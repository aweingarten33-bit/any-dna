// The three AI passes. Prompts adapted from the workbench prompts:
//   rules for every pass  <- Prompt 1 (Research): evidence only, unknown is a valid answer
//   dissect               <- Prompts 1 + 2 (Research, Extract DNA): why it works, mechanics not features
//   build (fit + idea)    <- Prompt 3 (Generate): real user, repeatable loop, buildable by one person
// Competitors are found in plain code (itunes.ts), not by the AI.
// Speed: Muse's time tracks how much it writes (about 125 tokens a second), so
// every field asks for few words.
// Prompt 3's "never [source] for [X]" rule is left out on purpose: carrying a
// proven app to a new audience is what Spinoff does. A reskin is still rejected.
import { structuredCall } from './ai.ts';
import { buildSchema, dissectSchema, gapsModelSchema } from './schemas.ts';
import type { AppListing, Dissect, FitCheck, Gaps, Idea, Review } from './types.ts';

const RULES = `You are one step in Spinoff, a tool that takes an app that already works and adapts it for a new audience.

Rules:
- Use only the data supplied in this message. Never invent facts, apps, prices, URLs, numbers or market claims.
- Separate what the data shows from your reading of why. A feature existing does not mean it caused success.
- Unknown is a correct answer. When the data doesn't show something, say "unknown" instead of guessing.
- Plain English. Short sentences. No jargon, no hype. Every field as short as it can be while staying specific.
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

// Fewer reviews in means less to read; these are enough to see the pattern.
const DISSECT_REVIEWS = 60;
const GAPS_REVIEWS = 120;

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
    user: `App Store listing:\n${listingBlock(app)}\n\nRecent 1 to 3 star reviews (${reviews.length} total, up to ${DISSECT_REVIEWS} shown):\n${reviewLines(reviews, DISSECT_REVIEWS, false) || '(none fetched)'}`,
  });
}

// ---- gaps ----------------------------------------------------------------

export async function runGaps(app: AppListing, reviews: Review[]): Promise<Gaps> {
  if (!reviews.length) return { repeated_complaints: [] };
  const shown = reviews.slice(0, GAPS_REVIEWS);
  const result = await structuredCall({
    schema: gapsModelSchema,
    effort: 'low',
    system: `${RULES}

Your job: find the complaints that repeat across these 1 to 3 star reviews of ${app.name}.
- Group reviews by the underlying problem, not by wording. Up to 6 themes, the biggest first. Theme names under 10 words.
- For each theme list the IDs (like "r12") of every review that makes that complaint. Only cite reviews that actually make it.
- about: "mechanic" if the complaint is about how the app works (pricing model, ads, reliability, onboarding, notifications, matching...), which would follow the mechanic to any audience. "subject" if it's about the app's own topic or content and wouldn't carry over.
- Skip one-off complaints. A theme needs at least two reviews.`,
    user: `Reviews:\n${reviewLines(shown, GAPS_REVIEWS, true)}`,
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

// ---- build: fit check + idea in one call --------------------------------
// One call instead of two saves a full round of waiting. Part 1's judgment is
// written first, so Part 2 still builds on it.

export async function runBuild(app: AppListing, dissect: Dissect, gaps: Gaps, audience: string): Promise<{ fit_check: FitCheck; idea: Idea }> {
  const carryable = gaps.repeated_complaints.filter((complaint) => complaint.about === 'mechanic');
  const result = await structuredCall({
    schema: buildSchema,
    // Low effort: the prompt already spells out the reasoning, and medium took about a minute.
    effort: 'low',
    system: `${RULES}

You adapt the proven mechanics of ${app.name} for a new audience: ${audience}. Do it in two parts, in order.

PART 1 — components (the fit check).
Judge each component by one question: does this audience already have the behavior it needs, at the frequency it needs?
- survives: they already do this, often enough. Keep it as is.
- adapts: the behavior exists but in a different form or rhythm. Say what changes.
- breaks: they don't do this. Example: a daily streak breaks for people selling a car, because nobody sells a car daily.
One row each for core_loop, frequency_required, reward_type, retention_lever, monetization_trigger and network_effect, then one row for each of the two most important dependencies. Use those plain names as "component".
- audience_behavior: what this audience actually does today that is relevant, concretely. One sentence.
- reason: one short sentence.
- replacement: for "adapts", the adapted version. For "breaks", a replacement built on a behavior this audience does have. For "survives", an empty string. One sentence.
This is your judgment, not fetched data, so don't present it as fact or cite numbers.

PART 2 — idea: one new app for ${audience}, built from Part 1.
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
Idea fields:
- name: a short product name.
- pitch: one sentence, under 20 words.
- core_loop: how the loop works for this audience. One or two sentences.
- what_broke_and_replaced: what didn't survive and what took its place. One or two sentences.
- first_session_flow: 3 to 5 steps, what a new user does in their first session. A few words each.
- differentiator_from_gaps: the complaint it designs out (name the theme and its review count) and how. One or two sentences.
- mvp: 3 to 5 features, the smallest version that tests the core loop. A few words each.
- monetization: how it would make money, in one or two sentences. Don't state prices: you have no price data.
- main_risk: the single most likely reason it fails, in one sentence.
- search_terms: 3 or 4 short phrases someone in this audience would type into the App Store to find an app that does this job. Not the product name.`,
    user: `Audience: ${audience}\n\nSource app: ${app.name} (category: ${app.category})\n\nMechanics:\n${JSON.stringify(dissect, null, 2)}\n\nRepeated complaints about how ${app.name} works (counted from fetched reviews):\n${carryable.length ? carryable.map((complaint) => `- ${complaint.theme} (${complaint.evidence_count} reviews)`).join('\n') : '(none found)'}`,
  });
  return {
    fit_check: { components: result.components.slice(0, 10).map((row) => ({ ...row, replacement: row.status === 'survives' ? '' : row.replacement })) },
    idea: {
      ...result.idea,
      first_session_flow: result.idea.first_session_flow.slice(0, 6),
      mvp: result.idea.mvp.map((item) => item.trim()).filter(Boolean).slice(0, 5),
      search_terms: result.idea.search_terms.map((term) => term.trim()).filter(Boolean).slice(0, 4),
    },
  };
}
