import type { CSSProperties } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { Screen } from '@/components/bits';
import { isNewBlueprint, type SavedIdea } from '../../server/lib/types.ts';

export function Saved({ ideas, onOpen, onDelete, onNew }: {
  ideas: SavedIdea[];
  onOpen: (idea: SavedIdea) => void;
  onDelete: (idea: SavedIdea) => void;
  onNew: () => void;
}) {
  return <Screen label={`${ideas.length} saved on this device`} title="Saved ideas"
    actions={<button type="button" className="btn-pill" onClick={onNew}><span>Make a new one</span><ArrowRight size={18} /></button>}>
    {ideas.length === 0
      ? <p className="screen-note">Ideas you build show up here.</p>
      : <ul className="saved">
          {ideas.map((item, i) => {
            const blueprint = item.output_json;
            const idea = blueprint.idea;
            return <li key={item.id} className="fade" style={{ '--d': `${200 + i * 50}ms` } as CSSProperties}>
              <button type="button" className="saved-main" onClick={() => onOpen(item)}>
                <span className="saved-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="saved-text">
                  <b>{idea.name}</b>
                  <small>{isNewBlueprint(blueprint) ? <>{blueprint.upload.label} <ArrowRight size={11} aria-hidden="true" /> {item.audience}</> : 'Saved with an earlier version'}</small>
                </span>
              </button>
              <div className="saved-actions">
                <span className="saved-date">{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <button type="button" className="saved-delete" onClick={() => { if (window.confirm(`Delete “${idea.name}”?`)) onDelete(item); }} aria-label={`Delete ${idea.name}`}><Trash2 size={15} /></button>
              </div>
            </li>;
          })}
        </ul>}
  </Screen>;
}
