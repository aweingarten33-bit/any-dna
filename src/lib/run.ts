// Runs the pipeline for one app + audience. Reading the app and mining the
// reviews don't depend on each other, so they run at the same time; building
// the idea and checking competitors follow. A failed step can be retried
// without redoing the steps that finished.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppListing, Blueprint } from '../../server/lib/types.ts';
import { api } from './api';

export const STEPS = [
  { id: 'read', label: 'Reading the app' },
  { id: 'mine', label: 'Mining reviews' },
  { id: 'build', label: 'Building your idea' },
  { id: 'compete', label: 'Checking competitors' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];
export type StepState = 'waiting' | 'running' | 'done' | 'failed';

/** Steps grouped by when they can run: the steps in a group run in parallel. */
const STAGES: StepId[][] = [['read', 'mine'], ['build'], ['compete']];

/** What the finished steps have produced so far. */
export type Progress = { [K in Exclude<keyof Blueprint, 'app' | 'audience'>]?: Blueprint[K] };

export function useRun(app: AppListing, audience: string, onDone: (blueprint: Blueprint) => void) {
  const [states, setStates] = useState<Record<StepId, StepState>>({ read: 'waiting', mine: 'waiting', build: 'waiting', compete: 'waiting' });
  const [progress, setProgress] = useState<Progress>({});
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
    const publish = () => { if (!signal.aborted) setProgress({ ...out }); };
    setError(null);

    // Both reading steps need the reviews; fetch them once and share.
    let reviews: Promise<void> | null = null;
    const ensureReviews = () => (reviews ??= out.reviews
      ? Promise.resolve()
      : api.getReviews(app, signal).then(({ summary }) => { out.reviews = summary; publish(); }));

    const steps: Record<StepId, () => Promise<void>> = {
      read: async () => {
        await ensureReviews();
        out.dissect ??= (await api.dissect(app, signal)).output;
      },
      mine: async () => {
        await ensureReviews();
        out.gaps ??= (await api.gaps(app, signal)).output;
      },
      build: async () => {
        if (out.fit_check && out.idea) return;
        const { output } = await api.build(app, audience, signal);
        out.fit_check = output.fit_check;
        out.idea = output.idea;
      },
      compete: async () => {
        if (out.verdict) return;
        const result = await api.verdict(app, audience, out.idea!, signal);
        out.verdict = result.output;
        out.searched = result.searched;
      },
    };

    let firstError: string | null = null;
    for (const stage of STAGES) {
      // Let every step in the stage finish, so one failure doesn't throw away the other's work.
      await Promise.all(stage.map(async (id) => {
        if (signal.aborted) return;
        setStates((prev) => (prev[id] === 'done' ? prev : { ...prev, [id]: 'running' }));
        try {
          await steps[id]();
          publish();
          if (!signal.aborted) setStates((prev) => ({ ...prev, [id]: 'done' }));
        } catch (caught) {
          if (signal.aborted) return;
          firstError ??= caught instanceof Error ? caught.message : String(caught);
          setStates((prev) => ({ ...prev, [id]: 'failed' }));
        }
      }));
      if (signal.aborted) return;
      if (firstError) { setError(firstError); return; }
    }
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

  return { states, progress, error, retry: run, cancel: () => controller.current?.abort() };
}
