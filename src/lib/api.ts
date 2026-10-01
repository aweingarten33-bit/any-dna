// Calls to the API. Same origin in production; in development Vite forwards
// /api to the local server (see vite.config.ts).
import type { BusinessPlan, Competitor, CompetitorListing, DnaMechanism, ExerciseTurn, FilterResult, GeneratedIdea, GenerateMode, Kit, SourceResearch, Upload, UploadRead } from '../../server/lib/types.ts';

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export class ApiError extends Error {}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

/**
 * POSTs to the API. A long AI step answers 202 "pending" while it works on the
 * server; we ask again, which joins the same job. Check-ins send `checkIn`
 * (the body without the upload's bytes); if the server lost the job (a
 * restart), it answers 409 and we send the full body once more.
 */
async function post<T>(name: string, body: unknown, signal?: AbortSignal, checkIn: unknown = body): Promise<T> {
  let failures = 0;
  let next = body;
  for (;;) {
    let response: Response;
    try {
      response = await fetch(`${BASE}/api/${name}`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      failures += 1;
      if (failures > 6) throw new ApiError('Couldn’t reach the server. Check your connection and try again.');
      await wait(Math.min(1000 * 2 ** (failures - 1), 8000), signal);
      continue;
    }
    if ((response.status === 502 || response.status === 503) && !response.headers.get('content-type')?.includes('json') && failures < 6) {
      failures += 1;
      await wait(2000 * failures, signal);
      continue;
    }
    failures = 0;
    const data = await response.json().catch(() => ({}));
    if (response.status === 202 && data.pending) { next = checkIn; continue; }
    if (response.status === 409 && data.needUpload && next !== body) { next = body; continue; }
    if (!response.ok) throw new ApiError(data.error || `Something went wrong (${response.status}).`);
    return data as T;
  }
}

/** The upload's fingerprint: the same one the server computes, so check-ins don't resend the bytes. */
export async function fingerprint(upload: Upload): Promise<string> {
  const payload = upload.kind === 'text' ? upload.text : upload.kind === 'link' ? upload.url : upload.kind === 'video' ? upload.frames.join('|') : upload.dataUrl;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${upload.kind}:${payload}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A call that reads the upload: bytes go up once, check-ins carry only the fingerprint. */
async function withUpload<T>(name: string, upload: Upload, rest: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const uploadRef = await fingerprint(upload);
  return post<T>(name, { ...rest, upload, uploadRef }, signal, { ...rest, uploadRef });
}

export const api = {
  // ACTIVE CORE: one creative turn. No online research/competitor pass before ideas.
  exercise: (upload: Upload, context: string, reaction: string, signal?: AbortSignal) =>
    withUpload<{ output: ExerciseTurn }>('exercise', upload, { context, reaction }, signal),

  // Legacy endpoints kept so old saved ideas can still open their build/plan tools.
  suggest: (upload: Upload, signal?: AbortSignal) =>
    withUpload<{ output: { audiences: string[] } }>('flow-pass', upload, { pass: 'suggest' }, signal),
  research: (upload: Upload, about: string, signal?: AbortSignal) =>
    withUpload<{ output: SourceResearch }>('flow-pass', upload, { pass: 'research', about }, signal),
  dna: (research: SourceResearch, signal?: AbortSignal) =>
    post<{ output: DnaMechanism[] }>('flow-pass', { pass: 'dna', research }, signal),
  generate: (input: { read: UploadRead; second?: UploadRead; audience: string; direction: string; templateId: string | null; mode: GenerateMode | 'collide' | null; feedback: FilterResult['rejected'] }, signal?: AbortSignal) =>
    post<{ output: GeneratedIdea[] }>('flow-pass', { pass: 'generate', ...input }, signal),
  filter: (ideas: GeneratedIdea[], signal?: AbortSignal) =>
    post<{ output: FilterResult }>('flow-pass', { pass: 'filter', ideas }, signal),
  compete: (audience: string, idea: GeneratedIdea, signal?: AbortSignal) =>
    post<{ competitors: Competitor[]; searched: CompetitorListing[] }>('flow-pass', { pass: 'compete', audience, idea }, signal),
  kit: (audience: string, idea: GeneratedIdea, templateId: string | null, signal?: AbortSignal) =>
    post<{ output: Kit }>('flow-pass', { pass: 'kit', audience, idea, templateId }, signal),
  plan: (audience: string, idea: GeneratedIdea, signal?: AbortSignal) =>
    post<{ output: BusinessPlan }>('flow-pass', { pass: 'plan', audience, idea }, signal),
};
