// One screen at a time.
// home (drop anything) → who's it for + describe it → steer it (optional)
// → inventing (workbench stages 1–4) → pick one of the kept ideas → result
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CloseIcon, TopBar } from '@/components/shell';
import { ideaStore, useSavedIdeas } from '@/lib/ideas-store';
import { NewHome } from '@/screens/newhome';
import { NewAudience } from '@/screens/newaudience';
import { NewSteer } from '@/screens/newsteer';
import { NewLoading } from '@/screens/newloading';
import { NewResult } from '@/screens/newresult';
import { NewPick } from '@/screens/newpick';
import { Result } from '@/screens/result';
import { Saved } from '@/screens/saved';
import { Divider } from '@/screens/flow';
import { isNewBlueprint, type Blueprint, type GeneratedIdea, type NewBlueprint, type SavedIdea, type Upload, type UploadRead } from '../server/lib/types.ts';
import { uploadLabel } from '@/lib/upload';

type ScreenState =
  | { name: 'home' }
  | { name: 'audience'; upload: Upload; audience?: string; direction?: string }
  | { name: 'steer'; upload: Upload; audience: string; direction: string; templateId?: string | null }
  | { name: 'loading'; upload: Upload; audience: string; direction: string; templateId: string | null }
  | { name: 'pick'; upload: Upload; audience: string; direction: string; templateId: string | null; read: UploadRead; kept: GeneratedIdea[] }
  | { name: 'result'; idea: SavedIdea }
  | { name: 'saved' };

// Going back into the loading screen would rerun it, so back lands on the steer screen instead.
function restorable(screen: ScreenState): ScreenState {
  if (screen.name === 'loading') return { name: 'steer', upload: screen.upload, audience: screen.audience, direction: screen.direction, templateId: screen.templateId };
  return screen;
}

/** History entries can't hold big uploads on some browsers; a step that lost its upload starts over. */
function usable(screen: ScreenState): ScreenState {
  if ('upload' in screen && !screen.upload) return { name: 'home' };
  return screen;
}

export default function App() {
  const [screen, setScreen] = useState<ScreenState>({ name: 'home' });
  const saved = useSavedIdeas();

  const go = useCallback((next: ScreenState, replace = false) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
    try { (replace ? history.replaceState : history.pushState).call(history, { screen: next }, ''); } catch { /* state too large for history: fine */ }
  }, []);

  useEffect(() => {
    history.replaceState({ screen: { name: 'home' } }, '');
    const onPop = (event: PopStateEvent) => setScreen(usable(restorable((event.state?.screen as ScreenState) ?? { name: 'home' })));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function goHome() { go({ name: 'home' }); }

  function open(from: Extract<ScreenState, { name: 'pick' }>, idea: GeneratedIdea, found: Pick<NewBlueprint, 'competitors' | 'searched'>) {
    const blueprint: NewBlueprint = {
      version: 3,
      upload: { kind: from.upload.kind, label: uploadLabel(from.upload) },
      audience: from.audience, direction: from.direction || undefined, templateId: from.templateId,
      read: from.read, idea, ...found,
    };
    go({ name: 'result', idea: ideaStore.save(blueprint) });
  }

  function update(entry: SavedIdea, next: Blueprint | NewBlueprint) {
    const updated = ideaStore.update(entry.id, next);
    if (!updated) return;
    setScreen((current) => (current.name === 'result' && current.idea.id === entry.id ? { name: 'result', idea: updated } : current));
    try { history.replaceState({ screen: { name: 'result', idea: updated } }, ''); } catch { /* state too large for history: fine */ }
  }

  const back = { label: 'Back', icon: <ArrowLeft size={22} />, onClick: () => history.back() };
  const close = { label: 'Close', icon: CloseIcon, onClick: goHome };
  const topBar = (options: { title?: string; left?: typeof back } = {}) =>
    <TopBar title={options.title} left={options.left} onBrand={goHome} savedCount={saved.length} onSaved={() => go({ name: 'saved' })} />;

  if (screen.name === 'home') {
    return <NewHome topBar={topBar()} busy={false}
      onUpload={(upload) => go({ name: 'audience', upload })}
      onDescribe={(text) => go({ name: 'audience', upload: { kind: 'text', text } })} />;
  }

  let body: ReactNode;
  let bar = topBar({ left: back });
  switch (screen.name) {
    case 'audience':
      body = <NewAudience upload={screen.upload} initial={screen.audience} initialDirection={screen.direction}
        onPick={(audience, direction) => go({ name: 'steer', upload: screen.upload, audience, direction })} />;
      break;
    case 'steer':
      body = <NewSteer initial={screen.templateId ?? null}
        onPick={(templateId) => go({ name: 'loading', upload: screen.upload, audience: screen.audience, direction: screen.direction, templateId })} />;
      break;
    case 'loading':
      bar = topBar({ left: close });
      body = <NewLoading key={`${screen.audience}:${screen.direction}:${screen.templateId}`} upload={screen.upload} audience={screen.audience} direction={screen.direction} templateId={screen.templateId}
        onDone={(read, kept) => go({ name: 'pick', upload: screen.upload, audience: screen.audience, direction: screen.direction, templateId: screen.templateId, read, kept }, true)}
        onBack={() => history.back()} />;
      break;
    case 'pick': {
      const from = screen;
      bar = topBar({ left: close });
      body = <NewPick ideas={from.kept} audience={from.audience} onChoose={(idea, found) => open(from, idea, found)} />;
      break;
    }
    case 'result': {
      const entry = screen.idea;
      const blueprint = entry.output_json;
      bar = topBar({ left: close, title: blueprint.idea.name });
      if (isNewBlueprint(blueprint)) {
        body = <NewResult blueprint={blueprint} onStartOver={goHome} onUpdate={(next) => update(entry, next)} />;
      } else if (blueprint.version === 2) {
        // Ideas saved from the earlier app-based version still open.
        body = <Result blueprint={blueprint} onStartOver={goHome} onUpdate={(next) => update(entry, next)} onDifferentAudience={goHome} />;
      } else {
        // Saved before either current format: there's nothing safe to show.
        const name = (blueprint as { idea?: { name?: string } }).idea?.name ?? 'This idea';
        body = <Divider n="!" part="Saved with an older version" title="Make a new one" sub={`${name} was saved with an older version that can’t be shown any more.`} action="Start"
          band={[name]} onContinue={goHome} />;
      }
      break;
    }
    case 'saved':
      bar = topBar({ left: close });
      body = <Saved ideas={saved} onNew={goHome}
        onOpen={(idea) => go({ name: 'result', idea })}
        onDelete={(idea) => ideaStore.remove(idea.id)} />;
      break;
  }

  return <div className="app is-flow">
    <div className="ambient" aria-hidden="true" />
    <div className="grain" aria-hidden="true" />
    {bar}
    <main className="flow" key={screen.name}>{body}</main>
  </div>;
}
