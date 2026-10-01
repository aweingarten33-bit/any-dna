// Runs the main system prompt in the workbench's four stages:
//   1 + 2  read the upload: research it, then extract its DNA (one call)
//   3      invent 3 ideas from that DNA, for the audience
//   4      a blunt stranger keeps the good ones (verdicts stay on the server)
// A failed stage can be retried without redoing the ones that finished.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeneratedIdea, Upload, UploadRead } from '../../server/lib/types.ts';
import { api } from './api';

export const NEW_STEPS = [
  { id: 'read', label: 'Reading it: what it is and what it means' },
  { id: 'invent', label: 'Inventing 3 apps from it' },
  { id: 'filter', label: 'Testing them like a stranger would' },
] as const;

export type NewStepId = (typeof NEW_STEPS)[number]['id'];
export type StepState = 'waiting' | 'running' | 'done' | 'failed';

export type NewProgress = { read?: UploadRead; ideas?: GeneratedIdea[]; kept?: GeneratedIdea[] };

export function useNewRun(upload: Upload, audience: string, direction: string, templateId: string | null, onDone: (read: UploadRead, kept: GeneratedIdea[]) => void) {
  const [states, setStates] = useState<Record<NewStepId, StepState>>({ read: 'waiting', invent: 'waiting', filter: 'waiting' });
  const [progress, setProgress] = useState<NewProgress>({});
  const [error, setError] = useState<string | null>(null);
  /** True when the upload names something the AI doesn't know and the user hasn't described it yet. */
  const [asking, setAsking] = useState(false);
  const told = useRef('');
  const skipped = useRef(false);
  const partial = useRef<NewProgress>({});
  const controller = useRef<AbortController | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const run = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const signal = abort.signal;
    const out = partial.current;
    const said = [direction, told.current].filter((part) => part.trim()).join('. ');
    setError(null);
    setAsking(false);

    const steps: Record<NewStepId, () => Promise<void>> = {
      read: async () => { out.read ??= (await api.read(upload, audience, said, signal)).output; },
      invent: async () => { out.ideas ??= (await api.invent(out.read!, audience, said, templateId, signal)).output; },
      filter: async () => { out.kept ??= (await api.filter(out.ideas!, out.read!, signal)).output; },
    };

    for (const step of NEW_STEPS) {
      if (signal.aborted) return;
      const id = step.id;
      setStates((prev) => (prev[id] === 'done' ? prev : { ...prev, [id]: 'running' }));
      try {
        await steps[id]();
        if (signal.aborted) return;
        setProgress({ ...out });
        setStates((prev) => ({ ...prev, [id]: 'done' }));
        // It doesn't know the song (or film, or book) and nobody described it: ask once instead of guessing.
        if (id === 'read' && out.read && !out.read.recognized && !said.trim() && !skipped.current) { setAsking(true); return; }
      } catch (caught) {
        if (signal.aborted) return;
        setStates((prev) => ({ ...prev, [id]: 'failed' }));
        setError(caught instanceof Error ? caught.message : String(caught));
        return;
      }
    }
    onDoneRef.current(out.read!, out.kept!);
  }, [upload, audience, direction, templateId]);

  useEffect(() => {
    void run();
    return () => controller.current?.abort();
  }, [run]);

  /** The user's answer to "what's it about?": read it again with their words. */
  const answer = useCallback((text: string) => {
    told.current = text.trim();
    partial.current = {};
    setStates({ read: 'waiting', invent: 'waiting', filter: 'waiting' });
    setProgress({});
    void run();
  }, [run]);

  /** Skip the question and carry on with what it has. */
  const skip = useCallback(() => {
    skipped.current = true;
    void run();
  }, [run]);

  return { states, progress, error, retry: run, asking, answer, skip };
}
