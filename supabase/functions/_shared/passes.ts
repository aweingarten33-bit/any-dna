// The five passes. Prompts adapted from the workbench prompts:
//   rules for every pass  <- Prompt 1 (Research): evidence only, unknown is a valid answer
//   dissect               <- Prompts 1 + 2 (Research, Extract DNA): why it works, mechanics not features
//   mutate                <- Prompt 3 (Generate): real user, repeatable loop, buildable by one person
//   verdict               <- Prompt 4 (Filter): the blunt-stranger checks, run against fetched competitors
// Prompt 3's "never [source] for [X]" rule is left out on purpose: carrying a
// proven app to a new audience is what Spinoff does. A reskin is still rejected.
import { structuredCall } from './claude.ts';
import { dissectSchema, fitCheckSchema, gapsModelSchema, ideaSchema, verdictModelSchema } from './schemas.ts';
import type { AppListing, Competitor, CompetitorListing, Dissect, FitCheck, Gaps, Idea, Review, Verdict } from './types.ts';

const RULES = `You are one step in Spinoff, a tool that takes an app that already works and adapts it for a new audience.

Rules:
- Use only the data supplied in this message. Never invent facts, apps, prices, URLs, numbers or market claims.
- Separate what the data shows from your reading of why. A feature existing does not mean it caused success.
- Unknown is a correct answer. When the data doesn't show something, say "unknown" instead of guessing.
- Plain English. Short sentences. No jargon, no hype.
- Never use the word "niche".`;

function listingBlock(app: AppListing) {
  return JSON.stringify({
    name: app.name, developer: app.developer, category: app.category, genres: app.genres,
    upfront_price: app.formatted_price || 'unknown', rating: app.rating, rating_count: app.rating_count,
    description: app.description,
  }, null, 2);
}

function reviewLines(reviews: Review[], limit: number, withIds: boolean) {
  return reviews.slice(0, limit).map((review, index) => {
    const text = `${review.title ? `${review.title}. ` : ''}${review.body}`.replace(/\s+/g, ' ').slice(0, 600);
    return withIds ? `[r${index + 1}] (${review.rating}★) ${text}` : `- (${review.rating}★) ${text}`;
  }).join('\n');
}

// ---- dissect -------------------------------------------------------------

export function runDissect(app: AppListing, reviews: Review[]): Promise<Dissect> {
  return structuredCall({
    schema: dissectSchema,
    effort: 'medium',
    system: `${RULES}

Your job: understand why this app works, not what it is. Isolate the mechanics with the topic stripped away.

Depth matters. Bad: "tap to book", "personalization", "great UX", or any feature every competitor has.
Good examples of the depth wanted:
- HotelTonight is not "tap to book". Inventory expires at a deadline, so its value drops to zero and incentives change as time runs out.
- GasBuddy: a constantly changing local condition becomes useful because the crowd keeps it updated.

Fields:
- core_loop: the specific actions a user repeats, and what happens because of them.
- frequency_required: how often a user must come back for the loop to work (daily, weekly, per event...).
- reward_type: what the user gets each time through the loop.
- retention_lever: what brings them back.
- monetization_trigger: the moment and reason a user pays, or how money is made if users don't pay.
- network_effect: whether and how it gets better as more people use it. "None" is a valid answer.
- dependencies: conditions the app needs to function (supply, trust, timing, data, partners, a behavior people already have).
- why_it_works: the structural reason this version works, in two or three sentences.
- unknowns: what this data can't tell you.

The listing description is the developer's own marketing; treat its claims as claims. The 1 to 3 star reviews show where the mechanics strain.`,
    user: `App Store listing:\n${listingBlock(app)}\n\nRecent 1 to 3 star reviews (${reviews.length} total, up to 120 shown):\n${reviewLines(reviews, 120, false) || '(none fetched)'}`,
  });
}

// ---- gaps ----------------------------------------------------------------

export async function runGaps(app: AppListing, reviews: Review[]): Promise<Gaps> {
  if (!reviews.length) return { repeated_complaints: [] };
  const shown = reviews.slice(0, 250);
  const result = await structuredCall({
    schema: gapsModelSchema,
    effort: 'low',
    system: `${RULES}

Your job: find the complaints that repeat across these 1 to 3 star reviews of ${app.name}.
- Group reviews by the underlying problem, not by wording. Up to 8 themes.
- For each theme list the IDs (like "r12") of every review that makes that complaint. Only cite reviews that actually make it.
- about: "mechanic" if the complaint is about how the app works (pricing model, ads, reliability, onboarding, notifications, matching...), which would follow the mechanic to any audience. "subject" if it's about the app's own topic or content and wouldn't carry over.
- Skip one-off complaints. A theme needs at least two reviews.`,
    user: `Reviews:\n${reviewLines(shown, 250, true)}`,
  });
  const byId = new Map(shown.map((review, index) => [`r${index + 1}`, review]));
  const complaints = result.themes.map((theme) => {
    const cited = [...new Set(theme.review_ids.map((id) => id.trim().toLowerCase()))].map((id) => byId.get(id)).filter((review): review is Review => !!review);
    const example = cited.slice().sort((a, b) => b.body.length - a.body.length)[0];
    return {
      theme: theme.theme,
      evidence_count: cited.length,
      example: example ? `${example.title ? `${example.title}. ` : ''}${example.body}`.replace(/\s+/g, ' ').slice(0, 320) : '',
      about: theme.about,
    };
  }).filter((complaint) => complaint.evidence_count >= 2);
  complaints.sort((a, b) => b.evidence_count - a.evidence_count);
  return { repeated_complaints: complaints.slice(0, 8) };
}

// ---- fit_check -----------------------------------------------------------

export async function runFitCheck(app: AppListing, dissect: Dissect, audience: string): Promise<FitCheck> {
  const result = await structuredCall({
    schema: fitCheckSchema,
    effort: 'medium',
    system: `${RULES}

Your job: test whether each mechanic of ${app.name} can work for a new audience: ${audience}.

Judge each component by one question: does this audience already have the behavior it needs, at the frequency it needs?
- survives: they already do this, often enough. Keep it as is.
- adapts: the behavior exists but in a different form or rhythm. Say what changes.
- breaks: they don't do this. Example: a daily streak breaks for people selling a car, because nobody sells a car daily.

One row each for core_loop, frequency_required, reward_type, retention_lever, monetization_trigger and network_effect, then one row per dependency. Use those plain names as "component".
- audience_behavior: what this audience actually does today that is relevant, concretely.
- reason: one or two sentences.
- replacement: for "adapts", the adapted version. For "breaks", a replacement built on a behavior this audience does have. For "survives", an empty string.

This is your judgment, not fetched data, so don't present it as fact or cite numbers.`,
    user: `Audience: ${audience}\n\nMechanics of ${app.name} (category: ${app.category}):\n${JSON.stringify(dissect, null, 2)}`,
  });
  return { components: result.components.slice(0, 14).map((row) => ({ ...row, replacement: row.status === 'survives' ? '' : row.replacement })) };
}

// ---- mutate --------------------------------------------------------------

export async function runMutate(app: AppListing, dissect: Dissect, fit: FitCheck, gaps: Gaps, audience: string): Promise<Idea> {
  const carryable = gaps.repeated_complaints.filter((complaint) => complaint.about === 'mechanic');
  const idea = await structuredCall({
    schema: ideaSchema,
    effort: 'high',
    system: `${RULES}

Your job: build one new app for ${audience} from the proven mechanics of ${app.name}.
- Keep every component that survived. Use the adapted version of every component that adapts. Replace every component that broke with its replacement.
- Make it different using the incumbent's repeated complaints listed below: design the new app so that complaint can't happen. Only use complaints about how the app works; they are the ones that would follow the mechanic. If none are listed, say there's no review evidence to differentiate on.

The idea must have:
- A real person in this audience with a real, recurring problem.
- What the user does inside the app, and what the app does in response.
- A repeatable core loop that fits how often this audience actually acts.
- A first version one person could build.
- Consumer-first: one person can adopt it without an employer, admin or procurement.
- A normal person would understand it in five seconds and want to show it to someone.

Reject before answering: a generic AI assistant, chatbot, dashboard, habit tracker, CRM or checklist; anything vague that can't be described as a specific app; and a reskin. If the only thing that changed from ${app.name} is the topic, you haven't finished: what broke must change how the product works.

Fields:
- name: a short product name.
- pitch: one sentence, under 20 words.
- core_loop: how the loop works for this audience.
- what_broke_and_replaced: what didn't survive and what took its place.
- first_session_flow: 3 to 6 steps, what a new user does in their first session.
- differentiator_from_gaps: the complaint it designs out (name the theme and its review count) and how.
- search_terms: 3 or 4 short phrases someone in this audience would type into the App Store to find an app that does this job. Not the product name.`,
    user: `Audience: ${audience}\n\nSource app: ${app.name} (${app.category})\n\nMechanics:\n${JSON.stringify(dissect, null, 2)}\n\nFit check for ${audience}:\n${JSON.stringify(fit.components, null, 2)}\n\nRepeated complaints about how ${app.name} works (counted from fetched reviews):\n${carryable.length ? carryable.map((complaint) => `- ${complaint.theme} (${complaint.evidence_count} reviews)`).join('\n') : '(none found)'}`,
  });
  return {
    ...idea,
    first_session_flow: idea.first_session_flow.slice(0, 6),
    search_terms: idea.search_terms.map((term) => term.trim()).filter(Boolean).slice(0, 4),
  };
}

// ---- verdict -------------------------------------------------------------

export async function runVerdict(idea: Idea, audience: string, searched: CompetitorListing[]): Promise<Verdict> {
  const listed = searched.map((app) => ({
    app_id: app.app_id, name: app.name, developer: app.developer, category: app.category,
    upfront_price: app.formatted_price || 'unknown', rating: app.rating, rating_count: app.rating_count, found_by_searching: app.matched_term,
  }));
  const result = await structuredCall({
    schema: verdictModelSchema,
    effort: 'high',
    system: `${RULES}

You are a blunt stranger seeing this pitch for the first time. You know nothing about the app it came from.
Below the pitch is every app the App Store returned when we searched for this idea. That list is your only evidence about competitors.

Decide:
1. understandable: after one read, do you know what it is and who it's for?
2. desirability: 0 to 10. If you were in this audience, would you actually use it or pay for it?
3. mechanic_load_bearing: does the core loop do real work? If you removed it and the product worked the same way, it's decoration: false.
4. already_exists: does an app on the list already do this job for these same people?
5. gimmick: is there an invented restriction, random theme or rule with no obvious benefit to the user?

go only if understandable, desirability 7 or more, mechanic load-bearing, not already existing, and no gimmick. Otherwise no_go.

Fields:
- competitors: up to 5 apps from the list that overlap the idea, by app_id, most overlapping first. overlap: one sentence on what they share and what differs. Never name an app that isn't on the list. An empty list is a valid answer.
- mvp: at most 5 features, the smallest version that tests the core loop.
- monetization: how it would make money. If you mention a price, it must be a listed app's upfront price from the list, named. Note that the App Store doesn't publish in-app purchase prices, so subscription prices are unknown.
- main_risk: the single most likely reason this fails.
- reason: two or three sentences explaining the call.`,
    user: `Audience: ${audience}\n\nPitch:\n${JSON.stringify({ name: idea.name, pitch: idea.pitch, core_loop: idea.core_loop, first_session_flow: idea.first_session_flow, differentiator: idea.differentiator_from_gaps }, null, 2)}\n\nApp Store search results (${listed.length}):\n${JSON.stringify(listed, null, 2)}`,
  });

  // Names and prices come from the fetched listing, never from the model.
  const byId = new Map(searched.map((app) => [app.app_id, app]));
  const seen = new Set<string>();
  const competitors: Competitor[] = result.competitors.flatMap((pick) => {
    const app = byId.get(pick.app_id.trim());
    if (!app || seen.has(app.app_id)) return [];
    seen.add(app.app_id);
    return [{ ...app, overlap: pick.overlap }];
  }).slice(0, 5);

  const checks = { ...result.checks, desirability: Math.max(0, Math.min(10, Math.round(result.checks.desirability))) };
  const passes = checks.understandable && checks.desirability >= 7 && checks.mechanic_load_bearing && !checks.already_exists && !checks.gimmick;
  const overridden = result.go_no_go === 'go' && !passes;
  return {
    competitors,
    mvp: result.mvp.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    monetization: result.monetization,
    main_risk: result.main_risk,
    go_no_go: passes ? result.go_no_go : 'no_go',
    reason: overridden ? `Marked no-go because it failed at least one check. ${result.reason}` : result.reason,
    checks,
  };
}
