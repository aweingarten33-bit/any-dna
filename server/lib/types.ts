// Shapes shared by the edge functions and the web app. Type-only: no imports,
// so both Deno and Vite can read this file.

/** An App Store listing, exactly as Apple's public lookup/search API reports it. */
export type AppListing = {
  app_id: string;
  country: string;
  name: string;
  developer: string;
  icon: string;
  rating: number | null;
  rating_count: number | null;
  /** Upfront price. Apple's API does not list in-app purchase or subscription prices. */
  price: number | null;
  formatted_price: string;
  currency: string | null;
  category: string;
  genres: string[];
  description: string;
  url: string;
};

export type Review = {
  id: string;
  rating: number;
  title: string;
  body: string;
  updated: string | null;
};

export type ReviewsSummary = {
  app_id: string;
  provider: string;
  /** 1 to 3 star reviews kept for analysis. */
  low_star_count: number;
  /** All reviews the provider returned before filtering. */
  scanned_count: number;
  fetched_at: string;
};

// ---- Pass outputs -------------------------------------------------------

/** Why the source app works, in plain words (workbench Prompts 1 and 2). */
export type Dissect = {
  what_it_is: string;
  what_people_do: string;
  why_it_works: string;
  how_it_makes_money: string;
  /** The 3 or 4 ideas inside the app that would still work somewhere else, strongest first. */
  tricks: Array<{ name: string; how_it_works: string; needs: string }>;
  unknowns: string[];
};

export type Complaint = {
  theme: string;
  /** Counted in code from the reviews the model cited, not estimated by the model. */
  evidence_count: number;
  /** A verbatim review, copied in code from the fetched data. */
  example: string;
  /** "mechanic": about how the app works, so it can carry over. "subject": about the app's own topic. */
  about: 'mechanic' | 'subject';
};

export type Gaps = { repeated_complaints: Complaint[] };

export type Idea = {
  name: string;
  pitch: string;
  who_its_for: string;
  /** What you do and what the app does back, step by step. */
  how_it_works: string[];
  /** The trick it borrows from the source app, in plain words. */
  borrowed_trick: string;
  whats_different: string;
  fixes_complaint: string;
  mvp: string[];
  monetization: string;
  main_risk: string;
  search_terms: string[];
};

/** Content for the phone mockup and the build plan. Written after the run, in the background. */
export type Kit = {
  screen: {
    title: string;
    greeting: string;
    hero_label: string;
    hero_value: string;
    primary_action: string;
    cards: Array<{ title: string; detail: string; tag: string }>;
    tabs: string[];
  };
  plan: Array<{ when: string; goal: string; done_when: string }>;
};

export type BusinessPlan = {
  summary: string;
  customer: string;
  problem: string;
  solution: string;
  revenue: { model: string; price_to_test: string; why: string };
  launch_costs: Array<{ item: string; estimate: string }>;
  first_100_users: string[];
  milestones: Array<{ when: string; goal: string }>;
  risks: Array<{ risk: string; plan: string }>;
};

/** An app found by searching the App Store for the new idea. Every field is fetched data. */
export type CompetitorListing = Pick<AppListing, 'app_id' | 'name' | 'developer' | 'icon' | 'rating' | 'rating_count' | 'price' | 'formatted_price' | 'category' | 'url'> & {
  matched_term: string;
  /** Every search term this app came up for. */
  matched_terms?: string[];
};

export type Competitor = CompetitorListing & {
  /** Why it's listed: which searches it came up for. */
  overlap: string;
};

export type PassName = 'dissect' | 'gaps' | 'build' | 'compete' | 'kit' | 'plan';

export type PassOutputs = {
  dissect: Dissect;
  gaps: Gaps;
  build: { idea: Idea };
  compete: { competitors: Competitor[]; searched: CompetitorListing[] };
  kit: Kit;
  plan: BusinessPlan;
};

/** Everything one run produces. Saved on the device as ideas.output_json. */
export type Blueprint = {
  /** 2 since the plain-language rewrite. Older saves have no version and a different shape. */
  version: 2;
  app: AppListing;
  audience: string;
  reviews: ReviewsSummary;
  dissect: Dissect;
  gaps: Gaps;
  idea: Idea;
  /** Every App Store search result for the idea's search terms. */
  searched: CompetitorListing[];
  /** The closest of those: the apps that came up for the most searches, then the highest ranked. */
  competitors: Competitor[];
  /** Filled in after the run. */
  kit?: Kit;
  /** Made when the person asks for it. */
  plan?: BusinessPlan;
};

// ---- The new front door: ideas from the upload itself ------------------------

/** What the user dropped in, as the browser sends it. The bytes travel with each request and are never stored. */
export type Upload =
  | { kind: 'text'; text: string }
  | { kind: 'photo'; dataUrl: string; filename: string }
  /** Still frames taken on the phone; the video itself is never uploaded. */
  | { kind: 'video'; frames: string[]; filename: string }
  | { kind: 'document'; dataUrl: string; filename: string };

/** The full output of the new generate pass. */
export type GeneratedIdea = {
  name: string;
  tagline: string;
  what_it_is: string;
  pattern: string;
  job: string;
  how_it_works: string[];
  killer_feature: string;
  callbacks: Array<{ detail: string; meaning: string }>;
  what_its_not: string;
  why_use: string;
  mvp: string[];
  monetization: string;
  main_risk: string;
  search_terms: string[];
};

export type NewPassName = 'suggest' | 'read' | 'invent' | 'filter' | 'compete' | 'kit' | 'plan';

/** Stages 1 and 2 of the main prompt: the upload researched, and its DNA. */
export type UploadRead = {
  /** False when the upload names a song, film or other work the AI doesn't actually know. */
  recognized: boolean;
  details: string[];
  meaning: string;
  why_different: string;
  conditions: string;
  unknowns: string[];
  mechanics: Array<{ name: string; chain: string; how_it_works: string; why_it_works: string; needs: string; transferable: string }>;
};

/** Everything one new-flow run produces. */
export type NewBlueprint = {
  /** 3 for the upload-first rewrite. */
  version: 3;
  /** What was uploaded, by kind and a short label. Never the bytes. */
  upload: { kind: Upload['kind']; label: string };
  audience: string;
  /** What the user typed to direct it (niche, feel, what it should do), if anything. */
  direction?: string;
  /** The template id when the user steered it, or null when they skipped it. */
  templateId: string | null;
  /** Stages 1 and 2: what the upload is and its DNA. */
  read: UploadRead;
  idea: GeneratedIdea;
  /** Every App Store search result for the idea's search terms. */
  searched: CompetitorListing[];
  /** The closest of those: the apps that came up for the most searches, then the highest ranked. */
  competitors: Competitor[];
  /** Filled in after the run. */
  kit?: Kit;
  /** Made when the person asks for it. */
  plan?: BusinessPlan;
};

export type SavedIdea = {
  id: string;
  created_at: string;
  source_app_id: string;
  audience: string;
  output_json: Blueprint | NewBlueprint;
};

/** The new front door saves NewBlueprint (version 3); the old flow saved Blueprint (version 2). */
export function isNewBlueprint(blueprint: Blueprint | NewBlueprint): blueprint is NewBlueprint {
  return blueprint.version === 3;
}
