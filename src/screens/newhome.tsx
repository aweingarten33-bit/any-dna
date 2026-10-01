// The new front door: drop anything, or describe it in words.
import { useRef, useState, type ReactNode } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { Composer, HomeBackground, type ComposerOption } from '@/components/shell';
import { fileToUpload, UploadError } from '@/lib/upload';
import type { Upload } from '../../server/lib/types.ts';

const ADD_OPTIONS: ComposerOption[] = [
  { id: 'photo', label: 'Photo', hint: 'Any photo: a selfie, a tree, a concert' },
  { id: 'document', label: 'Document', hint: 'PDF or Word' },
];

export function NewHome({ topBar, busy, onUpload, onDescribe }: {
  topBar: ReactNode;
  busy: boolean;
  onUpload: (upload: Upload) => void;
  onDescribe: (text: string) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
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
        <p className="hero-sub">A photo, a document, or a few words, even a song title. The app idea comes straight from what you drop in.</p>
      </section>
      <div className="drop-row">
        <button type="button" className="btn-pill" disabled={active} onClick={() => photoRef.current?.click()}>
          <ImageIcon size={18} /><span>{uploading ? 'Reading…' : 'Photo'}</span>
        </button>
        <button type="button" className="btn-pill" disabled={active} onClick={() => docRef.current?.click()}>
          <FileText size={18} /><span>{uploading ? 'Reading…' : 'Document'}</span>
        </button>
        <input ref={photoRef} type="file" accept="image/*,.heic,.heif" className="vh" aria-hidden="true" tabIndex={-1}
          onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />
        <input ref={docRef} type="file" accept="application/pdf,.pdf,.docx" className="vh" aria-hidden="true" tabIndex={-1}
          onChange={(event) => { void takeFile(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      {error && <p className="home-error" role="alert">{error}</p>}
      <p className="home-privacy">Your upload isn’t stored. It’s read once to invent the idea, then forgotten.</p>
    </main>
    <div className="dock home-dock">
      <div className="dock-stack">
        <Composer placeholder="Or type anything…" busy={active}
          options={ADD_OPTIONS} option="" menuTitle="Add a file"
          onOption={(id) => (id === 'photo' ? photoRef : docRef).current?.click()}
          onSubmit={(text) => { const trimmed = text.trim(); if (trimmed) onDescribe(trimmed); }} />
      </div>
    </div>
  </div>;
}
