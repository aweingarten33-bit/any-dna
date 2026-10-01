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

const TYPE_HINT = 'Type or paste';
const LINK_HINT = 'Paste the link here';

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
    <main className="home">
      <section className="hero" aria-label="Start">
        <h1><span className="line">Drop anything.</span><br /><span className="line">Get an app idea.</span></h1>
        <p className="hero-sub">A link, an image, a video or song, a document, or your own words. The app idea comes straight from it.</p>
      </section>
      <div className="drop-row">
        <button type="button" className="btn-pill" disabled={active} onClick={() => choose('link')} data-testid="button-link"><Link2 size={18} /><span>Link</span></button>
        {PICKERS.map((picker) => <button key={picker.id} type="button" className="btn-pill" disabled={active} onClick={() => choose(picker.id)}>
          <picker.icon size={18} /><span>{picker.label}</span>
        </button>)}
        {PICKERS.map((picker) => <input key={picker.id} ref={(element) => { inputs.current[picker.id] = element; }} type="file" accept={picker.accept} className="vh" aria-hidden="true" tabIndex={-1}
          onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />)}
      </div>
      {uploading && <p className="home-privacy" role="status">Reading it…</p>}
      {error && <p className="home-error" role="alert">{error}</p>}
      <p className="home-privacy">Your upload isn’t stored. It’s read once to invent the idea, then forgotten.</p>
    </main>
    <div className="dock home-dock">
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
      </div>
    </div>
  </div>;
}
