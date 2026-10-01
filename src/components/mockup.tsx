// A designed phone screen filled with the idea's own content. The designs are
// fixed and hand-made; only the words come from the AI, so it always looks right.
// Each template has its own layout (a countdown for deals, a map for "see your
// people", a deck for "swipe to match"...). The template cards show the same
// layout with sample content, so what you pick is what you get.
import type { CSSProperties } from 'react';
import { BarChart3, CalendarDays, Circle, Compass, Heart, Home, MessageCircle, Search, ShoppingBag, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import type { Kit } from '../../server/lib/types.ts';
import { templateById, type PhoneLayout } from '../../server/lib/templates.ts';

export type { PhoneLayout };

/** Accent colors chosen to look good on a white phone screen. */
const PALETTES = [
  { accent: '#ff5a36', deep: '#d93a17', soft: '#fff1ec' },
  { accent: '#2f6bff', deep: '#1a4fd6', soft: '#eef3ff' },
  { accent: '#12a37f', deep: '#0b7f62', soft: '#e7f7f1' },
  { accent: '#8b5cf6', deep: '#6d3fe0', soft: '#f3eeff' },
  { accent: '#e0453c', deep: '#b8302a', soft: '#fdeeed' },
  { accent: '#0f9bb5', deep: '#0a7a8f', soft: '#e6f7fa' },
];

function paletteFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

const TAB_ICONS: Array<[RegExp, LucideIcon]> = [
  [/today|home|feed|now/i, Home],
  [/week|calendar|schedule|plan|day/i, CalendarDays],
  [/family|friend|people|group|team|crew|community|club|circle/i, Users],
  [/profile|me|account|setting|you/i, UserRound],
  [/map|near|explore|discover|local/i, Compass],
  [/shop|store|deal|buy|market|order/i, ShoppingBag],
  [/stat|progress|insight|history|log|report/i, BarChart3],
  [/message|chat|inbox/i, MessageCircle],
  [/saved|favou?rite|like/i, Heart],
  [/search|find/i, Search],
];

function tabIcon(label: string): LucideIcon {
  return TAB_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? Circle;
}

/** The screen design a template uses. "Let it decide" uses the list. */
export function layoutFor(templateId: string | null | undefined): PhoneLayout {
  return templateById(templateId)?.layout ?? 'list';
}

type Screen = Kit['screen'];

function Hero({ screen }: { screen: Screen }) {
  return <section className="phone-hero">
    <span>{screen.hero_label}</span>
    <b>{screen.hero_value}</b>
    <button type="button" tabIndex={-1}>{screen.primary_action}</button>
  </section>;
}

function Cards({ cards }: { cards: Screen['cards'] }) {
  return <ul className="phone-cards">
    {cards.map((card, i) => <li key={i}>
      <span className="phone-dot" aria-hidden="true">{card.title.slice(0, 1)}</span>
      <span className="phone-card-text"><b>{card.title}</b><small>{card.detail}</small></span>
      <span className="phone-tag">{card.tag}</span>
    </li>)}
  </ul>;
}

/** Deals and auctions: a ticking ring, then offers with their prices. */
function CountdownBody({ screen }: { screen: Screen }) {
  return <>
    <section className="phone-count">
      <div className="phone-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" /><circle cx="60" cy="60" r="52" className="is-left" /></svg></div>
      <div className="phone-count-text"><span>{screen.hero_label}</span><b>{screen.hero_value}</b></div>
    </section>
    <ul className="phone-offers">
      {screen.cards.map((card, i) => <li key={i}>
        <span className="phone-offer-art" aria-hidden="true">{card.title.slice(0, 1)}</span>
        <b>{card.title}</b><small>{card.detail}</small><em>{card.tag}</em>
      </li>)}
    </ul>
    <button type="button" tabIndex={-1} className="phone-cta">{screen.primary_action}</button>
  </>;
}

/** People and places: a live map with pins, and a sheet of what's nearby. */
function MapBody({ screen }: { screen: Screen }) {
  const pins = [[28, 34], [64, 22], [72, 58], [38, 66]];
  return <>
    <section className="phone-map" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M-5 30 L105 42 M20 -5 L34 105 M-5 76 L105 62 M70 -5 L58 105" /><path d="M-5 52 Q50 40 105 50" className="is-main" /></svg>
      {screen.cards.slice(0, 3).map((card, i) => <span key={i} className="phone-pin" style={{ left: `${pins[i][0]}%`, top: `${pins[i][1]}%` } as CSSProperties}>{card.title.slice(0, 1)}</span>)}
      <span className="phone-pin is-me" style={{ left: `${pins[3][0]}%`, top: `${pins[3][1]}%` } as CSSProperties} />
      <span className="phone-map-chip"><b>{screen.hero_value}</b> {screen.hero_label}</span>
    </section>
    <div className="phone-sheet">
      <i className="phone-grabber" aria-hidden="true" />
      <Cards cards={screen.cards.slice(0, 2)} />
      <button type="button" tabIndex={-1} className="phone-cta">{screen.primary_action}</button>
    </div>
  </>;
}

/** Streaks and daily things: one big number and the week so far. */
function StreakBody({ screen }: { screen: Screen }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return <>
    <section className="phone-streak">
      <span>{screen.hero_label}</span>
      <b>{screen.hero_value}</b>
      <ol className="phone-week" aria-hidden="true">{days.map((day, i) => <li key={i} className={i < 5 ? 'is-done' : i === 5 ? 'is-today' : ''}><i />{day}</li>)}</ol>
      <button type="button" tabIndex={-1}>{screen.primary_action}</button>
    </section>
    <Cards cards={screen.cards.slice(0, 2)} />
  </>;
}

/** Choosing: a deck of cards to pass or pick. */
function SwipeBody({ screen }: { screen: Screen }) {
  const [front, ...rest] = screen.cards;
  return <>
    <section className="phone-deck">
      {rest.slice(0, 2).map((card, i) => <div key={i} className={`phone-deck-card is-back-${i + 1}`} aria-hidden="true">{card.title}</div>)}
      {front && <div className="phone-deck-card is-front">
        <div className="phone-deck-art" aria-hidden="true"><span>{front.title.slice(0, 1)}</span><em>{front.tag}</em></div>
        <b>{front.title}</b><small>{front.detail}</small>
      </div>}
    </section>
    <div className="phone-choices" aria-hidden="true">
      <span className="is-pass"><X size={22} strokeWidth={2.6} /></span>
      <span className="is-pick"><Heart size={22} strokeWidth={2.4} fill="currentColor" /></span>
    </div>
    <p className="phone-hint">{screen.hero_label}: <b>{screen.hero_value}</b></p>
  </>;
}

export function PhoneMockup({ name, screen, layout = 'list' }: { name: string; screen: Screen; layout?: PhoneLayout }) {
  const palette = paletteFor(name);
  const style = { '--m-accent': palette.accent, '--m-deep': palette.deep, '--m-soft': palette.soft } as CSSProperties;
  return <figure className={`phone is-${layout}`} style={style} aria-label={`What the main screen of ${name} could look like`}>
    <div className="phone-screen">
      <div className="phone-status" aria-hidden="true">
        <span>9:41</span>
        <i className="phone-island" />
        <span className="phone-status-icons"><b /><b /><b /><em /></span>
      </div>
      <header className="phone-head">
        <span className="phone-greet">{screen.greeting}</span>
        <strong className="phone-title">{screen.title}</strong>
      </header>
      {layout === 'countdown' ? <CountdownBody screen={screen} />
        : layout === 'map' ? <MapBody screen={screen} />
        : layout === 'streak' ? <StreakBody screen={screen} />
        : layout === 'swipe' ? <SwipeBody screen={screen} />
        : <><Hero screen={screen} /><Cards cards={screen.cards} /></>}
      <nav className="phone-tabs" aria-hidden="true">
        {screen.tabs.map((tab, i) => {
          const Icon = tabIcon(tab);
          return <span key={tab} className={i === 0 ? 'is-on' : ''}><Icon size={19} strokeWidth={i === 0 ? 2.4 : 1.8} />{tab}</span>;
        })}
      </nav>
      <i className="phone-home-bar" aria-hidden="true" />
    </div>
  </figure>;
}

export function PhoneSkeleton() {
  return <figure className="phone is-loading" aria-label="Drawing the screen">
    <div className="phone-screen">
      <div className="phone-status" aria-hidden="true"><span>9:41</span><i className="phone-island" /><span /></div>
      <div className="skel skel-line short" /><div className="skel skel-line" />
      <div className="skel skel-hero" />
      <div className="skel skel-card" /><div className="skel skel-card" /><div className="skel skel-card" />
    </div>
  </figure>;
}
