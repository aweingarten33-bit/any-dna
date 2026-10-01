// API handler for the new one-call creative exercise.
// It reads only what the person supplied. There is no App Store search,
// Apple Music lookup, competitor search, or separate research/DNA/filter pass.
import { unzipSync } from 'npm:fflate@^0.8.2';
import { PassError } from './ai.ts';
import { runExercise } from './exercise.ts';
import { LINK_NAMES, LinkError, linkImage, readLink } from './links.ts';
import type { UploadInput } from './passes.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
class Pending {}
class NeedUpload extends Error {}

const WAIT_MS = Number(Deno.env.get('PASS_WAIT_MS') ?? 20_000);
const KEEP_MS = 15 * 60 * 1000;
type Job = { promise: Promise<void>; endedAt?: number; outcome?: { ok: true; value: unknown } | { ok: false; error: unknown } };
const jobs = new Map<string, Job>();

function startJob(key: string, work: () => Promise<unknown>): Job {
  const started = Date.now();
  console.log('[exercise] started');
  const job: Job = { promise: Promise.resolve() };
  job.promise = work().then(
    (value) => {
      job.outcome = { ok: true, value };
      job.endedAt = Date.now();
      console.log(`[exercise] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    },
    (error) => {
      job.outcome = { ok: false, error };
      job.endedAt = Date.now();
      console.error(`[exercise] failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${error instanceof Error ? error.message : error}`);
    },
  );
  for (const [other, old] of jobs) if (old.endedAt && Date.now() - old.endedAt > KEEP_MS) jobs.delete(other);
  jobs.set(key, job);
  return job;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  return Math.floor((comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl).length * 3 / 4);
}
function dataUrlMime(dataUrl: string) {
  return (/^data:([^;,]+)/.exec(dataUrl)?.[1] ?? '').toLowerCase();
}
function unzipDataUrl(dataUrl: string): Record<string, Uint8Array> {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  try { return unzipSync(bytes); } catch { throw new HttpError(400, 'We could not open that document.'); }
}
function decodeXml(text: string) {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function docxText(dataUrl: string): string {
  const xml = unzipDataUrl(dataUrl)['word/document.xml'];
  if (!xml) throw new HttpError(400, 'We could not read that Word document.');
  return new TextDecoder().decode(xml)
    .split('</w:p>')
    .map((paragraph) => [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .map((line) => decodeXml(line).trim())
    .filter(Boolean).join('\n');
}

function pptxText(dataUrl: string): string {
  const files = unzipDataUrl(dataUrl);
  const slides = Object.entries(files)
    .filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort(([a], [b]) => Number(/slide(\d+)/.exec(a)?.[1] ?? 0) - Number(/slide(\d+)/.exec(b)?.[1] ?? 0));
  if (!slides.length) throw new HttpError(400, 'We could not read that PowerPoint.');
  return slides.map(([path, xml]) => {
    const words = [...new TextDecoder().decode(xml).matchAll(/<a:t>(.*?)<\/a:t>/gs)].map((m) => decodeXml(m[1]).trim()).filter(Boolean);
    return words.length ? `${path.replace(/^.*slide|\.xml$/g, '')}: ${words.join(' | ')}` : '';
  }).filter(Boolean).join('\n');
}

type RawUpload = { kind?: unknown; text?: unknown; dataUrl?: unknown; filename?: unknown; frames?: unknown; url?: unknown; from?: unknown };

async function normalizeUpload(raw: unknown): Promise<UploadInput> {
  const body = (raw ?? {}) as RawUpload;
  const filename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim().slice(0, 120) : 'upload';

  if (body.kind === 'text') {
    const value = typeof body.text === 'string' ? body.text.trim() : '';
    if (!value) throw new HttpError(400, 'Drop something in first.');
    if (body.from === 'song-file') return {
      kind: 'text', text: value.slice(0, 500), label: 'their song',
      packet: { category: 'Video / Audio', type: 'song file', provenance: 'The song title and artist came from the file tags or filename.', unavailable: ['the actual audio was not listened to'] },
    };
    return {
      kind: 'text', text: value.slice(0, 8000), label: 'their words',
      packet: { category: 'Text / Conversation', type: 'words typed by the person', provenance: 'Typed by the person.', unavailable: [] },
    };
  }

  if (body.kind === 'link') {
    const url = typeof body.url === 'string' ? body.url.trim().slice(0, 700) : '';
    let info;
    try { info = await readLink(url); }
    catch (error) {
      const message = error instanceof LinkError && error.message !== 'unsupported'
        ? error.message
        : 'That link isn’t supported yet. Try an App Store, Spotify, Apple Music, YouTube, TikTok, Instagram or GitHub link.';
      throw new HttpError(400, message);
    }
    const service = LINK_NAMES[info.source];
    const detail = [
      `${service} ${info.kind}: “${info.title || 'untitled'}”${info.creator ? ` by ${info.creator}` : ''}`,
      info.detail ? `Details: ${info.detail}` : '',
    ].filter(Boolean).join('\n').slice(0, 8000);
    const imageDataUrl = await linkImage(info.imageUrl);
    return {
      kind: 'link', text: detail, imageDataUrl, label: `a ${service} ${info.kind}`,
      packet: {
        category: 'Link', type: `${service} ${info.kind}`, title: info.title, creator: info.creator, url,
        provenance: `Read only the public information shared by the exact ${service} link the person pasted. No broader search was run.`,
        unavailable: [],
      },
    };
  }

  if (body.kind === 'video') {
    const frames = Array.isArray(body.frames) ? body.frames.filter((frame): frame is string => typeof frame === 'string').slice(0, 6) : [];
    if (!frames.length || frames.some((frame) => !/^data:image\/(jpeg|png|webp);base64,/.test(frame))) throw new HttpError(400, 'That video arrived broken. Try again.');
    if (frames.reduce((total, frame) => total + dataUrlBytes(frame), 0) > MAX_UPLOAD_BYTES) throw new HttpError(400, 'That video is too big. Try a shorter one.');
    return {
      kind: 'video', frames, label: filename,
      packet: { category: 'Video / Audio', type: 'video', title: filename, provenance: `${frames.length} still frames taken from across the video on the person's phone.`, unavailable: ['sound', 'motion between frames'] },
    };
  }

  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
  if (!dataUrl.startsWith('data:')) throw new HttpError(400, 'That upload arrived broken. Try again.');
  if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) throw new HttpError(400, 'That file is too big. Try one under 10 MB.');
  const mime = dataUrlMime(dataUrl);
  const lowerName = filename.toLowerCase();

  if (body.kind === 'photo') {
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) throw new HttpError(400, 'That photo format didn’t work. Try a JPEG or PNG.');
    return { kind: 'photo', dataUrl, label: filename, packet: { category: 'Image', type: 'photo', title: filename, provenance: 'Uploaded by the person.', unavailable: [] } };
  }

  if (body.kind === 'document') {
    if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) return { kind: 'pdf', dataUrl, label: filename, packet: { category: 'Document / Data', type: 'PDF', title: filename, provenance: 'Uploaded by the person; the PDF is attached to the model call.', unavailable: [] } };
    if (mime === DOCX_MIME || lowerName.endsWith('.docx')) {
      const value = docxText(dataUrl);
      if (!value.trim()) throw new HttpError(400, 'We could not read any text from that Word document.');
      return { kind: 'text', text: value.slice(0, 20000), label: filename, packet: { category: 'Document / Data', type: 'Word document', title: filename, provenance: 'Uploaded by the person; its text was extracted on the server.', unavailable: ['images and formatting'] } };
    }
    if (mime === PPTX_MIME || lowerName.endsWith('.pptx')) {
      const value = pptxText(dataUrl);
      if (!value.trim()) throw new HttpError(400, 'We could not read any text from that PowerPoint.');
      return { kind: 'text', text: value.slice(0, 24000), label: filename, packet: { category: 'Document / Data', type: 'PowerPoint', title: filename, provenance: 'Uploaded by the person; text from the slides was extracted on the server.', unavailable: ['images, animations and slide formatting'] } };
    }
    throw new HttpError(400, 'That document format didn’t work. Try a PDF, Word doc or PowerPoint.');
  }

  throw new HttpError(400, 'Drop in words, a link, photo, video, song, PDF, Word doc or PowerPoint.');
}

function fingerprintSource(raw: RawUpload): string {
  const payload = typeof raw.url === 'string' ? raw.url
    : typeof raw.dataUrl === 'string' ? raw.dataUrl
    : Array.isArray(raw.frames) ? raw.frames.join('|')
    : typeof raw.text === 'string' ? raw.text : '';
  return `${String(raw.kind)}:${payload}`;
}
async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function exercisePass(req: Request, admit: () => string | null): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  try {
    const body = await req.json().catch(() => { throw new HttpError(400, 'Body must be JSON'); }) as Record<string, unknown>;
    const claimed = typeof body.uploadRef === 'string' && /^[0-9a-f]{64}$/.test(body.uploadRef) ? body.uploadRef : null;
    let uploadRef = claimed;
    if (body.upload) {
      uploadRef = await sha256(fingerprintSource(body.upload as RawUpload));
      if (claimed && claimed !== uploadRef) throw new HttpError(400, 'That upload changed. Try again.');
    }
    if (!uploadRef) throw new HttpError(400, 'Drop something in first.');

    const context = typeof body.context === 'string' ? body.context.slice(-12000) : '';
    const reaction = typeof body.reaction === 'string' ? body.reaction.slice(0, 500) : '';
    const key = await sha256(JSON.stringify(['exercise', uploadRef, context, reaction]));
    let job = jobs.get(key);
    if (job?.outcome && !job.outcome.ok && Date.now() - job.endedAt! > 2 * 60 * 1000) job = undefined;

    if (!job) {
      if (!body.upload) throw new NeedUpload();
      const limited = admit();
      if (limited) throw new HttpError(429, limited);
      const upload = await normalizeUpload(body.upload);
      job = startJob(key, () => runExercise(upload, context, reaction));
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([job.promise, new Promise((resolve) => { timer = setTimeout(resolve, WAIT_MS); })]);
    clearTimeout(timer);
    if (!job.outcome) throw new Pending();
    if (job.outcome.ok) return json({ output: job.outcome.value });
    if (jobs.get(key) === job) jobs.delete(key);
    throw job.outcome.error;
  } catch (error) {
    if (error instanceof Pending) return json({ pending: true }, 202);
    if (error instanceof NeedUpload) return json({ needUpload: true }, 409);
    const status = error instanceof HttpError ? error.status : error instanceof PassError ? 502 : 500;
    if (status >= 500) console.error(error);
    const message = status === 500 ? 'Something went wrong on our side. Try again.' : error instanceof Error ? error.message : String(error);
    return json({ error: message }, status);
  }
}
