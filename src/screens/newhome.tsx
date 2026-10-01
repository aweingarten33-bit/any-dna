// The front door: type, paste or upload literally anything worth stealing ideas from.
import { useRef, useState, type ReactNode } from 'react';
import { FileText, Film, Image as ImageIcon, Link2 } from 'lucide-react';
import { Composer, HomeBackground, type ComposerOption } from '@/components/shell';
import { typedToUpload, UploadError } from '@/lib/upload';
import { exerciseFileToUpload } from '@/lib/exercise-upload';
import type { Upload } from '../../server/lib/types.ts';

const ADD_OPTIONS: ComposerOption[] = [
  { id: 'link', label: 'Link', hint: 'App Store, Spotify, Apple Music, YouTube, TikTok, Instagram, GitHub' },
  { id: 'image', label: 'Image', hint: 'A photo, screenshot, artwork, product, map — whatever' },
  { id: 'media', label: 'Video / Audio', hint: 'A video, reel, clip or song file' },
  { id: 'document', label: 'Document / Data', hint: 'PDF, Word or PowerPoint' },
  { id: 'text', label: 'Text / Conversation', hint: 'An app, idea, scene, notes, conversation — just type it' },
];

const PICKERS = [
  { id: 'image', label: 'Image', icon: ImageIcon, accept: 'image/*,.heic,.heif' },
  { id: 'media', label: 'Video / Song', icon: Film, accept: 'video/*,audio/*,.mp4,.mov,.m4v,.mp3,.m4a,.wav,.aac' },
  { id: 'document', label: 'Document', icon: FileText, accept: 'application/pdf,.pdf,.docx,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation' },
] as const;

const TYPE_HINT = 'Type an app, an idea, a scene… literally anything';
const LINK_HINT = 'Paste the link';

function focusBox() {
  document.querySelector<HTMLInputElement>('[data-testid=input-ask]')?.focus();
}

export function NewHome({ topBar, busy, onUpload, onDescribe }: {
  topBar: ReactNode;
  busy: boolean;
  onUpload: (upload: Upload) => void;
  onDescribe: (text: string) => void;
}) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState(TYPE_HINT);

  function choose(id: string) {
    setError(null);
    if (id === 'link' || id === 'text') { setPlaceholder(id === 'link' ? LINK_HINT : TYPE_HINT); focusBox(); return; }
    inputs.current[id]?.click();
  }

  async function takeFile(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      onUpload(await exerciseFileToUpload(file));
    } catch (caught) {
      setError(caught instanceof UploadError ? caught.message : 'That file didn’t work. Try again.');
    } finally {
      setUploading(false);
    }
  }

  const active = busy || uploading;
  return <div className={`app is-home${active ? ' is-busy' : ''}`}>
    <HomeBackground />
    {topBar}
    <main className="home home-cinematic">
      <section className="hero hero-cinematic" aria-label="Start">
        <p className="home-kicker">ANY DNA</p>
        <h1>Drop literally<br />anything in.</h1>
        <p className="hero-sub">An app. An Instagram reel. A movie scene. A song. A GitHub repo. Even a picture of your dog.</p>
        <p className="hero-punch">Think none of that has anything to do with a new app? <strong>Think again.</strong></p>
      </section>

      <section className="home-start" aria-label="Choose what to drop in">
        <p className="home-start-label">Throw something in</p>
        <div className="drop-row drop-row-cinematic">
          <button type="button" className="btn-pill" disabled={active} onClick={() => choose('link')} data-testid="button-link"><Link2 size={17} /><span>Link</span></button>
          {PICKERS.map((picker) => <button key={picker.id} type="button" className="btn-pill" disabled={active} onClick={() => choose(picker.id)}>
            <picker.icon size={17} /><span>{picker.label}</span>
          </button>)}
          {PICKERS.map((picker) => <input key={picker.id} ref={(element) => { inputs.current[picker.id] = element; }} type="file" accept={picker.accept} className="vh" aria-hidden="true" tabIndex={-1}
            onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />)}
        </div>
        {uploading && <p className="home-status" role="status">Alright, lemme look at it…</p>}
        {error && <p className="home-error" role="alert">{error}</p>}
      </section>
    </main>

    <div className="dock home-dock home-dock-cinematic">
      <div className="dock-stack">
        <Composer placeholder={placeholder} busy={active}
          options={ADD_OPTIONS} option="" menuTitle="What are you throwing in?"
          onOption={choose}
          onSubmit={(text) => {
            if (!text.trim()) return false;
            try {
              const upload = typedToUpload(text);
              setError(null);
              if (upload.kind === 'text') onDescribe(upload.text); else onUpload(upload);
            } catch (caught) {
              setError(caught instanceof UploadError ? caught.message : 'That didn’t work. Try again.');
              return false;
            }
          }} />
        <p className="home-privacy">Hit Go. We’ll take it from there.</p>
      </div>
    </div>
  </div>;
}
