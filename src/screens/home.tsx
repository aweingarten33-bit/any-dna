// The homepage from the original UI, wired to Spinoff's first step.
import { useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Composer, HomeBackground, type ComposerOption } from '@/components/shell';
import { HOME_PLACEHOLDER } from '@/lib/composer-marquee';

const COUNTRIES: ComposerOption[] = [
  { id: 'us', label: 'United States', hint: 'US App Store' },
  { id: 'gb', label: 'United Kingdom', hint: 'UK App Store' },
  { id: 'ca', label: 'Canada', hint: 'Canadian App Store' },
  { id: 'au', label: 'Australia', hint: 'Australian App Store' },
  { id: 'ie', label: 'Ireland', hint: 'Irish App Store' },
  { id: 'nz', label: 'New Zealand', hint: 'New Zealand App Store' },
  { id: 'in', label: 'India', hint: 'Indian App Store' },
];

export function Home({ topBar, busy, error, onFind, onRetry }: {
  topBar: ReactNode;
  busy: boolean;
  error: string | null;
  onFind: (query: string, country: string) => void;
  onRetry: () => void;
}) {
  const [country, setCountry] = useState('us');
  return <div className={`app is-home${busy || error ? ' is-busy' : ''}`}>
    <HomeBackground />
    {topBar}
    <main className="home">
      <section className="hero" aria-label="Start">
        <h1><span className="line">Which app should</span><br /><span className="line">we <span className="accent">spin off?</span></span></h1>
      </section>
      {busy && <div className="home-card"><div className="turn ai"><div className="ai-body"><span className="ai-label">One moment</span><p>Finding it on the App Store…</p></div></div></div>}
      {error && <div className="home-card"><div className="turn ai"><div className="ai-body">
        <span className="ai-label">Hit a snag</span><p>{error}</p>
        <button type="button" className="btn btn-quiet" onClick={onRetry}>Try again <RefreshCw size={14} /></button>
      </div></div></div>}
    </main>
    <div className="dock home-dock">
      <div className="dock-stack">
        <Composer placeholder={HOME_PLACEHOLDER} busy={busy} options={COUNTRIES} option={country} onOption={setCountry} menuTitle="App Store region"
          onSubmit={(text) => { onFind(text, country); }} />
      </div>
    </div>
  </div>;
}
