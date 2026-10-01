// The ideas that passed the filter. Pick one, or send the whole batch back and
// generate a better direction without redoing source research.
import { useState, type CSSProperties } from 'react';
import { Screen } from '@/components/bits';
import { api } from '@/lib/api';
import type { Competitor, CompetitorListing, GeneratedIdea } from '../../server/lib/types.ts';

export type RegenerateKind = 'new' | 'weirder' | 'useful' | 'angle';

export function NewPick({ ideas, found, audience, onChoose, onRegenerate }: {
  ideas: GeneratedIdea[];
  found?: Array<{ competitors: Competitor[]; searched: CompetitorListing[] }>;
  audience: string;
  onChoose: (idea: GeneratedIdea, found: { competitors: Competitor[]; searched: CompetitorListing[] }) => void;
  onRegenerate: (kind: RegenerateKind) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(idea: GeneratedIdea) {
    if (busy) return;
    setBusy(idea.name);
    setError(null);
    try {
      const known = found?.[ideas.indexOf(idea)];
      onChoose(idea, known?.searched.length ? known : await api.compete(audience, idea));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  return <Screen title={ideas.length > 1 ? 'Pick one' : 'Your idea'}
    sub={ideas.length > 1 ? 'Choose one, or send the whole batch back for a better direction.' : 'Open it, or try another direction.'}>
    <ul className="pick-list">
      {ideas.map((idea, i) => <li key={idea.name} className="fade" style={{ '--d': `${240 + i * 80}ms` } as CSSProperties}>
        <button type="button" className={`pick-card${busy === idea.name ? ' is-busy' : ''}`} disabled={!!busy} onClick={() => void choose(idea)} data-testid="button-pick">
          <b className="pick-name">{idea.name}</b>
          <p className="pick-tagline">{idea.tagline}</p>
          <p className="pick-what">{idea.what_it_is}</p>
          <span className="pick-go">{busy === idea.name ? <>Opening <i className="pulse-dot" /></> : 'Open idea'}</span>
        </button>
      </li>)}
    </ul>

    <section className="plan-cta" aria-label="Try a different direction">
      <p>None of these?</p>
      <div className="verdict-actions">
        <button type="button" className="btn-pill is-primary" disabled={!!busy} onClick={() => onRegenerate('new')}><span>New ideas</span></button>
        <button type="button" className="btn-pill" disabled={!!busy} onClick={() => onRegenerate('weirder')}><span>Weirder</span></button>
        <button type="button" className="btn-pill" disabled={!!busy} onClick={() => onRegenerate('useful')}><span>More useful</span></button>
        <button type="button" className="btn-pill" disabled={!!busy} onClick={() => onRegenerate('angle')}><span>Different angle</span></button>
      </div>
    </section>
    {error && <p className="flow-error" role="alert">{error}</p>}
  </Screen>;
}
