// A designed phone screen filled with the idea's own content. The design is
// fixed and hand-made; only the words come from the AI, so it always looks right.
import type { CSSProperties } from 'react';
import { BarChart3, CalendarDays, Circle, Compass, Heart, Home, MessageCircle, Search, ShoppingBag, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { Kit } from '../../server/lib/types.ts';

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

export function PhoneMockup({ name, screen }: { name: string; screen: Kit['screen'] }) {
  const palette = paletteFor(name);
  const style = { '--m-accent': palette.accent, '--m-deep': palette.deep, '--m-soft': palette.soft } as CSSProperties;
  return <figure className="phone" style={style} aria-label={`What the main screen of ${name} could look like`}>
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
      <section className="phone-hero">
        <span>{screen.hero_label}</span>
        <b>{screen.hero_value}</b>
        <button type="button" tabIndex={-1}>{screen.primary_action}</button>
      </section>
      <ul className="phone-cards">
        {screen.cards.map((card, i) => <li key={i}>
          <span className="phone-dot" aria-hidden="true">{card.title.slice(0, 1)}</span>
          <span className="phone-card-text"><b>{card.title}</b><small>{card.detail}</small></span>
          <span className="phone-tag">{card.tag}</span>
        </li>)}
      </ul>
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
