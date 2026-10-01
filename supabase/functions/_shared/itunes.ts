// Apple's public iTunes Search / Lookup API. No key needed.
// Docs: https://performance-partners.apple.com/search-api
import type { AppListing, CompetitorListing } from './types.ts';

const BASE = 'https://itunes.apple.com';

export type AppInput = { appId: string | null; term: string | null; country: string };

/** Accepts an App Store link, a bare numeric ID, or an app name. */
export function parseAppInput(raw: string, fallbackCountry = 'us'): AppInput {
  const text = raw.trim();
  const country = text.match(/apple\.com\/([a-z]{2})\//i)?.[1]?.toLowerCase() ?? fallbackCountry;
  const fromLink = text.match(/\/id(\d{5,})/i)?.[1] ?? text.match(/[?&]id=(\d{5,})/i)?.[1];
  if (fromLink) return { appId: fromLink, term: null, country };
  if (/^(id)?\d{5,}$/i.test(text)) return { appId: text.replace(/^id/i, ''), term: null, country };
  return { appId: null, term: text, country };
}

type ItunesResult = {
  trackId: number;
  trackName: string;
  artistName?: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  price?: number;
  formattedPrice?: string;
  currency?: string;
  primaryGenreName?: string;
  genres?: string[];
  description?: string;
  trackViewUrl?: string;
  kind?: string;
  wrapperType?: string;
};

async function getJson(url: string): Promise<{ resultCount: number; results: ItunesResult[] }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`App Store returned ${response.status}`);
  // Apple sometimes serves this JSON as text/javascript, so parse the text ourselves.
  return JSON.parse(await response.text());
}

function isApp(result: ItunesResult) {
  return result.kind === 'software' || result.wrapperType === 'software';
}

export function toListing(result: ItunesResult, country: string): AppListing {
  return {
    app_id: String(result.trackId),
    country,
    name: result.trackName,
    developer: result.artistName ?? '',
    icon: result.artworkUrl512 ?? result.artworkUrl100 ?? '',
    rating: typeof result.averageUserRating === 'number' ? Math.round(result.averageUserRating * 10) / 10 : null,
    rating_count: result.userRatingCount ?? null,
    price: typeof result.price === 'number' ? result.price : null,
    formatted_price: result.formattedPrice ?? (result.price === 0 ? 'Free' : ''),
    currency: result.currency ?? null,
    category: result.primaryGenreName ?? '',
    genres: result.genres ?? [],
    description: (result.description ?? '').slice(0, 4000),
    url: result.trackViewUrl ?? '',
  };
}

export async function lookupApp(appId: string, country: string): Promise<AppListing | null> {
  const data = await getJson(`${BASE}/lookup?id=${encodeURIComponent(appId)}&country=${country}&entity=software`);
  const hit = data.results.find(isApp);
  return hit ? toListing(hit, country) : null;
}

export async function searchApps(term: string, country: string, limit = 5): Promise<AppListing[]> {
  const data = await getJson(`${BASE}/search?term=${encodeURIComponent(term)}&country=${country}&entity=software&limit=${limit}`);
  return data.results.filter(isApp).map((result) => toListing(result, country));
}

/**
 * Search the store for each term and merge the results: the apps a person
 * would actually find if they went looking for the new idea.
 */
export async function searchCompetitors(terms: string[], country: string, excludeAppId: string, perTerm = 8, max = 15): Promise<CompetitorListing[]> {
  const unique = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 4);
  const settled = await Promise.allSettled(unique.map((term) => searchApps(term, country, perTerm).then((apps) => ({ term, apps }))));
  const seen = new Set([excludeAppId]);
  const found: CompetitorListing[] = [];
  // Interleave terms so one broad term can't crowd out the others.
  const lists = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  for (let rank = 0; rank < perTerm; rank += 1) {
    for (const { term, apps } of lists) {
      const app = apps[rank];
      if (!app || seen.has(app.app_id)) continue;
      seen.add(app.app_id);
      found.push({
        app_id: app.app_id, name: app.name, developer: app.developer, icon: app.icon, rating: app.rating, rating_count: app.rating_count,
        price: app.price, formatted_price: app.formatted_price, category: app.category, url: app.url, matched_term: term,
      });
    }
  }
  if (!lists.length && unique.length) throw new Error('App Store search failed for every term');
  return found.slice(0, max);
}
