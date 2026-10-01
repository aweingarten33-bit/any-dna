// The API: one route, flow-pass, runs each step of the app. Uploads travel
// with the request that reads them and are never stored. Each AI step runs as
// a server job: a request waits up to 20 seconds, then answers "pending", and
// the browser asks again and joins the same job.
import { PassError } from './ai.ts';
import { AppStoreError, closestCompetitors, findSong, searchCompetitors } from './itunes.ts';
import { runAudienceSuggest, runFilter, runInvent, runKit, runPlan, runRead, type UploadInput } from './passes.ts';
import { generateSchema, readSchema } from './schemas.ts';
import type { NewPassName } from './types.ts';
import { unzipSync } from 'npm:fflate@^0.8.2';
import { templateById } from './templates.ts';
import { LINK_NAMES, LinkError, linkImage, readLink } from './links.ts';

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

// ---- Uploads -------------------------------------------------------------------

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

export type RawUpload = { kind?: unknown; text?: unknown; dataUrl?: unknown; filename?: unknown; frames?: unknown; url?: unknown };

async function normalizeUpload(raw: unknown): Promise<UploadInput> {
  const body = (raw ?? {}) as RawUpload;
  const filename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim().slice(0, 120) : 'upload';
  if (body.kind === 'text') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) throw new HttpError(400, 'Describe what you want an app about.');
    return { kind: 'text', text: text.slice(0, 4000), label: 'their words' };
  }
  if (body.kind === 'link') {
    const url = typeof body.url === 'string' ? body.url.trim().slice(0, 600) : '';
    let info;
    try {
      info = await readLink(url);
    } catch (error) {
      throw new HttpError(400, error instanceof LinkError && error.message !== 'unsupported' ? error.message : 'Paste a Spotify, Apple Music, YouTube, TikTok or Instagram link.');
    }
    const service = LINK_NAMES[info.source];
    const text = [
      `${service} ${info.kind}: “${info.title || 'untitled'}”${info.creator ? ` by ${info.creator}` : ''}`,
      info.detail ? `Details: ${info.detail}` : '',
    ].filter(Boolean).join('\n').slice(0, 2000);
    return { kind: 'link', text, imageDataUrl: await linkImage(info.imageUrl), label: `a ${service} ${info.kind}` };
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

/** The upload's fingerprint. The browser computes the same one, so a check-in can name the upload without resending it. */
export function uploadFingerprintSource(raw: RawUpload): string {
  const payload = typeof raw.url === 'string' ? raw.url
    : typeof raw.dataUrl === 'string' ? raw.dataUrl
    : Array.isArray(raw.frames) ? raw.frames.join('|')
    : typeof raw.text === 'string' ? raw.text : '';
  return `${String(raw.kind)}:${payload}`;
}

/** Asked to check on a step that needs the upload, but the server doesn't have that step (it restarted): resend it. */
class NeedUpload extends Error {}

/** A job key from the request body, without the megabytes of upload bytes. Only suggest and read read the upload. */
async function flowKey(pass: string, body: Record<string, unknown>): Promise<string> {
  let uploadRef: string | null = null;
  if (pass === 'suggest' || pass === 'read') {
    const claimed = typeof body.uploadRef === 'string' && /^[0-9a-f]{64}$/.test(body.uploadRef) ? body.uploadRef : null;
    if (body.upload) {
      uploadRef = await sha256Hex(uploadFingerprintSource(body.upload as RawUpload));
      if (claimed && claimed !== uploadRef) throw new HttpError(400, 'That upload arrived changed. Try again.');
    } else if (claimed) {
      uploadRef = claimed;
    } else {
      throw new HttpError(400, 'Drop something in first.');
    }
  }
  return sha256Hex(JSON.stringify([pass, uploadRef, { ...body, upload: undefined, uploadRef: undefined }]));
}

// ---- The steps ------------------------------------------------------------------

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

/** The fields the screen-writing and business-plan prompts read. */
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

/** An audience the user typed goes inside prompts: plain words only. */
function audienceOf(value: unknown) {
  return text(value, 'audience', 80).replace(/[<>{}\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function doFlowPass(pass: NewPassName, body: Record<string, unknown>): Promise<unknown> {
  const country = countryOf(body.country);
  const audience = pass === 'suggest' || pass === 'filter' ? '' : audienceOf(body.audience);
  const templateId = typeof body.templateId === 'string' && body.templateId ? body.templateId.slice(0, 40) : undefined;
  const direction = typeof body.direction === 'string' && body.direction.trim() ? body.direction.trim().slice(0, 600) : undefined;

  if (pass === 'suggest' || pass === 'read') {
    const upload = await normalizeUpload(body.upload);
    if (pass === 'suggest') return { output: await runAudienceSuggest(upload) };
    // Typed words that name a song get real facts from Apple Music. A failed lookup just means no facts.
    const songText = upload.kind === 'text' ? upload.text : upload.kind === 'link' && / song: /.test(upload.text) ? `${upload.text.split('\n')[0]} song` : '';
    const song = songText ? await findSong(songText, country).catch(() => null) : null;
    return { output: await runRead(upload, audience, direction, song) };
  }
  if (pass === 'invent') return { output: await runInvent(readOf(body.read), audience, direction, templateId) };
  if (pass === 'filter') {
    // The stranger's "already exists" check gets real App Store results for each idea, not memory.
    const ideas = ideasOf(body.ideas);
    const found = await Promise.all(ideas.map((idea) => searchCompetitors(idea.search_terms, country, '').catch(() => [])));
    return { output: await runFilter(ideas, readOf(body.read), found) };
  }

  const idea = generatedIdeaOf(body.idea);
  const kitIdea = toKitIdea(idea, audience);
  if (pass === 'kit') return { output: await runKit(kitIdea, audience, templateById(templateId)?.layout) };
  const searched = await searchCompetitors(idea.search_terms, country, '');
  if (pass === 'plan') return { output: await runPlan(kitIdea, audience, closestCompetitors(searched, 8)) };
  // compete: App Store search in plain code, no AI.
  return { competitors: closestCompetitors(searched), searched };
}

/** Runs one step. `admit` is asked before a new job starts (the rate limit); checking on a running job is free. */
export function flowPass(req: Request, admit: () => string | null = () => null): Promise<Response> {
  return serve(async (body) => {
    const pass = body.pass as NewPassName;
    if (!FLOW_PASSES.includes(pass)) throw new HttpError(400, `pass must be one of ${FLOW_PASSES.join(', ')}`);
    const key = await flowKey(pass, body);

    let job = jobs.get(key);
    // A failure is told once, then forgotten, so "Try again" starts fresh.
    if (job?.outcome && !job.outcome.ok && Date.now() - job.endedAt! > 2 * 60 * 1000) job = undefined;
    if (!job) {
      if ((pass === 'suggest' || pass === 'read') && !body.upload) throw new NeedUpload();
      // Only AI steps count against the limit.
      const limited = pass === 'compete' ? null : admit();
      if (limited) throw new HttpError(429, limited);
      job = startJob(key, `${pass}${audienceLabel(body.audience)}`, () => doFlowPass(pass, body));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([job.promise, new Promise((resolve) => { timer = setTimeout(resolve, WAIT_MS); })]);
    clearTimeout(timer);
    if (!job.outcome) throw new Pending();
    if (job.outcome.ok) return job.outcome.value;
    if (jobs.get(key) === job) jobs.delete(key);
    throw job.outcome.error;
  }, (error) => error instanceof Pending ? json({ pending: true }, 202) : error instanceof NeedUpload ? json({ needUpload: true }, 409) : null)(req);
}

function audienceLabel(value: unknown) {
  return typeof value === 'string' && value ? ` for "${value.slice(0, 40)}"` : '';
}
