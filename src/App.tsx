// New flow: home → one continuous creative exercise.
// The old Research → DNA → Generate → Filter screens are no longer part of the app journey.
import { useCallback, useEffect, type ReactNode, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CloseIcon, TopBar } from '@/components/shell';
import { ideaStore, useSavedIdeas } from '@/lib/ideas-store';
import { NewHome } from '@/screens/newhome';
import { Exercise } from '@/screens/exercise';
import { NewResult } from '@/screens/newresult';
import { Saved } from '@/screens/saved';
import { Screen } from '@/components/bits';
import { isNewBlueprint, type NewBlueprint, type SavedIdea, type Upload } from '../server/lib/types.ts';

type ScreenState =
  | { name: 'home' }
  | { name: 'exercise'; upload: Upload }
  | { name: 'result'; idea: SavedIdea }
  | { name: 'saved' };

function usable(screen: ScreenState): ScreenState {
  if (screen.name === 'exercise' && !screen.upload) return { name: 'home' };
  return screen;
}

export default function App() {
  const [screen, setScreen] = useState<ScreenState>({ name: 'home' });
  const saved = useSavedIdeas();

  const go = useCallback((next: ScreenState, replace = false) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
    try { (replace ? history.replaceState : history.pushState).call(history, { screen: next }, ''); } catch { /* uploads can be too large for history; the screen still works */ }
  }, []);

  useEffect(() => {
    history.replaceState({ screen: { name: 'home' } }, '');
    const onPop = (event: PopStateEvent) => setScreen(usable((event.state?.screen as ScreenState) ?? { name: 'home' }));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function goHome() { go({ name: 'home' }); }

  function update(entry: SavedIdea, next: NewBlueprint) {
    const updated = ideaStore.update(entry.id, next);
    if (!updated) return;
    setScreen((current) => (current.name === 'result' && current.idea.id === entry.id ? { name: 'result', idea: updated } : current));
    try { history.replaceState({ screen: { name: 'result', idea: updated } }, ''); } catch { /* fine */ }
  }

  const back = { label: 'Back', icon: <ArrowLeft size={22} />, onClick: () => history.back() };
  const close = { label: 'Close', icon: CloseIcon, onClick: goHome };
  const topBar = (options: { title?: ReactNode; left?: typeof back } = {}) =>
    <TopBar title={options.title ?? 'Any DNA'} left={options.left} onBrand={goHome} savedCount={saved.length} onSaved={() => go({ name: 'saved' })} />;

  if (screen.name === 'home') {
    return <NewHome topBar={topBar()} busy={false}
      onUpload={(upload) => go({ name: 'exercise', upload })}
      onDescribe={(text) => go({ name: 'exercise', upload: { kind: 'text', text } })} />;
  }

  if (screen.name === 'exercise') {
    return <Exercise upload={screen.upload} topBar={topBar({ left: close })} onStartOver={goHome} />;
  }

  let body: ReactNode;
  let bar = topBar({ left: back });

  if (screen.name === 'saved') {
    bar = topBar({ left: close });
    body = <Saved ideas={saved} onNew={goHome}
      onOpen={(idea) => go({ name: 'result', idea })}
      onDelete={(idea) => ideaStore.remove(idea.id)} />;
  } else {
    const entry = screen.idea;
    const blueprint = entry.output_json;
    bar = topBar({ left: close, title: blueprint.idea.name });
    body = isNewBlueprint(blueprint)
      ? <NewResult blueprint={blueprint} onStartOver={goHome} onUpdate={(next) => update(entry, next)} />
      : <Screen title={blueprint.idea.name} sub="This was saved with an earlier version of the app and can’t be opened any more."
          actions={<button type="button" className="btn-pill is-primary" onClick={goHome}><span>Make a new one</span></button>} />;
  }

  return <div className="app is-flow">
    <div className="ambient" aria-hidden="true" />
    <div className="grain" aria-hidden="true" />
    {bar}
    <main className="flow">{body}</main>
  </div>;
}
