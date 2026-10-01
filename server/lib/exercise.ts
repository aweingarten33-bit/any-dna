// One fast creative conversation. No separate research/DNA/generate/filter calls.
import { z } from 'npm:zod@^4.1.0';
import { structuredCall, type UserContent } from './ai.ts';
import type { ExerciseTurn } from './types.ts';
import type { UploadInput } from './passes.ts';

const exerciseSchema = z.object({
  take: z.string(),
  dna: z.array(z.object({ name: z.string(), explanation: z.string() })),
  ideas: z.array(z.object({
    name: z.string(),
    pitch: z.string(),
    what_you_do: z.string(),
    why_youd_use_it: z.string(),
    first_version: z.string(),
  })),
  reactions: z.array(z.object({ label: z.string(), instruction: z.string() })),
});

// This is the original exercise, compressed so the model spends time inventing instead of rereading instructions.
const EXERCISE_PROMPT = `You run one creative product exercise.

The person gives you literally anything. Ask one question privately:
“What is the valuable idea inside this thing that could survive if we removed the thing itself?”

Then do this privately, in one pass:
1. Figure out what uniquely makes the source work.
2. Strip away the costume: brand, category, characters, imagery, themes, surface features.
3. Extract 3 real transferable mechanisms.
4. Push those mechanisms into multiple distant domains.
5. Throw away the obvious ideas.
6. Keep the best 3 SOFTWARE APP ideas only.

The rule that matters most: DON’T TRANSFER THE COSTUME. TRANSFER HOW IT WORKS.

Good DNA looks like:
- HotelTonight: inventory loses value as a deadline approaches, changing incentives.
- GitReverse: start from a finished artifact and reverse-engineer what created it.
- GasBuddy: a constantly changing local condition becomes useful because the crowd keeps it current.
- Napkin: the system chooses the representation that best communicates messy input.

Bad DNA: personalization, good UX, community, convenience, AI, notifications, swipe cards.

Every kept idea must have:
- a real recurring problem or desire
- a clear user action
- a useful app response
- a reason to come back
- a reason it deserves to be its own app
- a first version one person could actually build

Reject generic assistants, chatbots, dashboards, habit trackers, CRMs, checklists, “X for Y,” feature-sized ideas, one-off transformations, gimmicks, and anything where the borrowed DNA is decorative.

Use these moves when helpful: Repurpose, ×1000, Different Angle, 30 Years From Now, Collide.

Do not browse or claim current research. Use only the supplied source plus what you already know. If you don’t know something, do not invent it.

WRITE LIKE A NORMAL PERSON. Short. Specific. No consultant language. No AI language. No essays.

Return:
- take: 1 short sentence
- dna: exactly 3 items, each explanation max 18 words
- ideas: exactly 3. Pitch max 22 words. Other fields max 24 words each.
- reactions: exactly 3 natural things the person might say next. Under 10 words each. One reject/pivot, one pushes a promising idea, one changes angle.

On follow-ups, obey the person’s reaction. Don’t defend old ideas. Make a genuinely different next batch.`;

function safe(text: string) {
  return text.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceContent(upload: UploadInput): UserContent[] {
  const packet = upload.packet;
  const lines = [
    'SOURCE',
    `Category: ${packet.category}`,
    `Type: ${packet.type}`,
    packet.title ? `Title: ${safe(packet.title)}` : '',
    packet.creator ? `Creator: ${safe(packet.creator)}` : '',
    packet.url ? `URL supplied by person: ${packet.url}` : '',
    `Available: ${packet.provenance}`,
    packet.unavailable.length ? `Unavailable: ${packet.unavailable.join('; ')}` : '',
  ].filter(Boolean);

  if (upload.kind === 'text' || upload.kind === 'link') lines.push(`Contents:\n${upload.text}`);
  if (upload.kind === 'photo') lines.push('The uploaded image is attached.');
  if (upload.kind === 'video') lines.push(`${upload.frames.length} still frames from the uploaded video are attached in order.`);
  if (upload.kind === 'pdf') lines.push(`The uploaded PDF "${safe(upload.label)}" is attached.`);
  if (upload.kind === 'link' && upload.imageDataUrl) lines.push('The exact link preview image is attached.');

  const parts: UserContent[] = [{ type: 'text', text: lines.join('\n') }];
  if (upload.kind === 'photo') parts.push({ type: 'image', dataUrl: upload.dataUrl });
  if (upload.kind === 'video') for (const frame of upload.frames) parts.push({ type: 'image', dataUrl: frame });
  if (upload.kind === 'pdf') parts.push({ type: 'file', dataUrl: upload.dataUrl, filename: upload.label });
  if (upload.kind === 'link' && upload.imageDataUrl) parts.push({ type: 'image', dataUrl: upload.imageDataUrl });
  return parts;
}

export async function runExercise(upload: UploadInput, context = '', reaction = ''): Promise<ExerciseTurn> {
  const user = sourceContent(upload);
  if (context.trim()) user.push({ type: 'text', text: `RECENT CONVERSATION\n${context.slice(-6500)}` });
  user.push({
    type: 'text',
    text: reaction.trim()
      ? `PERSON'S REACTION:\n"${reaction.trim().slice(0, 350)}"\nContinue from this. New batch.`
      : 'First turn. Run the exercise now.',
  });

  const out = await structuredCall({
    schema: exerciseSchema,
    effort: 'low',
    maxOutputTokens: 2200,
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
