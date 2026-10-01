// Spinoff's web server: the API at /api/* and the built web app (dist/) for
// everything else. One process, one URL.
//
//   deno run -A server/main.ts
//
// Environment:
//   PORT                  port to listen on (Render sets this; default 8000)
//   META_MODEL_API_KEY    Muse key (the AI provider). See server/lib/ai.ts
//   DATABASE_URL          optional Postgres for the app_cache; memory otherwise
//   AI_CALLS_PER_HOUR     per-visitor limit on AI calls (default 30, about 7 runs)
//   AI_CALLS_PER_DAY      limit across all visitors (default 300)
import { serveDir, serveFile } from 'jsr:@std/http@^1/file-server';
import { getReviews, resolveApp, runPass } from './lib/handlers.ts';
import { migrate } from './lib/cache.ts';

const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  'resolve-app': resolveApp,
  'get-reviews': getReviews,
  'run-pass': runPass,
};

// ---- Rate limits on AI calls (run-pass is the only route that calls the AI) ----

const PER_VISITOR = Number(Deno.env.get('AI_CALLS_PER_HOUR') ?? 30);
const PER_DAY = Number(Deno.env.get('AI_CALLS_PER_DAY') ?? 300);
const visitors = new Map<string, { count: number; resetAt: number }>();
let day = { count: 0, resetAt: Date.now() + 24 * 3600 * 1000 };

function visitorId(req: Request, info: Deno.ServeHandlerInfo): string {
  // Render puts the real client address first in X-Forwarded-For.
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || (info.remoteAddr as Deno.NetAddr).hostname;
}

/** Returns an error message when the call is over a limit, otherwise counts it. */
export function takeAiCall(visitor: string, now = Date.now()): string | null {
  if (now > day.resetAt) day = { count: 0, resetAt: now + 24 * 3600 * 1000 };
  const entry = visitors.get(visitor);
  const current = entry && now < entry.resetAt ? entry : { count: 0, resetAt: now + 3600 * 1000 };
  if (current.count >= PER_VISITOR) return `You’ve hit the hourly limit. Try again in ${Math.ceil((current.resetAt - now) / 60000)} minutes.`;
  if (day.count >= PER_DAY) return 'Spinoff has hit its daily limit. Try again tomorrow.';
  current.count += 1;
  day.count += 1;
  visitors.set(visitor, current);
  if (visitors.size > 10_000) for (const [key, value] of visitors) if (now > value.resetAt) visitors.delete(key);
  return null;
}

// ---- Server ----

const DIST = new URL('../dist', import.meta.url).pathname;

export async function handle(req: Request, info: Deno.ServeHandlerInfo): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/api/health') return Response.json({ ok: true });

  const route = url.pathname.match(/^\/api\/([\w-]+)$/)?.[1];
  if (route !== undefined) {
    const handler = ROUTES[route];
    if (!handler) return Response.json({ error: 'Not found' }, { status: 404 });
    if (route === 'run-pass' && req.method === 'POST') {
      const limited = takeAiCall(visitorId(req, info));
      if (limited) return Response.json({ error: limited }, { status: 429 });
    }
    return handler(req);
  }

  // The web app. Unknown paths without a file extension get index.html (client-side screens).
  const response = await serveDir(req, { fsRoot: DIST, quiet: true });
  if (response.status === 404 && !/\.[a-z0-9]+$/i.test(url.pathname)) return serveFile(req, `${DIST}/index.html`);
  return response;
}

if (import.meta.main) {
  const schema = await Deno.readTextFile(new URL('./schema.sql', import.meta.url));
  const usingDb = await migrate(schema).catch((error) => {
    console.error('Database setup failed; using memory cache.', error);
    return false;
  });
  console.log(`Cache: ${usingDb ? 'Postgres' : 'memory'}`);
  Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000), hostname: '0.0.0.0' }, handle);
}
