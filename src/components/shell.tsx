// The homepage chrome, carried over from the original UI: ink-video
// background, top bar with the round account button, and the floating composer.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Bookmark, Check, Mic, Plus, User, X } from 'lucide-react';

/* ---------- Background ---------- */

// Looping ink video behind the home screen. Muted and inline so phones
// autoplay it; people who ask for reduced motion get the still frame.
export function HomeBackground() {
  const base = import.meta.env.BASE_URL;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return <div className="home-bg" aria-hidden="true">
    {reduced
      ? <img src={`${base}ink-poster.jpg`} alt="" />
      : <video autoPlay muted loop playsInline preload="auto" poster={`${base}ink-poster.jpg`}>
          <source src={`${base}ink.webm`} type="video/webm" />
          <source src={`${base}ink.mp4`} type="video/mp4" />
        </video>}
    <div className="home-bg-tint" />
  </div>;
}

/* ---------- Voice dictation (Web Speech API; hidden where unsupported) ---------- */

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};

function speechConstructor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const supported = !!speechConstructor();
  useEffect(() => () => recognition.current?.stop(), []);
  function start() {
    const Speech = speechConstructor();
    if (!Speech || listening) return;
    const rec = new Speech();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => onText(Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(''));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }
  function stop() { recognition.current?.stop(); setListening(false); }
  return { supported, listening, stop, toggle: () => (listening ? stop() : start()) };
}

/* ---------- Composer ---------- */

export type ComposerOption = { id: string; label: string; hint: string };

export function Composer({ placeholder, busy, onSubmit, options, option, onOption, menuTitle }: {
  placeholder: string;
  busy: boolean;
  /** Return false to keep the text in the box. */
  onSubmit: (text: string) => boolean | void;
  /** Choices behind the + button. */
  options: ComposerOption[];
  option: string;
  onOption: (id: string) => void;
  menuTitle: string;
}) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dictation = useDictation(setText);
  const ready = !busy && !!text.trim();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);

  function submit() {
    if (!ready) return;
    dictation.stop();
    if (onSubmit(text.trim()) !== false) setText('');
  }

  return (
    <div className="composer-wrap" ref={boxRef}>
      {menuOpen && (
        <div className="composer-menu" role="menu" aria-label={menuTitle}>
          <div className="composer-menu-extra"><small>{menuTitle}</small></div>
          {options.map((item) => (
            <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === option} className={item.id === option ? 'is-selected' : ''}
              onClick={() => { onOption(item.id); setMenuOpen(false); }}>
              <span><b>{item.label}</b><small>{item.hint}</small></span>
              {item.id === option && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
      <form className={`composer${dictation.listening ? ' is-listening' : ''}`} onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <button type="button" className={`composer-plus${menuOpen ? ' is-open' : ''}`} aria-label={menuTitle} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <Plus size={22} strokeWidth={2} />
        </button>
        <span className="composer-divider" aria-hidden="true" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={dictation.listening ? 'Listening…' : placeholder}
          aria-label={placeholder}
          maxLength={4000}
          enterKeyHint="send"
          autoCapitalize="off"
          autoCorrect="off"
          data-testid="input-ask"
        />
        {dictation.supported && (
          <button type="button" className={`composer-mic${dictation.listening ? ' is-on' : ''}`} onClick={dictation.toggle} aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}>
            <Mic size={20} />
          </button>
        )}
        <button type="submit" className="composer-send" disabled={!ready} aria-label="Send" data-testid="button-send">
          <ArrowUp size={22} strokeWidth={2.4} />
        </button>
      </form>
    </div>
  );
}

/* ---------- Top bar ---------- */

export function TopBar({ title, onBrand, left, savedCount, onSaved }: {
  title?: ReactNode;
  onBrand: () => void;
  /** Top-left control, shown only away from home (back or close). */
  left?: { label: string; icon: ReactNode; onClick: () => void };
  savedCount: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <header className="topbar">
      {left
        ? <button type="button" className="glass-round" onClick={left.onClick} aria-label={left.label}>{left.icon}</button>
        : <span className="topbar-spacer" aria-hidden="true" />}
      <button type="button" className="topbar-brand" onClick={onBrand} aria-label="Spinoff home">
        <span className="topbar-title">{title ?? 'Spinoff'}</span>
      </button>
      <div className="account" ref={ref}>
        <button type="button" className="glass-round" onClick={() => setOpen((value) => !value)} aria-label="Menu" aria-expanded={open} data-testid="button-account">
          <User size={22} />
        </button>
        {open && (
          <div className="account-menu" role="menu">
            <div className="account-id"><strong>Spinoff</strong><small>Your ideas are saved on this device.</small></div>
            <button type="button" onClick={() => { setOpen(false); onSaved(); }} data-testid="button-saved">
              <Bookmark size={16} />Saved ideas{savedCount ? <span className="account-count">{savedCount}</span> : null}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export const CloseIcon = <X size={22} />;
