// The front door: the five kinds of source, as buttons and behind the +.
// The typing box takes words, and a pasted link still works there too.
import { useRef, useState, type ReactNode } from 'react';
import { FileText, Film, Image as ImageIcon, Link2 } from 'lucide-react';
import { Composer, HomeBackground, type ComposerOption } from '@/components/shell';
import { fileToUpload, typedToUpload, UploadError } from '@/lib/upload';
import type { Upload } from '../../server/lib/types.ts';

/** The five kinds of source. Only what actually works is listed. */
const ADD_OPTIONS: ComposerOption[] = [
  { id: 'link', label: 'Link', hint: 'Spotify, Apple Music, YouTube, TikTok, Instagram, GitHub' },
  { id: 'image', label: 'Image', hint: 'A photo, screenshot, artwork, a product, a map' },
  { id: 'media', label: 'Video / Audio', hint: 'A video, or a song file' },
  { id: 'document', label: 'Document / Data', hint: 'PDF or Word' },
  { id: 'text', label: 'Text / Conversation', hint: 'An idea, notes, a copied conversation: type or paste it' },
];

const PICKERS = [
  { id: 'image', label: 'Image', icon: ImageIcon, accept: 'image/*,.heic,.heif' },
  { id: 'media', label: 'Video / Song', icon: Film, accept: 'video/*,audio/*,.mp4,.mov,.m4v,.mp3,.m4a,.wav,.aac' },
  { id: 'document', label: 'Document', icon: FileText, accept: 'application/pdf,.pdf,.docx' },
] as const;

const TYPE_HINT = 'Describe something or paste text';
const LINK_HINT = 'Paste a link';

/** Puts the cursor in the typing box. */
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
      onUpload(await fileToUpload(file));
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
        <p className="home-kicker">ANY DNA · APP INVENTION</p>
        <h1>Find the app<br />inside anything.</h1>
        <p className="hero-sub">Drop a link, image, video or song, document, or your own words. We extract the useful DNA and turn it into 3 new software app ideas.</p>
        <div className="home-steps" aria-label="How it works">
          <span><b>01</b><em>Drop anything</em></span>
          <i aria-hidden="true">→</i>
          <span><b>02</b><em>Extract the DNA</em></span>
          <i aria-hidden="true">→</i>
          <span><b>03</b><em>Get 3 apps</em></span>
        </div>
      </section>

      <section className="home-start" aria-label="Choose what to drop in">
        <p className="home-start-label">Start with</p>
        <div className="drop-row drop-row-cinematic">
          <button type="button" className="btn-pill" disabled={active} onClick={() => choose('link')} data-testid="button-link"><Link2 size={17} /><span>Link</span></button>
          {PICKERS.map((picker) => <button key={picker.id} type="button" className="btn-pill" disabled={active} onClick={() => choose(picker.id)}>
            <picker.icon size={17} /><span>{picker.label}</span>
          </button>)}
          {PICKERS.map((picker) => <input key={picker.id} ref={(element) => { inputs.current[picker.id] = element; }} type="file" accept={picker.accept} className="vh" aria-hidden="true" tabIndex={-1}
            onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />)}
        </div>
        {uploading && <p className="home-status" role="status">Reading it…</p>}
        {error && <p className="home-error" role="alert">{error}</p>}
      </section>
    </main>

    <div className="dock home-dock home-dock-cinematic">
      <div className="dock-stack">
        <Composer placeholder={placeholder} busy={active}
          options={ADD_OPTIONS} option="" menuTitle="What are you dropping in?"
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
        <p className="home-privacy">Uploads aren’t stored.</p>
      </div>
    </div>
  </div>;
}
