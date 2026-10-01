// Apple's public iTunes Search / Lookup API. No key needed.
// Docs: https://performance-partners.apple.com/search-api
import type { AppListing, CompetitorListing, Competitor } from './types.ts';

const BASE = 'https://itunes.apple.com';

/** The App Store was unreachable or errored: shown to the user as-is. */
export class AppStoreError extends Error {}

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
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  } catch {
    throw new AppStoreError('Couldn’t reach the App Store. Please try again.');
  }
  if (!response.ok) throw new AppStoreError(`The App Store returned an error (${response.status}). Please try again.`);
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
  const seen = new Map<string, CompetitorListing>();
  const found: CompetitorListing[] = [];
  // Interleave terms so one broad term can't crowd out the others.
  const lists = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  for (let rank = 0; rank < perTerm; rank += 1) {
    for (const { term, apps } of lists) {
      const app = apps[rank];
      if (!app || app.app_id === excludeAppId) continue;
      const known = seen.get(app.app_id);
      if (known) { if (!known.matched_terms!.includes(term)) known.matched_terms!.push(term); continue; }
      const listing: CompetitorListing = {
        app_id: app.app_id, name: app.name, developer: app.developer, icon: app.icon, rating: app.rating, rating_count: app.rating_count,
        price: app.price, formatted_price: app.formatted_price, category: app.category, url: app.url, matched_term: term, matched_terms: [term],
      };
      seen.set(app.app_id, listing);
      found.push(listing);
    }
  }
  if (!lists.length && unique.length) throw new AppStoreError('Couldn’t search the App Store for competitors. Please try again.');
  return found.slice(0, max);
}

/**
 * The closest competitors, chosen by plain rules instead of the AI: apps that
 * came up for more of the idea's searches first, then by search rank.
 */
export function closestCompetitors(searched: CompetitorListing[], max = 5): Competitor[] {
  return searched
    .map((app, rank) => ({ app, rank, hits: app.matched_terms?.length ?? 1 }))
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank)
    .slice(0, max)
    .map(({ app }) => {
      const terms = (app.matched_terms ?? [app.matched_term]).map((term) => `“${term}”`);
      const list = terms.length > 1 ? `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1]}` : terms[0];
      return { ...app, overlap: `Comes up when you search ${list}.` };
    });
}

/** Real facts about a song, from Apple Music's public search. */
export type SongFacts = { track: string; artist: string; album: string; genre: string; year: string };

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * If the user's words name a song, find it on Apple Music. Only a confident
 * match counts: the song's title must appear in what they typed, and so must
 * the artist or the word "song", so ordinary sentences don't match by accident.
 */
export async function findSong(text: string, country = 'us'): Promise<SongFacts | null> {
  const words = norm(text);
  if (!words || words.length > 200) return null;
  const data = await getJson(`${BASE}/search?term=${encodeURIComponent(text.slice(0, 120))}&country=${country}&entity=song&limit=5`);
  for (const result of data.results as Array<Record<string, unknown>>) {
    const track = typeof result.trackName === 'string' ? result.trackName : '';
    const artist = typeof result.artistName === 'string' ? result.artistName : '';
    const title = norm(track.replace(/\s*[([].*$/, ''));
    if (title.length < 3 || !words.includes(title)) continue;
    if (!words.includes(norm(artist)) && !/\bsong\b/.test(words)) continue;
    return {
      track, artist,
      album: typeof result.collectionName === 'string' ? result.collectionName : '',
      genre: typeof result.primaryGenreName === 'string' ? result.primaryGenreName : '',
      year: typeof result.releaseDate === 'string' ? result.releaseDate.slice(0, 4) : '',
    };
  }
  return null;
}
