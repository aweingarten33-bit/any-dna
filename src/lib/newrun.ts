// Runs the new front door: the idea comes from the upload itself. One AI call
// reads the upload and writes the whole idea, name last so the name comes from
// the thinking; then a real App Store search for competitors (no AI). The
// phone mockup starts on the result screen. A failed step can be retried
// without redoing the steps that finished.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Competitor, CompetitorListing, GeneratedIdea, NewBlueprint, Upload } from '../../server/lib/types.ts';
import { api } from './api';
import { uploadLabel } from './upload';

export const NEW_STEPS = [
  { id: 'build', label: 'Reading it and inventing the app' },
  { id: 'compete', label: 'Checking the App Store' },
] as const;

export type NewStepId = (typeof NEW_STEPS)[number]['id'];
export type StepState = 'waiting' | 'running' | 'done' | 'failed';

/** What the finished steps have produced so far. */
export type NewProgress = {
  idea?: GeneratedIdea;
  competitors?: Competitor[];
  searched?: CompetitorListing[];
};

export function useNewRun(upload: Upload, audience: string, templateId: string | null, onDone: (blueprint: NewBlueprint) => void) {
  const [states, setStates] = useState<Record<NewStepId, StepState>>({ build: 'waiting', compete: 'waiting' });
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
      build: async () => {
        out.idea ??= (await api.flowGenerate(upload, audience, templateId, signal)).output;
      },
      compete: async () => {
        if (out.competitors) return;
        const result = await api.flowCompete(audience, out.idea!, signal);
        out.competitors = result.competitors;
        out.searched = result.searched;
      },
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
    onDoneRef.current({
      version: 3,
      upload: { kind: upload.kind, label: uploadLabel(upload) },
      audience, templateId,
      idea: out.idea!,
      searched: out.searched ?? [], competitors: out.competitors ?? [],
    });
  }, [upload, audience, templateId]);

  useEffect(() => {
    void run();
    return () => controller.current?.abort();
  }, [run]);

  return { states, progress, error, retry: run };
}
