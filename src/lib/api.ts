// Calls to the Supabase edge functions.
import type { AppListing, CompetitorListing, Dissect, FitCheck, Gaps, Idea, ReviewsSummary, Verdict } from '../../supabase/functions/_shared/types.ts';

const BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export class ApiError extends Error {}

async function post<T>(name: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!BASE) throw new ApiError('Spinoff isn’t connected to its backend yet. Set VITE_SUPABASE_URL (see README).');
  let response: Response;
  try {
    response = await fetch(`${BASE}/functions/v1/${name}`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(KEY ? { apikey: KEY, Authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Couldn’t reach Spinoff. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Something went wrong (${response.status}).`);
  return data as T;
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
  fitCheck: (app: AppListing, audience: string, signal?: AbortSignal) =>
    post<{ output: FitCheck }>('run-pass', { pass: 'fit_check', app_id: app.app_id, country: app.country, audience }, signal),
  mutate: (app: AppListing, audience: string, fit_check: FitCheck, signal?: AbortSignal) =>
    post<{ output: Idea }>('run-pass', { pass: 'mutate', app_id: app.app_id, country: app.country, audience, fit_check }, signal),
  verdict: (app: AppListing, audience: string, idea: Idea, signal?: AbortSignal) =>
    post<{ output: Verdict; searched: CompetitorListing[] }>('run-pass', { pass: 'verdict', app_id: app.app_id, country: app.country, audience, idea }, signal),
};
