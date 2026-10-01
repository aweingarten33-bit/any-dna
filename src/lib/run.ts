// Runs the pipeline for one app + audience, one checklist step at a time.
// A failed step can be retried without redoing the steps before it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppListing, Blueprint } from '../../supabase/functions/_shared/types.ts';
import { api } from './api';

export const STEPS = [
  { id: 'read', label: 'Reading the app' },
  { id: 'mine', label: 'Mining reviews' },
  { id: 'build', label: 'Building your idea' },
  { id: 'compete', label: 'Checking competitors' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];
export type StepState = 'waiting' | 'running' | 'done' | 'failed';

/** What the finished steps have produced so far. */
type Progress = { [K in Exclude<keyof Blueprint, 'app' | 'audience'>]?: Blueprint[K] };

export function useRun(app: AppListing, audience: string, onDone: (blueprint: Blueprint) => void) {
  const [states, setStates] = useState<Record<StepId, StepState>>({ read: 'waiting', mine: 'waiting', build: 'waiting', compete: 'waiting' });
  const [error, setError] = useState<string | null>(null);
  const partial = useRef<Progress>({});
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

    const steps: Record<StepId, () => Promise<void>> = {
      read: async () => {
        out.reviews ??= (await api.getReviews(app, signal)).summary;
        out.dissect ??= (await api.dissect(app, signal)).output;
      },
      mine: async () => { out.gaps ??= (await api.gaps(app, signal)).output; },
      build: async () => {
        out.fit_check ??= (await api.fitCheck(app, audience, signal)).output;
        out.idea ??= (await api.mutate(app, audience, out.fit_check, signal)).output;
      },
      compete: async () => {
        if (!out.verdict) {
          const result = await api.verdict(app, audience, out.idea!, signal);
          out.verdict = result.output;
          out.searched = result.searched;
        }
      },
    };

    for (const { id } of STEPS) {
      if (signal.aborted) return;
      setStates((prev) => (prev[id] === 'done' ? prev : { ...prev, [id]: 'running' }));
      try {
        await steps[id]();
      } catch (caught) {
        if (signal.aborted) return;
        setStates((prev) => ({ ...prev, [id]: 'failed' }));
        setError(caught instanceof Error ? caught.message : String(caught));
        return;
      }
      setStates((prev) => ({ ...prev, [id]: 'done' }));
    }
    if (signal.aborted) return;
    onDoneRef.current({
      app, audience,
      reviews: out.reviews!, dissect: out.dissect!, gaps: out.gaps!, fit_check: out.fit_check!,
      idea: out.idea!, searched: out.searched ?? [], verdict: out.verdict!,
    });
  }, [app, audience]);

  useEffect(() => {
    void run();
    return () => controller.current?.abort();
  }, [run]);

  return { states, error, retry: run, cancel: () => controller.current?.abort() };
}
