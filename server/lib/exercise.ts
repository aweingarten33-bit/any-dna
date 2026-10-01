// The new core: one creative conversation instead of Research → DNA → Generate → Filter.
// The model does the owner's original exercise privately in one call, returns 3 strong
// app ideas, then gives the person 3 natural reactions to tap. No broad web research.
import { z } from 'npm:zod@^4.1.0';
import { structuredCall, type UserContent } from './ai.ts';
import type { ExerciseTurn } from './types.ts';
import type { UploadInput } from './passes.ts';

const exerciseSchema = z.object({
  take: z.string(),
  dna: z.array(z.object({
    name: z.string(),
    explanation: z.string(),
  })),
  ideas: z.array(z.object({
    name: z.string(),
    pitch: z.string(),
    what_you_do: z.string(),
    why_youd_use_it: z.string(),
    first_version: z.string(),
  })),
  reactions: z.array(z.object({
    label: z.string(),
    instruction: z.string(),
  })),
});

const EXERCISE_PROMPT = `You are running one continuous creative product exercise.

The person gives you literally anything: an app, product, website, image, reel, video, song, movie scene, document, GitHub repo, random object, conversation, or idea. Your job is to find the valuable idea inside it that could survive if the source itself disappeared, then use that DNA to invent genuinely good SOFTWARE APP ideas.

This is NOT a generic startup-idea generator. It is NOT "X but for Y." It is NOT a competitor dashboard. It is the same exercise every time: understand what is actually interesting → extract transferable DNA → reimagine it somewhere else → keep only the ideas worth showing.

IMPORTANT: do this whole exercise privately in ONE response. Do not narrate Research, DNA, Generate, Filter as separate stages. Do not browse the web or claim you verified anything current. Use the supplied source plus what you already know. If you do not recognize something, work from what was supplied instead of inventing facts.

THE ORIGINAL EXERCISE

1. UNDERSTAND WHY IT WORKS
Understand why the source works, not just what it is.
Privately identify:
- what people actually do or experience
- what happens because of those actions
- why this version is interesting or useful
- the structural conditions that make it work: timing, trust, scarcity, supply/demand, network effects, incentives, behavior, creation method, distribution, constraints, etc.

2. EXTRACT THE DNA
Find 3–4 transferable mechanisms: the valuable ideas that survive when you remove the source name, brand, category, characters, themes, imagery and surface details.
A mechanism can be:
- a behavioral trick
- an economic mechanic
- a structural relationship
- a constraint that creates the magic
- a creation or distribution method that is itself the innovation

Depth examples:
- HotelTonight is not "tap to book." It is "inventory expires at a deadline, so value drops toward zero and incentives change as time runs out."
- GitReverse is "start from a finished artifact and reverse-engineer the instructions required to recreate it."
- GasBuddy is "a constantly changing local condition becomes useful because the crowd keeps it updated."
- Napkin is "you do not choose the representation; the system picks the one that best communicates what you gave it."

Bad DNA: personalization, good UX, community, convenience, AI, notifications, swipe cards, or other generic features.

3. INVENT
Privately generate the obvious answers first and throw them away.
Push the strongest DNA into at least 3 different domains. Generate at least 6 candidate SOFTWARE APPS. Keep only the best 3.

Hard rejects:
- "[source] for [audience]"
- generic AI assistants, chatbots, dashboards, habit trackers, CRMs, checklists
- a feature that belongs inside another app instead of deserving its own app
- one-off content transformations with no reason to come back
- social/reaction gimmicks whose main value is novelty
- vague concepts with no actual product loop
- ideas where the source DNA is decorative instead of load-bearing
- physical/offline businesses

Every idea you keep needs:
- a real person with a real problem or desire
- something clear they do in the app
- something useful the app does back
- a repeatable reason to return
- a clear advantage over the normal way people handle it now
- a first version one person could realistically build
- a 5-second explanation a normal person understands

Use these lenses when useful:
REPURPOSE — move the whole winning system into a genuinely different domain.
×1000 — amplify or invert the defining mechanic until a fundamentally different product appears.
30 YEARS FROM NOW — project the system into plausible future behavior/technology, then backcast to something buildable now. No sci-fi nonsense.
DIFFERENT ANGLE — reinterpret the job, economics, relationship, or who is really being served.
COLLIDE — when the person gives two sources, combine one real mechanism from each inside a third context. Never make a literal mashup.

4. COLD FILTER
Before returning anything, be a blunt stranger seeing the ideas cold. Throw out anything confusing, gimmicky, generic, too close to the source, obviously feature-sized, or not useful enough to deserve its own app.

WRITING
Talk like a smart friend, not a consultant and not an AI. Short sentences. Normal words. Concrete. Specific. No theory-speak. No arrows. No startup-bro language. No fake excitement.

OUTPUT
- take: one short sentence saying what is actually worth stealing from this source.
- dna: exactly 3 mechanisms. Plain-English name + one short explanation each.
- ideas: exactly 3 app ideas. Each gets a name, a punchy one-line pitch, what the person actually does, why they would use it, and the first version.
- reactions: exactly 3 things the person might naturally say next. These are TAP OPTIONS, not product-button labels. Make them sound blunt, casual and human — like "Nah. These are too obvious.", "#2 has something. Push that way harder.", or "Different angle completely." At least one should reject/pivot, one should push a promising direction, and one should change the angle or intensity. Keep each label under about 12 words. Mild profanity is fine when it sounds natural, but don't force it.

When this is a follow-up turn, treat the tapped reaction as real creative direction. Do not defend the old ideas. Do not merely rewrite them. Actually react to what the person chose and produce a materially new batch.`;

function safe(text: string) {
  return text.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceContent(upload: UploadInput): UserContent[] {
  const packet = upload.packet;
  const lines = [
    'THE SOURCE',
    `Category: ${packet.category}`,
    `Type: ${packet.type}`,
    packet.title ? `Title: ${safe(packet.title)}` : '',
    packet.creator ? `Creator: ${safe(packet.creator)}` : '',
    packet.url ? `URL supplied by the person: ${packet.url}` : '',
    `What was actually available: ${packet.provenance}`,
    packet.unavailable.length ? `Not available: ${packet.unavailable.join('; ')}` : '',
  ].filter(Boolean);

  if (upload.kind === 'text' || upload.kind === 'link') lines.push(`Source contents:\n${upload.text}`);
  if (upload.kind === 'photo') lines.push('The uploaded image is attached after this text.');
  if (upload.kind === 'video') lines.push(`${upload.frames.length} still frames from the uploaded video are attached in order.`);
  if (upload.kind === 'pdf') lines.push(`The uploaded PDF "${safe(upload.label)}" is attached after this text.`);
  if (upload.kind === 'link' && upload.imageDataUrl) lines.push('The source link\'s public preview image is attached after this text.');

  const parts: UserContent[] = [{ type: 'text', text: lines.join('\n') }];
  if (upload.kind === 'photo') parts.push({ type: 'image', dataUrl: upload.dataUrl });
  if (upload.kind === 'video') for (const frame of upload.frames) parts.push({ type: 'image', dataUrl: frame });
  if (upload.kind === 'pdf') parts.push({ type: 'file', dataUrl: upload.dataUrl, filename: upload.label });
  if (upload.kind === 'link' && upload.imageDataUrl) parts.push({ type: 'image', dataUrl: upload.imageDataUrl });
  return parts;
}

export async function runExercise(upload: UploadInput, context = '', reaction = ''): Promise<ExerciseTurn> {
  const user = sourceContent(upload);
  if (context.trim()) {
    user.push({ type: 'text', text: `CONVERSATION SO FAR\n${context.slice(-12000)}` });
  }
  user.push({
    type: 'text',
    text: reaction.trim()
      ? `THE PERSON TAPPED THIS REACTION:\n"${reaction.trim().slice(0, 500)}"\n\nContinue the same exercise from that reaction. Give them a genuinely new batch.`
      : 'This is the first turn. Run the exercise now.',
  });

  const out = await structuredCall({
    schema: exerciseSchema,
    effort: 'medium',
    system: EXERCISE_PROMPT,
    user,
  });

  return {
    take: out.take.trim(),
    dna: out.dna.slice(0, 3),
    ideas: out.ideas.slice(0, 3),
    reactions: out.reactions.slice(0, 3),
  };
}
