// Runs all three edge functions on one port, at the same paths Supabase uses
// (/functions/v1/<name>). For local development only.
//
//   deno run -A dev/server.ts             real Apple + Claude (needs ANTHROPIC_API_KEY)
//   deno run -A dev/server.ts --fixtures  fictional demo data, no network or key needed
import { getReviews, resolveApp, runPass } from '../supabase/functions/_shared/handlers.ts';
import { installFixtures } from './fixtures.ts';

if (Deno.args.includes('--fixtures')) {
  Deno.env.set('ANTHROPIC_API_KEY', Deno.env.get('ANTHROPIC_API_KEY') ?? 'fixture-key');
  installFixtures({ delayMs: 900 });
  console.log('Demo mode: Apple and Claude are replaced by fictional fixture data.');
}

const routes: Record<string, (req: Request) => Promise<Response>> = {
  'resolve-app': resolveApp,
  'get-reviews': getReviews,
  'run-pass': runPass,
};

const port = Number(Deno.env.get('PORT') ?? 54321);
Deno.serve({ port }, (req) => {
  const name = new URL(req.url).pathname.match(/^\/functions\/v1\/([\w-]+)/)?.[1];
  const route = name ? routes[name] : undefined;
  return route ? route(req) : new Response('Not found', { status: 404 });
});
