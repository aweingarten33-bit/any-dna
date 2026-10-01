// The train: confirm the app, a divider, pick the audience, then the checklist.
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Check, RefreshCw, X } from 'lucide-react';
import { AppIcon, Fade, Marquee, Screen, Source, Split, compact, price } from '@/components/bits';
import { STEPS, useRun, type Progress, type StepState } from '@/lib/run';
import type { AppListing, Blueprint } from '../../server/lib/types.ts';

export function Confirm({ candidates, index, onYes, onNext, onSearchAgain }: {
  candidates: AppListing[];
  index: number;
  onYes: (app: AppListing) => void;
  onNext: () => void;
  onSearchAgain: () => void;
}) {
  const app = candidates[index];
  const hasNext = index < candidates.length - 1;
  return <Screen n="01" label="The app" title="Is this the right app?"
    actions={<>
      <button type="button" className="btn-pill is-primary" onClick={() => onYes(app)} data-testid="button-confirm"><span>Yes, that’s it</span><ArrowRight size={18} /></button>
      {hasNext
        ? <button type="button" className="btn-pill" onClick={onNext}><span>No, next match</span><small>{index + 2} / {candidates.length}</small></button>
        : <button type="button" className="btn-pill" onClick={onSearchAgain}><span>No, search again</span></button>}
    </>}>
    <Fade delay={240}>
      <article className="specimen" key={app.app_id}>
        <div className="specimen-head">
          <AppIcon app={app} size={84} />
          <div className="specimen-name">
            <h2>{app.name}</h2>
            <p>{app.developer}</p>
          </div>
        </div>
        <div className="bento">
          <div className="tile tile-wide">
            <span className="tile-k">Rating</span>
            <b className="tile-num">{app.rating != null ? app.rating.toFixed(1) : '—'}<em>/5</em></b>
            <span className="tile-v">{app.rating_count != null ? `${compact(app.rating_count)} ratings` : 'No ratings yet'}</span>
          </div>
          <div className="tile"><span className="tile-k">Category</span><b className="tile-text">{app.category || 'Not listed'}</b></div>
          <div className="tile"><span className="tile-k">Price</span><b className="tile-text">{price(app)}</b></div>
        </div>
        <div className="specimen-foot">
          <Source fetched />
          {app.url && <a href={app.url} target="_blank" rel="noreferrer">View listing <ArrowUpRight size={14} /></a>}
        </div>
      </article>
    </Fade>
  </Screen>;
}

export function Divider({ n, part, title, sub, action, band, onContinue }: { n: string; part: string; title: string; sub: string; action: string; band: string[]; onContinue: () => void }) {
  return <section className="divider">
    <div className="divider-num" aria-hidden="true">{n}</div>
    <div className="divider-copy">
      <p className="label"><span className="label-n">{part}</span></p>
      <h1><Split text={title} delay={120} /></h1>
      <p className="divider-sub fade" style={{ '--d': '380ms' } as CSSProperties}>{sub}</p>
      <div className="fade" style={{ '--d': '480ms' } as CSSProperties}>
        <button type="button" className="btn-pill is-primary is-round" onClick={onContinue} data-testid="button-continue"><span>{action}</span><ArrowRight size={18} /></button>
      </div>
    </div>
    <Marquee items={band} />
  </section>;
}

const AUDIENCES = ['Dog owners', 'Home cooks', 'Jam band fans', 'Fantasy sports players', 'Side hustlers', 'Renters', 'Travelers'];

export function Audience({ app, initial, onPick }: { app: AppListing; initial?: string; onPick: (audience: string) => void }) {
  const preset = initial && AUDIENCES.includes(initial) ? initial : null;
  const [picked, setPicked] = useState<string | null>(preset);
  const [custom, setCustom] = useState(initial && !preset ? initial : '');
  const audience = (picked ?? custom).trim();
  return <Screen n="02" label="The audience" title="Who is it for?" sub={<>Pick the people you want to rebuild <b>{app.name}</b> for.</>}
    actions={<button type="button" className="btn-pill is-primary" disabled={!audience} onClick={() => onPick(audience)} data-testid="button-build">
      <span>{audience ? <>Build it for <em>{audience}</em></> : 'Pick an audience'}</span><ArrowRight size={18} />
    </button>}>
    <ol className="aud-list" role="radiogroup" aria-label="Audience">
      {AUDIENCES.map((name, i) => <li key={name} className="fade" style={{ '--d': `${300 + i * 45}ms` } as CSSProperties}>
        <button type="button" role="radio" aria-checked={picked === name} className={`aud-row${picked === name ? ' is-on' : ''}`}
          onClick={() => { setPicked(picked === name ? null : name); setCustom(''); }}>
          <span className="aud-n">{String(i + 1).padStart(2, '0')}</span>
          <span className="aud-name">{name}</span>
          <span className="aud-tick" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        </button>
      </li>)}
    </ol>
    <label className="aud-other fade" style={{ '--d': '640ms' } as CSSProperties}>
      <span className="aud-n">08</span>
      <input value={custom} maxLength={80} placeholder="Someone else…" onChange={(event) => { setCustom(event.target.value); setPicked(null); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && audience) onPick(audience); }} aria-label="Someone else" data-testid="input-audience" />
    </label>
  </Screen>;
}

const STATE_TEXT: Record<StepState, string> = { waiting: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed' };

/** Each finished step is a quarter; a running step eases toward the next quarter but never reaches it. */
function useMeter(states: Record<string, StepState>) {
  const done = Object.values(states).filter((state) => state === 'done').length;
  const running = Object.values(states).includes('running');
  const [value, setValue] = useState(0);
  useEffect(() => {
    const floor = done * 25;
    const ceiling = running ? floor + 22 : floor;
    const timer = window.setInterval(() => {
      setValue((current) => {
        if (current < floor) return Math.min(floor, current + Math.max(1, (floor - current) / 4));
        if (current < ceiling) return current + (ceiling - current) * 0.035;
        return current;
      });
    }, 90);
    return () => window.clearInterval(timer);
  }, [done, running]);
  return Math.floor(value);
}

/** True once the same step has been running for a while, so the screen can say it's still going. */
function useSlow(states: Record<string, StepState>, after = 25_000) {
  const running = Object.entries(states).filter(([, state]) => state === 'running').map(([id]) => id).join();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!running) return;
    const timer = window.setTimeout(() => setSlow(true), after);
    return () => window.clearTimeout(timer);
  }, [running, after]);
  return slow;
}

export function Loading({ app, audience, onDone, onBack }: { app: AppListing; audience: string; onDone: (blueprint: Blueprint) => void; onBack: () => void }) {
  const { states, progress, error, retry } = useRun(app, audience, onDone);
  const meter = useMeter(states);
  const slow = useSlow(states);
  const findings = Findings({ app, progress });
  return <Screen n="03" label="The blueprint" title="Building your blueprint"
    sub={<span className="route"><span>{app.name}</span><ArrowRight size={14} /><span>{audience}</span></span>}
    actions={error
      ? <>
          <button type="button" className="btn-pill is-primary" onClick={() => void retry()}><span>Try again</span><RefreshCw size={17} /></button>
          <button type="button" className="btn-pill" onClick={onBack}><span>Go back</span></button>
        </>
      : <button type="button" className="btn-pill" onClick={onBack}><span>Cancel</span></button>}>
    <div className={`meter fade${findings.length ? ' is-compact' : ''}`} style={{ '--d': '240ms' } as CSSProperties} aria-hidden="true">
      <span className="meter-num">{meter}</span><span className="meter-pct">%</span>
    </div>
    <div className="meter-rail" aria-hidden="true"><i style={{ transform: `scaleX(${meter / 100})` }} /></div>
    {findings.length > 0 && <section className="feed" aria-label="Found so far" aria-live="polite">{findings}</section>}
    <ol className={`rail${findings.length ? ' is-compact' : ''}`} aria-live="polite">
      {STEPS.map((step, i) => {
        const state = states[step.id];
        return <li key={step.id} className={`is-${state}`}>
          <span className="rail-n">{String(i + 1).padStart(2, '0')}</span>
          <span className="rail-label">{step.label}</span>
          <span className="rail-state">
            {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'failed' ? <X size={14} strokeWidth={3} /> : state === 'running' ? <i className="pulse-dot" /> : null}
            {STATE_TEXT[state]}
          </span>
        </li>;
      })}
    </ol>
    {error ? <p className="flow-error" role="alert">{error}</p>
      : slow ? <p className="screen-note" role="status">Still working. The AI steps can take a minute or two. You can lock your phone; the run picks up where it left off.</p>
      : !findings.length && <p className="screen-note">What we find shows up here as it comes in. If a step fails, the finished ones are kept.</p>}
  </Screen>;
}

/** Cards for what each finished step found, newest first. */
function Findings({ app, progress }: { app: AppListing; progress: Progress }) {
  const cards = [];
  const { reviews, dissect, gaps, idea, competitors, searched } = progress;
  if (reviews) cards.push(<article key="reviews" className="find">
    <p className="find-k">Reviews</p>
    <p className="find-big">{reviews.low_star_count}<span> recent 1 to 3 star reviews of {app.name}</span></p>
  </article>);
  if (dissect) cards.push(<article key="dissect" className="find">
    <p className="find-k">Why {app.name} works</p>
    <p className="find-quote">{dissect.why_it_works}</p>
  </article>);
  const top = gaps?.repeated_complaints[0];
  if (gaps) cards.push(<article key="gaps" className="find">
    <p className="find-k">Top complaint</p>
    {top
      ? <><p className="find-title">{top.theme} <b>{top.evidence_count} reviews</b></p>{top.example && <p className="find-quote is-small">“{top.example}”</p>}</>
      : <p className="find-title">No complaint repeats across reviews.</p>}
  </article>);
  if (idea) cards.push(<article key="idea" className="find">
    <p className="find-k">The idea</p>
    <p className="find-name">{idea.name}</p>
    <p className="find-quote is-small">{idea.pitch}</p>
  </article>);
  if (competitors && searched) cards.push(<article key="competitors" className="find">
    <p className="find-k">Competitors</p>
    <p className="find-title">{competitors.length ? `${competitors.length} closest, out of ${searched.length} apps found` : 'No similar apps found on the App Store'}</p>
    {competitors.length > 0 && <div className="find-icons">{competitors.map((comp) => <AppIcon key={comp.app_id} app={comp} size={36} />)}</div>}
  </article>);
  return cards.reverse();
}
