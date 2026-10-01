// Runs the Any DNA prompt, one canonical prompt per step:
//   1 research   why the source works (both sources at once for Collide)
//   2 dna        its transferable mechanics
//   3 generate   3 ideas, for the audience, in the picked mode
//   4 filter     a blunt stranger keeps the good ones
// The side rule for a failed filter lives here: if every idea fails, generate
// again with the stranger's reasons, up to 2 more times. A rejected idea is
// never shown; if none survive, the run ends honestly with `noneKept`.
// A failed step can be retried without redoing the ones that finished.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FilterResult, GeneratedIdea, GenerateMode, Upload, UploadRead } from '../../server/lib/types.ts';
import { api } from './api';

export const NEW_STEPS = [
  { id: 'research', label: 'Research: why it works' },
  { id: 'dna', label: 'Extracting its DNA' },
  { id: 'generate', label: 'Inventing 3 apps from it' },
  { id: 'filter', label: 'Testing them like a stranger would' },
] as const;

/** Generate + filter runs at most this many times: the first try and 2 retries. */
export const MAX_ATTEMPTS = 3;

export type NewStepId = (typeof NEW_STEPS)[number]['id'];
export type StepState = 'waiting' | 'running' | 'done' | 'failed';
export type Mode = GenerateMode | 'collide' | null;

export type RunInput = { upload: Upload; second?: Upload; audience: string; direction: string; templateId: string | null; mode: Mode };

export type NewProgress = {
  read?: UploadRead;
  /** Collide: the second source's research and DNA. */
  secondRead?: UploadRead;
  /** Which generate + filter try this is, from 1. */
  attempt: number;
  /** How many ideas the stranger has turned down so far. */
  rejectedCount: number;
};

const FRESH: Record<NewStepId, StepState> = { research: 'waiting', dna: 'waiting', generate: 'waiting', filter: 'waiting' };

type RunMemo = {
  research?: UploadRead['research'];
  secondResearch?: UploadRead['research'];
  read?: UploadRead;
  secondRead?: UploadRead;
  ideas?: GeneratedIdea[];
  result?: FilterResult;
  attempt: number;
  rejected: FilterResult['rejected'];
};

export function useNewRun(input: RunInput, onDone: (read: UploadRead, kept: GeneratedIdea[], secondRead?: UploadRead) => void) {
  const { upload, second, audience, direction, templateId, mode } = input;
  const [states, setStates] = useState<Record<NewStepId, StepState>>(FRESH);
  const [progress, setProgress] = useState<NewProgress>({ attempt: 1, rejectedCount: 0 });
  const [error, setError] = useState<string | null>(null);
  /** Nothing passed the stranger after every try: the honest failure state. */
  const [noneKept, setNoneKept] = useState(false);
  /** Which source the AI doesn't know and the user hasn't described yet. */
  const [asking, setAsking] = useState<'a' | 'b' | null>(null);
  const about = useRef({ a: '', b: '' });
  const skipped = useRef(false);
  const partial = useRef<RunMemo>({ attempt: 1, rejected: [] });
  const controller = useRef<AbortController | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const collide = mode === 'collide' && !!second;

  const run = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const signal = abort.signal;
    const out = partial.current;
    setError(null);
    setAsking(null);
    setNoneKept(false);
    const show = () => setProgress({ read: out.read, secondRead: out.secondRead, attempt: out.attempt, rejectedCount: out.rejected.length });
    const mark = (id: NewStepId, state: StepState) => setStates((prev) => ({ ...prev, [id]: state }));

    const steps: Record<NewStepId, () => Promise<void>> = {
      research: async () => {
        await Promise.all([
          out.research ? null : api.research(upload, about.current.a, signal).then((r) => { out.research = r.output; }),
          !collide || out.secondResearch ? null : api.research(second!, about.current.b, signal).then((r) => { out.secondResearch = r.output; }),
        ]);
      },
      dna: async () => {
        await Promise.all([
          out.read ? null : api.dna(out.research!, signal).then((r) => { out.read = { research: out.research!, dna: r.output }; }),
          !collide || out.secondRead ? null : api.dna(out.secondResearch!, signal).then((r) => { out.secondRead = { research: out.secondResearch!, dna: r.output }; }),
        ]);
      },
      generate: async () => {
        out.ideas ??= (await api.generate({ read: out.read!, second: collide ? out.secondRead : undefined, audience, direction, templateId, mode: collide ? 'collide' : mode === 'collide' ? null : mode, feedback: out.rejected }, signal)).output;
      },
      filter: async () => { out.result ??= (await api.filter(out.ideas!, signal)).output; },
    };

    for (;;) {
      for (const step of NEW_STEPS) {
        if (signal.aborted) return;
        const id = step.id;
        setStates((prev) => (prev[id] === 'done' ? prev : { ...prev, [id]: 'running' }));
        try {
          await steps[id]();
          if (signal.aborted) return;
          show();
          mark(id, 'done');
          // It doesn't know the song (or film, or book) and nobody described it: ask once instead of guessing.
          if (id === 'research' && !skipped.current) {
            const unknown = out.research && !out.research.recognized && !about.current.a ? 'a' : collide && out.secondResearch && !out.secondResearch.recognized && !about.current.b ? 'b' : null;
            if (unknown) { setAsking(unknown); return; }
          }
        } catch (caught) {
          if (signal.aborted) return;
          mark(id, 'failed');
          setError(caught instanceof Error ? caught.message : String(caught));
          return;
        }
      }
      const result = out.result!;
      if (result.kept.length) { onDoneRef.current(out.read!, result.kept, out.secondRead); return; }
      // Every idea failed: keep the reasons and generate again with them as corrective feedback.
      out.rejected = [...out.rejected, ...result.rejected];
      if (out.attempt >= MAX_ATTEMPTS) { show(); setNoneKept(true); return; }
      out.attempt += 1;
      out.ideas = undefined;
      out.result = undefined;
      show();
      setStates((prev) => ({ ...prev, generate: 'waiting', filter: 'waiting' }));
    }
  }, [upload, second, collide, audience, direction, templateId, mode]);

  useEffect(() => {
    void run();
    return () => controller.current?.abort();
  }, [run]);

  /** The user's answer to "what's it about?": research that source again with their words. */
  const answer = useCallback((text: string) => {
    const which = asking ?? 'a';
    about.current[which] = text.trim();
    const out = partial.current;
    if (which === 'a') { out.research = undefined; out.read = undefined; } else { out.secondResearch = undefined; out.secondRead = undefined; }
    setStates(FRESH);
    void run();
  }, [run, asking]);

  /** Skip the question and carry on with what it has. */
  const skip = useCallback(() => {
    skipped.current = true;
    void run();
  }, [run]);

  return { states, progress, error, retry: run, asking, answer, skip, noneKept };
}
