// Request handlers for the three edge functions. Each function's index.ts just
// serves one of these, so the local dev server can route to all of them.
import { getRow, isFresh, LISTING_TTL_MS, REVIEWS_TTL_MS, saveAnalysis, saveListing, saveReviews } from './cache.ts';
import { PassError } from './ai.ts';
import { AppStoreError, closestCompetitors, lookupApp, parseAppInput, searchApps, searchCompetitors } from './itunes.ts';
import { runAudienceSuggest, runBuild, runDissect, runFilter, runGaps, runInvent, runKit, runPlan, runRead, type UploadInput } from './passes.ts';
import { getLowStarReviews, reviewProvider } from './reviews.ts';
import { generateSchema, ideaSchema, readSchema } from './schemas.ts';
import type { AppListing, NewPassName, PassName, Review, ReviewsSummary } from './types.ts';
import { unzipSync } from 'npm:fflate@^0.8.2';
import { templateById } from './templates.ts';

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

function serve(handle: (body: Record<string, unknown>) => Promise<unknown>, special: (error: unknown) => Response | null = () => null) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    try {
      const body = await req.json().catch(() => { throw new HttpError(400, 'Body must be JSON'); });
      return json(await handle(body ?? {}));
    } catch (error) {
      const handled = special(error);
      if (handled) return handled;
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

const PASSES: PassName[] = ['dissect', 'gaps', 'build', 'compete', 'kit', 'plan'];

async function doPass(pass: PassName, body: Record<string, unknown>, appId: string, country: string): Promise<unknown> {
  if (pass === 'dissect') { const { output, cached } = await ensureDissect(appId, country); return { output, cached }; }
  if (pass === 'gaps') return ensureGaps(appId, country);

  const audience = text(body.audience, 'audience', 80);
  if (pass === 'build') {
    const [{ listing, output: dissect }, { output: gaps }] = await Promise.all([ensureDissect(appId, country), ensureGaps(appId, country)]);
    return { output: await runBuild(listing, dissect, gaps, audience) };
  }
  if (pass === 'kit' || pass === 'plan') {
    const idea = ideaSchema.safeParse(body.idea);
    if (!idea.success) throw new HttpError(400, `${pass} needs the idea from the build step`);
    if (pass === 'kit') return { output: await runKit(idea.data, audience) };
    // Competitor prices are searched again here rather than taken from the request, so they stay fetched data.
    const searched = await searchCompetitors(idea.data.search_terms, country, appId);
    return { output: await runPlan(idea.data, audience, closestCompetitors(searched, 8)) };
  }
  // compete: search the store the way someone in this audience would, and keep the closest matches. No AI.
  const idea = ideaSchema.pick({ search_terms: true }).safeParse(body.idea);
  if (!idea.success) throw new HttpError(400, 'compete needs the idea from the build step');
  const searched = await searchCompetitors(idea.data.search_terms, country, appId);
  return { competitors: closestCompetitors(searched), searched };
}

// An AI pass can take a minute or more. Holding one HTTP request open that long
// breaks on phones (a locked screen or a switched app drops it) and on proxies.
// So a pass runs as a job on the server: a request waits up to WAIT_MS, and if
// the job isn't done it answers "pending"; the browser asks again with the same
// body and joins the same job. Finished results are kept for a while, so a
// dropped request never restarts the work.
const WAIT_MS = Number(Deno.env.get('PASS_WAIT_MS') ?? 20_000);
const KEEP_MS = 15 * 60 * 1000;
type Job = { promise: Promise<unknown>; endedAt?: number; outcome?: { ok: true; value: unknown } | { ok: false; error: unknown } };
const jobs = new Map<string, Job>();

/** Drops every pass job. For tests. */
export function forgetJobs() { jobs.clear(); }

function startJob(key: string, label: string, work: () => Promise<unknown>): Job {
  const started = Date.now();
  const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[pass] ${label} started`);
  const job: Job = { promise: Promise.resolve() };
  job.promise = work().then(
    (value) => { job.outcome = { ok: true, value }; job.endedAt = Date.now(); console.log(`[pass] ${label} done in ${seconds()}s`); },
    (error) => {
      job.outcome = { ok: false, error };
      job.endedAt = Date.now();
      console.error(`[pass] ${label} failed after ${seconds()}s: ${error instanceof Error ? error.message : error}`);
    },
  );
  for (const [other, old] of jobs) if (old.endedAt && Date.now() - old.endedAt > KEEP_MS) jobs.delete(other);
  jobs.set(key, job);
  return job;
}

class Pending {}

/** Runs a pass. `admit` is asked before a new job starts (the rate limit); joining a running job is free. */
export function runPass(req: Request, admit: () => string | null = () => null): Promise<Response> {
  return serve(async (body) => {
    const pass = body.pass as PassName;
    if (!PASSES.includes(pass)) throw new HttpError(400, `pass must be one of ${PASSES.join(', ')}`);
    const appId = text(body.app_id, 'app_id', 20);
    const country = countryOf(body.country);
    const audienceKey = pass === 'dissect' || pass === 'gaps' ? null : body.audience;
    const ideaKey = pass === 'compete' ? (body.idea as { search_terms?: unknown })?.search_terms : pass === 'kit' || pass === 'plan' ? body.idea : null;
    const key = JSON.stringify([pass, appId, country, audienceKey, ideaKey]);

    let job = jobs.get(key);
    // A failure is told once, then forgotten, so "Try again" starts fresh.
    if (job?.outcome && !job.outcome.ok && Date.now() - job.endedAt! > 2 * 60 * 1000) job = undefined;
    if (!job) {
      // Only AI passes count against the limit.
      const limited = pass === 'compete' ? null : admit();
      if (limited) throw new HttpError(429, limited);
      job = startJob(key, `${pass} ${country}/${appId}${typeof body.audience === 'string' ? ` for "${body.audience.slice(0, 40)}"` : ''}`, () => doPass(pass, body, appId, country));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([job.promise, new Promise((resolve) => { timer = setTimeout(resolve, WAIT_MS); })]);
    clearTimeout(timer);
    if (!job.outcome) throw new Pending();
    if (job.outcome.ok) return job.outcome.value;
    if (jobs.get(key) === job) jobs.delete(key);
    throw job.outcome.error;
  }, (error) => error instanceof Pending ? json({ pending: true }, 202) : null)(req);
}

// ---- The new front door: ideas from the upload itself -----------------------
// Uploads are validated here and travel with each request. They are never
// written to the cache or the database; they live only in the request.

/** Uploads may not exceed this; the bytes travel with every pass request. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor(b64.length * 3 / 4);
}

function dataUrlMime(dataUrl: string): string {
  return (/^data:([^;,]+)/.exec(dataUrl)?.[1] ?? '').toLowerCase();
}

/** Pulls readable text out of a .docx (a zip of XML) without extra libraries. */
function docxText(dataUrl: string): string {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  let xml: Uint8Array | undefined;
  try {
    xml = unzipSync(bytes)['word/document.xml'];
  } catch {
    throw new HttpError(400, 'We could not open that Word document.');
  }
  if (!xml) throw new HttpError(400, 'We could not read that Word document.');
  const text = new TextDecoder().decode(xml);
  const lines = text.split('</w:p>').map((paragraph) =>
    [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''),
  );
  return lines
    .map((line) => line.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim())
    .filter(Boolean)
    .join('\n');
}

type RawUpload = { kind?: unknown; text?: unknown; dataUrl?: unknown; filename?: unknown; frames?: unknown };

async function normalizeUpload(raw: unknown): Promise<UploadInput> {
  const body = (raw ?? {}) as RawUpload;
  const filename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim().slice(0, 120) : 'upload';
  if (body.kind === 'text') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) throw new HttpError(400, 'Describe what you want an app about.');
    return { kind: 'text', text: text.slice(0, 4000), label: 'their words' };
  }
  if (body.kind === 'video') {
    const frames = Array.isArray(body.frames) ? body.frames.filter((frame): frame is string => typeof frame === 'string').slice(0, 6) : [];
    if (!frames.length || frames.some((frame) => !/^data:image\/(jpeg|png|webp);base64,/.test(frame))) throw new HttpError(400, 'That video arrived broken. Try again.');
    if (frames.reduce((total, frame) => total + dataUrlBytes(frame), 0) > MAX_UPLOAD_BYTES) throw new HttpError(400, 'That video is too big. Try a shorter one.');
    return { kind: 'video', frames, label: filename };
  }
  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
  if (!dataUrl.startsWith('data:')) throw new HttpError(400, 'That upload arrived broken. Try again.');
  if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) throw new HttpError(400, 'That file is too big. Try one under 10 MB.');
  const mime = dataUrlMime(dataUrl);
  if (body.kind === 'photo') {
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
      throw new HttpError(400, 'That photo is in a format we cannot read. Try a JPEG or PNG.');
    }
    return { kind: 'photo', dataUrl, label: filename };
  }
  if (body.kind === 'document') {
    if (mime === 'application/pdf') return { kind: 'pdf', dataUrl, label: filename };
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const text = docxText(dataUrl);
      if (!text.trim()) throw new HttpError(400, 'We could not read any text from that Word document.');
      return { kind: 'text', text: text.slice(0, 20000), label: `the document "${filename}"` };
    }
    throw new HttpError(400, 'That document is in a format we cannot read. Try a PDF or Word document.');
  }
  throw new HttpError(400, 'Tell us what you uploaded: a photo, a video, a document, or words.');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A job key from the request body, without the megabytes of upload bytes. Only suggest and read read the upload. */
async function flowKey(pass: string, body: Record<string, unknown>): Promise<string> {
  const raw = (body.upload ?? {}) as RawUpload;
  const uploadRef = pass === 'suggest' || pass === 'read'
    ? await sha256Hex(`${raw.kind}:${typeof raw.dataUrl === 'string' ? raw.dataUrl : Array.isArray(raw.frames) ? raw.frames.join('|') : typeof raw.text === 'string' ? raw.text : ''}`)
    : null;
  return sha256Hex(JSON.stringify([pass, uploadRef, { ...body, upload: undefined }]));
}

function readOf(value: unknown) {
  const parsed = readSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'This step needs the reading from the first step.');
  return parsed.data;
}

function ideasOf(value: unknown) {
  if (!Array.isArray(value) || !value.length) throw new HttpError(400, 'This step needs the ideas from the invent step.');
  return value.slice(0, 3).map(generatedIdeaOf);
}

function generatedIdeaOf(value: unknown) {
  const parsed = generateSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'This step needs the idea from the generate step.');
  return parsed.data;
}

/** Maps the new idea onto the fields the kit/plan prompts read. The prompts themselves are untouched. */
function toKitIdea(idea: ReturnType<typeof generatedIdeaOf>, audience: string) {
  return {
    name: idea.name,
    pitch: idea.tagline,
    who_its_for: `${audience}: ${idea.job}`,
    how_it_works: idea.how_it_works,
    mvp: idea.mvp,
    monetization: idea.monetization,
    main_risk: idea.main_risk,
  };
}

const FLOW_PASSES: NewPassName[] = ['suggest', 'read', 'invent', 'filter', 'compete', 'kit', 'plan'];

async function doFlowPass(pass: NewPassName, body: Record<string, unknown>): Promise<unknown> {
  const country = countryOf(body.country);
  const audience = pass === 'suggest' || pass === 'filter' ? '' : text(body.audience, 'audience', 80);
  const templateId = typeof body.templateId === 'string' && body.templateId ? body.templateId.slice(0, 40) : undefined;
  const direction = typeof body.direction === 'string' && body.direction.trim() ? body.direction.trim().slice(0, 600) : undefined;

  if (pass === 'suggest' || pass === 'read') {
    const upload = await normalizeUpload(body.upload);
    if (pass === 'suggest') return { output: await runAudienceSuggest(upload) };
    return { output: await runRead(upload, audience, direction) };
  }
  if (pass === 'invent') return { output: await runInvent(readOf(body.read), audience, direction, templateId) };
  if (pass === 'filter') return { output: await runFilter(ideasOf(body.ideas), readOf(body.read)) };

  const idea = generatedIdeaOf(body.idea);
  const kitIdea = toKitIdea(idea, audience);
  if (pass === 'kit') return { output: await runKit(kitIdea, audience, templateById(templateId)?.layout) };
  const searched = await searchCompetitors(idea.search_terms, country, '');
  if (pass === 'plan') return { output: await runPlan(kitIdea, audience, closestCompetitors(searched, 8)) };
  // compete: App Store search in plain code, no AI.
  return { competitors: closestCompetitors(searched), searched };
}

/**
 * The new front door's passes. Like run-pass, each AI step runs as a server
 * job: a request waits up to 20 seconds, then answers "pending", and the
 * browser asks again and joins the same job.
 */
export function flowPass(req: Request, admit: () => string | null = () => null): Promise<Response> {
  return serve(async (body) => {
    const pass = body.pass as NewPassName;
    if (!FLOW_PASSES.includes(pass)) throw new HttpError(400, `pass must be one of ${FLOW_PASSES.join(', ')}`);
    const key = await flowKey(pass, body);

    let job = jobs.get(key);
    // A failure is told once, then forgotten, so "Try again" starts fresh.
    if (job?.outcome && !job.outcome.ok && Date.now() - job.endedAt! > 2 * 60 * 1000) job = undefined;
    if (!job) {
      // Only AI passes count against the limit.
      const limited = pass === 'compete' ? null : admit();
      if (limited) throw new HttpError(429, limited);
      job = startJob(key, `flow:${pass}${typeof body.audience === 'string' ? ` for "${body.audience.slice(0, 40)}"` : ''}`, () => doFlowPass(pass, body));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([job.promise, new Promise((resolve) => { timer = setTimeout(resolve, WAIT_MS); })]);
    clearTimeout(timer);
    if (!job.outcome) throw new Pending();
    if (job.outcome.ok) return job.outcome.value;
    if (jobs.get(key) === job) jobs.delete(key);
    throw job.outcome.error;
  }, (error) => error instanceof Pending ? json({ pending: true }, 202) : null)(req);
}
