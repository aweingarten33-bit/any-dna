// Review providers. Swap with the REVIEW_PROVIDER secret:
//   apple-rss (default) Apple's public customer-reviews feed, ~500 most recent reviews
//   scraper             your own scraper; fill in scraperProvider below
//   none                no reviews (the gaps pass then reports nothing)
import type { Review } from './types.ts';

export type ReviewProvider = {
  name: string;
  /** Recent reviews of any rating. Filtering to 1 to 3 stars happens in getLowStarReviews. */
  fetchRecent(appId: string, country: string): Promise<Review[]>;
};

type FeedEntry = {
  id?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  updated?: { label?: string };
  'im:rating'?: { label?: string };
};

export const appleRssProvider: ReviewProvider = {
  name: 'apple-rss',
  async fetchRecent(appId, country) {
    const reviews: Review[] = [];
    // The feed serves up to 10 pages of 50. Stop at the first empty or failed page.
    for (let page = 1; page <= 10; page += 1) {
      const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
      let entries: FeedEntry[] = [];
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) break;
        const data = JSON.parse(await response.text());
        const raw = data?.feed?.entry;
        entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
      } catch {
        break;
      }
      const parsed = entries
        .filter((entry) => entry['im:rating']?.label)
        .map((entry) => ({
          id: entry.id?.label ?? crypto.randomUUID(),
          rating: Number(entry['im:rating']?.label),
          title: entry.title?.label ?? '',
          body: entry.content?.label ?? '',
          updated: entry.updated?.label ?? null,
        }));
      if (!parsed.length) break;
      reviews.push(...parsed);
    }
    return reviews;
  },
};

export const scraperProvider: ReviewProvider = {
  name: 'scraper',
  fetchRecent(_appId, _country) {
    // Plug your scraper in here. Return recent reviews of any rating.
    throw new Error('REVIEW_PROVIDER=scraper is selected but no scraper is wired up yet (see _shared/reviews.ts).');
  },
};

export const noReviewsProvider: ReviewProvider = { name: 'none', fetchRecent: () => Promise.resolve([]) };

export function reviewProvider(name = Deno.env.get('REVIEW_PROVIDER') ?? 'apple-rss'): ReviewProvider {
  if (name === 'scraper') return scraperProvider;
  if (name === 'none') return noReviewsProvider;
  return appleRssProvider;
}

export async function getLowStarReviews(provider: ReviewProvider, appId: string, country: string) {
  const all = await provider.fetchRecent(appId, country);
  const lowStar = all.filter((review) => review.rating >= 1 && review.rating <= 3 && (review.body || review.title));
  return { scanned: all.length, lowStar };
}
