// The blueprint: one swipeable panel per section.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { AppIcon, Rating, Source, price } from '@/components/bits';
import type { Blueprint, FitComponent } from '../../server/lib/types.ts';

const CARDS = ['DNA', 'What survives and what breaks', 'The idea', 'Competitors', 'MVP'] as const;
const SHORT = ['DNA', 'Fit', 'Idea', 'Rivals', 'MVP'];
const NEXT = ['DNA', 'What survives', 'The idea', 'Competitors', 'MVP'];

const LABELS: Record<string, string> = {
  core_loop: 'Core loop', frequency_required: 'Frequency', reward_type: 'Reward', retention_lever: 'Brings people back',
  monetization_trigger: 'When people pay', network_effect: 'Network effect',
};

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

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={`field${wide ? ' is-wide' : ''}`}><dt>{label}</dt><dd>{children}</dd></div>;
}

const STATUS: Record<FitComponent['status'], string> = { survives: 'Survives', adapts: 'Adapts', breaks: 'Breaks' };

export function Result({ blueprint, onDifferentAudience, onStartOver }: { blueprint: Blueprint; onDifferentAudience: () => void; onStartOver: () => void }) {
  const { app, audience, reviews, dissect, gaps, fit_check, idea, searched, verdict } = blueprint;
  // Ideas saved before the competitor check moved to plain code keep these on the old verdict.
  const competitors = blueprint.competitors ?? verdict?.competitors ?? [];
  const mvp = idea.mvp ?? verdict?.mvp ?? [];
  const monetization = idea.monetization ?? verdict?.monetization ?? '';
  const mainRisk = idea.main_risk ?? verdict?.main_risk ?? '';
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

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

  const counts = { survives: 0, adapts: 0, breaks: 0 };
  fit_check.components.forEach((row) => { counts[row.status] += 1; });
  const carryover = gaps.repeated_complaints.filter((complaint) => complaint.about === 'mechanic');

  return <section className="blueprint">
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
      <Panel index={0} active={active === 0} title="DNA" source={<Source />}>
        <p className="lede">Why {app.name} works, with its topic stripped away. Read from the App Store listing and {reviews.low_star_count} recent 1 to 3 star reviews.</p>
        <blockquote className="pull">{dissect.why_it_works}</blockquote>
        <dl className="bento-fields">
          {Object.entries(LABELS).map(([key, label]) => <Field key={key} label={label} wide={key === 'core_loop'}>{dissect[key as keyof typeof LABELS & keyof typeof dissect] as string}</Field>)}
          {dissect.dependencies.length > 0 && <Field label="Needs" wide><ul className="ticks">{dissect.dependencies.map((item) => <li key={item}>{item}</li>)}</ul></Field>}
          {dissect.unknowns.length > 0 && <Field label="Unknown from this data" wide><ul className="ticks is-muted">{dissect.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></Field>}
        </dl>
      </Panel>

      <Panel index={1} active={active === 1} title="What survives and what breaks" source={<Source />}>
        <p className="lede">For {audience.toLowerCase()}: does this audience already have the behavior each piece needs?</p>
        <div className="tally">
          {(['survives', 'adapts', 'breaks'] as const).map((status) => <div key={status} className={`tally-cell is-${status}`}><b>{counts[status]}</b><span>{STATUS[status]}</span></div>)}
        </div>
        <ul className="fit-list">
          {fit_check.components.map((row) => <li key={row.component} className={`is-${row.status}`}>
            <div className="fit-top"><b>{LABELS[row.component] ?? row.component}</b><span className="fit-badge">{STATUS[row.status]}</span></div>
            <p className="fit-behavior">{row.audience_behavior}</p>
            <p>{row.reason}</p>
            {row.replacement && <p className="fit-replacement"><ArrowRight size={14} aria-hidden="true" /><span>{row.replacement}</span></p>}
          </li>)}
        </ul>
      </Panel>

      <Panel index={2} active={active === 2} title="The idea" source={<Source />}>
        <h3 className="idea-name">{idea.name}</h3>
        <p className="idea-pitch">{idea.pitch}</p>
        <dl className="stack-fields">
          <Field label="Core loop">{idea.core_loop}</Field>
          <Field label="What broke, and what replaced it">{idea.what_broke_and_replaced}</Field>
          <Field label="What makes it different">{idea.differentiator_from_gaps}</Field>
          <Field label="First session"><ol className="timeline">{idea.first_session_flow.map((step, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span>{step}</li>)}</ol></Field>
        </dl>
        <section className="evidence">
          <div className="evidence-head"><h4>Complaints about {app.name}</h4><Source fetched>From {reviews.low_star_count} reviews</Source></div>
          {gaps.repeated_complaints.length === 0
            ? <p className="muted">{reviews.low_star_count ? 'No complaint came up in more than one review.' : 'No 1 to 3 star reviews were available to read.'}</p>
            : <ul>{gaps.repeated_complaints.map((complaint) => <li key={complaint.theme}>
                <div className="evidence-theme"><span>{complaint.theme}</span><b>{complaint.evidence_count}</b></div>
                {complaint.example && <blockquote>“{complaint.example}”</blockquote>}
                {complaint.about === 'subject' && <small>About {app.name}’s own topic, so it doesn’t carry over.</small>}
              </li>)}</ul>}
          {gaps.repeated_complaints.length > 0 && carryover.length === 0 && <p className="muted">None of these are about how the app works, so none carry over.</p>}
        </section>
      </Panel>

      <Panel index={3} active={active === 3} title="Competitors" source={<Source fetched />}>
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

      <Panel index={4} active={active === 4} title="MVP" source={<Source />}>
        <p className="lede">The smallest version that tests the core loop.</p>
        <ol className="mvp">{mvp.map((item, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>
        <dl className="stack-fields">
          <Field label="How it makes money">{monetization}</Field>
          {mainRisk && <Field label="Main risk">{mainRisk}</Field>}
        </dl>
        <div className="verdict-actions">
          <button type="button" className="btn-pill is-primary" onClick={onDifferentAudience} data-testid="button-different-audience"><span>Try a different audience</span><ArrowRight size={18} /></button>
          <button type="button" className="btn-pill" onClick={onStartOver}><span>Start with another app</span></button>
        </div>
      </Panel>

    </div>

    <div className="bp-nav">
      <button type="button" className="glass-round small" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous section"><ArrowLeft size={18} /></button>
      {active < CARDS.length - 1
        ? <button type="button" className="bp-next" onClick={() => go(active + 1)} aria-label="Next section"><span><small>Next</small>{NEXT[active + 1]}</span><ArrowRight size={18} /></button>
        : <span className="bp-end">End of blueprint</span>}
    </div>
  </section>;
}
