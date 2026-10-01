// What each pass must return. Zod validates the reply; the same schema, turned
// into JSON Schema, constrains the model's output.
import { z } from 'npm:zod@^4.1.0';


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


/** Prompt 1 — Research. */
export const researchSchema = z.object({
  recognized: z.boolean(),
  core_sequence: z.string(),
  why_it_works: z.string(),
  conditions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  source_details: z.array(z.string()),
});

/** Prompt 2 — Extract DNA. */
export const dnaSchema = z.object({
  mechanisms: z.array(z.object({
    name: z.string(),
    how_it_works: z.string(),
    why_it_works: z.string(),
    needs: z.string(),
    transferability: z.string(),
    chain: z.string(),
  })),
});

/** Prompts 1 and 2 as later stages receive them back from the browser. */
export const readSchema = z.object({ research: researchSchema, dna: dnaSchema.shape.mechanisms });

/** Prompt 3 — Generate: the best 3 ideas. */
export const inventSchema = z.object({ ideas: z.array(generateSchema) });

/** Prompt 4 — Filter: keep or reject, desirability score, one-line reason, per idea. */
export const filterSchema = z.object({
  verdicts: z.array(z.object({ index: z.number(), keep: z.boolean(), desirability: z.number(), reason: z.string() })),
});

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
