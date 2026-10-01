// Optional: how far to take it (Prompt 3's modes), and a proven trick from a
// real app (like Videoleap's template gallery). Skipping both lets the source
// decide alone. Collide asks for a second source right here.
import { useRef, useState, type CSSProperties } from 'react';
import { ArrowBigUp, Camera, Check, FileText, Film, Flame, Footprints, Gavel, Heart, Image as ImageIcon, MapPin, Music, Puzzle, Receipt, Route, ScanSearch, Sparkles, Timer, Users, type LucideIcon } from 'lucide-react';
import { Screen } from '@/components/bits';
import { TEMPLATES, type Template } from '../../server/lib/templates.ts';
import { PhoneMockup } from '@/components/mockup';
import { fileToUpload, typedToUpload, uploadLabel, UploadError } from '@/lib/upload';
import type { Mode } from '@/lib/newrun';
import type { Upload } from '../../server/lib/types.ts';

/** Prompt 3's modes, in plain words. */
export const MODES: Array<{ id: Exclude<Mode, null>; name: string; line: string }> = [
  { id: 'repurpose', name: 'Repurpose', line: 'Move the whole thing into a world that looks nothing like it.' },
  { id: 'x1000', name: '×1000', line: 'Push its main trick to the extreme until it’s a different product.' },
  { id: 'future', name: '30 years from now', line: 'Picture it in 2056, then build the first step today.' },
  { id: 'angle', name: 'Different angle', line: 'Question what it really does, and build from that.' },
  { id: 'collide', name: 'Collide', line: 'Mix one trick from this with one from something else.' },
];

/** A picture for each template, like Videoleap's template thumbnails. */
const LOOKS: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  'last-minute-deal': { icon: Timer, from: '#ff7a45', to: '#d9361b' },
  'crowd-keeps-fresh': { icon: Users, from: '#22c3a6', to: '#0b7f62' },
  streak: { icon: Flame, from: '#ffb020', to: '#f05a1a' },
  'people-map': { icon: MapPin, from: '#4f86ff', to: '#1a4fd6' },
  'swipe-match': { icon: Heart, from: '#ff5f8f', to: '#d6245a' },
  'everyone-at-once': { icon: Camera, from: '#3a3f4b', to: '#0f1115' },
  'walk-to-collect': { icon: Footprints, from: '#7bd35a', to: '#2f9a3a' },
  'point-to-know': { icon: ScanSearch, from: '#2fb8ff', to: '#1660e0' },
  'split-bill': { icon: Receipt, from: '#25c48a', to: '#118060' },
  'highest-bid': { icon: Gavel, from: '#f5c542', to: '#c7891a' },
  'crowd-votes': { icon: ArrowBigUp, from: '#ff6a3d', to: '#e2401b' },
  'daily-puzzle': { icon: Puzzle, from: '#8b5cf6', to: '#5b2fd0' },
  'race-strangers': { icon: Route, from: '#ff8a3d', to: '#e2531b' },
};

/** A real preview of the screen this template makes, with sample content (like Videoleap's thumbnails). */
function Thumb({ template }: { template: Template }) {
  const look = LOOKS[template.id] ?? { icon: Sparkles, from: '#4f86ff', to: '#8b5cf6' };
  return <span className="tpl-preview" style={{ '--a': look.from, '--b': look.to } as CSSProperties} aria-hidden="true">
    <PhoneMockup name={template.name} screen={template.sample} layout={template.layout} />
  </span>;
}

const PICKERS = [
  { id: 'photo', label: 'Photo', icon: ImageIcon, accept: 'image/*,.heic,.heif' },
  { id: 'video', label: 'Video', icon: Film, accept: 'video/*,.mp4,.mov,.m4v' },
  { id: 'song', label: 'Song', icon: Music, accept: 'audio/*,.mp3,.m4a,.wav,.aac' },
  { id: 'document', label: 'Document', icon: FileText, accept: 'application/pdf,.pdf,.docx' },
] as const;

/** Collide's second source: a file, a link, or words. */
function SecondSource({ value, onChange }: { value: Upload | null; onChange: (upload: Upload | null) => void }) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try { onChange(await fileToUpload(file)); } catch (caught) { setError(caught instanceof UploadError ? caught.message : 'That file didn’t work. Try again.'); } finally { setBusy(false); }
  }

  function takeTyped() {
    if (!typed.trim()) return;
    try { onChange(typedToUpload(typed)); setError(null); } catch (caught) { setError(caught instanceof UploadError ? caught.message : 'That didn’t work. Try again.'); }
  }

  if (value) {
    return <div className="second-source is-set">
      <p><span>Colliding with</span><b>{uploadLabel(value)}</b></p>
      <button type="button" className="btn btn-quiet" onClick={() => { onChange(null); setTyped(''); }}>Change</button>
    </div>;
  }
  return <div className="second-source">
    <p className="second-k">The second source</p>
    <div className="drop-row">
      {PICKERS.map((picker) => <button key={picker.id} type="button" className="btn-pill" disabled={busy} onClick={() => inputs.current[picker.id]?.click()}>
        <picker.icon size={18} /><span>{picker.label}</span>
      </button>)}
      {PICKERS.map((picker) => <input key={picker.id} ref={(element) => { inputs.current[picker.id] = element; }} type="file" accept={picker.accept} className="vh" aria-hidden="true" tabIndex={-1}
        onChange={(event) => { void take(event.target.files?.[0]); event.target.value = ''; }} />)}
    </div>
    <label className="aud-other">
      <input value={typed} maxLength={600} placeholder="Or paste a link or type it" onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') takeTyped(); }} onBlur={takeTyped} aria-label="Second source" data-testid="input-second" />
    </label>
    {busy && <p className="screen-note" role="status">Reading it…</p>}
    {error && <p className="flow-error" role="alert">{error}</p>}
  </div>;
}

export function NewSteer({ initial, initialMode, initialSecond, onPick }: {
  initial: string | null; initialMode: Mode; initialSecond: Upload | null;
  onPick: (templateId: string | null, mode: Mode, second: Upload | null) => void;
}) {
  const [picked, setPicked] = useState<string | null>(initial);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [second, setSecond] = useState<Upload | null>(initialSecond);
  const chosen = TEMPLATES.find((template) => template.id === picked);
  const needsSecond = mode === 'collide' && !second;
  const label = needsSecond ? 'Add a second source' : chosen ? `Use “${chosen.name}”` : mode ? 'Invent it' : 'Skip, use my upload';
  return <Screen title="How should it think?"
    sub="Optional. Pick a mode, add a proven trick from a real app, or skip both and let your upload decide."
    actions={<button type="button" className="btn-pill is-primary" disabled={needsSecond}
      onClick={() => onPick(picked, mode, mode === 'collide' ? second : null)} data-testid="button-steer">
      <span>{label}</span>
    </button>}>
    <h3 className="sub-head">Mode</h3>
    <ul className="mode-list" role="radiogroup" aria-label="Mode">
      <li><button type="button" role="radio" aria-checked={mode === null} className={`mode-row${mode === null ? ' is-on' : ''}`} onClick={() => setMode(null)}>
        <b>Standard</b><span>Find where its pattern already works and build there.</span>
      </button></li>
      {MODES.map((item) => <li key={item.id}>
        <button type="button" role="radio" aria-checked={mode === item.id} className={`mode-row${mode === item.id ? ' is-on' : ''}`} onClick={() => setMode(mode === item.id ? null : item.id)} data-testid={`mode-${item.id}`}>
          <b>{item.name}</b><span>{item.line}</span>
        </button>
      </li>)}
    </ul>
    {mode === 'collide' && <SecondSource value={second} onChange={setSecond} />}
    <h3 className="sub-head">Proven trick</h3>
    <ul className="tpl-grid" role="radiogroup" aria-label="Templates">
      <li className="fade" style={{ '--d': '260ms' } as CSSProperties}>
        <button type="button" role="radio" aria-checked={picked === null} className={`tpl-card is-auto${picked === null ? ' is-on' : ''}`} onClick={() => setPicked(null)}>
          <span className="tpl-top"><Sparkles size={18} /><span className="tpl-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span></span>
          <b>No trick</b>
          <p>The idea comes only from what you dropped in.</p>
        </button>
      </li>
      {TEMPLATES.map((template, i) => <li key={template.id} className="fade" style={{ '--d': `${300 + i * 35}ms` } as CSSProperties}>
        <button type="button" role="radio" aria-checked={picked === template.id} className={`tpl-card${picked === template.id ? ' is-on' : ''}`}
          onClick={() => setPicked(picked === template.id ? null : template.id)}>
          <Thumb template={template} />
          <span className="tpl-top"><small>Like {template.sourceApp}</small><span className="tpl-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span></span>
          <b>{template.name}</b>
          <p>{template.trick}</p>
        </button>
      </li>)}
    </ul>
  </Screen>;
}
