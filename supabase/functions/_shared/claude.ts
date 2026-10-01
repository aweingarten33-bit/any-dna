// One structured Claude call: JSON constrained by a schema, validated with Zod,
// retried once if the reply is not valid JSON or does not match.
import Anthropic from 'npm:@anthropic-ai/sdk@^0.129.0';
import type { z } from 'npm:zod@^4.1.0';
import { toOutputSchema } from './schemas.ts';

let client: Anthropic | null = null;
function anthropic() {
  if (client) return client;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it with: supabase secrets set ANTHROPIC_API_KEY=...');
  client = new Anthropic({ apiKey });
  return client;
}

export const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5';
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export class PassError extends Error {}

export async function structuredCall<T extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: T;
  effort?: Effort;
}): Promise<z.infer<T>> {
  const format = { type: 'json_schema' as const, schema: toOutputSchema(opts.schema) };
  let content = opts.user;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 1) {
      content = `${opts.user}\n\nYour previous reply was rejected: ${lastError}\nReturn only JSON that matches the schema.`;
    }
    // Fallbacks re-run a request the safety classifiers decline on Anthropic's
    // recommended model for that refusal category, instead of failing the run.
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: opts.effort ?? 'medium', format },
      system: opts.system,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') throw new PassError('Claude declined this request.');
    if (response.stop_reason === 'max_tokens') { lastError = 'the reply was cut off at the length limit'; continue; }
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      lastError = 'it was not valid JSON';
      continue;
    }
    const parsed = opts.schema.safeParse(json);
    if (parsed.success) return parsed.data;
    lastError = `it did not match the schema (${parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')})`;
  }
  throw new PassError(`Claude returned invalid output twice: ${lastError}`);
}
