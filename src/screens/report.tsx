// The blueprint as a printed report. It's rendered outside the app and only
// shows when printing, so "Save as PDF" in the print dialog gives a clean document.
import { createPortal } from 'react-dom';
import { PhoneMockup } from '@/components/mockup';
import { price } from '@/components/bits';
import { buildPrompt } from '@/lib/build-prompt';
import type { Blueprint } from '../../server/lib/types.ts';

export function PrintReport({ blueprint }: { blueprint: Blueprint }) {
  const { app, audience, reviews, dissect, gaps, idea, competitors, kit, plan } = blueprint;
  const date = new Date(reviews.fetched_at || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const complaints = gaps.repeated_complaints.filter((complaint) => complaint.about === 'mechanic');
  return createPortal(<article className="print-report" aria-hidden="true">
    <section className="pr-cover">
      <p className="pr-kicker">Spinoff blueprint</p>
      <h1>{idea.name}</h1>
      <p className="pr-pitch">{idea.pitch}</p>
      <dl className="pr-meta">
        <div><dt>Built from</dt><dd>{app.name}</dd></div>
        <div><dt>For</dt><dd>{audience}</dd></div>
        <div><dt>Date</dt><dd>{date}</dd></div>
      </dl>
      <p className="pr-note">Facts marked “App Store” were fetched from Apple on this date. Everything else is the AI’s suggestion, not verified.</p>
    </section>

    <section className="pr-section">
      <h2><span>01</span>The idea</h2>
      <p className="pr-lead">{idea.who_its_for}</p>
      <h3>How it works</h3>
      <ol className="pr-steps">{idea.how_it_works.map((step, i) => <li key={i}>{step}</li>)}</ol>
      <div className="pr-grid">
        <div><h3>Borrowed from {app.name}</h3><p>{idea.borrowed_trick}</p></div>
        <div><h3>What’s different</h3><p>{idea.whats_different}</p></div>
        <div><h3>The complaint it fixes</h3><p>{idea.fixes_complaint}</p></div>
        <div><h3>Biggest risk</h3><p>{idea.main_risk}</p></div>
      </div>
    </section>

    <section className="pr-section pr-break">
      <h2><span>02</span>Build it</h2>
      <div className="pr-build">
        {kit && <div className="pr-phone"><PhoneMockup name={idea.name} screen={kit.screen} /></div>}
        <div>
          <h3>First version</h3>
          <ol className="pr-steps">{idea.mvp.map((item, i) => <li key={i}>{item}</li>)}</ol>
          {kit && <><h3>Four-week plan</h3>
            <table className="pr-table"><tbody>{kit.plan.map((step, i) => <tr key={i}><th>{step.when}</th><td>{step.goal}<small>Done when: {step.done_when}</small></td></tr>)}</tbody></table></>}
        </div>
      </div>
      <h3>Build prompt</h3>
      <pre className="pr-prompt">{buildPrompt(idea, kit)}</pre>
      <p className="pr-small">Paste it into Lovable, Bolt or Replit to build without code, or into Claude Code or Cursor to build with code you own.</p>
    </section>

    <section className="pr-section pr-break">
      <h2><span>03</span>Competitors <em>App Store</em></h2>
      <p className="pr-small">Searched the App Store for {idea.search_terms.map((term) => `“${term}”`).join(', ')}.</p>
      {competitors.length
        ? <table className="pr-table pr-rivals"><thead><tr><th>App</th><th>Rating</th><th>Price</th></tr></thead><tbody>
            {competitors.map((comp) => <tr key={comp.app_id}><td><b>{comp.name}</b><small>{comp.overlap}</small></td><td>{comp.rating != null ? `${comp.rating.toFixed(1)} (${(comp.rating_count ?? 0).toLocaleString()})` : '—'}</td><td>{price(comp)}</td></tr>)}
          </tbody></table>
        : <p>Nothing came up for these searches.</p>}
      <p className="pr-small">Prices are upfront prices. Apple doesn’t publish in-app or subscription prices.</p>
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
      <h3>Risks</h3>
      <table className="pr-table"><tbody>{plan.risks.map((risk, i) => <tr key={i}><th>{risk.risk}</th><td>{risk.plan}</td></tr>)}</tbody></table>
    </section>}

    <section className="pr-section pr-break">
      <h2><span>{plan ? '05' : '04'}</span>Where it came from</h2>
      <p className="pr-lead">{dissect.what_it_is} {dissect.why_it_works}</p>
      <h3>The tricks that make {app.name} work</h3>
      <table className="pr-table"><tbody>{dissect.tricks.map((trick, i) => <tr key={i}><th>{trick.name}</th><td>{trick.how_it_works}<small>Needs: {trick.needs}</small></td></tr>)}</tbody></table>
      <h3>What people complain about <em>From {reviews.low_star_count} App Store reviews</em></h3>
      {complaints.length
        ? <ul className="pr-quotes">{complaints.map((complaint) => <li key={complaint.theme}><b>{complaint.theme} <span>{complaint.evidence_count} reviews</span></b>{complaint.example && <q>{complaint.example}</q>}</li>)}</ul>
        : <p>No complaint about how the app works came up in more than one review.</p>}
    </section>
  </article>, document.body);
}
