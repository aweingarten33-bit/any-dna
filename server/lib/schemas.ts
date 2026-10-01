// What each pass must return. Zod validates the reply; the same schema, turned
// into JSON Schema, constrains the model's output.
import { z } from 'npm:zod@^4.1.0';

export const dissectSchema = z.object({
  what_it_is: z.string(),
  what_people_do: z.string(),
  why_it_works: z.string(),
  how_it_makes_money: z.string(),
  tricks: z.array(z.object({ name: z.string(), how_it_works: z.string(), needs: z.string() })),
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

export const ideaSchema = z.object({
  name: z.string(),
  pitch: z.string(),
  who_its_for: z.string(),
  how_it_works: z.array(z.string()),
  borrowed_trick: z.string(),
  whats_different: z.string(),
  fixes_complaint: z.string(),
  mvp: z.array(z.string()),
  monetization: z.string(),
  main_risk: z.string(),
  search_terms: z.array(z.string()),
});

export const buildSchema = z.object({ idea: ideaSchema });

// ---- The new front door: ideas from the upload itself ----------------------
// The user drops anything (photo, document, typed words) and names an
// audience. No source app, no DNA extraction.

export const audienceSuggestSchema = z.object({
  audiences: z.array(z.string()),
});

export const generateSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  what_it_is: z.string(),
  pattern: z.string(),
  job: z.string(),
  how_it_works: z.array(z.string()),
  killer_feature: z.string(),
  callbacks: z.array(z.object({ detail: z.string(), meaning: z.string() })),
  what_its_not: z.string(),
  why_use: z.string(),
  mvp: z.array(z.string()),
  monetization: z.string(),
  main_risk: z.string(),
  search_terms: z.array(z.string()),
});

export const generateOutputSchema = z.object({ output: generateSchema });

export const kitSchema = z.object({
  screen: z.object({
    title: z.string(),
    greeting: z.string(),
    hero_label: z.string(),
    hero_value: z.string(),
    primary_action: z.string(),
    cards: z.array(z.object({ title: z.string(), detail: z.string(), tag: z.string() })),
    tabs: z.array(z.string()),
  }),
  plan: z.array(z.object({ when: z.string(), goal: z.string(), done_when: z.string() })),
});

export const planSchema = z.object({
  summary: z.string(),
  customer: z.string(),
  problem: z.string(),
  solution: z.string(),
  revenue: z.object({ model: z.string(), price_to_test: z.string(), why: z.string() }),
  launch_costs: z.array(z.object({ item: z.string(), estimate: z.string() })),
  first_100_users: z.array(z.string()),
  milestones: z.array(z.object({ when: z.string(), goal: z.string() })),
  risks: z.array(z.object({ risk: z.string(), plan: z.string() })),
});

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
