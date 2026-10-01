// Inventing the app, one step per canonical prompt. What each step finds shows
// up as soon as it's done: why the source works, then its DNA. Ideas are never
// shown before the stranger has passed them; if none pass after every try,
// this screen says so and offers what to change.
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import { Fade, Screen } from '@/components/bits';
import { MAX_ATTEMPTS, NEW_STEPS, useNewRun, type Mode, type NewStepId, type StepState } from '@/lib/newrun';
import { uploadLabel } from '@/lib/upload';
import type { GeneratedIdea, Upload, UploadRead } from '../../server/lib/types.ts';

const STATE_TEXT: Record<StepState, string> = { waiting: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed' };

/** Each stage moves the meter toward its share; reading and inventing are most of the wait. */
function useMeter(states: Record<NewStepId, StepState>) {
  const target = states.filter === 'done' ? 100 : states.generate === 'done' ? 92 : states.dna === 'done' ? 86 : states.research === 'done' ? 48 : states.research === 'running' ? 36 : 0;
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setValue((current) => (current < target ? current + Math.max(0.15, (target - current) * 0.02) : current));
    }, 120);
    return () => window.clearInterval(timer);
  }, [target]);
  return Math.min(100, Math.floor(value));
}

/** True once the idea step has been running a while, so the screen can say it's still going. */
function useSlow(running: boolean, after = 25_000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!running) return;
    const timer = window.setTimeout(() => setSlow(true), after);
    return () => window.clearTimeout(timer);
  }, [running, after]);
  return slow;
}

export type Adjust = 'source' | 'audience' | 'steer';

export function NewLoading({ upload, second, audience, direction, templateId, mode, onDone, onBack, onAdjust }: {
  upload: Upload; second?: Upload; audience: string; direction: string; templateId: string | null; mode: Mode;
  onDone: (read: UploadRead, kept: GeneratedIdea[], secondRead?: UploadRead) => void; onBack: () => void; onAdjust: (what: Adjust) => void;
}) {
  const { states, progress, error, retry, asking, answer, skip, noneKept } = useNewRun({ upload, second, audience, direction, templateId, mode }, onDone);
  const [about, setAbout] = useState('');
  const meter = useMeter(states);
  const slow = useSlow(states.research === 'running' || states.dna === 'running' || states.generate === 'running');
  const found = !!progress.read;
  const retrying = progress.attempt > 1;
  if (noneKept) {
    return <Screen title="Nothing passed"
      sub={`A blunt stranger tested ${progress.rejectedCount} ideas over ${MAX_ATTEMPTS} tries and turned every one down. We won’t show you a weak idea, so try changing something.`}
      actions={<>
        <button type="button" className="btn-pill is-primary" onClick={() => onAdjust('steer')} data-testid="button-adjust-steer"><span>Try another mode or trick</span></button>
        <button type="button" className="btn-pill" onClick={() => onAdjust('audience')}><span>Change who it’s for or your direction</span></button>
        <button type="button" className="btn-pill" onClick={() => onAdjust('source')}><span>Drop something else</span></button>
      </>}>
      <p className="screen-note" role="status">What usually helps: a narrower audience, a line in “Anything else?” about the problem you want solved, or a different mode.</p>
    </Screen>;
  }
  return <Screen title="Inventing your app"
    sub={<span className="route"><span>{uploadLabel(upload)}</span>{second && <><span>×</span><span>{uploadLabel(second)}</span></>}<ArrowRight size={14} /><span>{audience}</span></span>}
    actions={error
      ? <>
          <button type="button" className="btn-pill is-primary" onClick={() => void retry()}><span>Try again</span><RefreshCw size={17} /></button>
          <button type="button" className="btn-pill" onClick={onBack}><span>Go back</span></button>
        </>
      : <button type="button" className="btn-pill" onClick={onBack}><span>Cancel</span></button>}>
    {upload.kind === 'photo' && <Fade delay={120}><img className="upload-thumb" src={upload.dataUrl} alt="What you uploaded" /></Fade>}
    <div className={`meter fade${found ? ' is-compact' : ''}`} style={{ '--d': '240ms' } as CSSProperties} aria-hidden="true">
      <span className="meter-num">{meter}</span><span className="meter-pct">%</span>
    </div>
    <div className="meter-rail" aria-hidden="true"><i style={{ transform: `scaleX(${meter / 100})` }} /></div>
    {found && <section className="feed" aria-live="polite">
      {retrying && <article className="find">
        <p className="find-k">Try {progress.attempt} of {MAX_ATTEMPTS}</p>
        <p className="find-quote">The stranger turned down {progress.rejectedCount === 1 ? 'the last idea' : `all ${progress.rejectedCount} ideas so far`}. Inventing new ones, using their reasons.</p>
      </article>}
      {[progress.read, progress.secondRead].map((read, i) => read && <article key={i} className="find is-dna">
        <p className="find-k">{progress.secondRead ? `Why ${uploadLabel(i ? second! : upload)} works` : 'Why it works'}</p>
        <p className="find-quote">{read.research.why_it_works}</p>
        <ol className="find-tricks">{read.dna.map((mechanic) => <li key={mechanic.name}><b>{mechanic.name}</b><span>{mechanic.chain}</span></li>)}</ol>
      </article>)}
    </section>}
    <ol className={`rail${found ? ' is-compact' : ''}`} aria-live="polite">
      {NEW_STEPS.map((step, i) => {
        const state = states[step.id];
        const label = step.id === 'generate' && retrying ? `Inventing 3 new ones (try ${progress.attempt} of ${MAX_ATTEMPTS})` : step.label;
        return <li key={step.id} className={`is-${state}`}>
          <span className="rail-n">{String(i + 1).padStart(2, '0')}</span>
          <span className="rail-label">{label}</span>
          <span className="rail-state">
            {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'failed' ? <X size={14} strokeWidth={3} /> : state === 'running' ? <i className="pulse-dot" /> : null}
            {STATE_TEXT[state]}
          </span>
        </li>;
      })}
    </ol>
    {asking && <section className="ask" role="dialog" aria-label="Tell us about it">
      <p className="ask-k">We don’t know {asking === 'b' && second ? uploadLabel(second) : 'this one'}</p>
      <p className="ask-q">What’s it about, or how does it make you feel?</p>
      <textarea rows={3} value={about} maxLength={600} onChange={(event) => setAbout(event.target.value)} placeholder="Like “a slow breakup song that ends hopeful” or “makes me want to drive with the windows down”." data-testid="input-about" />
      <div className="ask-actions">
        <button type="button" className="btn-pill is-primary" disabled={!about.trim()} onClick={() => { answer(about); setAbout(''); }} data-testid="button-about"><span>Keep going</span><ArrowRight size={18} /></button>
        <button type="button" className="btn-pill" onClick={skip}><span>Skip</span></button>
      </div>
    </section>}
    {error ? <p className="flow-error" role="alert">{error}</p>
      : slow ? <p className="screen-note" role="status">Still thinking. It works out why your upload works before it invents anything, which can take a minute. You can lock your phone; it picks up where it left off.</p>
      : <p className="screen-note">It works out why your upload works, pulls out the pattern underneath, invents 3 apps, and keeps only the ones a stranger would get and want.</p>}
  </Screen>;
}
