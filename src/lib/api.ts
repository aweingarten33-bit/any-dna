// Calls to Spinoff's API. Same origin in production; in development Vite
// forwards /api to the local server (see vite.config.ts).
import type { AppListing, BusinessPlan, Competitor, CompetitorListing, Dissect, Gaps, GeneratedIdea, Idea, Kit, ReviewsSummary, Upload, UploadRead } from '../../server/lib/types.ts';

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export class ApiError extends Error {}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

/**
 * POSTs to the API. A long AI step answers 202 "pending" while it works on the
 * server; we ask again with the same body, which joins the same job. A dropped
 * connection (a locked phone, a flaky network, a redeploy) is retried too, so
 * the work already done on the server isn't lost.
 */
async function post<T>(name: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let failures = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetch(`${BASE}/api/${name}`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      failures += 1;
      if (failures > 6) throw new ApiError('Couldn’t reach Spinoff. Check your connection and try again.');
      await wait(Math.min(1000 * 2 ** (failures - 1), 8000), signal);
      continue;
    }
    // Render answers 502/503 for a moment while a new version starts up.
    if ((response.status === 502 || response.status === 503) && !response.headers.get('content-type')?.includes('json') && failures < 6) {
      failures += 1;
      await wait(2000 * failures, signal);
      continue;
    }
    failures = 0;
    const data = await response.json().catch(() => ({}));
    if (response.status === 202 && data.pending) continue;
    if (!response.ok) throw new ApiError(data.error || `Something went wrong (${response.status}).`);
    return data as T;
  }
}

export const api = {
  resolveApp: (query: string, country: string, signal?: AbortSignal) =>
    post<{ candidates: AppListing[] }>('resolve-app', { query, country }, signal),
  getReviews: (app: AppListing, signal?: AbortSignal) =>
    post<{ summary: ReviewsSummary }>('get-reviews', { app_id: app.app_id, country: app.country }, signal),
  dissect: (app: AppListing, signal?: AbortSignal) =>
    post<{ output: Dissect }>('run-pass', { pass: 'dissect', app_id: app.app_id, country: app.country }, signal),
  gaps: (app: AppListing, signal?: AbortSignal) =>
    post<{ output: Gaps }>('run-pass', { pass: 'gaps', app_id: app.app_id, country: app.country }, signal),
  build: (app: AppListing, audience: string, signal?: AbortSignal) =>
    post<{ output: { idea: Idea } }>('run-pass', { pass: 'build', app_id: app.app_id, country: app.country, audience }, signal),
  compete: (app: AppListing, audience: string, idea: Idea, signal?: AbortSignal) =>
    post<{ competitors: Competitor[]; searched: CompetitorListing[] }>('run-pass', { pass: 'compete', app_id: app.app_id, country: app.country, audience, idea: { search_terms: idea.search_terms } }, signal),
  kit: (app: AppListing, audience: string, idea: Idea, signal?: AbortSignal) =>
    post<{ output: Kit }>('run-pass', { pass: 'kit', app_id: app.app_id, country: app.country, audience, idea }, signal),
  plan: (app: AppListing, audience: string, idea: Idea, signal?: AbortSignal) =>
    post<{ output: BusinessPlan }>('run-pass', { pass: 'plan', app_id: app.app_id, country: app.country, audience, idea }, signal),

  // ---- the new front door: ideas from the upload itself ----
  // Only suggest and read send the upload; the later steps work from the reading and the idea.
  flowSuggest: (upload: Upload, signal?: AbortSignal) =>
    post<{ output: { audiences: string[] } }>('flow-pass', { pass: 'suggest', upload }, signal),
  // The main system prompt, in the workbench's stages: 1+2 read the upload, 3 invents 3 ideas, 4 filters them.
  flowRead: (upload: Upload, audience: string, direction: string, signal?: AbortSignal) =>
    post<{ output: UploadRead }>('flow-pass', { pass: 'read', upload, audience, direction }, signal),
  flowInvent: (read: UploadRead, audience: string, direction: string, templateId: string | null, signal?: AbortSignal) =>
    post<{ output: GeneratedIdea[] }>('flow-pass', { pass: 'invent', read, audience, direction, templateId }, signal),
  flowFilter: (ideas: GeneratedIdea[], read: UploadRead, signal?: AbortSignal) =>
    post<{ output: GeneratedIdea[] }>('flow-pass', { pass: 'filter', ideas, read }, signal),
  flowCompete: (audience: string, idea: GeneratedIdea, signal?: AbortSignal) =>
    post<{ competitors: Competitor[]; searched: CompetitorListing[] }>('flow-pass', { pass: 'compete', audience, idea }, signal),
  flowKit: (audience: string, idea: GeneratedIdea, templateId: string | null, signal?: AbortSignal) =>
    post<{ output: Kit }>('flow-pass', { pass: 'kit', audience, idea, templateId }, signal),
  flowPlan: (audience: string, idea: GeneratedIdea, signal?: AbortSignal) =>
    post<{ output: BusinessPlan }>('flow-pass', { pass: 'plan', audience, idea }, signal),
};
