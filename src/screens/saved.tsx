import { ArrowRight, Trash2 } from 'lucide-react';
import { AppIcon, Screen } from '@/components/bits';
import type { SavedIdea } from '../../supabase/functions/_shared/types.ts';

export function Saved({ ideas, onOpen, onDifferentAudience, onDelete, onNew }: {
  ideas: SavedIdea[];
  onOpen: (idea: SavedIdea) => void;
  onDifferentAudience: (idea: SavedIdea) => void;
  onDelete: (idea: SavedIdea) => void;
  onNew: () => void;
}) {
  return <Screen title="Saved ideas" sub={ideas.length ? 'Saved on this device.' : undefined}
    actions={<button type="button" className="btn btn-quiet btn-block" onClick={onNew}>Start with a new app</button>}>
    {ideas.length === 0
      ? <p className="screen-note">Ideas you build show up here.</p>
      : <ul className="saved-list">
          {ideas.map((item) => {
            const { app, idea, verdict } = item.output_json;
            return <li key={item.id}>
              <button type="button" className="saved-main" onClick={() => onOpen(item)}>
                <AppIcon app={app} size={44} />
                <span className="saved-text">
                  <b>{idea.name}</b>
                  <small>{app.name} <ArrowRight size={12} aria-hidden="true" /> {item.audience} · {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                </span>
                <span className={`saved-call is-${verdict.go_no_go}`}>{verdict.go_no_go === 'go' ? 'Go' : 'No-go'}</span>
              </button>
              <div className="saved-actions">
                <button type="button" className="text-link" onClick={() => onDifferentAudience(item)}>Try a different audience</button>
                <button type="button" className="delete-button" onClick={() => { if (window.confirm(`Delete “${idea.name}”?`)) onDelete(item); }} aria-label={`Delete ${idea.name}`}><Trash2 size={15} /> Delete</button>
              </div>
            </li>;
          })}
        </ul>}
  </Screen>;
}
