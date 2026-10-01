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
    setError(null);

    const steps: Record<NewStepId, () => Promise<void>> = {
      read: async () => { out.read ??= (await api.flowRead(upload, audience, direction, signal)).output; },
      invent: async () => { out.ideas ??= (await api.flowInvent(out.read!, audience, direction, templateId, signal)).output; },
      filter: async () => { out.kept ??= (await api.flowFilter(out.ideas!, out.read!, signal)).output; },
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

  return { states, progress, error, retry: run };
}
