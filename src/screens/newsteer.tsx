// Optional: steer the idea with a proven trick from a real app (like
// Videoleap's template gallery). Skipping lets the upload decide alone.
import { useState, type CSSProperties } from 'react';
import { ArrowBigUp, ArrowRight, Camera, Check, Flame, Footprints, Gavel, Heart, MapPin, Puzzle, Receipt, Route, ScanSearch, Sparkles, Timer, Users, type LucideIcon } from 'lucide-react';
import { Screen } from '@/components/bits';
import { TEMPLATES } from '../../server/lib/templates.ts';

/** A picture for each template, like Videoleap's template thumbnails. */
const LOOKS: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  'last-minute-deal': { icon: Timer, from: '#ff7a45', to: '#d9361b' },
  'crowd-keeps-fresh': { icon: Users, from: '#22c3a6', to: '#0b7f62' },
  streak: { icon: Flame, from: '#ffb020', to: '#f05a1a' },
  'people-map': { icon: MapPin, from: '#4f86ff', to: '#1a4fd6' },
  'swipe-match': { icon: Heart, from: '#ff5f8f', to: '#d6245a' },
  'everyone-at-once': { icon: Camera, from: '#3a3f4b', to: '#0f1115' },
  'walk-to-collect': { icon: Footprints, from: '#7bd35a', to: '#2f9a3a' },
  'point-to-know': { icon: ScanSearch, from: '#2fb8ff', to: '#1660e0' },
  'split-bill': { icon: Receipt, from: '#25c48a', to: '#118060' },
  'highest-bid': { icon: Gavel, from: '#f5c542', to: '#c7891a' },
  'crowd-votes': { icon: ArrowBigUp, from: '#ff6a3d', to: '#e2401b' },
  'daily-puzzle': { icon: Puzzle, from: '#8b5cf6', to: '#5b2fd0' },
  'race-strangers': { icon: Route, from: '#ff8a3d', to: '#e2531b' },
};

function Thumb({ id }: { id: string }) {
  const look = LOOKS[id] ?? { icon: Sparkles, from: '#4f86ff', to: '#8b5cf6' };
  const Icon = look.icon;
  return <span className="tpl-thumb" style={{ '--a': look.from, '--b': look.to } as CSSProperties} aria-hidden="true">
    <i /><i /><Icon size={30} strokeWidth={2} />
  </span>;
}

export function NewSteer({ initial, onPick }: { initial: string | null; onPick: (templateId: string | null) => void }) {
  const [picked, setPicked] = useState<string | null>(initial);
  const chosen = TEMPLATES.find((template) => template.id === picked);
  return <Screen n="02" label="Optional" title="Steer it?"
    sub="Pick a proven trick from a real app to build in, or let what you dropped in decide."
    actions={<>
      <button type="button" className="btn-pill is-primary" onClick={() => onPick(picked)} data-testid="button-steer">
        <span>{chosen ? <>Build it with <em>{chosen.name.toLowerCase()}</em></> : 'Let it decide'}</span><ArrowRight size={18} />
      </button>
    </>}>
    <ul className="tpl-grid" role="radiogroup" aria-label="Templates">
      <li className="fade" style={{ '--d': '260ms' } as CSSProperties}>
        <button type="button" role="radio" aria-checked={picked === null} className={`tpl-card is-auto${picked === null ? ' is-on' : ''}`} onClick={() => setPicked(null)}>
          <span className="tpl-top"><Sparkles size={18} /><span className="tpl-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span></span>
          <b>Let it decide</b>
          <p>The pattern comes only from what you dropped in.</p>
        </button>
      </li>
      {TEMPLATES.map((template, i) => <li key={template.id} className="fade" style={{ '--d': `${300 + i * 35}ms` } as CSSProperties}>
        <button type="button" role="radio" aria-checked={picked === template.id} className={`tpl-card${picked === template.id ? ' is-on' : ''}`}
          onClick={() => setPicked(picked === template.id ? null : template.id)}>
          <Thumb id={template.id} />
          <span className="tpl-top"><small>Like {template.sourceApp}</small><span className="tpl-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span></span>
          <b>{template.name}</b>
          <p>{template.trick}</p>
        </button>
      </li>)}
    </ul>
  </Screen>;
}
