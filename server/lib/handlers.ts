// The API: one route, flow-pass, runs each step of the app. Uploads travel
// with the request that reads them and are never stored. Each AI step runs as
// a server job: a request waits up to 20 seconds, then answers "pending", and
// the browser asks again and joins the same job.
import { PassError } from './ai.ts';
import { AppStoreError, closestCompetitors, findApp, findSong, searchCompetitors } from './itunes.ts';
import { runAudienceSuggest, runDna, runFilter, runGenerate, runKit, runPlan, runResearch, type UploadInput } from './passes.ts';
import { generateSchema, readSchema, researchSchema } from './schemas.ts';
import type { GenerateMode, NewPassName } from './types.ts';
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

export type RawUpload = { kind?: unknown; text?: unknown; dataUrl?: unknown; filename?: unknown; frames?: unknown; url?: unknown; from?: unknown };

/** The upload as the wrapper's normalized source: what was actually available, and what wasn't. */
async function normalizeUpload(raw: unknown): Promise<UploadInput> {
  const body = (raw ?? {}) as RawUpload;
  const filename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim().slice(0, 120) : 'upload';
  if (body.kind === 'text') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) throw new HttpError(400, 'Describe what you want an app about.');
    if (body.from === 'song-file') {
      return { kind: 'text', text: text.slice(0, 400), label: 'their song', packet: {
        category: 'Video / Audio', type: 'song file',
        provenance: 'A song file on the person\'s phone. Its title and artist were read from the file\'s tags or its file name.',
        unavailable: ['the audio itself: it was not listened to'],
      } };
    }
    return { kind: 'text', text: text.slice(0, 4000), label: 'their words', packet: {
      category: 'Text / Conversation', type: 'words typed by the person', provenance: 'Typed by the person.', unavailable: [],
    } };
  }
  if (body.kind === 'link') {
    const url = typeof body.url === 'string' ? body.url.trim().slice(0, 600) : '';
    let info;
    try {
      info = await readLink(url);
    } catch (error) {
      throw new HttpError(400, error instanceof LinkError && error.message !== 'unsupported' ? error.message : 'Paste a Spotify, Apple Music, YouTube, TikTok, Instagram or GitHub link.');
    }
    const service = LINK_NAMES[info.source];
    const text = [
      `${service} ${info.kind}: “${info.title || 'untitled'}”${info.creator ? ` by ${info.creator}` : ''}`,
      info.detail ? `Details: ${info.detail}` : '',
    ].filter(Boolean).join('\n').slice(0, 6000);
    const imageDataUrl = await linkImage(info.imageUrl);
    const github = info.source === 'github';
    return { kind: 'link', text, imageDataUrl, label: `a ${service} ${info.kind}`, packet: {
      category: 'Link', type: `${service} ${info.kind}`, title: info.title, creator: info.creator, url,
      provenance: github
        ? 'Fetched from GitHub\'s public API: the repo\'s description, stars, language, topics and the start of its README.'
        : `Fetched from ${service}'s public share preview: the title, creator${info.detail ? ', a short description' : ''}${imageDataUrl ? ' and the cover image' : ''}.`,
      unavailable: github
        ? ['the code itself: it was not read', 'the rest of the README']
        : [`the ${info.kind} itself: it was not ${info.kind === 'video' ? 'watched' : info.kind === 'post' ? 'opened' : 'listened to'}; only its share preview was fetched`],
    } };
  }
  if (body.kind === 'video') {
    const frames = Array.isArray(body.frames) ? body.frames.filter((frame): frame is string => typeof frame === 'string').slice(0, 6) : [];
    if (!frames.length || frames.some((frame) => !/^data:image\/(jpeg|png|webp);base64,/.test(frame))) throw new HttpError(400, 'That video arrived broken. Try again.');
    if (frames.reduce((total, frame) => total + dataUrlBytes(frame), 0) > MAX_UPLOAD_BYTES) throw new HttpError(400, 'That video is too big. Try a shorter one.');
    return { kind: 'video', frames, label: filename, packet: {
      category: 'Video / Audio', type: 'video from the person\'s phone', title: filename,
      provenance: `${frames.length} still frames taken from across the video on the person's phone.`,
      unavailable: ['the sound', 'the motion between the frames'],
    } };
  }
  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
  if (!dataUrl.startsWith('data:')) throw new HttpError(400, 'That upload arrived broken. Try again.');
  if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) throw new HttpError(400, 'That file is too big. Try one under 10 MB.');
  const mime = dataUrlMime(dataUrl);
  if (body.kind === 'photo') {
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
      throw new HttpError(400, 'That photo is in a format we cannot read. Try a JPEG or PNG.');
    }
    return { kind: 'photo', dataUrl, label: filename, packet: {
      category: 'Image', type: 'photo', title: filename, provenance: 'Uploaded by the person (resized on their phone).', unavailable: [],
    } };
  }
  if (body.kind === 'document') {
    if (mime === 'application/pdf') {
      return { kind: 'pdf', dataUrl, label: filename, packet: {
        category: 'Document / Data', type: 'PDF', title: filename, provenance: 'Uploaded by the person; the whole file is attached.', unavailable: [],
      } };
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const text = docxText(dataUrl);
      if (!text.trim()) throw new HttpError(400, 'We could not read any text from that Word document.');
      const cut = text.length > 20000;
      return { kind: 'text', text: text.slice(0, 20000), label: `the document "${filename}"`, packet: {
        category: 'Document / Data', type: 'Word document', title: filename,
        provenance: 'Uploaded by the person. Its text was extracted on the server.',
        unavailable: ['its images and formatting', ...(cut ? ['the text after the first 20,000 characters'] : [])],
      } };
    }
    throw new HttpError(400, 'That document is in a format we cannot read. Try a PDF or Word document.');
  }
  throw new HttpError(400, 'Tell us what you uploaded: a photo, a video, a document, or words.');
}

/**
 * Live research for publicly researchable sources, gathered before Prompt 1:
 * a song's Apple Music facts, and an app's App Store listing when the words are its name.
 * A failed lookup just means no facts.
 */
async function gatherResearch(upload: UploadInput, country: string): Promise<UploadInput> {
  const songText = upload.kind === 'text' ? upload.text : upload.kind === 'link' && / song: /.test(upload.text) ? `${upload.text.split('\n')[0]} song` : '';
  const appText = upload.kind === 'text' && upload.packet.type === 'words typed by the person' ? upload.text : '';
  const [song, app] = await Promise.all([
    songText ? findSong(songText, country).catch(() => null) : null,
    appText ? findApp(appText, country).catch(() => null) : null,
  ]);
  const facts = [
    song ? `Apple Music lists this song (fetched): "${song.track}" by ${song.artist}${song.album ? `, from ${song.album}` : ''}${song.genre ? `, ${song.genre}` : ''}${song.year ? `, ${song.year}` : ''}.` : '',
    app ? `An App Store app has this name (fetched; the person may mean it, or something else with the same name): "${app.name}" by ${app.developer}, ${app.category}, ${app.formatted_price || 'price unknown'}, rated ${app.rating ?? 'unknown'} from ${app.rating_count?.toLocaleString('en-US') ?? 'unknown'} ratings. Its description: ${app.description.slice(0, 1500)}` : '',
  ].filter(Boolean);
  return facts.length ? { ...upload, packet: { ...upload.packet, facts } } : upload;
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

/** A job key from the request body, without the megabytes of upload bytes. Only suggest and research read the upload. */
async function flowKey(pass: string, body: Record<string, unknown>): Promise<string> {
  let uploadRef: string | null = null;
  if (pass === 'suggest' || pass === 'research') {
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
  if (!parsed.success) throw new HttpError(400, 'This step needs the research and DNA from the first steps.');
  return parsed.data;
}

function researchOf(value: unknown) {
  const parsed = researchSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'This step needs the research from the first step.');
  return parsed.data;
}

const MODES: Array<GenerateMode | 'collide'> = ['repurpose', 'x1000', 'future', 'angle', 'collide'];

function feedbackOf(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 12).flatMap((item) => {
    const { name, reason } = (item ?? {}) as Record<string, unknown>;
    return typeof name === 'string' && typeof reason === 'string' ? [{ name: name.slice(0, 80), reason: reason.slice(0, 300) }] : [];
  });
}

function ideasOf(value: unknown) {
  if (!Array.isArray(value) || !value.length) throw new HttpError(400, 'This step needs the ideas from the generate step.');
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

const FLOW_PASSES: NewPassName[] = ['suggest', 'research', 'dna', 'generate', 'filter', 'compete', 'kit', 'plan'];

/** An audience the user typed goes inside prompts: plain words only. */
function audienceOf(value: unknown) {
  return text(value, 'audience', 80).replace(/[<>{}\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function doFlowPass(pass: NewPassName, body: Record<string, unknown>): Promise<unknown> {
  const country = countryOf(body.country);
  const audience = ['suggest', 'research', 'dna', 'filter'].includes(pass) ? '' : audienceOf(body.audience);
  const templateId = typeof body.templateId === 'string' && body.templateId ? body.templateId.slice(0, 40) : undefined;
  const direction = typeof body.direction === 'string' && body.direction.trim() ? body.direction.trim().slice(0, 600) : undefined;

  if (pass === 'suggest' || pass === 'research') {
    const upload = await normalizeUpload(body.upload);
    if (pass === 'suggest') return { output: await runAudienceSuggest(upload) };
    const about = typeof body.about === 'string' && body.about.trim() ? body.about.trim().slice(0, 600) : undefined;
    return { output: await runResearch(await gatherResearch(upload, country), about) };
  }
  if (pass === 'dna') return { output: await runDna(researchOf(body.research)) };
  if (pass === 'generate') {
    const mode = MODES.find((item) => item === body.mode);
    const second = mode === 'collide' ? readOf(body.second) : undefined;
    return { output: await runGenerate({ read: readOf(body.read), second, audience, direction, templateId, mode, feedback: feedbackOf(body.feedback) }) };
  }
  if (pass === 'filter') {
    // Real App Store results for each idea, before the "already exists" judgment.
    const ideas = ideasOf(body.ideas);
    const found = await Promise.all(ideas.map((idea) => searchCompetitors(idea.search_terms, country, '').catch(() => [])));
    return { output: await runFilter(ideas, found) };
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
      if ((pass === 'suggest' || pass === 'research') && !body.upload) throw new NeedUpload();
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
