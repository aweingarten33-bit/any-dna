import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { uploadLabel } from '@/lib/upload';
import type { ExerciseTurn, Upload } from '../../server/lib/types.ts';

type Round = { output: ExerciseTurn; reaction?: string };

function conversationContext(rounds: Round[]) {
  return rounds.slice(-4).map((round, index) => {
    const ideas = round.output.ideas.map((idea, i) => `${i + 1}. ${idea.name}: ${idea.pitch}`).join('\n');
    const dna = round.output.dna.map((item) => `${item.name}: ${item.explanation}`).join('\n');
    return [
      `ROUND ${index + 1}`,
      `What was worth stealing: ${round.output.take}`,
      `DNA:\n${dna}`,
      `Ideas:\n${ideas}`,
      round.reaction ? `The person reacted: ${round.reaction}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

export function Exercise({ upload, topBar, onStartOver }: {
  upload: Upload;
  topBar: ReactNode;
  onStartOver: () => void;
}) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const started = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const latest = rounds.at(-1)?.output;
  const trail = useMemo(() => rounds.flatMap((round) => round.reaction ? [round.reaction] : []).slice(-3), [rounds]);

  async function run(reaction = '') {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setPicked(reaction || null);
    try {
      const context = conversationContext(rounds);
      const { output } = await api.exercise(upload, context, reaction, abort.signal);
      if (abort.signal.aborted) return;
      setRounds((current) => {
        const updated = current.map((round, index) => index === current.length - 1 && reaction && !round.reaction ? { ...round, reaction } : round);
        return [...updated, { output }];
      });
      setPicked(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      if (abort.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    return () => controller.current?.abort();
    // The upload is fixed for the lifetime of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(label: string, instruction: string) {
    if (busy) return;
    const reaction = `${label}\n${instruction}`;
    void run(reaction);
  }

  return <div className="app exercise-app">
    {topBar}
    <main className="exercise-page">
      <header className="exercise-head">
        <button type="button" className="exercise-source" onClick={onStartOver} title="Start with something else">
          <span>Working from</span>
          <strong>{uploadLabel(upload)}</strong>
        </button>
        {trail.length > 0 && <div className="reaction-trail" aria-label="Your recent reactions">
          {trail.map((reaction, index) => <span key={`${reaction}-${index}`}>{reaction.split('\n')[0]}</span>)}
        </div>}
      </header>

      {!latest && busy && <section className="exercise-thinking" role="status">
        <div className="thinking-orb" aria-hidden="true" />
        <h1>Taking it apart…</h1>
        <p>Finding the good DNA and seeing what else it could become.</p>
      </section>}

      {latest && <div className={`exercise-answer${busy ? ' is-thinking' : ''}`}>
        <section className="exercise-take">
          <p className="exercise-eyebrow">WHAT'S ACTUALLY GOOD ABOUT IT</p>
          <h1>{latest.take}</h1>
        </section>

        <section className="exercise-dna" aria-label="The DNA">
          <p className="exercise-eyebrow">THE DNA</p>
          <div className="dna-strip">
            {latest.dna.map((item, index) => <article key={`${item.name}-${index}`}>
              <b>{item.name}</b>
              <span>{item.explanation}</span>
            </article>)}
          </div>
        </section>

        <section className="exercise-ideas" aria-label="App ideas">
          <div className="exercise-section-title">
            <div>
              <p className="exercise-eyebrow">OK. NOW LET'S TURN IT INTO SOMETHING.</p>
              <h2>3 apps worth looking at</h2>
            </div>
          </div>
          <div className="idea-stack">
            {latest.ideas.map((idea, index) => <article className="exercise-idea" key={`${idea.name}-${index}`}>
              <div className="idea-number">0{index + 1}</div>
              <div className="idea-copy">
                <h3>{idea.name}</h3>
                <p className="idea-pitch">{idea.pitch}</p>
                <dl>
                  <div><dt>You</dt><dd>{idea.what_you_do}</dd></div>
                  <div><dt>Why</dt><dd>{idea.why_youd_use_it}</dd></div>
                  <div><dt>V1</dt><dd>{idea.first_version}</dd></div>
                </dl>
              </div>
            </article>)}
          </div>
        </section>

        <section className="exercise-reactions" aria-label="Pick a reaction">
          <p className="exercise-eyebrow">WHAT ARE YOU THINKING?</p>
          <div className="reaction-grid">
            {latest.reactions.map((reaction, index) => <button type="button" key={`${reaction.label}-${index}`} disabled={busy}
              className={picked?.startsWith(reaction.label) ? 'is-picked' : ''}
              onClick={() => choose(reaction.label, reaction.instruction)}>
              <span>{reaction.label}</span>
              <ArrowRight size={18} />
            </button>)}
          </div>
          <button type="button" className="start-over-link" disabled={busy} onClick={onStartOver}>Nah. Give me something else to start with.</button>
        </section>
      </div>}

      {busy && latest && <div className="exercise-working" role="status"><RefreshCw size={16} className="spin" />Alright. Lemme take another swing at it…</div>}
      {error && <div className="exercise-error" role="alert">
        <strong>That didn’t work.</strong>
        <span>{error}</span>
        <button type="button" onClick={() => void run(picked ?? '')}>Try again</button>
      </div>}
    </main>
  </div>;
}
