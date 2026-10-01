// Runs the new front door: the idea comes from the upload itself.
// The name and tagline land first (cheap call), then the full blueprint,
// then a real App Store search for competitors (no AI). The phone mockup
// starts separately on the result screen. A failed step can be retried
// without redoing the steps that finished.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Competitor, CompetitorListing, GeneratedIdea, Headline, NewBlueprint, Upload } from '../../server/lib/types.ts';
import { api } from './api';

export const NEW_STEPS = [
  { id: 'headline', label: 'Naming it' },
  { id: 'build', label: 'Building the idea' },
  { id: 'compete', label: 'Checking competitors' },
] as const;

export type NewStepId = (typeof NEW_STEPS)[number]['id'];
export type StepState = 'waiting' | 'running' | 'done' | 'failed';

/** What the finished steps have produced so far. The headline arrives first. */
export type NewProgress = {
  headline?: Headline;
  idea?: GeneratedIdea;
  competitors?: Competitor[];
  searched?: CompetitorListing[];
};

export function useNewRun(upload: Upload, audience: string, templateId: string | undefined, onDone: (blueprint: NewBlueprint) => void) {
  const [states, setStates] = useState<Record<NewStepId, StepState>>({ headline: 'waiting', build: 'waiting', compete: 'waiting' });
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
    const publish = () => { if (!signal.aborted) setProgress({ ...out }); };
    setError(null);

    const steps: Record<NewStepId, () => Promise<void>> = {
      headline: async () => {
        out.headline ??= (await api.flowHeadline(upload, audience, signal)).output;
      },
      build: async () => {
        if (out.idea) return;
        out.idea = (await api.flowGenerate(upload, audience, out.headline!, templateId, signal)).output;
      },
      compete: async () => {
        if (out.competitors) return;
        const result = await api.flowCompete(upload, audience, out.idea!, signal);
        out.competitors = result.competitors;
        out.searched = result.searched;
      },
    };

    let firstError: string | null = null;
    for (const step of NEW_STEPS) {
      if (signal.aborted) return;
      const id = step.id;
      setStates((prev) => (prev[id] === 'done' ? prev : { ...prev, [id]: 'running' }));
      try {
        await steps[id]();
        publish();
        if (!signal.aborted) setStates((prev) => ({ ...prev, [id]: 'done' }));
      } catch (caught) {
        if (signal.aborted) return;
        firstError ??= caught instanceof Error ? caught.message : String(caught);
        setStates((prev) => ({ ...prev, [id]: 'failed' }));
        break;
      }
    }
    if (signal.aborted) return;
    if (firstError) { setError(firstError); return; }
    onDoneRef.current({
      version: 3, upload, audience, templateId,
      headline: out.headline!, idea: out.idea!,
      searched: out.searched ?? [], competitors: out.competitors ?? [],
    });
  }, [upload, audience, templateId]);

  useEffect(() => {
    void run();
    return () => controller.current?.abort();
  }, [run]);

  return { states, progress, error, retry: run, cancel: () => controller.current?.abort() };
}
