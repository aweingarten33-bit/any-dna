// Who's it for? Suggested audiences from the upload, plus free text.
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { Fade, Screen } from '@/components/bits';
import { api } from '@/lib/api';
import { uploadLabel } from '@/lib/upload';
import type { Upload } from '../../server/lib/types.ts';

export function NewAudience({ upload, initial, initialDirection, onPick }: { upload: Upload; initial?: string; initialDirection?: string; onPick: (audience: string, direction: string) => void }) {
  const [audiences, setAudiences] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(initial ?? null);
  const [custom, setCustom] = useState('');
  const [direction, setDirection] = useState(initialDirection ?? '');
  const audience = (picked ?? custom).trim();

  useEffect(() => {
    const abort = new AbortController();
    setAudiences(null);
    setError(null);
    api.suggest(upload, abort.signal).then(
      ({ output }) => { if (!abort.signal.aborted) setAudiences(output.audiences); },
      (caught) => { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught)); },
    );
    return () => abort.abort();
  }, [upload]);

  function retry() {
    const abort = new AbortController();
    setError(null);
    api.suggest(upload, abort.signal).then(
      ({ output }) => { if (!abort.signal.aborted) setAudiences(output.audiences); },
      (caught) => { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught)); },
    );
  }

  return <Screen title="Who’s it for?"
    sub={<>Pick who the app is for. It’ll be built from {uploadLabel(upload)}.</>}
    actions={<button type="button" className="btn-pill is-primary" disabled={!audience} onClick={() => onPick(audience, direction.trim())} data-testid="button-build">
      <span>{audience ? `Build it for ${audience}` : 'Pick an audience'}</span>
    </button>}>
    {!audiences && !error && <p className="screen-note" role="status">Reading what you dropped in…</p>}
    {error && <div className="flow-error" role="alert"><p>{error}</p>
      <button type="button" className="btn btn-quiet" onClick={retry}>Try again <RefreshCw size={14} /></button></div>}
    {audiences && <ol className="aud-list" role="radiogroup" aria-label="Audience">
      {audiences.map((name, i) => <li key={name} className="fade" style={{ '--d': `${300 + i * 45}ms` } as CSSProperties}>
        <button type="button" role="radio" aria-checked={picked === name} className={`aud-row${picked === name ? ' is-on' : ''}`}
          onClick={() => { setPicked(picked === name ? null : name); setCustom(''); }}>
          <span className="aud-name">{name}</span>
          <span className="aud-tick" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        </button>
      </li>)}
    </ol>}
    <Fade delay={audiences ? 300 + audiences.length * 45 : 300}>
      <label className="aud-other">
        <input value={custom} maxLength={80} placeholder="Someone else…" onChange={(event) => { setCustom(event.target.value); setPicked(null); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && audience) onPick(audience, direction.trim()); }} aria-label="Someone else" data-testid="input-audience" />
      </label>
    </Fade>
    <Fade delay={audiences ? 360 + audiences.length * 45 : 360}>
      <label className="direct">
        <span className="direct-k">Anything else? <em>Optional</em></span>
        <textarea value={direction} maxLength={600} rows={3} onChange={(event) => setDirection(event.target.value)}
          placeholder="The niche, the feel, or what it should do. Like “for runners training for their first marathon” or “playful, not serious”." data-testid="input-direction" />
      </label>
    </Fade>
  </Screen>;
}
