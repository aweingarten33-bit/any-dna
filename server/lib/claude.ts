// Claude, used when AI_PROVIDER=claude or when only ANTHROPIC_API_KEY is set.
// Model: CLAUDE_MODEL (default claude-opus-5-5).
import Anthropic from 'npm:@anthropic-ai/sdk@^0.129.0';
import { PassError, splitDataUrl, type GenerateRequest, type UserContent } from './ai.ts';

const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5';

let client: Anthropic | null = null;
function anthropic() {
  if (client) return client;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new PassError('ANTHROPIC_API_KEY is not set on the server.');
  client = new Anthropic({ apiKey });
  return client;
}

/** Content parts become Anthropic blocks; plain strings pass through unchanged. */
function toContent(user: GenerateRequest['user']) {
  if (typeof user === 'string') return user;
  return (user as UserContent[]).map((part) => {
    if (part.type === 'text') return { type: 'text' as const, text: part.text };
    const { mime, base64 } = splitDataUrl(part.dataUrl);
    if (part.type === 'image') {
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: mime as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 },
      };
    }
    return {
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: mime as 'application/pdf', data: base64 },
    };
  });
}

export async function claudeGenerate(req: GenerateRequest): Promise<{ text: string; truncated: boolean }> {
  const response = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: req.maxOutputTokens ?? 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: req.effort, format: { type: 'json_schema', schema: req.schema } },
    system: req.system,
    messages: [{ role: 'user', content: toContent(req.user) }],
  });
  if (response.stop_reason === 'refusal') throw new PassError('Claude declined this request.');
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  return { text, truncated: response.stop_reason === 'max_tokens' };
}
