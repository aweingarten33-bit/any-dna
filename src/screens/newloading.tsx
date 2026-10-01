// Inventing the app, in the workbench's stages. What each stage finds shows up
// as soon as it's done: the upload's meaning and DNA, then the ideas.
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import { Fade, Screen } from '@/components/bits';
import { NEW_STEPS, useNewRun, type NewStepId, type StepState } from '@/lib/newrun';
import { uploadLabel } from '@/lib/upload';
import type { GeneratedIdea, Upload, UploadRead } from '../../server/lib/types.ts';

const STATE_TEXT: Record<StepState, string> = { waiting: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed' };

/** Each stage moves the meter toward its share; reading and inventing are most of the wait. */
function useMeter(states: Record<NewStepId, StepState>) {
  const target = states.filter === 'done' ? 100 : states.invent === 'done' ? 92 : states.read === 'done' ? (states.invent === 'running' ? 86 : 40) : states.read === 'running' ? 36 : 0;
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

export function NewLoading({ upload, audience, direction, templateId, onDone, onBack }: {
  upload: Upload; audience: string; direction: string; templateId: string | null;
  onDone: (read: UploadRead, kept: GeneratedIdea[]) => void; onBack: () => void;
}) {
  const { states, progress, error, retry, asking, answer, skip } = useNewRun(upload, audience, direction, templateId, onDone);
  const [about, setAbout] = useState('');
  const meter = useMeter(states);
  const slow = useSlow(states.read === 'running' || states.invent === 'running');
  const found = !!(progress.read || progress.ideas);
  return <Screen title="Inventing your app"
    sub={<span className="route"><span>{uploadLabel(upload)}</span><ArrowRight size={14} /><span>{audience}</span></span>}
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
      {progress.ideas && <article className="find">
        <p className="find-k">3 apps invented</p>
        <ol className="find-tricks">{progress.ideas.map((idea) => <li key={idea.name}><b>{idea.name}</b><span>{idea.tagline}</span></li>)}</ol>
      </article>}
      {progress.read && <article className="find is-dna">
        <p className="find-k">What it really is</p>
        <p className="find-quote">{progress.read.meaning}</p>
        <ol className="find-tricks">{progress.read.mechanics.map((mechanic) => <li key={mechanic.name}><b>{mechanic.name}</b><span>{mechanic.chain}</span></li>)}</ol>
      </article>}
    </section>}
    <ol className={`rail${found ? ' is-compact' : ''}`} aria-live="polite">
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
    {asking && <section className="ask" role="dialog" aria-label="Tell us about it">
      <p className="ask-k">We don’t know this one</p>
      <p className="ask-q">What’s it about, or how does it make you feel?</p>
      <textarea rows={3} value={about} maxLength={600} onChange={(event) => setAbout(event.target.value)} placeholder="Like “a slow breakup song that ends hopeful” or “makes me want to drive with the windows down”." data-testid="input-about" />
      <div className="ask-actions">
        <button type="button" className="btn-pill is-primary" disabled={!about.trim()} onClick={() => answer(about)} data-testid="button-about"><span>Keep going</span><ArrowRight size={18} /></button>
        <button type="button" className="btn-pill" onClick={skip}><span>Skip</span></button>
      </div>
    </section>}
    {error ? <p className="flow-error" role="alert">{error}</p>
      : slow ? <p className="screen-note" role="status">Still thinking. It reads what you dropped in literally and figuratively before it invents anything, which can take a minute. You can lock your phone; it picks up where it left off.</p>
      : <p className="screen-note">It reads what you dropped in, finds the pattern underneath, invents 3 apps, and keeps only the ones a stranger would get.</p>}
  </Screen>;
}
