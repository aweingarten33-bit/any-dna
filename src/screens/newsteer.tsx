// Optional: a mode (Prompt 3's modes) and a template (a pattern from a real
// app, like Videoleap's template gallery). Kept quiet: the modes are one row
// of chips, and the templates stay folded until asked for. Skipping both lets
// the upload decide alone. Collide asks for a second source right here.
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
  { id: 'repurpose', name: 'Repurpose', line: 'Moves the whole thing into a world that looks nothing like it.' },
  { id: 'x1000', name: '×1000', line: 'Pushes its main idea to the extreme until it’s a different product.' },
  { id: 'future', name: '30 years', line: 'Pictures it in 2056, then builds the first step today.' },
  { id: 'angle', name: 'New angle', line: 'Questions what it really does, and builds from that.' },
  { id: 'collide', name: 'Collide', line: 'Mixes it with a second thing you drop in.' },
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
  const [showTemplates, setShowTemplates] = useState(false);
  const chosen = TEMPLATES.find((template) => template.id === picked);
  const chosenMode = MODES.find((item) => item.id === mode);
  const needsSecond = mode === 'collide' && !second;
  return <Screen title="Any extras?"
    sub="Both optional. Skip to let your upload decide."
    actions={<button type="button" className="btn-pill is-primary" disabled={needsSecond}
      onClick={() => onPick(picked, mode, mode === 'collide' ? second : null)} data-testid="button-steer">
      <span>{needsSecond ? 'Add the second thing' : chosen || mode ? 'Invent it' : 'Skip'}</span>
    </button>}>
    <h3 className="sub-head">Mode</h3>
    <div className="mode-chips" role="radiogroup" aria-label="Mode">
      {MODES.map((item) => <button key={item.id} type="button" role="radio" aria-checked={mode === item.id} className={`mode-chip${mode === item.id ? ' is-on' : ''}`}
        onClick={() => setMode(mode === item.id ? null : item.id)} data-testid={`mode-${item.id}`}>{item.name}</button>)}
    </div>
    {chosenMode && <p className="mode-line">{chosenMode.line}</p>}
    {mode === 'collide' && <SecondSource value={second} onChange={setSecond} />}
    <h3 className="sub-head">Template</h3>
    {!showTemplates
      ? <button type="button" className="tpl-toggle" onClick={() => setShowTemplates(true)} data-testid="button-templates">
          <span>{chosen ? <>{chosen.name} <small>like {chosen.sourceApp}</small></> : 'Add a template'}</span><b>{chosen ? 'Change' : 'Browse'}</b>
        </button>
      : <ul className="tpl-grid" role="radiogroup" aria-label="Templates">
          <li><button type="button" role="radio" aria-checked={picked === null} className={`tpl-card is-auto${picked === null ? ' is-on' : ''}`} onClick={() => { setPicked(null); setShowTemplates(false); }}>
            <span className="tpl-top"><Sparkles size={18} /><span className="tpl-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span></span>
            <b>No template</b>
            <p>The idea comes only from what you dropped in.</p>
          </button></li>
          {TEMPLATES.map((template) => <li key={template.id}>
            <button type="button" role="radio" aria-checked={picked === template.id} className={`tpl-card${picked === template.id ? ' is-on' : ''}`}
              onClick={() => { setPicked(template.id); setShowTemplates(false); }}>
              <Thumb template={template} />
              <span className="tpl-top"><small>Like {template.sourceApp}</small><span className="tpl-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span></span>
              <b>{template.name}</b>
              <p>{template.trick}</p>
            </button>
          </li>)}
        </ul>}
  </Screen>;
}
