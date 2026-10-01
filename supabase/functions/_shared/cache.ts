// app_cache: one row per (app_id, country). Holds the listing, the reviews and
// the audience-independent passes (dissect, gaps) so "Try a different
// audience" reruns only the passes that depend on the audience.
// Without SUPABASE_URL (local dev) it falls back to memory.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2.50.0';
import type { AppListing, Dissect, Gaps, Review, ReviewsSummary } from './types.ts';

export const LISTING_TTL_MS = 7 * 24 * 3600 * 1000;
export const REVIEWS_TTL_MS = 3 * 24 * 3600 * 1000;

export type CachedAnalysis = { dissect?: Dissect; gaps?: Gaps };

export type CacheRow = {
  app_id: string;
  country: string;
  listing_json: AppListing | null;
  reviews_json: { summary: ReviewsSummary; reviews: Review[] } | null;
  analysis_json: CachedAnalysis;
  fetched_at: string | null;
  reviews_fetched_at: string | null;
};

const memory = new Map<string, CacheRow>();
let client: SupabaseClient | null | undefined;

function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export function isFresh(iso: string | null | undefined, ttl: number) {
  return !!iso && Date.now() - new Date(iso).getTime() < ttl;
}

export async function getRow(appId: string, country: string): Promise<CacheRow | null> {
  const supabase = db();
  if (!supabase) return memory.get(`${country}:${appId}`) ?? null;
  const { data, error } = await supabase.from('app_cache').select('*').eq('app_id', appId).eq('country', country).maybeSingle();
  if (error) throw new Error(`Cache read failed: ${error.message}`);
  return data ? { ...data, analysis_json: data.analysis_json ?? {} } as CacheRow : null;
}

async function upsert(row: Partial<CacheRow> & { app_id: string; country: string }) {
  const supabase = db();
  if (!supabase) {
    const key = `${row.country}:${row.app_id}`;
    const current = memory.get(key) ?? { app_id: row.app_id, country: row.country, listing_json: null, reviews_json: null, analysis_json: {}, fetched_at: null, reviews_fetched_at: null };
    memory.set(key, { ...current, ...row });
    return;
  }
  const { error } = await supabase.from('app_cache').upsert(row, { onConflict: 'app_id,country' });
  if (error) throw new Error(`Cache write failed: ${error.message}`);
}

export function saveListing(listing: AppListing) {
  return upsert({ app_id: listing.app_id, country: listing.country, listing_json: listing, fetched_at: new Date().toISOString() });
}

/** New reviews invalidate the passes that were built from the old ones. */
export function saveReviews(appId: string, country: string, summary: ReviewsSummary, reviews: Review[]) {
  return upsert({ app_id: appId, country, reviews_json: { summary, reviews }, reviews_fetched_at: summary.fetched_at, analysis_json: {} });
}

export async function saveAnalysis(appId: string, country: string, patch: CachedAnalysis) {
  const current = await getRow(appId, country);
  return upsert({ app_id: appId, country, analysis_json: { ...(current?.analysis_json ?? {}), ...patch } });
}
