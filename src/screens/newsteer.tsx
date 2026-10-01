// Optional: steer the idea with a proven trick from a real app (like
// Videoleap's template gallery). Skipping lets the upload decide alone.
import { useState, type CSSProperties } from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { Screen } from '@/components/bits';
import { TEMPLATES } from '../../server/lib/templates.ts';

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
          <span className="tpl-top"><small>Like {template.sourceApp}</small><span className="tpl-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span></span>
          <b>{template.name}</b>
          <p>{template.trick}</p>
        </button>
      </li>)}
    </ul>
  </Screen>;
}
