// Saved ideas. v1 keeps them on this device. Records have the same shape as
// the ideas table, so a server-backed store can replace this one once accounts exist.
import { useSyncExternalStore } from 'react';
import type { Blueprint, SavedIdea } from '../../server/lib/types.ts';

export type IdeaStore = {
  list(): SavedIdea[];
  save(blueprint: Blueprint): SavedIdea;
  remove(id: string): void;
  subscribe(listener: () => void): () => void;
};

const KEY = 'spinoff-ideas-v1';

function createLocalStore(): IdeaStore {
  const listeners = new Set<() => void>();
  let cache: SavedIdea[] = read();

  function read(): SavedIdea[] {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string' && item.output_json) : [];
    } catch {
      return [];
    }
  }
  function write(next: SavedIdea[]) {
    cache = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked or full: keep it for this session */ }
    listeners.forEach((listener) => listener());
  }

  return {
    list: () => cache,
    save(blueprint) {
      const idea: SavedIdea = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        created_at: new Date().toISOString(),
        source_app_id: blueprint.app.app_id,
        audience: blueprint.audience,
        output_json: blueprint,
      };
      write([idea, ...cache]);
      return idea;
    },
    remove(id) { write(cache.filter((item) => item.id !== id)); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const ideaStore: IdeaStore = createLocalStore();

export function useSavedIdeas(): SavedIdea[] {
  return useSyncExternalStore(ideaStore.subscribe, ideaStore.list);
}
