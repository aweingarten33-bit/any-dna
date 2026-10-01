// Spinoff: one screen at a time.
// home → confirm → divider → audience → loading → divider → result
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CloseIcon, TopBar } from '@/components/shell';
import { api } from '@/lib/api';
import { ideaStore, useSavedIdeas } from '@/lib/ideas-store';
import { Home } from '@/screens/home';
import { Audience, Confirm, Divider, Loading } from '@/screens/flow';
import { Result } from '@/screens/result';
import { Saved } from '@/screens/saved';
import type { AppListing, Blueprint, SavedIdea } from '../supabase/functions/_shared/types.ts';

type ScreenState =
  | { name: 'home' }
  | { name: 'confirm'; candidates: AppListing[]; index: number }
  | { name: 'to-audience'; app: AppListing }
  | { name: 'audience'; app: AppListing; audience?: string }
  | { name: 'loading'; app: AppListing; audience: string }
  | { name: 'to-result'; idea: SavedIdea }
  | { name: 'result'; idea: SavedIdea }
  | { name: 'saved' };

// A step back into the checklist would rerun it, so back lands on the audience instead.
function restorable(screen: ScreenState): ScreenState {
  if (screen.name === 'loading') return { name: 'audience', app: screen.app, audience: screen.audience };
  if (screen.name === 'to-result') return { name: 'result', idea: screen.idea };
  return screen;
}

export default function App() {
  const [screen, setScreen] = useState<ScreenState>({ name: 'home' });
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const lastFind = useRef<{ query: string; country: string } | null>(null);
  const findAbort = useRef<AbortController | null>(null);
  const saved = useSavedIdeas();

  const go = useCallback((next: ScreenState, replace = false) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
    try { (replace ? history.replaceState : history.pushState).call(history, { screen: next }, ''); } catch { /* state too large for history: fine */ }
  }, []);

  useEffect(() => {
    history.replaceState({ screen: { name: 'home' } }, '');
    const onPop = (event: PopStateEvent) => setScreen(restorable((event.state?.screen as ScreenState) ?? { name: 'home' }));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  async function find(query: string, country: string) {
    lastFind.current = { query, country };
    findAbort.current?.abort();
    const abort = new AbortController();
    findAbort.current = abort;
    setFinding(true);
    setFindError(null);
    try {
      const { candidates } = await api.resolveApp(query, country, abort.signal);
      if (!abort.signal.aborted) go({ name: 'confirm', candidates, index: 0 });
    } catch (error) {
      if (!abort.signal.aborted) setFindError(error instanceof Error ? error.message : String(error));
    } finally {
      if (findAbort.current === abort) setFinding(false);
    }
  }

  function goHome() {
    findAbort.current?.abort();
    setFinding(false);
    setFindError(null);
    go({ name: 'home' });
  }

  function finish(blueprint: Blueprint) {
    const idea = ideaStore.save(blueprint);
    go({ name: 'to-result', idea }, true);
  }

  const back = { label: 'Back', icon: <ArrowLeft size={22} />, onClick: () => history.back() };
  const close = { label: 'Close', icon: CloseIcon, onClick: goHome };
  const topBar = (options: { title?: string; left?: typeof back } = {}) =>
    <TopBar title={options.title} left={options.left} onBrand={goHome} savedCount={saved.length} onSaved={() => go({ name: 'saved' })} />;

  if (screen.name === 'home') {
    return <Home topBar={topBar()} busy={finding} error={findError} onFind={(query, country) => void find(query, country)}
      onRetry={() => (lastFind.current ? void find(lastFind.current.query, lastFind.current.country) : setFindError(null))} />;
  }

  let body: ReactNode;
  let bar = topBar({ left: back });
  switch (screen.name) {
    case 'confirm':
      body = <Confirm candidates={screen.candidates} index={screen.index}
        onYes={(app) => go({ name: 'to-audience', app })}
        onNext={() => go({ ...screen, index: screen.index + 1 }, true)}
        onSearchAgain={goHome} />;
      break;
    case 'to-audience':
      body = <Divider part="Part 2 of 3" title="Who’s it for?" sub={`${screen.app.name} works. Next, pick who you want to rebuild it for.`} action="Continue"
        onContinue={() => go({ name: 'audience', app: screen.app }, true)} />;
      break;
    case 'audience':
      body = <Audience app={screen.app} initial={screen.audience} onPick={(audience) => go({ name: 'loading', app: screen.app, audience })} />;
      break;
    case 'loading':
      bar = topBar({ left: close });
      body = <Loading key={`${screen.app.app_id}:${screen.audience}`} app={screen.app} audience={screen.audience} onDone={finish} onBack={() => history.back()} />;
      break;
    case 'to-result':
      bar = topBar({ left: close });
      body = <Divider part="Part 3 of 3" title="Your blueprint is ready" sub={`${screen.idea.output_json.idea.name}: six cards, one section each. Swipe through.`} action="Show me"
        onContinue={() => go({ name: 'result', idea: screen.idea }, true)} />;
      break;
    case 'result':
      bar = topBar({ left: close, title: screen.idea.output_json.idea.name });
      body = <Result blueprint={screen.idea.output_json} onStartOver={goHome}
        onDifferentAudience={() => go({ name: 'audience', app: screen.idea.output_json.app })} />;
      break;
    case 'saved':
      bar = topBar({ left: close });
      body = <Saved ideas={saved} onNew={goHome}
        onOpen={(idea) => go({ name: 'result', idea })}
        onDifferentAudience={(idea) => go({ name: 'audience', app: idea.output_json.app })}
        onDelete={(idea) => ideaStore.remove(idea.id)} />;
      break;
  }

  return <div className="app is-flow">
    {bar}
    <main className="flow" key={screen.name}>{body}</main>
  </div>;
}
