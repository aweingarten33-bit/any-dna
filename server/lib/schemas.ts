// What each pass must return. Zod validates the reply; the same schema, turned
// into JSON Schema, constrains the model's output.
import { z } from 'npm:zod@^4.1.0';

export const dissectSchema = z.object({
  core_loop: z.string(),
  frequency_required: z.string(),
  reward_type: z.string(),
  retention_lever: z.string(),
  monetization_trigger: z.string(),
  network_effect: z.string(),
  dependencies: z.array(z.string()),
  why_it_works: z.string(),
  unknowns: z.array(z.string()),
});

/** The model cites review IDs; code turns them into counts and verbatim examples. */
export const gapsModelSchema = z.object({
  themes: z.array(z.object({
    theme: z.string(),
    review_ids: z.array(z.string()),
    about: z.enum(['mechanic', 'subject']),
  })),
});

export const fitCheckSchema = z.object({
  components: z.array(z.object({
    component: z.string(),
    status: z.enum(['survives', 'adapts', 'breaks']),
    audience_behavior: z.string(),
    reason: z.string(),
    replacement: z.string(),
  })),
});

export const ideaSchema = z.object({
  name: z.string(),
  pitch: z.string(),
  core_loop: z.string(),
  what_broke_and_replaced: z.string(),
  first_session_flow: z.array(z.string()),
  differentiator_from_gaps: z.string(),
  mvp: z.array(z.string()),
  monetization: z.string(),
  main_risk: z.string(),
  search_terms: z.array(z.string()),
});

/** The idea, from its own call. */
export const ideaOnlySchema = z.object({ idea: ideaSchema });

const UNSUPPORTED = ['$schema', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format'];

/** JSON Schema for structured outputs: every object closed, every property required. */
export function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) if (!UNSUPPORTED.includes(key)) out[key] = clean(value);
    if (out.type === 'object' && out.properties) {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties as object);
    }
    return out;
  };
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}
