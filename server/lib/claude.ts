// Claude, used when AI_PROVIDER=claude or when only ANTHROPIC_API_KEY is set.
// Model: CLAUDE_MODEL (default claude-opus-5-5).
import Anthropic from 'npm:@anthropic-ai/sdk@^0.129.0';
import { PassError, type GenerateRequest } from './ai.ts';

const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5';

let client: Anthropic | null = null;
function anthropic() {
  if (client) return client;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new PassError('ANTHROPIC_API_KEY is not set on the server.');
  client = new Anthropic({ apiKey });
  return client;
}

export async function claudeGenerate(req: GenerateRequest): Promise<{ text: string; truncated: boolean }> {
  // Structured outputs constrain the reply to the schema. Fallbacks re-run a
  // request the safety classifiers decline on Anthropic's recommended model.
  const response = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: req.effort, format: { type: 'json_schema', schema: req.schema } },
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
  });
  if (response.stop_reason === 'refusal') throw new PassError('Claude declined this request.');
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  return { text, truncated: response.stop_reason === 'max_tokens' };
}
