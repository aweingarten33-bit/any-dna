import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { Star } from 'lucide-react';
import type { AppListing, CompetitorListing } from '../../server/lib/types.ts';

/** Where a piece of the blueprint came from. Anything not fetched is labelled unverified. */
export function Source({ fetched, children }: { fetched?: boolean; children?: ReactNode }) {
  return fetched
    ? <span className="source is-fetched" title="Taken from data Spinoff fetched"><i aria-hidden="true" />{children ?? 'From App Store'}</span>
    : <span className="source is-unverified" title="The AI’s judgment, not fetched data"><i aria-hidden="true" />Unverified</span>;
}

export function AppIcon({ app, size = 64 }: { app: Pick<AppListing, 'icon' | 'name'>; size?: number }) {
  return app.icon
    ? <img className="app-icon" src={app.icon} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="app-icon is-blank" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{app.name.slice(0, 1)}</span>;
}

export function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

export function Rating({ app }: { app: Pick<AppListing, 'rating' | 'rating_count'> }) {
  if (app.rating == null) return <span>No rating yet</span>;
  return <span className="rating" title={app.rating_count != null ? `${app.rating_count.toLocaleString()} ratings` : undefined}>
    <Star size={13} fill="currentColor" aria-hidden="true" />{app.rating.toFixed(1)}{app.rating_count != null && <small> ({compact(app.rating_count)})</small>}
  </span>;
}

export function price(app: Pick<CompetitorListing, 'formatted_price' | 'price'>) {
  return app.formatted_price || (app.price === 0 ? 'Free' : 'Price not listed');
}

/** Monospace index label: "01 — The app". */
export function Label({ n, children }: { n?: string; children: ReactNode }) {
  return <p className="label">{n && <span className="label-n">{n}</span>}{n && <span className="label-dash" aria-hidden="true" />}<span>{children}</span></p>;
}

/** Headline whose words rise into place one after another. */
export function Split({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const words = text.split(' ');
  return <span className={`split${className ? ` ${className}` : ''}`} aria-label={text}>
    {words.map((word, i) => <Fragment key={i}>
      <span className="split-mask" aria-hidden="true">
        <span className="split-word" style={{ '--d': `${delay + i * 55}ms` } as CSSProperties}>{word}</span>
      </span>
      {i < words.length - 1 && ' '}
    </Fragment>)}
  </span>;
}

/** Children fade up in sequence. */
export function Stagger({ children, base = 0, step = 60, className, as: Tag = 'div' }: { children: ReactNode[]; base?: number; step?: number; className?: string; as?: 'div' | 'ol' | 'ul' }) {
  return <Tag className={className}>
    {children.map((child, i) => <Fade key={i} delay={base + i * step}>{child}</Fade>)}
  </Tag>;
}

export function Fade({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <div className="fade" style={{ '--d': `${delay}ms` } as CSSProperties}>{children}</div>;
}

/** One-screen-at-a-time frame used by every step after home. */
export function Screen({ label, n, title, sub, children, actions }: { label?: string; n?: string; title: string; sub?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return <section className="screen">
    <div className="screen-body">
      {label && <Label n={n}>{label}</Label>}
      <h1 className="screen-title"><Split text={title} delay={80} /></h1>
      {sub && <p className="screen-sub fade" style={{ '--d': '260ms' } as CSSProperties}>{sub}</p>}
      {children}
    </div>
    {actions && <div className="screen-actions">{actions}</div>}
  </section>;
}

/** Infinite text band, used on divider screens. */
export function Marquee({ items }: { items: string[] }) {
  const run = <span className="marquee-run">{items.map((item, i) => <span key={i}>{item}<i aria-hidden="true">✳</i></span>)}</span>;
  return <div className="marquee" aria-hidden="true"><div className="marquee-track">{run}{run}</div></div>;
}
