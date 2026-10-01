// Building the idea: one AI step reads the upload and invents the app, then a
// quick App Store search. The idea card appears as soon as it's written.
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import { Fade, Screen } from '@/components/bits';
import { NEW_STEPS, useNewRun, type NewStepId, type StepState } from '@/lib/newrun';
import { uploadLabel } from '@/lib/upload';
import type { NewBlueprint, Upload } from '../../server/lib/types.ts';

const STATE_TEXT: Record<StepState, string> = { waiting: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed' };

/** The idea step is most of the wait, so it eases toward 90% and the search finishes the rest. */
function useMeter(states: Record<NewStepId, StepState>) {
  const target = states.compete === 'done' ? 100 : states.build === 'done' ? 92 : states.build === 'running' ? 88 : 0;
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

export function NewLoading({ upload, audience, templateId, onDone, onBack }: {
  upload: Upload; audience: string; templateId: string | null;
  onDone: (blueprint: NewBlueprint) => void; onBack: () => void;
}) {
  const { states, progress, error, retry } = useNewRun(upload, audience, templateId, onDone);
  const meter = useMeter(states);
  const slow = useSlow(states.build === 'running');
  return <Screen n="03" label="The idea" title="Inventing your app"
    sub={<span className="route"><span>{uploadLabel(upload)}</span><ArrowRight size={14} /><span>{audience}</span></span>}
    actions={error
      ? <>
          <button type="button" className="btn-pill is-primary" onClick={() => void retry()}><span>Try again</span><RefreshCw size={17} /></button>
          <button type="button" className="btn-pill" onClick={onBack}><span>Go back</span></button>
        </>
      : <button type="button" className="btn-pill" onClick={onBack}><span>Cancel</span></button>}>
    {upload.kind === 'photo' && <Fade delay={120}><img className="upload-thumb" src={upload.dataUrl} alt="What you uploaded" /></Fade>}
    <div className={`meter fade${progress.idea ? ' is-compact' : ''}`} style={{ '--d': '240ms' } as CSSProperties} aria-hidden="true">
      <span className="meter-num">{meter}</span><span className="meter-pct">%</span>
    </div>
    <div className="meter-rail" aria-hidden="true"><i style={{ transform: `scaleX(${meter / 100})` }} /></div>
    {progress.idea && <section className="feed" aria-live="polite">
      <article className="find">
        <p className="find-k">Your app</p>
        <p className="find-name">{progress.idea.name}</p>
        <p className="find-quote is-small">{progress.idea.tagline}</p>
      </article>
    </section>}
    <ol className={`rail${progress.idea ? ' is-compact' : ''}`} aria-live="polite">
      {NEW_STEPS.map((step, i) => {
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
      : slow ? <p className="screen-note" role="status">Still thinking. It reads what you dropped in literally and figuratively before it invents anything, which can take a minute. You can lock your phone; it picks up where it left off.</p>
      : <p className="screen-note">It reads what you dropped in, finds the pattern underneath, and builds a real app around it.</p>}
  </Screen>;
}
