// Meta Muse through the Meta Model API (Responses API).
// Key: META_MODEL_API_KEY. Model: META_MODEL (default muse-spark-1.3).
import { PassError, type GenerateRequest } from './ai.ts';

const ENDPOINT = 'https://api.meta.ai/v1/responses';
const MODEL = Deno.env.get('META_MODEL') ?? 'muse-spark-1.3';

// The contributor tier lets Meta train on prompts, which would include users' ideas.
if (/contributor/i.test(MODEL)) throw new Error('META_MODEL must not be a contributor-tier model: it allows training on prompts.');

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (!Array.isArray(payload.output)) return '';
  return payload.output.flatMap((item) => {
    const content = (item as { content?: unknown })?.content;
    return Array.isArray(content) ? content.map((part) => (part as { text?: unknown })?.text).filter((text): text is string => typeof text === 'string') : [];
  }).join('\n');
}

export async function museGenerate(req: GenerateRequest): Promise<{ text: string; truncated: boolean }> {
  const key = Deno.env.get('META_MODEL_API_KEY');
  if (!key) throw new PassError('META_MODEL_API_KEY is not set on the server.');

  let lastError = '';
  // One retry for network errors, rate limits and server errors.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    const sent = Date.now();
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          store: false,
          max_output_tokens: 8000,
          reasoning: { effort: req.effort },
          instructions: `${req.system}\n\nReturn exactly one JSON object and nothing else: no markdown, no commentary. It must match this JSON Schema:\n${JSON.stringify(req.schema)}`,
          input: req.user,
        }),
      });
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError' ? 'Muse timed out' : 'could not reach Muse';
      console.error(`[muse] attempt ${attempt + 1}: ${lastError}`);
      // A timed-out call already used two minutes; another would leave the user waiting four.
      if (error instanceof Error && error.name === 'TimeoutError') break;
      continue;
    }

    if (response.status === 401 || response.status === 403) throw new PassError('Muse rejected the API key. Check META_MODEL_API_KEY.');
    if (response.status === 404) throw new PassError(`Muse model "${MODEL}" is not available on this key. Check META_MODEL.`);
    if (response.status === 429 || response.status >= 500) {
      lastError = `Muse returned HTTP ${response.status}`;
      console.error(`[muse] attempt ${attempt + 1}: ${lastError} ${(await response.text().catch(() => '')).slice(0, 200)}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      console.error(`[muse] HTTP ${response.status}: ${detail}`);
      throw new PassError(`Muse returned HTTP ${response.status}. ${detail}`.trim());
    }

    const payload = await response.json() as Record<string, unknown>;
    const incomplete = typeof payload.status === 'string' && payload.status !== 'completed';
    const usage = payload.usage as { output_tokens?: number } | undefined;
    console.log(`[muse] ${req.effort} effort, ${((Date.now() - sent) / 1000).toFixed(1)}s, ${usage?.output_tokens ?? '?'} output tokens, status ${payload.status}`);
    return { text: outputText(payload), truncated: incomplete };
  }
  throw new PassError(`Muse failed: ${lastError}. Please try again.`);
}
