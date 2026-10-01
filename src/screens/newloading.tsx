// Building the idea: the name and tagline land first, the rest fills in.
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import { Fade, Screen } from '@/components/bits';
import { NEW_STEPS, useNewRun, type NewProgress, type NewStepId, type StepState } from '@/lib/newrun';
import { uploadLabel } from '@/lib/upload';
import type { NewBlueprint, Upload } from '../../server/lib/types.ts';

const STATE_TEXT: Record<StepState, string> = { waiting: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed' };

function useMeter(states: Record<NewStepId, StepState>) {
  const done = Object.values(states).filter((state) => state === 'done').length;
  const running = Object.values(states).includes('running');
  const [value, setValue] = useState(0);
  useEffect(() => {
    const total = NEW_STEPS.length;
    const floor = (done / total) * 100;
    const ceiling = running ? floor + (100 / total) * 0.9 : floor;
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

export function NewLoading({ upload, audience, templateId, onDone, onBack }: {
  upload: Upload; audience: string; templateId: string | undefined;
  onDone: (blueprint: NewBlueprint) => void; onBack: () => void;
}) {
  const { states, progress, error, retry } = useNewRun(upload, audience, templateId, onDone);
  const meter = useMeter(states);
  return <Screen n="02" label="The idea" title="Building your idea"
    sub={<span className="route"><span>{uploadLabel(upload)}</span><ArrowRight size={14} /><span>{audience}</span></span>}
    actions={error
      ? <>
          <button type="button" className="btn-pill is-primary" onClick={() => void retry()}><span>Try again</span><RefreshCw size={17} /></button>
          <button type="button" className="btn-pill" onClick={onBack}><span>Go back</span></button>
        </>
      : <button type="button" className="btn-pill" onClick={onBack}><span>Cancel</span></button>}>
    <div className="meter fade" style={{ '--d': '240ms' } as CSSProperties} aria-hidden="true">
      <span className="meter-num">{meter}</span><span className="meter-pct">%</span>
    </div>
    <div className="meter-rail" aria-hidden="true"><i style={{ transform: `scaleX(${meter / 100})` }} /></div>
    {progress.headline && <HeadlineCard headline={progress.headline} />}
    <ol className="rail" aria-live="polite">
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
      : <p className="screen-note">The name lands first, then the full idea. You can lock your phone; the run picks up where it left off.</p>}
  </Screen>;
}

function HeadlineCard({ headline }: { headline: NonNullable<NewProgress['headline']> }) {
  return <Fade delay={120}>
    <article className="find">
      <p className="find-k">The name</p>
      <p className="find-name">{headline.name}</p>
      <p className="find-quote is-small">{headline.tagline}</p>
    </article>
  </Fade>;
}
