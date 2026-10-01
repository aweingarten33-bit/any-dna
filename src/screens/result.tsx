// The blueprint: one swipeable card per section.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Users } from 'lucide-react';
import { AppIcon, Rating, Source, price } from '@/components/bits';
import type { Blueprint, FitComponent } from '../../supabase/functions/_shared/types.ts';

const CARDS = ['DNA', 'What survives and what breaks', 'The idea', 'Competitors', 'MVP', 'Verdict'] as const;

const LABELS: Record<string, string> = {
  core_loop: 'Core loop', frequency_required: 'Frequency needed', reward_type: 'Reward', retention_lever: 'What brings people back',
  monetization_trigger: 'When people pay', network_effect: 'Network effect',
};

function Card({ index, title, source, children }: { index: number; title: string; source: ReactNode; children: ReactNode }) {
  return <article className="bp-card" aria-roledescription="card" aria-label={`${index + 1} of ${CARDS.length}: ${title}`}>
    <header className="bp-card-head">
      <span className="bp-card-n">{index + 1} / {CARDS.length}</span>
      <h2>{title}</h2>
      <div className="bp-sources">{source}</div>
    </header>
    <div className="bp-card-body">{children}</div>
  </article>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="bp-field"><dt>{label}</dt><dd>{children}</dd></div>;
}

const STATUS: Record<FitComponent['status'], string> = { survives: 'Survives', adapts: 'Adapts', breaks: 'Breaks' };

export function Result({ blueprint, onDifferentAudience, onStartOver }: { blueprint: Blueprint; onDifferentAudience: () => void; onStartOver: () => void }) {
  const { app, audience, reviews, dissect, gaps, fit_check, idea, searched, verdict } = blueprint;
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

  const carryover = gaps.repeated_complaints.filter((complaint) => complaint.about === 'mechanic');
  const terms = idea.search_terms.map((term) => `“${term}”`).join(', ');

  return <section className="blueprint">
    <div className="bp-meta"><AppIcon app={app} size={28} /><span>{app.name}</span><ArrowRight size={14} /><span>{audience}</span></div>
    <div className="bp-track" ref={track} tabIndex={0} onKeyDown={(event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); }
    }}>
      <Card index={0} title="DNA" source={<Source />}>
        <p className="bp-lede">Why {app.name} works, with its topic stripped away. Read from its App Store listing and {reviews.low_star_count} recent 1 to 3 star reviews.</p>
        <dl className="bp-fields">
          {Object.entries(LABELS).map(([key, label]) => <Field key={key} label={label}>{dissect[key as keyof typeof LABELS & keyof typeof dissect] as string}</Field>)}
          {dissect.dependencies.length > 0 && <Field label="Needs"><ul>{dissect.dependencies.map((item) => <li key={item}>{item}</li>)}</ul></Field>}
          <Field label="Why it works">{dissect.why_it_works}</Field>
          {dissect.unknowns.length > 0 && <Field label="Unknown from this data"><ul>{dissect.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></Field>}
        </dl>
      </Card>

      <Card index={1} title="What survives and what breaks" source={<Source />}>
        <p className="bp-lede">Does the audience already have the behavior each piece needs?</p>
        <ul className="fit-list">
          {fit_check.components.map((row) => <li key={row.component} className={`fit-${row.status}`}>
            <div className="fit-top"><b>{LABELS[row.component] ?? row.component}</b><span className={`fit-badge is-${row.status}`}>{STATUS[row.status]}</span></div>
            <p className="fit-behavior"><Users size={14} aria-hidden="true" /> {row.audience_behavior}</p>
            <p>{row.reason}</p>
            {row.replacement && <p className="fit-replacement"><ArrowRight size={14} aria-hidden="true" /> {row.replacement}</p>}
          </li>)}
        </ul>
      </Card>

      <Card index={2} title="The idea" source={<Source />}>
        <h3 className="idea-name">{idea.name}</h3>
        <p className="idea-pitch">{idea.pitch}</p>
        <dl className="bp-fields">
          <Field label="Core loop">{idea.core_loop}</Field>
          <Field label="What broke and what replaced it">{idea.what_broke_and_replaced}</Field>
          <Field label="First session"><ol className="steps">{idea.first_session_flow.map((step, i) => <li key={i}>{step}</li>)}</ol></Field>
          <Field label="What makes it different">{idea.differentiator_from_gaps}</Field>
        </dl>
        <div className="evidence">
          <div className="evidence-head"><b>Complaints about {app.name}</b><Source fetched>From {reviews.low_star_count} reviews</Source></div>
          {gaps.repeated_complaints.length === 0
            ? <p className="muted">{reviews.low_star_count ? 'No complaint came up in more than one review.' : 'No 1 to 3 star reviews were available to read.'}</p>
            : <ul>{gaps.repeated_complaints.map((complaint) => <li key={complaint.theme}>
                <div className="evidence-theme"><span>{complaint.theme}</span><b>{complaint.evidence_count} reviews</b></div>
                {complaint.example && <blockquote>“{complaint.example}”</blockquote>}
                {complaint.about === 'subject' && <small>About {app.name}’s own topic, so it doesn’t carry over.</small>}
              </li>)}</ul>}
          {gaps.repeated_complaints.length > 0 && carryover.length === 0 && <p className="muted">None of these are about how the app works, so none carry over to the new idea.</p>}
        </div>
      </Card>

      <Card index={3} title="Competitors" source={<><Source fetched /><Source /></>}>
        <p className="bp-lede">We searched the App Store for {terms} and checked {searched.length} apps.{' '}
          {verdict.competitors.length ? 'These overlap the idea.' : 'None of them do the same job for this audience.'}</p>
        <ul className="comp-list">
          {verdict.competitors.map((comp) => <li key={comp.app_id}>
            <div className="comp-top">
              <AppIcon app={comp} size={44} />
              <div className="comp-name"><b>{comp.name}</b><small>{comp.developer}</small></div>
              <a href={comp.url} target="_blank" rel="noreferrer" aria-label={`Open ${comp.name} on the App Store`}><ExternalLink size={16} /></a>
            </div>
            <div className="comp-facts"><span>{price(comp)}</span><Rating app={comp} /><span>{comp.category}</span></div>
            <p>{comp.overlap}</p>
          </li>)}
        </ul>
        <p className="muted small">Names, prices and ratings come from the App Store. Prices are upfront prices; Apple doesn’t publish in-app or subscription prices. The overlap notes are unverified.</p>
      </Card>

      <Card index={4} title="MVP" source={<Source />}>
        <p className="bp-lede">The smallest version that tests the core loop.</p>
        <ol className="mvp-list">{verdict.mvp.map((item, i) => <li key={i}>{item}</li>)}</ol>
        <dl className="bp-fields"><Field label="How it makes money">{verdict.monetization}</Field></dl>
      </Card>

      <Card index={5} title="Verdict" source={<Source />}>
        <div className={`verdict-call is-${verdict.go_no_go}`}>{verdict.go_no_go === 'go' ? 'Go' : 'No-go'}</div>
        <p className="verdict-reason">{verdict.reason}</p>
        <dl className="bp-fields"><Field label="Main risk">{verdict.main_risk}</Field></dl>
        <ul className="checks">
          <li className={verdict.checks.understandable ? 'is-pass' : 'is-fail'}>Clear after one read</li>
          <li className={verdict.checks.desirability >= 7 ? 'is-pass' : 'is-fail'}>Would people want it: {verdict.checks.desirability}/10</li>
          <li className={verdict.checks.mechanic_load_bearing ? 'is-pass' : 'is-fail'}>The core loop does real work</li>
          <li className={!verdict.checks.already_exists ? 'is-pass' : 'is-fail'}>{verdict.checks.already_exists ? 'Already exists on the App Store' : 'Not already on the App Store'}</li>
          <li className={!verdict.checks.gimmick ? 'is-pass' : 'is-fail'}>{verdict.checks.gimmick ? 'Has a gimmick' : 'No gimmicks'}</li>
        </ul>
        <div className="verdict-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={onDifferentAudience} data-testid="button-different-audience">Try a different audience</button>
          <button type="button" className="btn btn-quiet btn-block" onClick={onStartOver}>Start with another app</button>
        </div>
      </Card>
    </div>

    <nav className="bp-nav" aria-label="Blueprint sections">
      <button type="button" className="glass-round small" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous section"><ArrowLeft size={18} /></button>
      <div className="bp-dots">{CARDS.map((title, i) => <button key={title} type="button" className={i === active ? 'is-on' : ''} onClick={() => go(i)} aria-label={title} aria-current={i === active} />)}</div>
      <button type="button" className="glass-round small" onClick={() => go(active + 1)} disabled={active === CARDS.length - 1} aria-label="Next section"><ArrowRight size={18} /></button>
    </nav>
  </section>;
}
