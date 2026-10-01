// The train: confirm the app, a divider, pick the audience, then the checklist.
import { useState } from 'react';
import { ArrowRight, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { AppIcon, Rating, Screen, Source, price } from '@/components/bits';
import { STEPS, useRun } from '@/lib/run';
import type { AppListing, Blueprint } from '../../supabase/functions/_shared/types.ts';

export function Confirm({ candidates, index, onYes, onNext, onSearchAgain }: {
  candidates: AppListing[];
  index: number;
  onYes: (app: AppListing) => void;
  onNext: () => void;
  onSearchAgain: () => void;
}) {
  const app = candidates[index];
  const hasNext = index < candidates.length - 1;
  return <Screen kicker="Part 1 of 3 · The app" title="Is this the right app?"
    actions={<>
      <button type="button" className="btn btn-primary btn-block" onClick={() => onYes(app)} data-testid="button-confirm">Yes, that’s it</button>
      {hasNext
        ? <button type="button" className="btn btn-quiet btn-block" onClick={onNext}>No, show the next match ({index + 2} of {candidates.length})</button>
        : <button type="button" className="btn btn-quiet btn-block" onClick={onSearchAgain}>No, search again</button>}
    </>}>
    <article className="app-card">
      <AppIcon app={app} size={88} />
      <div className="app-card-text">
        <h2>{app.name}</h2>
        <p>{app.developer}</p>
      </div>
      <dl className="app-facts">
        <div><dt>Rating</dt><dd><Rating app={app} /></dd></div>
        <div><dt>Category</dt><dd>{app.category || 'Not listed'}</dd></div>
        <div><dt>Price</dt><dd>{price(app)}</dd></div>
      </dl>
      <Source fetched />
    </article>
  </Screen>;
}

export function Divider({ part, title, sub, action, onContinue }: { part: string; title: string; sub: string; action: string; onContinue: () => void }) {
  return <section className="divider">
    <p className="divider-part">{part}</p>
    <h1>{title}</h1>
    <p className="divider-sub">{sub}</p>
    <button type="button" className="btn btn-primary" onClick={onContinue} data-testid="button-continue">{action} <ArrowRight size={16} /></button>
  </section>;
}

const AUDIENCES = ['Dog owners', 'Home cooks', 'Jam band fans', 'Fantasy sports players', 'Side hustlers', 'Renters', 'Travelers'];

export function Audience({ app, initial, onPick }: { app: AppListing; initial?: string; onPick: (audience: string) => void }) {
  const preset = initial && AUDIENCES.includes(initial) ? initial : null;
  const [picked, setPicked] = useState<string | null>(preset);
  const [custom, setCustom] = useState(initial && !preset ? initial : '');
  const audience = (picked ?? custom).trim();
  return <Screen kicker="Part 2 of 3 · The audience" title="Who is it for?" sub={<>Pick the people you want to build {app.name}’s mechanics for.</>}
    actions={<button type="button" className="btn btn-primary btn-block" disabled={!audience} onClick={() => onPick(audience)} data-testid="button-build">Build the blueprint <ArrowRight size={16} /></button>}>
    <div className="audience-chips" role="radiogroup" aria-label="Audience">
      {AUDIENCES.map((name) => <button key={name} type="button" role="radio" aria-checked={picked === name} className={`chip${picked === name ? ' is-on' : ''}`}
        onClick={() => { setPicked(picked === name ? null : name); setCustom(''); }}>{name}</button>)}
    </div>
    <label className="audience-other">
      <span>Someone else</span>
      <input value={custom} maxLength={80} placeholder="e.g. Nurses on night shift" onChange={(event) => { setCustom(event.target.value); setPicked(null); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && audience) onPick(audience); }} data-testid="input-audience" />
    </label>
  </Screen>;
}

export function Loading({ app, audience, onDone, onBack }: { app: AppListing; audience: string; onDone: (blueprint: Blueprint) => void; onBack: () => void }) {
  const { states, error, retry } = useRun(app, audience, onDone);
  return <Screen kicker="Part 3 of 3 · The blueprint" title="Building your blueprint" sub={<>{app.name} <ArrowRight size={14} className="inline-arrow" /> {audience}</>}
    actions={error
      ? <>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void retry()}><RefreshCw size={15} /> Try again</button>
          <button type="button" className="btn btn-quiet btn-block" onClick={onBack}>Go back</button>
        </>
      : <button type="button" className="btn btn-quiet btn-block" onClick={onBack}>Cancel</button>}>
    <ol className="checklist" aria-live="polite">
      {STEPS.map((step) => {
        const state = states[step.id];
        return <li key={step.id} className={`is-${state}`}>
          <span className="check-icon" aria-hidden="true">
            {state === 'done' ? <Check size={16} strokeWidth={3} /> : state === 'running' ? <Loader2 size={16} className="spin" /> : state === 'failed' ? <X size={16} strokeWidth={3} /> : null}
          </span>
          <span>{step.label}</span>
          <span className="sr-only">{state}</span>
        </li>;
      })}
    </ol>
    {error ? <p className="flow-error" role="alert">{error}</p> : <p className="screen-note">This usually takes a minute or two. Finished steps are kept if one fails.</p>}
  </Screen>;
}
