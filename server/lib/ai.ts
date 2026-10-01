// One structured AI call: ask the provider for JSON, validate it with Zod, and
// retry once if the reply is not valid JSON or does not match the schema.
//
// Provider: AI_PROVIDER=muse|claude. Without it, Muse is used when
// META_MODEL_API_KEY is set, otherwise Claude when ANTHROPIC_API_KEY is set.
import type { z } from 'npm:zod@^4.1.0';
import { toOutputSchema } from './schemas.ts';
import { claudeGenerate } from './claude.ts';
import { museGenerate } from './muse.ts';

export type Effort = 'low' | 'medium' | 'high';

/** One piece of a user message. Text, or media carried as a data URL. */
export type UserContent =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string }
  | { type: 'file'; dataUrl: string; filename: string };

export type GenerateRequest = {
  system: string;
  /** Plain text, or text plus image/file parts for multimodal calls. */
  user: string | UserContent[];
  /** JSON Schema the reply must match. */
  schema: Record<string, unknown>;
  effort: Effort;
};

/** Splits a data: URL into its MIME type and base64 body. */
export function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new PassError('An upload arrived in a format the server could not read.');
  return { mime: match[1] || 'application/octet-stream', base64: match[3] };
}

/** A failure the user should see as-is (bad key, refusal, invalid output). */
export class PassError extends Error {}

export type ProviderName = 'muse' | 'claude';

export function activeProvider(): ProviderName {
  const chosen = Deno.env.get('AI_PROVIDER')?.trim().toLowerCase();
  if (chosen === 'muse' || chosen === 'claude') return chosen;
  if (Deno.env.get('META_MODEL_API_KEY')) return 'muse';
  if (Deno.env.get('ANTHROPIC_API_KEY')) return 'claude';
  throw new PassError('No AI key is configured. Set META_MODEL_API_KEY on the server.');
}

/** Models sometimes wrap JSON in a code fence or add a sentence; keep only the object. */
export function extractJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('no JSON object');
    return JSON.parse(clean.slice(first, last + 1));
  }
}

export async function structuredCall<T extends z.ZodType>(opts: {
  system: string;
  user: string | UserContent[];
  schema: T;
  effort?: Effort;
}): Promise<z.infer<T>> {
  const provider = activeProvider();
  const generate = provider === 'muse' ? museGenerate : claudeGenerate;
  const schema = toOutputSchema(opts.schema);
  let user = opts.user;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 1) {
      const note = `\n\nYour previous reply was rejected: ${lastError}\nReturn only JSON that matches the schema.`;
      user = typeof user === 'string' ? `${user}${note}` : [...user, { type: 'text' as const, text: note }];
    }
    const reply = await generate({ system: opts.system, user, schema, effort: opts.effort ?? 'medium' });
    if (reply.truncated) { lastError = 'the reply was cut off at the length limit'; continue; }
    let json: unknown;
    try {
      json = extractJson(reply.text);
    } catch {
      lastError = 'it was not valid JSON';
      continue;
    }
    const parsed = opts.schema.safeParse(json);
    if (parsed.success) return parsed.data;
    lastError = `it did not match the schema (${parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')})`;
  }
  throw new PassError(`The AI returned invalid output twice: ${lastError}`);
}
