// The blueprint for an idea from the new front door: the idea first, then how
// to build it, real competitors, and the business plan on request.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, FileDown, RefreshCw, Sparkles } from 'lucide-react';
import { AppIcon, Rating, Source, price } from '@/components/bits';
import { PhoneMockup, PhoneSkeleton, layoutFor } from '@/components/mockup';
import { api } from '@/lib/api';
import { BUILDERS, CODE_TOOLS, newBuildPrompt } from '@/lib/build-prompt';
import type { NewBlueprint } from '../../server/lib/types.ts';
import { templateById } from '../../server/lib/templates.ts';

const CARDS = ['The idea', 'Build it', 'Competitors', 'Business plan', 'Where it came from'] as const;
const SHORT = ['Idea', 'Build', 'Rivals', 'Plan', 'Origin'];

function Panel({ index, active, title, source, children }: { index: number; active: boolean; title: string; source: ReactNode; children: ReactNode }) {
  return <article className={`bp-panel${active ? ' is-active' : ''}`} aria-roledescription="card" aria-label={`${index + 1} of ${CARDS.length}: ${title}`} aria-hidden={!active}>
    <div className="bp-panel-inner">
      <header className="bp-panel-head">
        <h2>{title}</h2>
        <div className="bp-panel-sources">{source}</div>
      </header>
      <div className="bp-panel-body">{children}</div>
    </div>
  </article>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><dt>{label}</dt><dd>{children}</dd></div>;
}

/** Runs an AI extra (the mockup or the plan), saving the result into the blueprint. */
function useExtra<T>(have: T | undefined, load: (signal: AbortSignal) => Promise<T>, save: (value: T) => void, auto: boolean) {
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>(have || !auto ? 'idle' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const start = useRef(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState('loading');
    setError(null);
    try {
      const value = await load(abort.signal);
      if (!abort.signal.aborted) { saveRef.current(value); setState('idle'); }
    } catch (caught) {
      if (abort.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setState('failed');
    }
  });
  useEffect(() => {
    if (auto && !have) void start.current();
    return () => controller.current?.abort();
    // Only on mount: a finished extra is saved into the blueprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { state, error, start: () => void start.current() };
}

export function NewResult({ blueprint, onUpdate, onStartOver }: {
  blueprint: NewBlueprint;
  onUpdate: (next: NewBlueprint) => void;
  onStartOver: () => void;
}) {
  const { audience, idea, searched, competitors, kit, plan } = blueprint;
  const template = templateById(blueprint.templateId);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const latest = useRef(blueprint);
  latest.current = blueprint;

  const kitRun = useExtra(kit, (signal) => api.kit(audience, idea, blueprint.templateId, signal).then((r) => r.output), (value) => onUpdate({ ...latest.current, kit: value }), true);
  const planRun = useExtra(plan, (signal) => api.plan(audience, idea, signal).then((r) => r.output), (value) => onUpdate({ ...latest.current, plan: value }), false);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const onScroll = () => setActive(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)));
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  function go(index: number) {
    const element = track.current;
    if (!element) return;
    const target = Math.max(0, Math.min(CARDS.length - 1, index));
    element.scrollTo({ left: target * element.clientWidth, behavior: 'smooth' });
    setActive(target);
  }

  const prompt = newBuildPrompt(idea, kit);
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); } catch { /* clipboard blocked: the prompt is still on screen to select */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return <section className="blueprint">
    <NewPrintReport blueprint={blueprint} prompt={prompt} />
    <div className="bp-top">
      <div className="bp-route"><span>{blueprint.upload.label}</span><ArrowRight size={13} /><span>{audience}</span></div>
      <nav className="segments" aria-label="Blueprint sections">
        {CARDS.map((title, i) => <button key={title} type="button" className={i < active ? 'is-past' : i === active ? 'is-on' : ''} onClick={() => go(i)} aria-label={title} aria-current={i === active}>
          <i /><span>{SHORT[i]}</span>
        </button>)}
      </nav>
    </div>

    <div className="bp-track" ref={track} tabIndex={0} onKeyDown={(event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); }
    }}>
      <Panel index={0} active={active === 0} title="The idea" source={null}>
        <h3 className="idea-name">{idea.name}</h3>
        <p className="idea-pitch">{idea.tagline}</p>
        <p className="idea-who">{idea.what_it_is}</p>
        <h4 className="sub-head">The pattern underneath</h4>
        <p className="pattern-chain">{idea.pattern.split(/\s*(?:→|->)\s*/).map((part, i, all) => <span key={i}><b>{part}</b>{i < all.length - 1 && <ArrowRight size={14} aria-hidden="true" />}</span>)}</p>
        <dl className="stack-fields">
          <Field label="The job it does">{idea.job}</Field>
        </dl>
        <h4 className="sub-head">How it works</h4>
        <ol className="steps">{idea.how_it_works.map((step, i) => <li key={i}><span>{i + 1}</span><p>{step}</p></li>)}</ol>
        <div className="killer"><span>The killer feature</span><p>{idea.killer_feature}</p></div>
        <h4 className="sub-head">The callbacks to what you dropped in</h4>
        <ul className="callbacks">{idea.callbacks.map((callback, i) => <li key={i}><b>{callback.detail}</b><p>{callback.meaning}</p></li>)}</ul>
        <dl className="stack-fields">
          <Field label="What it’s not">{idea.what_its_not}</Field>
          <Field label="Why people would keep using it">{idea.why_use}</Field>
          <Field label="Biggest risk">{idea.main_risk}</Field>
          {template && <Field label="Proven trick built in">{template.name}, like {template.sourceApp}</Field>}
        </dl>
      </Panel>

      <Panel index={1} active={active === 1} title="Build it" source={null}>
        <p className="lede">What the first screen could look like, and how to build it this week.</p>
        <div className="phone-stage">
          {kit ? <PhoneMockup name={idea.name} screen={kit.screen} layout={layoutFor(blueprint.templateId)} /> : kitRun.state === 'failed'
            ? <div className="extra-failed"><p>{kitRun.error}</p><button type="button" className="btn-pill" onClick={kitRun.start}><span>Try again</span><RefreshCw size={16} /></button></div>
            : <PhoneSkeleton />}
        </div>
        <h4 className="sub-head">First version</h4>
        <ul className="mvp">{idea.mvp.map((item, i) => <li key={i}><p>{item}</p></li>)}</ul>
        <h4 className="sub-head">Your build prompt</h4>
        <div className="prompt-box">
          <pre>{prompt}</pre>
          <button type="button" className="btn-pill is-primary" onClick={() => void copyPrompt()} data-testid="button-copy-prompt">
            <span>{copied ? 'Copied' : 'Copy prompt'}</span>{copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
        </div>
        <h4 className="sub-head">Build it without code</h4>
        <ul className="tools">
          {BUILDERS.map((tool) => <li key={tool.name}>
            <a href={tool.href(prompt)} target="_blank" rel="noreferrer" onClick={() => { if (!tool.prefilled) void copyPrompt(); }}>
              <b>{tool.name}<ArrowUpRight size={16} /></b>
              <p>{tool.what}</p>
              {!tool.prefilled && <small>Copies the prompt for you</small>}
            </a>
          </li>)}
        </ul>
        <h4 className="sub-head">Or with code you own</h4>
        <ul className="tools is-quiet">
          {CODE_TOOLS.map((tool) => <li key={tool.name}>
            <a href={tool.url} target="_blank" rel="noreferrer"><b>{tool.name}<ArrowUpRight size={16} /></b><p>{tool.what}</p></a>
          </li>)}
        </ul>
        {kit && <>
          <h4 className="sub-head">Four-week plan</h4>
          <ol className="weeks">{kit.plan.map((step, i) => <li key={i}><span>{step.when}</span><div><p>{step.goal}</p><small>Done when: {step.done_when}</small></div></li>)}</ol>
        </>}
      </Panel>

      <Panel index={2} active={active === 2} title="Competitors" source={<Source fetched>Real App Store data</Source>}>
        <p className="lede">Searched the App Store for {idea.search_terms.map((term, i) => <span key={term}>{i > 0 && ', '}<q>{term}</q></span>)}. Found {searched.length} apps. {competitors.length ? `These ${competitors.length} came up the most.` : 'Nothing came up.'}</p>
        <ul className="rivals">
          {competitors.map((comp, i) => <li key={comp.app_id}>
            <AppIcon app={comp} size={48} />
            <div className="rival-main">
              <div className="rival-name"><b>{comp.name}</b><a href={comp.url} target="_blank" rel="noreferrer" aria-label={`Open ${comp.name} on the App Store`}><ArrowUpRight size={16} /></a></div>
              <div className="rival-facts"><Rating app={comp} /><span>{comp.category}</span></div>
              <p>{comp.overlap}</p>
            </div>
            <span className="rival-price">{price(comp)}</span>
          </li>)}
        </ul>
        <p className="fine">Names, prices and ratings come from the App Store. Prices are upfront prices; Apple doesn’t publish in-app or subscription prices. Coming up in the same search doesn’t mean an app does the same job; open it to check.</p>
      </Panel>

      <Panel index={3} active={active === 3} title="Business plan" source={null}>
        <dl className="stack-fields is-first"><Field label="How it makes money">{idea.monetization}</Field></dl>
        {plan ? <>
          <p className="plan-summary">{plan.summary}</p>
          <dl className="stack-fields">
            <Field label="Who pays">{plan.customer}</Field>
            <Field label="The problem">{plan.problem}</Field>
            <Field label="What the app does">{plan.solution}</Field>
          </dl>
          <div className="price-card"><span>Price to test</span><b>{plan.revenue.price_to_test}</b><p>{plan.revenue.model} {plan.revenue.why}</p></div>
          <h4 className="sub-head">What it costs to launch</h4>
          <ul className="cost-list">{plan.launch_costs.map((cost, i) => <li key={i}><span>{cost.item}</span><b>{cost.estimate}</b></li>)}</ul>
          <h4 className="sub-head">Finding the first 100 people</h4>
          <ul className="ticks big">{plan.first_100_users.map((item, i) => <li key={i}>{item}</li>)}</ul>
          <h4 className="sub-head">First 90 days</h4>
          <ol className="weeks">{plan.milestones.map((step, i) => <li key={i}><span>{step.when}</span><div><p>{step.goal}</p></div></li>)}</ol>
          <h4 className="sub-head">Risks, and what to do</h4>
          <ul className="risk-list">{plan.risks.map((risk, i) => <li key={i}><b>{risk.risk}</b><p>{risk.plan}</p></li>)}</ul>
          <p className="fine">Prices and costs are suggestions to test, not market data.</p>
        </> : <div className="plan-cta">
          <p>Who pays, what to charge, what it costs to launch, where to find your first 100 people, and the first 90 days.</p>
          <button type="button" className="btn-pill is-primary" disabled={planRun.state === 'loading'} onClick={planRun.start} data-testid="button-plan">
            <span>{planRun.state === 'loading' ? 'Writing your plan…' : 'Write the business plan'}</span>{planRun.state === 'loading' ? <i className="pulse-dot" /> : <Sparkles size={17} />}
          </button>
          {planRun.state === 'loading' && <small>About 20 to 40 seconds.</small>}
          {planRun.state === 'failed' && <p className="flow-error" role="alert">{planRun.error}</p>}
        </div>}
        <div className="verdict-actions">
          <button type="button" className="btn-pill" onClick={() => window.print()} data-testid="button-pdf"><span>Save as PDF</span><FileDown size={17} /></button>
          <small className="pdf-hint">Opens the print screen. Choose “Save as PDF”, or on iPhone, share and save to Files.</small>
        </div>
      </Panel>

      <Panel index={4} active={active === 4} title="Where it came from" source={null}>
        <p className="lede">What we read in {blueprint.upload.label}, and the pattern underneath that the app is built on.</p>
        <blockquote className="pull">{blueprint.read.meaning}</blockquote>
        <p className="origin-why">{blueprint.read.why_different}</p>
        <h4 className="sub-head">The details it calls back to</h4>
        <ul className="ticks big">{blueprint.read.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul>
        <h4 className="sub-head">Its DNA, strongest first</h4>
        <ol className="tricks">{blueprint.read.mechanics.map((mechanic, i) => <li key={i}><div>
          <b>{mechanic.name}</b>
          <p className="pattern-chain">{mechanic.chain.split(/\s*(?:→|->)\s*/).map((part, j, all) => <span key={j}><b>{part}</b>{j < all.length - 1 && <ArrowRight size={14} aria-hidden="true" />}</span>)}</p>
          <p>{mechanic.how_it_works} {mechanic.why_it_works}</p>
          <small>Needs: {mechanic.needs}</small>
        </div></li>)}</ol>
        {blueprint.read.unknowns.length > 0 && <dl className="stack-fields"><Field label="What it can’t tell"><ul className="ticks is-muted">{blueprint.read.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></Field></dl>}
        <div className="verdict-actions">
          <button type="button" className="btn-pill is-primary" onClick={onStartOver}><span>Make another one</span></button>
        </div>
      </Panel>
    </div>

    <div className="bp-nav">
      <button type="button" className="glass-round small" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous section"><ArrowLeft size={18} /></button>
      {active < CARDS.length - 1
        ? <button type="button" className="bp-next" onClick={() => go(active + 1)} aria-label="Next section"><span><small>Next</small>{CARDS[active + 1]}</span><ArrowRight size={18} /></button>
        : <span className="bp-end">End of blueprint</span>}
    </div>
  </section>;
}

/** The printed report (Save as PDF). Only shows when printing. */
function NewPrintReport({ blueprint, prompt }: { blueprint: NewBlueprint; prompt: string }) {
  const { audience, idea, competitors, kit, plan } = blueprint;
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return createPortal(<article className="print-report" aria-hidden="true">
    <section className="pr-cover">
      <p className="pr-kicker">App blueprint</p>
      <h1>{idea.name}</h1>
      <p className="pr-pitch">{idea.tagline}</p>
      <dl className="pr-meta">
        <div><dt>Inspired by</dt><dd>{blueprint.upload.label}</dd></div>
        <div><dt>For</dt><dd>{audience}</dd></div>
        <div><dt>Date</dt><dd>{date}</dd></div>
      </dl>
      <p className="pr-note">Facts marked “App Store” were fetched from Apple on this date. Everything else is the AI’s suggestion, not verified.</p>
    </section>
    <section className="pr-section">
      <h2><span>01</span>The idea</h2>
      <p className="pr-lead">{idea.what_it_is}</p>
      <h3>The pattern</h3><p>{idea.pattern}</p>
      <h3>The job</h3><p>{idea.job}</p>
      <h3>How it works</h3>
      <ol className="pr-steps">{idea.how_it_works.map((step, i) => <li key={i}>{step}</li>)}</ol>
      <h3>The killer feature</h3><p>{idea.killer_feature}</p>
      <h3>Callbacks</h3>
      <table className="pr-table"><tbody>{idea.callbacks.map((callback, i) => <tr key={i}><th>{callback.detail}</th><td>{callback.meaning}</td></tr>)}</tbody></table>
      <div className="pr-grid">
        <div><h3>What it’s not</h3><p>{idea.what_its_not}</p></div>
        <div><h3>Why people would use it</h3><p>{idea.why_use}</p></div>
        <div><h3>Biggest risk</h3><p>{idea.main_risk}</p></div>
        <div><h3>How it makes money</h3><p>{idea.monetization}</p></div>
      </div>
    </section>
    <section className="pr-section pr-break">
      <h2><span>02</span>Build it</h2>
      <div className="pr-build">
        {kit && <div className="pr-phone"><PhoneMockup name={idea.name} screen={kit.screen} layout={layoutFor(blueprint.templateId)} /></div>}
        <div>
          <h3>First version</h3>
          <ol className="pr-steps">{idea.mvp.map((item, i) => <li key={i}>{item}</li>)}</ol>
          {kit && <><h3>Four-week plan</h3>
            <table className="pr-table"><tbody>{kit.plan.map((step, i) => <tr key={i}><th>{step.when}</th><td>{step.goal}<small>Done when: {step.done_when}</small></td></tr>)}</tbody></table></>}
        </div>
      </div>
      <h3>Build prompt</h3>
      <pre className="pr-prompt">{prompt}</pre>
    </section>
    <section className="pr-section pr-break">
      <h2><span>03</span>Competitors <em>App Store</em></h2>
      {competitors.length
        ? <table className="pr-table pr-rivals"><thead><tr><th>App</th><th>Rating</th><th>Price</th></tr></thead><tbody>
            {competitors.map((comp) => <tr key={comp.app_id}><td><b>{comp.name}</b><small>{comp.overlap}</small></td><td>{comp.rating != null ? `${comp.rating.toFixed(1)} (${(comp.rating_count ?? 0).toLocaleString()})` : '—'}</td><td>{price(comp)}</td></tr>)}
          </tbody></table>
        : <p>Nothing came up for these searches.</p>}
    </section>
    {plan && <section className="pr-section pr-break">
      <h2><span>04</span>Business plan</h2>
      <p className="pr-lead">{plan.summary}</p>
      <div className="pr-grid">
        <div><h3>Customer</h3><p>{plan.customer}</p></div>
        <div><h3>Problem</h3><p>{plan.problem}</p></div>
        <div><h3>Solution</h3><p>{plan.solution}</p></div>
        <div><h3>Revenue</h3><p>{plan.revenue.model} Price to test: <b>{plan.revenue.price_to_test}</b>. {plan.revenue.why}</p></div>
      </div>
      <h3>Launch costs (estimates)</h3>
      <table className="pr-table"><tbody>{plan.launch_costs.map((cost, i) => <tr key={i}><th>{cost.item}</th><td>{cost.estimate}</td></tr>)}</tbody></table>
      <h3>First 100 users</h3>
      <ul className="pr-bullets">{plan.first_100_users.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <h3>First 90 days</h3>
      <table className="pr-table"><tbody>{plan.milestones.map((step, i) => <tr key={i}><th>{step.when}</th><td>{step.goal}</td></tr>)}</tbody></table>
    </section>}
  </article>, document.body);
}
