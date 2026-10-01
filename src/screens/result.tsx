// The blueprint: one swipeable panel per section, starting with the idea.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, FileDown, RefreshCw, Sparkles } from 'lucide-react';
import { AppIcon, Rating, Source, price } from '@/components/bits';
import { PhoneMockup, PhoneSkeleton } from '@/components/mockup';
import { api } from '@/lib/api';
import { BUILDERS, CODE_TOOLS, buildPrompt } from '@/lib/build-prompt';
import { PrintReport } from '@/screens/report';
import type { Blueprint } from '../../server/lib/types.ts';

const CARDS = ['The idea', 'Build it', 'Competitors', 'Business plan', 'Where it came from'] as const;
const SHORT = ['Idea', 'Build', 'Rivals', 'Plan', 'Origin'];

function Panel({ index, active, title, source, children }: { index: number; active: boolean; title: string; source: ReactNode; children: ReactNode }) {
  return <article className={`bp-panel${active ? ' is-active' : ''}`} aria-roledescription="card" aria-label={`${index + 1} of ${CARDS.length}: ${title}`} aria-hidden={!active}>
    <div className="bp-panel-inner">
      <header className="bp-panel-head">
        <span className="bp-panel-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
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

/** Runs an AI extra (the kit or the plan) and reports its state. */
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

export function Result({ blueprint, onUpdate, onDifferentAudience, onStartOver }: {
  blueprint: Blueprint;
  onUpdate: (next: Blueprint) => void;
  onDifferentAudience: () => void;
  onStartOver: () => void;
}) {
  const { app, audience, reviews, dissect, gaps, idea, searched, competitors, kit, plan } = blueprint;
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const latest = useRef(blueprint);
  latest.current = blueprint;

  // The mockup and build plan are written in the background as soon as the blueprint opens.
  const kitRun = useExtra(kit, (signal) => api.kit(app, audience, idea, signal).then((r) => r.output), (value) => onUpdate({ ...latest.current, kit: value }), true);
  const planRun = useExtra(plan, (signal) => api.plan(app, audience, idea, signal).then((r) => r.output), (value) => onUpdate({ ...latest.current, plan: value }), false);

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

  const prompt = buildPrompt(idea, kit);
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); } catch { /* clipboard blocked: the prompt is still on screen to select */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  const topComplaint = gaps.repeated_complaints.find((complaint) => complaint.about === 'mechanic');

  return <section className="blueprint">
    <PrintReport blueprint={blueprint} />
    <div className="bp-top">
      <div className="bp-route"><AppIcon app={app} size={22} /><span>{app.name}</span><ArrowRight size={13} /><span>{audience}</span></div>
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
      <Panel index={0} active={active === 0} title="The idea" source={<Source />}>
        <h3 className="idea-name">{idea.name}</h3>
        <p className="idea-pitch">{idea.pitch}</p>
        <p className="idea-who">{idea.who_its_for}</p>
        <h4 className="sub-head">How it works</h4>
        <ol className="steps">{idea.how_it_works.map((step, i) => <li key={i}><span>{i + 1}</span><p>{step}</p></li>)}</ol>
        <dl className="stack-fields">
          <Field label={`Borrowed from ${app.name}`}>{idea.borrowed_trick}</Field>
          <Field label="What’s different">{idea.whats_different}</Field>
          <Field label="The complaint it fixes">
            {idea.fixes_complaint}
            {topComplaint?.example && <blockquote className="quote">“{topComplaint.example}”<cite>A real {app.name} review</cite></blockquote>}
          </Field>
          <Field label="Biggest risk">{idea.main_risk}</Field>
        </dl>
      </Panel>

      <Panel index={1} active={active === 1} title="Build it" source={<Source />}>
        <p className="lede">What the first screen could look like, and how to build it this week.</p>
        <div className="phone-stage">
          {kit ? <PhoneMockup name={idea.name} screen={kit.screen} /> : kitRun.state === 'failed'
            ? <div className="extra-failed"><p>{kitRun.error}</p><button type="button" className="btn-pill" onClick={kitRun.start}><span>Try again</span><RefreshCw size={16} /></button></div>
            : <PhoneSkeleton />}
        </div>

        <h4 className="sub-head">First version</h4>
        <ol className="mvp">{idea.mvp.map((item, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>

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

      <Panel index={2} active={active === 2} title="Competitors" source={<Source fetched />}>
        <p className="lede">Searched the App Store for {idea.search_terms.map((term, i) => <span key={term}>{i > 0 && ', '}<q>{term}</q></span>)}. Found {searched.length} apps. {competitors.length ? `These ${competitors.length} came up the most.` : 'Nothing came up.'}</p>
        <ul className="rivals">
          {competitors.map((comp, i) => <li key={comp.app_id}>
            <span className="rival-n">{String(i + 1).padStart(2, '0')}</span>
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

      <Panel index={3} active={active === 3} title="Business plan" source={<Source />}>
        <dl className="stack-fields is-first"><Field label="How it makes money">{idea.monetization}</Field></dl>
        {plan ? <>
          <p className="plan-summary">{plan.summary}</p>
          <dl className="stack-fields">
            <Field label="Who pays">{plan.customer}</Field>
            <Field label="The problem">{plan.problem}</Field>
            <Field label="What the app does">{plan.solution}</Field>
          </dl>
          <div className="price-card">
            <span>Price to test</span>
            <b>{plan.revenue.price_to_test}</b>
            <p>{plan.revenue.model} {plan.revenue.why}</p>
          </div>
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

      <Panel index={4} active={active === 4} title="Where it came from" source={<Source />}>
        <p className="lede">Read from {app.name}’s App Store listing and {reviews.low_star_count} recent 1 to 3 star reviews.</p>
        <blockquote className="pull">{dissect.what_it_is}</blockquote>
        <p className="origin-why">{dissect.why_it_works}</p>
        <h4 className="sub-head">The tricks that make it work</h4>
        <ol className="tricks">{dissect.tricks.map((trick, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span><div><b>{trick.name}</b><p>{trick.how_it_works}</p><small>Needs: {trick.needs}</small></div></li>)}</ol>
        <dl className="stack-fields">
          <Field label="How it makes money">{dissect.how_it_makes_money}</Field>
          {dissect.unknowns.length > 0 && <Field label="What this data can’t tell us"><ul className="ticks is-muted">{dissect.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></Field>}
        </dl>
        <section className="evidence">
          <div className="evidence-head"><h4>What people complain about</h4><Source fetched>From {reviews.low_star_count} reviews</Source></div>
          {gaps.repeated_complaints.length === 0
            ? <p className="muted">{reviews.low_star_count ? 'No complaint came up in more than one review.' : 'No 1 to 3 star reviews were available to read.'}</p>
            : <ul>{gaps.repeated_complaints.map((complaint) => <li key={complaint.theme}>
                <div className="evidence-theme"><span>{complaint.theme}</span><b>{complaint.evidence_count}</b></div>
                {complaint.example && <blockquote>“{complaint.example}”</blockquote>}
                {complaint.about === 'subject' && <small>About {app.name}’s own topic, so it wouldn’t follow to a new app.</small>}
              </li>)}</ul>}
        </section>
        <div className="verdict-actions">
          <button type="button" className="btn-pill is-primary" onClick={onDifferentAudience} data-testid="button-different-audience"><span>Try a different audience</span><ArrowRight size={18} /></button>
          <button type="button" className="btn-pill" onClick={onStartOver}><span>Start with another app</span></button>
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
