// The new front door: drop anything, or describe it in words.
import { useRef, useState, type ReactNode } from 'react';
import { FileText, Film, Image as ImageIcon, Music } from 'lucide-react';
import { Composer, HomeBackground, type ComposerOption } from '@/components/shell';
import { fileToUpload, UploadError } from '@/lib/upload';
import type { Upload } from '../../server/lib/types.ts';

const ADD_OPTIONS: ComposerOption[] = [
  { id: 'photo', label: 'Photo', hint: 'Any photo: a selfie, a tree, a concert' },
  { id: 'video', label: 'Video', hint: 'We look at a few moments from it' },
  { id: 'song', label: 'Song', hint: 'We read its title and artist' },
  { id: 'document', label: 'Document', hint: 'PDF or Word' },
];

const PICKERS = [
  { id: 'photo', label: 'Photo', icon: ImageIcon, accept: 'image/*,.heic,.heif' },
  { id: 'video', label: 'Video', icon: Film, accept: 'video/*,.mp4,.mov,.m4v' },
  { id: 'song', label: 'Song', icon: Music, accept: 'audio/*,.mp3,.m4a,.wav,.aac' },
  { id: 'document', label: 'Document', icon: FileText, accept: 'application/pdf,.pdf,.docx' },
] as const;

export function NewHome({ topBar, busy, onUpload, onDescribe }: {
  topBar: ReactNode;
  busy: boolean;
  onUpload: (upload: Upload) => void;
  onDescribe: (text: string) => void;
}) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <h1><span className="line">Drop anything.</span><br /><span className="line">Get an <span className="accent">app idea.</span></span></h1>
        <p className="hero-sub">A photo, a video, a song, a document, or a few words. The app idea comes straight from what you drop in.</p>
      </section>
      <div className="drop-row">
        {PICKERS.map((picker) => <button key={picker.id} type="button" className="btn-pill" disabled={active} onClick={() => inputs.current[picker.id]?.click()}>
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
        <Composer placeholder="Or type anything…" busy={active}
          options={ADD_OPTIONS} option="" menuTitle="Add a file"
          onOption={(id) => inputs.current[id]?.click()}
          onSubmit={(text) => { const trimmed = text.trim(); if (trimmed) onDescribe(trimmed); }} />
      </div>
    </div>
  </div>;
}
