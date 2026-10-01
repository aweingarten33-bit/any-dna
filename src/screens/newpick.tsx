// The ideas that passed the stranger test. Pick one to open its blueprint;
// competitors are looked up on the App Store as soon as you pick (no AI).
import { useState, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { Screen } from '@/components/bits';
import { api } from '@/lib/api';
import type { Competitor, CompetitorListing, GeneratedIdea } from '../../server/lib/types.ts';

export function NewPick({ ideas, audience, onChoose }: {
  ideas: GeneratedIdea[];
  audience: string;
  onChoose: (idea: GeneratedIdea, found: { competitors: Competitor[]; searched: CompetitorListing[] }) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(idea: GeneratedIdea) {
    if (busy) return;
    setBusy(idea.name);
    setError(null);
    try {
      onChoose(idea, await api.compete(audience, idea));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  return <Screen n="04" label="Your apps" title={ideas.length > 1 ? `${ideas.length} made the cut` : 'Your app'}
    sub={ideas.length > 1 ? 'These passed the stranger test. Pick one to see the full blueprint. You can come back for the others.' : 'It passed the stranger test.'}>
    <ul className="pick-list">
      {ideas.map((idea, i) => <li key={idea.name} className="fade" style={{ '--d': `${240 + i * 80}ms` } as CSSProperties}>
        <button type="button" className={`pick-card${busy === idea.name ? ' is-busy' : ''}`} disabled={!!busy} onClick={() => void choose(idea)} data-testid="button-pick">
          <span className="pick-n">{String(i + 1).padStart(2, '0')}</span>
          <b className="pick-name">{idea.name}</b>
          <p className="pick-tagline">{idea.tagline}</p>
          <p className="pick-what">{idea.what_it_is}</p>
          <span className="pick-go">{busy === idea.name ? <>Opening <i className="pulse-dot" /></> : <>See the blueprint <ArrowRight size={16} /></>}</span>
        </button>
      </li>)}
    </ul>
    {error && <p className="flow-error" role="alert">{error}</p>}
  </Screen>;
}
