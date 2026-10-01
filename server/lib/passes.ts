// The AI passes. Prompts adapted from the four workbench prompts:
//   RULES                <- Prompt 1 (Research): only the supplied data, unknown is a correct answer
//   dissect              <- Prompts 1 + 2 (Research, Extract DNA): why it works, and the 3-4 tricks
//                           that would still work somewhere else, at HotelTonight/GasBuddy depth
//   build                <- Prompt 3 (Generate): private candidates, hard rejections, must-haves;
//                           plus Prompt 4 (Filter) as a private self-check instead of a verdict
//   kit, plan            <- new: the phone mockup and build plan, and the business plan
// Competitors are found in plain code (itunes.ts), not by the AI.
// Everything is written for a normal person: see WRITING.
import { structuredCall } from './ai.ts';
import { audienceSuggestSchema, buildSchema, dissectSchema, filterSchema, gapsModelSchema, inventSchema, kitSchema, planSchema, readSchema } from './schemas.ts';
import type { AppListing, BusinessPlan, CompetitorListing, Dissect, Gaps, GeneratedIdea, Idea, Kit, Review } from './types.ts';
import type { UserContent } from './ai.ts';
import { templateById, type PhoneLayout } from './templates.ts';
import type { z } from 'npm:zod@^4.1.0';

const RULES = `You are one step in Spinoff. Spinoff takes an app that already works and turns what makes it work into a new app for a different group of people.

Rules:
- Use only the data supplied in this message. Never invent facts, apps, prices, numbers or market claims.
- A feature existing doesn't mean it caused the app's success. Separate what the data shows from your reading of why.
- Unknown is a correct answer. If the data doesn't show something, say so instead of guessing.`;

/** Research rules for the new upload-first passes. RULES above stays untouched for the old flow. */
const NEW_RULES = `You are one step in Spinoff. Spinoff turns what a person uploads — a photo, a document, a song, a video, or their own words — into a new app idea inspired by it.

Rules:
- Use what was uploaded. For well-known works the user names (a famous song, film, book, painting or place), you may use what is widely known about them: what they're about, how they sound or feel. Never invent facts about them, and never make claims about private people.
- Never invent apps, prices, numbers or market claims.
- Unknown is a correct answer. If you don't know something, say so instead of guessing.`;

/** How every pass writes. The readers are normal people, not product managers. */
const WRITING = `How to write:
- Write like you're texting a smart friend who has never heard of this. Everyday words, short sentences, under 20 words each.
- Be concrete. Say who, what they tap, what they see, when. Bad: "Leverages community engagement to drive retention." Good: "Neighbors post what's left on their porch, so you check on your way home."
- Never use these words: mechanic, loop, lever, leverage, synergy, ecosystem, engagement, monetize, monetization, value proposition, gamify, gamification, frictionless, seamless, empower, unlock, holistic, robust, niche, platform, solution, innovative, utilize, stakeholders.
- No hype, no exclamation marks, no buzzwords. If a sentence would fit any app, delete it and say something specific.`;

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

${WRITING}

Your job: understand why ${app.name} works, not what it is. Then find the tricks inside it that would still work if you moved them somewhere completely different.

A trick is one of:
- a reason people act differently than they normally would,
- a way money, value or supply moves that isn't obvious,
- who takes part, what each side gets, and why it holds together,
- a limit or rule that creates the magic,
- a way of reaching people or making things that is itself the new part.

The depth wanted:
- HotelTonight isn't "book a hotel on your phone". It's "rooms nobody books by tonight are worth nothing tomorrow, so prices drop as the deadline gets close".
- GasBuddy isn't "find gas prices". It's "prices change all the time, and the crowd keeps them up to date because they want the same info".
Too shallow: "personalization", "great design", "easy to use", or anything every competing app also has.

Fields:
- what_it_is: one sentence a 12-year-old would understand.
- what_people_do: what someone actually does in the app, step by step in one or two sentences.
- why_it_works: two or three sentences on the real reason it works, not the marketing.
- how_it_makes_money: one or two sentences. If the data doesn't show it, say what's unknown.
- tricks: 3 or 4, strongest first. Describe each without the app's name, topic or category, so it could be moved anywhere.
  - name: 2 to 5 plain words, like "Last-minute markdown" or "Crowd keeps it fresh".
  - how_it_works: one sentence.
  - needs: one sentence on what has to be true for it to work somewhere else.
- unknowns: up to 3 things this data can't tell you.

The listing description is the developer's own marketing, so treat its claims as claims. The 1 to 3 star reviews show where the app strains.`,
    user: `App Store listing:\n${listingBlock(app)}\n\nRecent 1 to 3 star reviews (${reviews.length} total, up to ${DISSECT_REVIEWS} shown):\n${reviewLines(reviews, DISSECT_REVIEWS, false) || '(none fetched)'}`,
  }).then((dissect) => ({ ...dissect, tricks: dissect.tricks.slice(0, 4), unknowns: dissect.unknowns.slice(0, 3) }));
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
- Group reviews by the underlying problem, not by wording. Up to 6 themes, the biggest first.
- Name each theme the way a frustrated customer would say it, under 10 words. Good: "Lost my streak because the app crashed". Bad: "Reliability issues impacting retention".
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

// ---- build: the idea ----------------------------------------------------

export async function runBuild(app: AppListing, dissect: Dissect, gaps: Gaps, audience: string): Promise<{ idea: Idea }> {
  const carryable = gaps.repeated_complaints.filter((complaint) => complaint.about === 'mechanic');
  const { idea } = await structuredCall({
    schema: buildSchema,
    effort: 'medium',
    system: `${RULES}

${WRITING}

You design one new app for ${audience}, built on the tricks that make ${app.name} work.

Before writing anything, privately:
1. Write down the obvious answer: "${app.name}, but for ${audience}". Throw it away. Only changing the topic is a reskin, not a new app.
2. For each trick, ask: where in the lives of ${audience} is the same thing already true? Think of at least 3 different situations.
3. Sketch at least 3 different apps. Keep the best one.
4. Check it like a blunt stranger who has never heard of ${app.name}:
   - After one read, do I know what it is and who it's for?
   - If I were one of ${audience}, would I actually use it? Would I pay?
   - Take the borrowed trick out. Does the app still work the same? Then the trick is decoration: start over.
   - Is there a made-up rule or theme that doesn't help the person? Remove it.
   If it fails any of these, fix it before answering.

Throw away, always:
- a generic AI assistant, chatbot, dashboard, habit tracker, CRM or checklist,
- anything vague that can't be described as a specific app,
- anything that needs an employer, a school or an admin to set it up. One person must be able to download it and start.

Use the complaints about ${app.name} listed below: design the new app so that complaint can't happen. If none are listed, say there's no review evidence to build on.

The app must have: a real person with a real problem that keeps coming back, something they do in the app, something the app does in response, a reason to come back as often as this problem actually happens, and a first version one person could build.

Fields:
- name: a short, memorable product name. Not a pun on ${app.name}.
- pitch: one sentence, under 15 words. What it does for whom. A friend should get it instantly.
- who_its_for: one specific person and their problem, in one or two sentences. Like: "A dad who walks the dog at 6am and can never tell if his kids already did."
- how_it_works: 3 or 4 steps. Each step starts with "You" (what the person does) or "The app" (what it does back).
- borrowed_trick: which trick it takes from ${app.name} and how it shows up here, one or two sentences. Name ${app.name}.
- whats_different: how it differs from ${app.name} beyond the audience, one or two sentences.
- fixes_complaint: the complaint it designs out (name it and its review count) and how, one or two sentences.
- mvp: 3 to 5 features for the first version, a few words each.
- monetization: how it makes money, one or two sentences. Don't state market prices: you have no price data.
- main_risk: the most likely reason it fails, one sentence.
- search_terms: 3 or 4 short phrases someone in this audience would type into the App Store to find an app that does this job. Not the product name.`,
    user: `Audience: ${audience}\n\nSource app: ${app.name} (category: ${app.category})\n\nWhat we know about ${app.name}:\n${JSON.stringify(dissect, null, 2)}\n\nComplaints about how ${app.name} works (counted from fetched reviews):\n${carryable.length ? carryable.map((complaint) => `- ${complaint.theme} (${complaint.evidence_count} reviews)`).join('\n') : '(none found)'}`,
  });
  return {
    idea: {
      ...idea,
      how_it_works: idea.how_it_works.map((step) => step.trim()).filter(Boolean).slice(0, 5),
      mvp: idea.mvp.map((item) => item.trim()).filter(Boolean).slice(0, 5),
      search_terms: idea.search_terms.map((term) => term.trim()).filter(Boolean).slice(0, 4),
    },
  };
}

/** The fields kit/plan need from an idea, old shape or new. */
export type KitIdea = { name: string; pitch: string; who_its_for: string; how_it_works: string[]; mvp: string[]; monetization: string; main_risk: string };

function ideaBlock(idea: KitIdea, audience: string) {
  return `Audience: ${audience}\n\nThe app:\n${JSON.stringify({ name: idea.name, pitch: idea.pitch, who_its_for: idea.who_its_for, how_it_works: idea.how_it_works, mvp: idea.mvp, monetization: idea.monetization, main_risk: idea.main_risk }, null, 2)}`;
}

// ---- kit: what the main screen shows, and a build plan ------------------

const LAYOUT_NOTES: Record<PhoneLayout, string> = {
  list: '',
  countdown: 'This screen is a countdown layout: hero_value is the time left (like "42 min" or "3:18"), hero_label says what ends, and each card is an offer with its price or current bid in tag.',
  map: 'This screen is a map layout: the cards are people or places shown as pins on a map, hero_value is a short count (like "3"), hero_label says what is counted, and each tag is a distance or a time.',
  streak: 'This screen is a big-number layout: hero_value is one number (like "23"), hero_label says what it counts (like "day streak"), and only the first 2 cards show.',
  swipe: 'This screen is a swipe-deck layout: the cards are options to pass or pick, the first one is shown large with its detail as a short description, and each tag is a distance, price or time.',
};

export async function runKit(idea: KitIdea, audience: string, layout: PhoneLayout = 'list'): Promise<Kit> {
  const kit = await structuredCall({
    schema: kitSchema,
    effort: 'low',
    system: `${RULES}

${WRITING}

You write the content of the main screen of a new phone app, as it would look on a normal day for one person using it, plus a short plan to build its first version.

screen (this fills a designed phone mockup, so keep every piece short and real, never placeholder text like "Item 1"):
- title: the app name or the screen name, 1 to 3 words.
- greeting: a short line at the top, like "Morning, Sam" or "3 walks this week". Under 5 words.
- hero_label: a small label for the main number or status, 1 to 4 words, like "Next pickup".
- hero_value: the main number or status itself, 1 to 4 words, like "6:30 pm" or "2 left".
- primary_action: the main button, 1 to 3 words, starting with a verb, like "Log a walk".
- cards: exactly 3 realistic items someone would see on this screen. title 2 to 5 words, detail under 8 words, tag 1 or 2 words (a status, time or price).
- tabs: exactly 4 tab names for the bottom bar, 1 word each, the first being this screen.
${LAYOUT_NOTES[layout]}

plan: 4 steps to build and test the first version, for one person using an AI app builder.
- when: like "Week 1".
- goal: what to build or do, one sentence.
- done_when: how you know it's done, one sentence. Make it testable, like "5 people logged a walk 3 days in a row".`,
    user: ideaBlock(idea, audience),
  });
  return {
    screen: { ...kit.screen, cards: kit.screen.cards.slice(0, 3), tabs: kit.screen.tabs.slice(0, 4) },
    plan: kit.plan.slice(0, 5),
  };
}

// ---- plan: the business plan, made on request ----------------------------

export function runPlan(idea: KitIdea, audience: string, competitors: CompetitorListing[]): Promise<BusinessPlan> {
  const listed = competitors.slice(0, 8).map((app) => ({ name: app.name, upfront_price: app.formatted_price || 'unknown', rating: app.rating, rating_count: app.rating_count }));
  return structuredCall({
    schema: planSchema,
    effort: 'low',
    system: `${RULES}

${WRITING}

You write a one-page business plan for a new app, for the person who will build it alone. Practical, not a pitch deck.

The only market data you have is the competitor list: their upfront App Store prices and ratings. Apple doesn't publish in-app or subscription prices, so those are unknown. Anything else is your suggestion, not a fact: write it as a suggestion ("Try...", "Expect about...").

Fields:
- summary: what the business is, in two sentences.
- customer: who pays, specifically. One or two sentences.
- problem: what's broken today for them. One or two sentences.
- solution: what the app does about it. One or two sentences.
- revenue.model: how money comes in. One sentence.
- revenue.price_to_test: a price to try first, like "$4.99 a month". A suggestion, not data.
- revenue.why: why that price, in one sentence. You may compare to a listed competitor's upfront price, naming it.
- launch_costs: 3 to 5 rough costs to launch the first version, like "AI app builder plan" with an estimate like "about $25 a month". Rough estimates only.
- first_100_users: 3 to 5 specific places or ways to find the first 100 people. Name real kinds of places (a subreddit type, a local group, an event), not "social media".
- milestones: 4 steps over the first 90 days. when like "Day 30", goal one sentence.
- risks: the 3 biggest risks, each with a plan, one sentence each.`,
    user: `${ideaBlock(idea, audience)}\n\nApps on the App Store doing a similar job (fetched):\n${listed.length ? JSON.stringify(listed, null, 2) : '(none found)'}`,
  }).then((plan) => ({
    ...plan,
    launch_costs: plan.launch_costs.slice(0, 5),
    first_100_users: plan.first_100_users.slice(0, 5),
    milestones: plan.milestones.slice(0, 5),
    risks: plan.risks.slice(0, 3),
  }));
}

// ---- The new front door: ideas from the upload itself ----------------------
// The user drops anything (photo, document, typed words) and names an
// audience. No source app, no DNA extraction. Uploads are never stored:
// the bytes travel with each request and live only in that request.

export type UploadInput =
  | { kind: 'text'; text: string; label: string }
  | { kind: 'photo'; dataUrl: string; label: string }
  | { kind: 'pdf'; dataUrl: string; label: string };

/** The upload as Muse content parts: the text lead, then any media. */
function uploadContent(upload: UploadInput, lead: string): UserContent[] {
  const parts: UserContent[] = [{ type: 'text', text: lead }];
  if (upload.kind === 'photo') parts.push({ type: 'image', dataUrl: upload.dataUrl });
  if (upload.kind === 'pdf') parts.push({ type: 'file', dataUrl: upload.dataUrl, filename: upload.label });
  return parts;
}

function uploadLead(upload: UploadInput): string {
  if (upload.kind === 'text') return `The user described something in words (instead of uploading a file):\n\n${upload.text}`;
  if (upload.kind === 'photo') return `The user uploaded a photo (${upload.label}). It is attached after this text.`;
  return `The user uploaded a document (${upload.label}). It is attached after this text.`;
}

const PEOPLE_RULE = `If the upload shows people, describe situations, never looks or identity.`;

function namesRule(): string {
  return `Never use trademarked or real names in the product (no song titles, lyrics, artist names, brands, or real people's names). Use the feeling, not the name.`;
}

// ---- suggest: who is it for ------------------------------------------------

export async function runAudienceSuggest(upload: UploadInput): Promise<{ audiences: string[] }> {
  const { audiences } = await structuredCall({
    schema: audienceSuggestSchema,
    effort: 'low',
    system: `${NEW_RULES}

${WRITING}

Your job: look at what the user uploaded and suggest 4 to 6 audiences who would care about an app inspired by it.
- Short labels, 1 to 3 words each, like "New parents" or "Marathon runners".
- Different kinds of people, not variations of one.
- ${PEOPLE_RULE}`,
    user: uploadContent(upload, `${uploadLead(upload)}\n\nWho would care about an app inspired by this?`),
  });
  return { audiences: audiences.map((audience) => audience.trim()).filter(Boolean).slice(0, 6) };
}

// ---- generate: the full blueprint --------------------------------------------

// ---- The main system prompt: the four workbench prompts ---------------------
// Stage 1 Research and Stage 2 Extract DNA run as one call (DNA is extracted
// "using the research supplied"). Stage 3 Generate returns 3 ideas. Stage 4
// Filter judges them like a blunt stranger; only kept ideas reach the user,
// and the verdicts are never shown. Wording stays as close to the original
// prompts as the change of subject (an upload instead of a product) allows.

/** Optional direction the user typed on the "who's it for" screen (the Kaiber-style describe step). */
function directionLine(direction: string | undefined) {
  return direction ? `\nThe user's direction (the niche, the feel, or what they want it to do): ${direction}` : '';
}

export async function runRead(upload: UploadInput, audience: string, direction?: string): Promise<z.infer<typeof readSchema>> {
  const read = await structuredCall({
    schema: readSchema,
    effort: 'medium',
    system: `${NEW_RULES}

${WRITING}

Do this in two parts, in order.

PART 1 — Research
You are a product analyst. Your job is to understand why this upload works on people, not what it is.

Study what the user supplied. Build a factual model of:
- What is actually in it (specific details: images, words, sounds, structure, moments — not a list of objects)
- What it means underneath, literally and figuratively (the feeling, the story, the tension, the change that happens)
- Why this specific one hits differently from others like it
- The conditions around it: who is involved, when, where, what's at stake

Rules:
- Use only what was supplied, plus what is widely known about a well-known work the user names. Never invent facts, URLs or market claims.
- Separate what is in it from what it may mean.
- A detail being present does not mean it matters.
- High confidence requires actual evidence, not a plausible story.
- Mark unknowns plainly. Unknown is a correct answer.
- ${PEOPLE_RULE}
- Do not generate ideas yet.

PART 2 — Extract DNA
You are a mechanic extractor. Find the valuable ideas inside this upload that would survive if you removed the upload itself.

Using the research from Part 1, find 3–4 transferable mechanisms. Each is one of:
- A behavioral trick (why people act or feel differently than they would otherwise)
- An economic mechanic (how value, money or supply moves in a non-obvious way)
- A structural relationship (who takes part, what each side gets, what makes it stable)
- A constraint that creates the magic
- A distribution or creation method that is itself the innovation

The depth required:
- HotelTonight is not "tap to book" — it is "inventory expires at a deadline so value drops to zero and incentives change as time runs out"
- GasBuddy is "a constantly changing local condition becomes useful because the crowd keeps it updated"
- The song Kiss from a Rose is not "romance" — it is GRAY STATE → SMALL BUT POWERFUL THING ENTERS → PERCEPTION CHANGES → YOU WANT TO UNDERSTAND WHAT CAUSED IT
- The Superman theme music is not "heroes" — it is ANTICIPATION → MOTION → LIFT → CONFIDENCE → ARRIVAL: momentum carries you before you can talk yourself out of it

Bad DNA: vague traits ("love", "nature", "music", "happiness", "community"), themes every similar upload shares.

Rules:
- Strip the names, titles, brands, characters and topic. Preserve structural conditions only. This is to prevent "an app about [the upload's topic]" ideas later.
- Put the most powerful mechanic first.
- Each mechanic must be able to survive being moved to a completely different domain.
- Separately, keep 3 to 6 specific details of the upload (an image, a line's meaning, a sound, a moment) so later the app can call back to it.

Return:
- details: the specific details of the upload, a few words each.
- meaning: what it means underneath, 2 or 3 sentences.
- why_different: why this one hits differently from others like it, one or two sentences.
- conditions: who is involved, when, where, what's at stake, one or two sentences.
- unknowns: up to 3 things you can't tell.
- mechanics: 3 or 4, strongest first. Each with name (plain English, 2 to 5 words), chain (like A → B → C → D), how_it_works (one sentence), why_it_works (one sentence), needs (what conditions it needs, one sentence), transferable (how transferable it is, one sentence).`,
    user: uploadContent(upload, `${uploadLead(upload)}\n\nAudience the app will be for: ${audience}${directionLine(direction)}\n\nDo Part 1 and Part 2.`),
  });
  return { ...read, details: read.details.slice(0, 6), unknowns: read.unknowns.slice(0, 3), mechanics: read.mechanics.slice(0, 4) };
}

export async function runInvent(read: z.infer<typeof readSchema>, audience: string, direction?: string, templateId?: string): Promise<GeneratedIdea[]> {
  const template = templateById(templateId);
  const steer = template
    ? `\n\nThe user also chose this proven trick from ${template.sourceApp} ("${template.name}"): ${template.trick} Build it in alongside the upload's DNA.`
    : '';
  const { ideas } = await structuredCall({
    schema: inventSchema,
    effort: 'medium',
    system: `${NEW_RULES}

${WRITING}

You invent non-obvious software apps by finding real problems where the upload's structural DNA would work better than what people do now.

You have the upload's extracted mechanics, the specific details of the upload, and the audience: ${audience}. Your job is to find places in the lives of ${audience} where those same conditions already exist — and build a product there.

Before writing anything, privately:
1. Generate the obvious answers and discard them. If you could describe an idea as "an app about [the upload's topic]" (a love app for a love song, a tree app for a photo of a tree), it is already discarded.
2. Push each mechanic into at least 3 candidate situations in the lives of ${audience}, at different distances from the upload.
3. Generate at least 6 candidates. Keep only the best 3.

Hard rejections — discard before returning:
- Any idea that is just about the upload's topic
- Generic AI assistant, chatbot, dashboard, habit tracker, CRM, journal, or checklist
- Any idea where removing the mechanic leaves the product working the same way
- Any vague concept that can't be described as a specific app

Each kept idea must have:
- A real user with a real problem
- What the user does inside the app
- What the app does in response
- A repeatable core loop
- Why it is better than what people do now
- A first version one person could build

Consumer-first: the first user is an individual. Must be adoptable by one person without employer permission, procurement, or an admin setting it up.

Desirability check: would a normal person understand why this is interesting in 5 seconds? Would they want to show it to someone?

Callback: someone who knows the upload should recognize where each idea came from. Turn specific details of the upload into the app's own words and one feature. ${namesRule()}

Return: 3 ideas. Fields for each:
- name: short and memorable, 1 to 3 words.
- tagline: one sentence, under 15 words. What it does for whom.
- what_it_is: 2 or 3 sentences.
- pattern: the mechanic it's built on, as a chain (A → B → C).
- job: the real user's problem as one sentence they'd say, like "When I..., help me...".
- how_it_works: 3 or 4 steps, each starting with "You" (what the user does) or "The app" (what it does in response).
- killer_feature: the feature that makes it more than the obvious version, one or two sentences.
- callbacks: 3 to 5 items. detail: an upload detail in a few words. meaning: what it is in the app, one sentence.
- what_its_not: the obvious version you discarded, one sentence.
- why_use: why it's better than what people do now, and why they'd come back, one or two sentences.
- mvp: 3 to 5 features for a first version one person could build, a few words each.
- monetization: how it makes money, one or two sentences. Don't state market prices.
- main_risk: the most likely reason it fails, one sentence.
- search_terms: 3 or 4 phrases someone would type into the App Store to find an app that does this job. Not the product name.`,
    user: `Audience: ${audience}${directionLine(direction)}${steer}\n\nWhat the upload is (research):\n${JSON.stringify({ details: read.details, meaning: read.meaning, why_different: read.why_different, conditions: read.conditions }, null, 2)}\n\nThe upload's DNA (mechanics, strongest first):\n${JSON.stringify(read.mechanics, null, 2)}`,
  });
  return ideas.slice(0, 3).map((idea) => ({
    ...idea,
    name: idea.name.trim(),
    tagline: idea.tagline.trim(),
    how_it_works: idea.how_it_works.map((step) => step.trim()).filter(Boolean).slice(0, 5),
    callbacks: idea.callbacks.slice(0, 5),
    mvp: idea.mvp.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    search_terms: idea.search_terms.map((term) => term.trim()).filter(Boolean).slice(0, 4),
  }));
}

/** Stage 4. Returns the ideas worth showing, best first. The verdicts stay on the server. */
export async function runFilter(ideas: GeneratedIdea[], read: z.infer<typeof readSchema>): Promise<GeneratedIdea[]> {
  if (!ideas.length) return [];
  const { verdicts } = await structuredCall({
    schema: filterSchema,
    effort: 'low',
    system: `${NEW_RULES}

You are a blunt stranger seeing these product pitches for the first time. You know nothing about the upload they came from, except the short list of its details at the end.

For each idea, decide:
1. Understandable — after one read, do you know what it is and who it is for?
2. Desirable — if you were the target user, would you actually use or pay for it? (0–10)
3. Mechanic test — if you removed the mechanic, does the product still work the same way? If yes, the mechanic is decoration, not structure. Reject it.
4. Already exists — does an existing product already do this for the same people?
5. Gimmick check — is there any invented restriction, random theme, or rule that has no obvious benefit to the user?
6. Resemblance — would someone who knows the upload see where it came from? If it could have come from any similar upload, reject it.

Keep if: understandable, desirable (7+), mechanic is load-bearing, not already built, no gimmicks, recognizable.

Reject if: confusing, mechanic is decoration, existing product does the same job, built around an arbitrary rule, or generic.

Return: for each idea, by its index, keep or reject, the desirability score, and one line explaining why.`,
    user: `Upload details: ${read.details.join('; ')}\n\nPitches:\n${JSON.stringify(ideas.map((idea, index) => ({ index, name: idea.name, tagline: idea.tagline, what_it_is: idea.what_it_is, how_it_works: idea.how_it_works, killer_feature: idea.killer_feature })), null, 2)}`,
  });
  const scored = verdicts.filter((verdict) => verdict.index >= 0 && verdict.index < ideas.length);
  const kept = scored.filter((verdict) => verdict.keep).sort((a, b) => b.desirability - a.desirability);
  console.log(`[filter] kept ${kept.length} of ${ideas.length}: ${scored.map((v) => `#${v.index} ${v.keep ? 'keep' : 'reject'} ${v.desirability} (${v.reason})`).join(' | ')}`);
  // Never a "no ideas" screen: if the stranger rejects all three, show the one they rated highest.
  const order = kept.length ? kept : scored.sort((a, b) => b.desirability - a.desirability).slice(0, 1);
  const picked = order.map((verdict) => ideas[verdict.index]);
  return picked.length ? picked : ideas.slice(0, 1);
}
