import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import type { AppListing, CompetitorListing } from '../../supabase/functions/_shared/types.ts';

/** Where a piece of the blueprint came from. Anything not fetched is labelled unverified. */
export function Source({ fetched, children }: { fetched?: boolean; children?: ReactNode }) {
  return fetched
    ? <span className="source is-fetched" title="Taken from data Spinoff fetched">{children ?? 'From App Store'}</span>
    : <span className="source is-unverified" title="Claude’s judgment, not fetched data">Unverified</span>;
}

export function AppIcon({ app, size = 64 }: { app: Pick<AppListing, 'icon' | 'name'>; size?: number }) {
  return app.icon
    ? <img className="app-icon" src={app.icon} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="app-icon is-blank" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{app.name.slice(0, 1)}</span>;
}

export function Rating({ app }: { app: Pick<AppListing, 'rating' | 'rating_count'> }) {
  if (app.rating == null) return <span>No rating yet</span>;
  const count = app.rating_count != null ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(app.rating_count) : null;
  return <span className="rating" title={app.rating_count != null ? `${app.rating_count.toLocaleString()} ratings` : undefined}>
    <Star size={14} fill="currentColor" aria-hidden="true" />{app.rating.toFixed(1)}{count && <small> ({count})</small>}
  </span>;
}

export function price(app: Pick<CompetitorListing, 'formatted_price' | 'price'>) {
  return app.formatted_price || (app.price === 0 ? 'Free' : 'Price not listed');
}

/** One-screen-at-a-time frame used by every step after home. */
export function Screen({ kicker, title, sub, children, actions }: { kicker?: string; title: ReactNode; sub?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return <section className="screen">
    <div className="screen-body">
      {kicker && <p className="screen-kicker">{kicker}</p>}
      <h1 className="screen-title">{title}</h1>
      {sub && <p className="screen-sub">{sub}</p>}
      {children}
    </div>
    {actions && <div className="screen-actions">{actions}</div>}
  </section>;
}
