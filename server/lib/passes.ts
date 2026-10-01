// The AI steps. The reasoning follows the owner's Any DNA prompt (prompts.ts),
// one canonical Workbench prompt per stage, each wrapped the same way:
//   outer wrapper + app additions → the stage's canonical prompt → its side rules → return format
//   research  <- Canonical Prompt 1
//   dna       <- Canonical Prompt 2
//   generate  <- Canonical Prompt 3 (with a mode instruction in its slot, if one was picked)
//   filter    <- Canonical Prompt 4
// The retries after a failed filter are app code (src/lib/newrun.ts), as the side rules say.
// Plus three app steps outside the four: suggest (audiences), kit (the phone
// screen and build plan) and plan (the business plan, on request).
import { structuredCall } from './ai.ts';
import { audienceSuggestSchema, dnaSchema, filterSchema, inventSchema, kitSchema, planSchema, researchSchema } from './schemas.ts';
import type { BusinessPlan, CompetitorListing, DnaMechanism, FilterResult, GeneratedIdea, GenerateMode, Kit, SourceResearch } from './types.ts';
import type { UserContent } from './ai.ts';
import { templateById, type PhoneLayout } from './templates.ts';
import { closestCompetitors } from './itunes.ts';
import {
  MODE_INSTRUCTIONS, OUTER_WRAPPER, PROMPT_1_RESEARCH, PROMPT_2_EXTRACT_DNA, PROMPT_3_GENERATE, PROMPT_3_RETURN, PROMPT_4_FILTER,
  SIDE_RULE_CALLBACKS, SIDE_RULE_COMPETITORS, SIDE_RULE_NAMING, SIDE_RULE_WRITING, SIDE_RULES_INTRO,
} from './prompts.ts';
import { APP_ADDITIONS_INTRO, CHAIN_RULE, DEPTH_EXAMPLES, GENERATE_INPUTS, PEOPLE_AND_DIRECTION_FENCE, PEOPLE_RULE } from './prompt-additions.ts';

const BREAK = '\n\n⸻\n\n';

/** The owner's wrapper, then the app's additions that apply to every stage. */
function wrapper(...additions: string[]) {
  return [OUTER_WRAPPER, [APP_ADDITIONS_INTRO, ...additions].join('\n\n')].join(BREAK);
}

/** The side rules a stage uses, under the owner's side-rules heading. */
function sideRules(...rules: string[]) {
  return [SIDE_RULES_INTRO, ...rules].join('\n\n');
}

/** Field names the code reads. Not part of any prompt's reasoning. */
function returnFormat(lines: string) {
  return `Return format (for the app)\n\nWrite the Return above into these fields:\n${lines}`;
}

/** Keeps source material inside its <source> tags: no tag-like text can close the block early. */
function fenced(text: string, tag: 'source' | 'direction' = 'source') {
  return `<${tag}>\n${text.replace(/<\/?\s*(source|direction)\b[^>]*>/gi, '').trim()}\n</${tag}>`;
}

/** File names are the user's words too: plain characters only, short. */
function safeLabel(label: string) {
  return label.replace(/[<>\n\r]/g, ' ').slice(0, 80);
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
    system: `${SIDE_RULE_WRITING}

${SIDE_RULE_NAMING}

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
    system: `${SIDE_RULE_WRITING}

Never invent facts, URLs, prices, statistics or market claims.

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

// ---- The source -----------------------------------------------------------------
// Uploads are never stored: the bytes travel with each request and live only in it.

/** What the wrapper calls a normalized source: what was actually available, and what wasn't. */
export type SourcePacket = {
  category: 'Link' | 'Image' | 'Video / Audio' | 'Document / Data' | 'Text / Conversation';
  type: string;
  title?: string;
  creator?: string;
  url?: string;
  /** Where each piece came from, and how it was obtained. */
  provenance: string;
  /** Facts fetched from a public service (App Store, Apple Music, GitHub), already worded. */
  facts?: string[];
  /** What the AI does not have, and why. */
  unavailable: string[];
};

export type UploadInput = (
  | { kind: 'text'; text: string }
  | { kind: 'photo'; dataUrl: string }
  | { kind: 'video'; frames: string[] }
  | { kind: 'pdf'; dataUrl: string }
  /** A pasted link: what the service publicly shares about it, and its cover image if any. */
  | { kind: 'link'; text: string; imageDataUrl: string | null }
) & { label: string; packet: SourcePacket };

/** The source as content parts: the normalized source and its text, then any media. */
function sourceContent(upload: UploadInput, name = 'The source'): UserContent[] {
  const { packet } = upload;
  const media = upload.kind === 'photo' ? 'The image is attached after this text.'
    : upload.kind === 'video' ? `${upload.frames.length} still frames from across the video are attached after this text, in order from start to end.`
    : upload.kind === 'pdf' ? `The document "${safeLabel(upload.label)}" is attached after this text.`
    : upload.kind === 'link' && upload.imageDataUrl ? 'Its cover image is attached after this text.' : '';
  const lines = [
    `${name} (normalized):`,
    `- Category: ${packet.category}`,
    `- Type: ${packet.type}`,
    packet.title ? `- Title: ${safeLabel(packet.title)}` : '',
    packet.creator ? `- Creator: ${safeLabel(packet.creator)}` : '',
    packet.url ? `- Canonical URL: ${packet.url}` : '',
    `- Provenance: ${packet.provenance}`,
    `- Unavailable: ${packet.unavailable.length ? packet.unavailable.join('; ') : 'nothing'}`,
  ].filter(Boolean);
  const text = upload.kind === 'text' || upload.kind === 'link' ? `\n\nSource contents:\n${fenced(upload.text)}` : '';
  const facts = packet.facts?.length ? `\n\nFetched research:\n${fenced(packet.facts.join('\n'))}` : '';
  const parts: UserContent[] = [{ type: 'text', text: `${lines.join('\n')}${text}${facts}${media ? `\n\n${media} It is source material.` : ''}` }];
  if (upload.kind === 'photo') parts.push({ type: 'image', dataUrl: upload.dataUrl });
  if (upload.kind === 'video') for (const frame of upload.frames) parts.push({ type: 'image', dataUrl: frame });
  if (upload.kind === 'pdf') parts.push({ type: 'file', dataUrl: upload.dataUrl, filename: upload.label });
  if (upload.kind === 'link' && upload.imageDataUrl) parts.push({ type: 'image', dataUrl: upload.imageDataUrl });
  return parts;
}

// ---- suggest: who is it for (an app step, not one of the four) ----------------

export async function runAudienceSuggest(upload: UploadInput): Promise<{ audiences: string[] }> {
  const { audiences } = await structuredCall({
    schema: audienceSuggestSchema,
    effort: 'low',
    system: `${wrapper(PEOPLE_RULE)}${BREAK}${SIDE_RULE_WRITING}

Your job: look at the source and suggest 4 to 6 audiences who would care about an app descended from it.
- Short labels, 1 to 3 words each, like "New parents" or "Marathon runners".
- Different kinds of people, not variations of one.`,
    user: sourceContent(upload),
  });
  return { audiences: audiences.map((audience) => audience.trim()).filter(Boolean).slice(0, 6) };
}

// ---- Canonical Prompt 1 — Research ----------------------------------------------

export async function runResearch(upload: UploadInput, about?: string): Promise<SourceResearch> {
  const research = await structuredCall({
    schema: researchSchema,
    effort: 'medium',
    system: [
      wrapper(PEOPLE_RULE),
      PROMPT_1_RESEARCH,
      sideRules(SIDE_RULE_CALLBACKS),
      returnFormat(`- recognized: false if the source names a specific work (a song, film, book, app...) that you don't actually know and nothing supplied describes it. Otherwise true.
- core_sequence: the core loop or core sequence.
- why_it_works: why it works.
- conditions: the structural conditions that make it work, one per item.
- uncertainties: the key uncertainties, one per item. Unknown is a correct answer.
- source_details: 3–6 concrete source details (the callback side rule), a few words each.`),
    ].join(BREAK),
    user: [...sourceContent(upload), ...(about ? [{ type: 'text' as const, text: `What the person says the source is about (their words, also source material):\n${fenced(about)}` }] : [])],
  });
  return {
    ...research,
    conditions: research.conditions.slice(0, 6),
    uncertainties: research.uncertainties.slice(0, 4),
    source_details: research.source_details.slice(0, 6),
  };
}

// ---- Canonical Prompt 2 — Extract DNA ---------------------------------------------

/** What Prompt 2 is supplied: the research, without the source details (they are not DNA). */
function researchBlock(research: SourceResearch) {
  return JSON.stringify({ core_loop: research.core_sequence, why_it_works: research.why_it_works, structural_conditions: research.conditions, key_uncertainties: research.uncertainties }, null, 2);
}

export async function runDna(research: SourceResearch): Promise<DnaMechanism[]> {
  const { mechanisms } = await structuredCall({
    schema: dnaSchema,
    effort: 'medium',
    system: [
      wrapper(DEPTH_EXAMPLES, CHAIN_RULE),
      PROMPT_2_EXTRACT_DNA,
      returnFormat(`- mechanisms: 3–4, the most powerful first. Each with name (plain English), how_it_works (one sentence), why_it_works, needs (what conditions it needs to function), transferability (how transferable it is), chain (the structural chain, like A → B → C → D).`),
    ].join(BREAK),
    user: `The research supplied (from Prompt 1):\n${researchBlock(research)}`,
  });
  return mechanisms.slice(0, 4);
}

// ---- Canonical Prompt 3 — Generate ----------------------------------------------------

export type SourceReading = { research: SourceResearch; dna: DnaMechanism[] };

export type GenerateInput = {
  read: SourceReading;
  /** Collide: the second source's reading. */
  second?: SourceReading;
  audience: string;
  direction?: string;
  templateId?: string;
  mode?: GenerateMode | 'collide';
  /** The filter's reasons for rejecting every idea of an earlier attempt. */
  feedback?: Array<{ name: string; reason: string }>;
};

/** Collide's own Prompt 3 text: what comes after “use this instead of the standard Prompt 3:”. */
const COLLIDE_PROMPT_3 = MODE_INSTRUCTIONS.collide.split('Then use this instead of the standard Prompt 3:')[1].trim();

/**
 * Prompt 3, with the picked mode in its slot. Collide replaces the opening of
 * Prompt 3 (what you have and what your job is) and keeps its quality bars:
 * the private steps, hard rejections, must-haves, consumer-first and desirability checks.
 */
function generatePrompt(mode: GenerateInput['mode']) {
  if (mode === 'collide') {
    const bars = PROMPT_3_GENERATE.slice(PROMPT_3_GENERATE.indexOf('Before writing anything, privately:'));
    return `CANONICAL PROMPT 3 — GENERATE (Collide)\n\n${COLLIDE_PROMPT_3}\n\n${bars}\n\n${PROMPT_3_RETURN}`;
  }
  return [PROMPT_3_GENERATE, mode ? `Mode instruction:\n\n${MODE_INSTRUCTIONS[mode]}` : '', PROMPT_3_RETURN].filter(Boolean).join('\n\n');
}

function readingBlock(read: SourceReading) {
  return JSON.stringify({
    mechanics: read.dna.map(({ name, how_it_works, why_it_works, needs, transferability, chain }) => ({ name, chain, how_it_works, why_it_works, needs, transferability })),
    structural_conditions: read.research.conditions,
    source_details: read.research.source_details,
  }, null, 2);
}

export async function runGenerate(input: GenerateInput): Promise<GeneratedIdea[]> {
  const { read, second, audience, direction, mode, feedback } = input;
  const template = templateById(input.templateId);
  const collide = mode === 'collide' && second;
  const sources = collide
    ? `Source A — extracted mechanics, structural conditions and source details:\n${readingBlock(read)}\n\nSource B — extracted mechanics, structural conditions and source details:\n${readingBlock(second)}`
    : `The source's extracted mechanics, structural conditions and source details:\n${readingBlock(read)}`;
  const inputs = [
    `Target audience: ${audience}`,
    direction ? `Direction:\n${fenced(direction, 'direction')}` : '',
    template ? `Proven trick, from ${template.sourceApp} ("${template.name}"): ${template.trick}` : '',
  ].filter(Boolean).join('\n\n');
  const corrective = feedback?.length
    ? `\n\nCorrective feedback: every idea from the last attempt failed Prompt 4. Don't return these ideas or close variants of them; fix what the reasons point to.\n${feedback.map((item) => `- ${item.name}: ${item.reason}`).join('\n')}`
    : '';
  const { ideas } = await structuredCall({
    schema: inventSchema,
    effort: 'medium',
    system: [
      wrapper(GENERATE_INPUTS, PEOPLE_AND_DIRECTION_FENCE),
      generatePrompt(collide ? 'collide' : mode === 'collide' ? undefined : mode),
      sideRules(SIDE_RULE_CALLBACKS, SIDE_RULE_NAMING, SIDE_RULE_WRITING),
      returnFormat(`- ideas: exactly 3. Each with:
  - name: the app's name, 1 to 3 words.
  - tagline: what it does for whom, one sentence under 15 words.
  - what_it_is: 2 or 3 sentences.
  - pattern: the mechanic it is built on, as a chain (A → B → C).${collide ? ' Name both: the one from Source A and the one from Source B.' : ''}
  - job: the real user's problem, as one sentence they'd say, like "When I..., help me...".
  - how_it_works: the repeatable core loop in 3 or 4 steps, each starting with "You" (what the user does inside the app) or "The app" (what it does in response).
  - killer_feature: what makes it more than the obvious version, one or two sentences.
  - callbacks: 0 to 5 source details used for lineage. detail: the source detail in a few words. meaning: what it became in the app, one sentence. Leave it empty when a callback would weaken the idea.
  - what_its_not: the obvious idea you discarded, one sentence.
  - why_use: why it is better than what people do now, one or two sentences.
  - mvp: 3 to 5 features of a first version one person could build, a few words each.
  - monetization: how it makes money, one or two sentences. No market prices.
  - main_risk: the most likely reason it fails, one sentence.
  - search_terms: 3 or 4 phrases someone would type into the App Store to find an app that does this job. Not the app's name.`),
    ].join(BREAK),
    user: `${sources}\n\n${inputs}${corrective}`,
  });
  return ideas.slice(0, 3).map((idea) => ({
    ...idea,
    name: idea.name.trim(),
    tagline: idea.tagline.trim(),
    how_it_works: idea.how_it_works.map((step) => step.trim()).filter(Boolean).slice(0, 5),
    callbacks: idea.callbacks.filter((callback) => callback.detail.trim()).slice(0, 5),
    mvp: idea.mvp.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    search_terms: idea.search_terms.map((term) => term.trim()).filter(Boolean).slice(0, 4),
  }));
}

// ---- Canonical Prompt 4 — Filter --------------------------------------------------

/** The ideas that passed, best first, and the reasons the rest didn't. A rejected idea is never returned as kept. */
export async function runFilter(ideas: GeneratedIdea[], found: CompetitorListing[][] = []): Promise<FilterResult> {
  if (!ideas.length) return { kept: [], rejected: [] };
  const { verdicts } = await structuredCall({
    schema: filterSchema,
    effort: 'low',
    system: [
      PROMPT_4_FILTER,
      sideRules(SIDE_RULE_COMPETITORS),
      returnFormat(`- verdicts: one per idea, by its index. keep: true to keep, false to reject. desirability: your 0–10 score from check 2. reason: the one line explaining why.`),
    ].join(BREAK),
    // "You know nothing about the source product": the pitches only, with real App Store results.
    user: `Pitches:\n${JSON.stringify(ideas.map((idea, index) => ({
      index, name: idea.name, tagline: idea.tagline, what_it_is: idea.what_it_is, mechanic: idea.pattern, how_it_works: idea.how_it_works, killer_feature: idea.killer_feature,
      app_store_search_results: (found[index] ?? []).slice(0, 5).map((app) => ({ name: app.name, rating: app.rating, ratings: app.rating_count, category: app.category })),
    })), null, 2)}\n\napp_store_search_results are real, fetched App Store search results for each idea's job.`,
  });
  const scored = verdicts.filter((verdict) => verdict.index >= 0 && verdict.index < ideas.length);
  console.log(`[filter] kept ${scored.filter((v) => v.keep).length} of ${ideas.length}: ${scored.map((v) => `#${v.index} ${v.keep ? 'keep' : 'reject'} ${v.desirability} (${v.reason})`).join(' | ')}`);
  const judged = new Set(scored.map((verdict) => verdict.index));
  const keep = scored.filter((verdict) => verdict.keep).sort((a, b) => b.desirability - a.desirability);
  return {
    kept: keep.map((verdict) => ideas[verdict.index]),
    found: keep.map((verdict) => ({ competitors: closestCompetitors(found[verdict.index] ?? []), searched: found[verdict.index] ?? [] })),
    rejected: [
      ...scored.filter((verdict) => !verdict.keep).map((verdict) => ({ name: ideas[verdict.index].name, reason: verdict.reason })),
      // An idea the filter skipped hasn't passed.
      ...ideas.filter((_, index) => !judged.has(index)).map((idea) => ({ name: idea.name, reason: 'Not judged.' })),
    ],
  };
}
