// One screen at a time.
// home (drop anything) → who's it for + describe it → mode and template (optional)
// → inventing (the four canonical prompts) → pick one of the kept ideas → result
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CloseIcon, TopBar } from '@/components/shell';
import { ideaStore, useSavedIdeas } from '@/lib/ideas-store';
import { NewHome } from '@/screens/newhome';
import { NewAudience } from '@/screens/newaudience';
import { NewSteer } from '@/screens/newsteer';
import type { Mode } from '@/lib/newrun';
import { NewLoading } from '@/screens/newloading';
import { NewResult } from '@/screens/newresult';
import { NewPick } from '@/screens/newpick';
import { Saved } from '@/screens/saved';
import { Screen } from '@/components/bits';
import { isNewBlueprint, type FilterResult, type GeneratedIdea, type NewBlueprint, type SavedIdea, type Upload, type UploadRead } from '../server/lib/types.ts';
import { uploadLabel } from '@/lib/upload';

type Steer = { templateId: string | null; mode: Mode; second: Upload | null };

type ScreenState =
  | { name: 'home' }
  | { name: 'audience'; upload: Upload; audience?: string; direction?: string; steer?: Steer }
  | { name: 'steer'; upload: Upload; audience: string; direction: string; steer?: Steer }
  | { name: 'loading'; upload: Upload; audience: string; direction: string; steer: Steer }
  | { name: 'pick'; upload: Upload; audience: string; direction: string; steer: Steer; read: UploadRead; secondRead?: UploadRead; kept: GeneratedIdea[]; found?: FilterResult['found'] }
  | { name: 'result'; idea: SavedIdea }
  | { name: 'saved' };

// Going back into the loading screen would rerun it, so back lands on the steer screen instead.
function restorable(screen: ScreenState): ScreenState {
  if (screen.name === 'loading') return { name: 'steer', upload: screen.upload, audience: screen.audience, direction: screen.direction, steer: screen.steer };
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
    const { templateId, mode, second } = from.steer;
    const blueprint: NewBlueprint = {
      version: 4,
      upload: { kind: from.upload.kind, label: uploadLabel(from.upload) },
      audience: from.audience, direction: from.direction || undefined, templateId, mode,
      second: second && from.secondRead ? { kind: second.kind, label: uploadLabel(second), read: from.secondRead } : undefined,
      read: from.read, idea, ...found,
    };
    go({ name: 'result', idea: ideaStore.save(blueprint) });
  }

  function update(entry: SavedIdea, next: NewBlueprint) {
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
        onPick={(audience, direction) => go({ name: 'steer', upload: screen.upload, audience, direction, steer: screen.steer })} />;
      break;
    case 'steer':
      body = <NewSteer initial={screen.steer?.templateId ?? null} initialMode={screen.steer?.mode ?? null} initialSecond={screen.steer?.second ?? null}
        onPick={(templateId, mode, second) => go({ name: 'loading', upload: screen.upload, audience: screen.audience, direction: screen.direction, steer: { templateId, mode, second } })} />;
      break;
    case 'loading': {
      const from = screen;
      const { templateId, mode, second } = from.steer;
      bar = topBar({ left: close });
      body = <NewLoading key={`${from.audience}:${from.direction}:${templateId}:${mode}`} upload={from.upload} second={mode === 'collide' ? second ?? undefined : undefined}
        audience={from.audience} direction={from.direction} templateId={templateId} mode={mode}
        onDone={(read, kept, secondRead, found) => go({ name: 'pick', upload: from.upload, audience: from.audience, direction: from.direction, steer: from.steer, read, secondRead, kept, found }, true)}
        onBack={() => history.back()}
        // Nothing passed: let the user change the source, audience, direction or mode.
        onAdjust={(what) => go(what === 'source' ? { name: 'home' }
          : what === 'audience' ? { name: 'audience', upload: from.upload, audience: from.audience, direction: from.direction, steer: from.steer }
          : { name: 'steer', upload: from.upload, audience: from.audience, direction: from.direction, steer: from.steer }, true)} />;
      break;
    }
    case 'pick': {
      const from = screen;
      bar = topBar({ left: close });
      body = <NewPick ideas={from.kept} found={from.found} audience={from.audience} onChoose={(idea, found) => open(from, idea, found)} />;
      break;
    }
    case 'result': {
      const entry = screen.idea;
      const blueprint = entry.output_json;
      bar = topBar({ left: close, title: blueprint.idea.name });
      body = isNewBlueprint(blueprint)
        ? <NewResult blueprint={blueprint} onStartOver={goHome} onUpdate={(next) => update(entry, next)} />
        // Saved by the earlier app-based version: there's nothing that can be shown any more.
        : <Screen title={blueprint.idea.name} sub="This was saved with an earlier version of the app and can’t be opened any more."
            actions={<button type="button" className="btn-pill is-primary" onClick={goHome}><span>Make a new one</span></button>} />;
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
