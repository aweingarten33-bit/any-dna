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
import { audienceSuggestSchema, buildSchema, dissectSchema, gapsModelSchema, generateSchema, headlineSchema, kitSchema, planSchema } from './schemas.ts';
import type { AppListing, BusinessPlan, CompetitorListing, Dissect, Gaps, Idea, Kit, Review } from './types.ts';
import type { UserContent } from './ai.ts';
import { templateById } from './templates.ts';
import type { z } from 'npm:zod@^4.1.0';

const RULES = `You are one step in Spinoff. Spinoff takes an app that already works and turns what makes it work into a new app for a different group of people.

Rules:
- Use only the data supplied in this message. Never invent facts, apps, prices, numbers or market claims.
- A feature existing doesn't mean it caused the app's success. Separate what the data shows from your reading of why.
- Unknown is a correct answer. If the data doesn't show something, say so instead of guessing.`;

/** Research rules for the new upload-first passes. RULES above stays untouched for the old flow. */
const NEW_RULES = `You are one step in Spinoff. Spinoff turns what a person uploads — a photo, a document, a song, a video, or their own words — into a new app idea inspired by it.

Rules:
- Use only the data supplied in this message. Never invent facts, apps, prices, numbers or market claims.
- Unknown is a correct answer. If the data doesn't show something, say so instead of guessing.`;

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

export async function runKit(idea: KitIdea, audience: string): Promise<Kit> {
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

// ---- headline: the name and tagline, fast -----------------------------------

export async function runHeadline(upload: UploadInput, audience: string): Promise<{ name: string; tagline: string }> {
  const headline = await structuredCall({
    schema: headlineSchema,
    effort: 'low',
    system: `${NEW_RULES}

${WRITING}

You are an inventor. The user uploaded something and named an audience: ${audience}. Name the app they would build from it.

Read the upload literally and figuratively: what is actually in it, and what does it mean underneath — the feeling, the story, the tension, the change? Go past the obvious theme. Find the small, specific thing that makes it interesting, not the general topic.

Then name the product:
- name: short and memorable, 1 to 3 words. ${namesRule()}
- tagline: one sentence, under 15 words. What it does for whom. A friend should get it instantly.

${PEOPLE_RULE}`,
    user: uploadContent(upload, `${uploadLead(upload)}\n\nAudience: ${audience}\n\nName the app.`),
  });
  return { name: headline.name.trim(), tagline: headline.tagline.trim() };
}

// ---- generate: the full blueprint --------------------------------------------

const EXAMPLES = `Two examples of the quality wanted. Match their depth. Never reuse their names, words or ideas; every upload must produce its own pattern.

Example 1: the song Kiss from a Rose → ROSE / GRAY
- Reading: not romance. Something small and beautiful breaks through a gray state and changes how everything feels.
- Pattern: GRAY STATE → SMALL THING ENTERS → PERCEPTION CHANGES → YOU WANT TO KNOW WHY
- Job: when something makes my life better, figure out what it was and help me do it again.
- App: tap "That helped" when your mood lifts. The app learns what came before it and gives one suggestion when you feel gray.
- Callbacks: Gray = how you feel now. Rose = a small thing that helps. Rose Garden = everything that works for you.

Example 2: the Superman theme music → TAKEOFF
- Reading: the music itself builds from anticipation to lift to confident arrival.
- Pattern: ANTICIPATION → MOTION → LIFT → CONFIDENCE → ARRIVAL
- Job: get me started on something I'm avoiding.
- App: type the task you're avoiding. The app gives one tiny first step, then slightly bigger ones as you build momentum. One "Up" button gives the next step.
- Callbacks: Runway = before you start. Lift = first real action. Flight = a focused work session. Flight Log = what you finished.`;

export async function runGenerate(
  upload: UploadInput,
  audience: string,
  headline: { name: string; tagline: string },
  templateId?: string,
): Promise<z.infer<typeof generateSchema>> {
  const template = templateById(templateId);
  const steer = template
    ? `\n\nSteer it with this proven trick from ${template.sourceApp} ("${template.name}"): ${template.trick} Use it as one ingredient, not the whole app. The upload still supplies the pattern.`
    : '';
  const generated = await structuredCall({
    schema: generateSchema,
    effort: 'medium',
    system: `${NEW_RULES}

${WRITING}

You are an inventor. The user uploaded something and named an audience: ${audience}. Turn it into a real app people would use, one that someone who knows the upload would recognize.

Work through these steps privately, then write the answer.

1. Read it, literally and figuratively. What is actually in it? What does it mean underneath: the feeling, the story, the tension, the change that happens? Go past the obvious theme.
2. Find the pattern. Write it as a short chain (like GRAY STATE → SMALL THING ENTERS → PERCEPTION CHANGES → YOU WANT TO KNOW WHY). Strip away the topic. Keep the pattern that would still work somewhere else.
3. Find the real job. Where does that pattern happen again and again in the lives of ${audience}? Write the job in one sentence a normal person gets immediately.
4. Design the app. One core interaction that fits on one screen. What the person does, and what the app does back. Why it beats what exists, naming the boring version you're NOT building. One killer feature. A first version one person could build.
5. Build in the callback. Turn details from the upload into the product's own words and features. Add one feature from a specific detail, not the general theme. ${namesRule()}
6. Check it like a blunt stranger. Would a normal person get it in 5 seconds and want to show someone? Would they use it more than once? If you remove the pattern and the app works the same, start over. If it could come from any similar upload, start over. If it's a generic AI assistant, chatbot, dashboard, habit tracker, journal or checklist, start over.

${EXAMPLES}

${PEOPLE_RULE}

The name and tagline are decided — keep them exactly: "${headline.name}" / "${headline.tagline}".

Fields:
- name: exactly "${headline.name}".
- tagline: exactly "${headline.tagline}".
- what_it_is: 2 or 3 sentences. What the app really is.
- pattern: the chain, like GRAY STATE → SMALL THING ENTERS → PERCEPTION CHANGES → YOU WANT TO KNOW WHY.
- job: one sentence a normal person gets immediately.
- how_it_works: 3 or 4 steps. Each step starts with "You" (what the person does) or "The app" (what it does back).
- killer_feature: the one feature that makes it special, ideally from a specific detail of the upload. One or two sentences.
- callbacks: each detail from the upload and what it means in the app. 3 to 5 items. detail: the upload detail in a few words. meaning: what it means in the product, one sentence.
- what_its_not: the boring version you're NOT building. One or two sentences.
- why_use: why people would use it more than once. One or two sentences.
- mvp: 3 to 5 features for the first version, a few words each.
- monetization: how it makes money, one or two sentences. Don't state market prices: you have no price data.
- search_terms: 3 or 4 short phrases someone in this audience would type into the App Store to find an app that does this job. Not the product name.`,
    user: uploadContent(upload, `${uploadLead(upload)}\n\nAudience: ${audience}${steer}\n\nWrite the full blueprint.`),
  });
  return {
    ...generated,
    name: headline.name,
    tagline: headline.tagline,
    how_it_works: generated.how_it_works.map((step) => step.trim()).filter(Boolean).slice(0, 5),
    callbacks: generated.callbacks.slice(0, 5),
    mvp: generated.mvp.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    search_terms: generated.search_terms.map((term) => term.trim()).filter(Boolean).slice(0, 4),
  };
}
