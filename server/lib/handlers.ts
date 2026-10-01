// Request handlers for the three edge functions. Each function's index.ts just
// serves one of these, so the local dev server can route to all of them.
import { getRow, isFresh, LISTING_TTL_MS, REVIEWS_TTL_MS, saveAnalysis, saveListing, saveReviews } from './cache.ts';
import { PassError } from './ai.ts';
import { AppStoreError, lookupApp, parseAppInput, searchApps, searchCompetitors } from './itunes.ts';
import { runBuild, runDissect, runGaps, runVerdict } from './passes.ts';
import { getLowStarReviews, reviewProvider } from './reviews.ts';
import { ideaSchema } from './schemas.ts';
import type { AppListing, PassName, Review, ReviewsSummary } from './types.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function serve(handle: (body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    try {
      const body = await req.json().catch(() => { throw new HttpError(400, 'Body must be JSON'); });
      return json(await handle(body ?? {}));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof PassError || error instanceof AppStoreError ? 502 : 500;
      if (status >= 500) console.error(error);
      // Unexpected errors can carry internals (SQL, stack details); keep those in the logs.
      const message = status === 500 ? 'Something went wrong on our side. Please try again.' : error instanceof Error ? error.message : String(error);
      return json({ error: message }, status);
    }
  };
}

function text(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${name} is required`);
  return value.trim().slice(0, max);
}

function countryOf(value: unknown) {
  return typeof value === 'string' && /^[a-z]{2}$/i.test(value) ? value.toLowerCase() : 'us';
}

// ---- Step 1: resolve_app ------------------------------------------------

export const resolveApp = serve(async (body) => {
  const input = parseAppInput(text(body.query, 'query'), countryOf(body.country));
  const candidates = input.appId
    ? [await lookupApp(input.appId, input.country)].filter((app): app is AppListing => !!app)
    : await searchApps(input.term!, input.country, 5);
  if (!candidates.length) throw new HttpError(404, input.appId ? 'No App Store app has that ID.' : `No App Store apps matched “${input.term}”.`);
  await Promise.all(candidates.map(saveListing));
  return { candidates };
});

// ---- Step 2: get_reviews -------------------------------------------------

// Steps now run in parallel (dissect and gaps, or two visitors on the same
// app), so the same fetch or AI call can be asked for twice at once. Share one
// in-flight job per key instead of doing the work twice.
const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, work: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const job = work().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

function ensureListing(appId: string, country: string): Promise<AppListing> {
  return once(`listing:${country}:${appId}`, () => loadListing(appId, country));
}

function ensureReviews(appId: string, country: string, refresh = false): Promise<{ summary: ReviewsSummary; reviews: Review[] }> {
  return once(`reviews:${country}:${appId}:${refresh}`, () => loadReviews(appId, country, refresh));
}

async function loadListing(appId: string, country: string): Promise<AppListing> {
  const row = await getRow(appId, country);
  if (row?.listing_json && isFresh(row.fetched_at, LISTING_TTL_MS)) return row.listing_json;
  const listing = await lookupApp(appId, country);
  if (!listing) throw new HttpError(404, 'That app is no longer on the App Store.');
  await saveListing(listing);
  return listing;
}

async function loadReviews(appId: string, country: string, refresh: boolean): Promise<{ summary: ReviewsSummary; reviews: Review[] }> {
  const row = await getRow(appId, country);
  if (!refresh && row?.reviews_json && isFresh(row.reviews_fetched_at, REVIEWS_TTL_MS)) return row.reviews_json;
  const provider = reviewProvider();
  const { scanned, lowStar } = await getLowStarReviews(provider, appId, country);
  const summary: ReviewsSummary = { app_id: appId, provider: provider.name, low_star_count: lowStar.length, scanned_count: scanned, fetched_at: new Date().toISOString() };
  await saveReviews(appId, country, summary, lowStar);
  return { summary, reviews: lowStar };
}

export const getReviews = serve(async (body) => {
  const appId = text(body.app_id, 'app_id', 20);
  const country = countryOf(body.country);
  await ensureListing(appId, country);
  const { summary } = await ensureReviews(appId, country, body.refresh === true);
  return { summary };
});

// ---- Step 3: the passes --------------------------------------------------

async function context(appId: string, country: string) {
  const listing = await ensureListing(appId, country);
  const { reviews } = await ensureReviews(appId, country);
  const row = await getRow(appId, country);
  return { listing, reviews, analysis: row?.analysis_json ?? {} };
}

function ensureDissect(appId: string, country: string) {
  return once(`dissect:${country}:${appId}`, () => loadDissect(appId, country));
}

function ensureGaps(appId: string, country: string) {
  return once(`gaps:${country}:${appId}`, () => loadGaps(appId, country));
}

async function loadDissect(appId: string, country: string) {
  const { listing, reviews, analysis } = await context(appId, country);
  if (analysis.dissect) return { listing, output: analysis.dissect, cached: true };
  const output = await runDissect(listing, reviews);
  await saveAnalysis(appId, country, { dissect: output });
  return { listing, output, cached: false };
}

async function loadGaps(appId: string, country: string) {
  const { listing, reviews, analysis } = await context(appId, country);
  if (analysis.gaps) return { output: analysis.gaps, cached: true };
  const output = await runGaps(listing, reviews);
  await saveAnalysis(appId, country, { gaps: output });
  return { output, cached: false };
}

const PASSES: PassName[] = ['dissect', 'gaps', 'build', 'verdict'];

export const runPass = serve(async (body) => {
  const pass = body.pass as PassName;
  if (!PASSES.includes(pass)) throw new HttpError(400, `pass must be one of ${PASSES.join(', ')}`);
  const appId = text(body.app_id, 'app_id', 20);
  const country = countryOf(body.country);

  if (pass === 'dissect') { const { output, cached } = await ensureDissect(appId, country); return { output, cached }; }
  if (pass === 'gaps') return ensureGaps(appId, country);

  const audience = text(body.audience, 'audience', 80);
  if (pass === 'build') {
    const [{ listing, output: dissect }, { output: gaps }] = await Promise.all([ensureDissect(appId, country), ensureGaps(appId, country)]);
    return { output: await runBuild(listing, dissect, gaps, audience) };
  }
  // verdict: search the store for the new idea, then judge it against what came back.
  const idea = ideaSchema.safeParse(body.idea);
  if (!idea.success) throw new HttpError(400, 'verdict needs the idea from the build step');
  const searched = await searchCompetitors(idea.data.search_terms, country, appId);
  return { output: await runVerdict(idea.data, audience, searched), searched };
});
