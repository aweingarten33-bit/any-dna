// app_cache: one row per (app_id, country). Holds the listing, the reviews and
// the audience-independent passes (dissect, gaps) so "Try a different
// audience" reruns only the passes that depend on the audience.
// Uses Postgres when DATABASE_URL is set; otherwise memory (lost on restart).
import postgres from 'npm:postgres@^3.4.5';
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
  fetched_at: string | Date | null;
  reviews_fetched_at: string | Date | null;
};

const JSON_COLUMNS = ['listing_json', 'reviews_json', 'analysis_json'] as const;

const memory = new Map<string, CacheRow>();
let sql: postgres.Sql | null | undefined;

function db(): postgres.Sql | null {
  if (sql !== undefined) return sql;
  const url = Deno.env.get('DATABASE_URL');
  sql = url ? postgres(url, { max: 5, idle_timeout: 30, onnotice: () => {}, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'prefer' }) : null;
  return sql;
}

/** Creates the tables if they don't exist. Called once at startup. */
export async function migrate(schema: string): Promise<boolean> {
  const client = db();
  if (!client) return false;
  await client.unsafe(schema);
  return true;
}

export function isFresh(value: string | Date | null | undefined, ttl: number) {
  return !!value && Date.now() - new Date(value).getTime() < ttl;
}

export async function getRow(appId: string, country: string): Promise<CacheRow | null> {
  const client = db();
  if (!client) return memory.get(`${country}:${appId}`) ?? null;
  const [row] = await client<CacheRow[]>`select * from app_cache where app_id = ${appId} and country = ${country}`;
  return row ? { ...row, analysis_json: row.analysis_json ?? {} } : null;
}

async function upsert(row: Partial<CacheRow> & { app_id: string; country: string }) {
  const client = db();
  if (!client) {
    const key = `${row.country}:${row.app_id}`;
    const current = memory.get(key) ?? { app_id: row.app_id, country: row.country, listing_json: null, reviews_json: null, analysis_json: {}, fetched_at: null, reviews_fetched_at: null };
    memory.set(key, { ...current, ...row });
    return;
  }
  // deno-lint-ignore no-explicit-any -- postgres.js types dynamic column objects loosely
  const values: Record<string, any> = { ...row };
  for (const column of JSON_COLUMNS) if (column in values) values[column] = client.json(values[column] as postgres.JSONValue);
  const updates = Object.keys(values).filter((column) => column !== 'app_id' && column !== 'country');
  await client`insert into app_cache ${client(values)}
    on conflict (app_id, country) do update set ${client(values, updates)}`;
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
