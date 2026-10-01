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

// ---- The front door: literally anything can be the source ---------------------

/** What the user dropped in, as the browser sends it. The bytes travel with each request and are never stored. */
export type Upload =
  /** Typed words. A song file also arrives as text (its title and artist), marked so the AI is told the audio wasn't heard. */
  | { kind: 'text'; text: string; from?: 'song-file' }
  | { kind: 'photo'; dataUrl: string; filename: string }
  /** Still frames taken on the phone; the video itself is never uploaded. */
  | { kind: 'video'; frames: string[]; filename: string }
  | { kind: 'document'; dataUrl: string; filename: string }
  /** A pasted supported public link. The server reads only that source's public preview/content. */
  | { kind: 'link'; url: string };

/** One turn of the new single-call creative exercise. */
export type ExerciseTurn = {
  /** One short sentence: what is actually worth stealing from the source. */
  take: string;
  dna: Array<{ name: string; explanation: string }>;
  ideas: Array<{
    name: string;
    pitch: string;
    what_you_do: string;
    why_youd_use_it: string;
    first_version: string;
  }>;
  /** Natural reactions the person can tap to steer the next turn. */
  reactions: Array<{ label: string; instruction: string }>;
};

/** The full output of the old generate pass. Kept for saved ideas and the old result tools. */
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

export type NewPassName = 'exercise' | 'suggest' | 'research' | 'dna' | 'generate' | 'filter' | 'compete' | 'kit' | 'plan';

/** Prompt 3's optional modes the app offered before the conversational exercise. */
export type GenerateMode = 'repurpose' | 'x1000' | 'future' | 'angle';

/** Prompt 1: why the source works. */
export type SourceResearch = {
  /** False when the source names a song, film or other work the AI doesn't actually know and nothing fetched describes it. */
  recognized: boolean;
  core_sequence: string;
  why_it_works: string;
  conditions: string[];
  uncertainties: string[];
  /** 3–6 concrete source details for callbacks later. Not DNA. */
  source_details: string[];
};

/** Prompt 2: the transferable mechanisms, strongest first. */
export type DnaMechanism = { name: string; how_it_works: string; why_it_works: string; needs: string; transferability: string; chain: string };

/** Prompts 1 and 2 together: what later stages and the Origin panel read. */
export type UploadRead = { research: SourceResearch; dna: DnaMechanism[] };

/** Prompt 4's result: the ideas that passed, best first, and why the rest didn't. */
export type FilterResult = {
  kept: GeneratedIdea[];
  rejected: Array<{ name: string; reason: string }>;
  /** The App Store search already done for each kept idea (same order), so opening one needs no second search. */
  found?: Array<{ competitors: Competitor[]; searched: CompetitorListing[] }>;
};

/** Everything one old-flow run produces. */
export type NewBlueprint = {
  /** 4 since the ANY DNA prompts (research and DNA are separate stages). */
  version: 4;
  /** What was uploaded, by kind and a short label. Never the bytes. */
  upload: { kind: Upload['kind']; label: string };
  audience: string;
  /** What the user typed to direct it (niche, feel, what it should do), if anything. */
  direction?: string;
  /** The template id when the user steered it, or null when they skipped it. */
  templateId: string | null;
  /** Prompt 3's mode, if one was picked. */
  mode?: GenerateMode | 'collide' | null;
  /** Collide: the second source, by kind and label, and its research and DNA. */
  second?: { kind: Upload['kind']; label: string; read: UploadRead };
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
  output_json: NewBlueprint | LegacyBlueprint;
};

/** Ideas saved by earlier versions. They can't be shown any more; only their name is kept. */
export type LegacyBlueprint = { version?: 1 | 2 | 3; idea: { name: string }; audience: string };

/** Ideas made by the previous pipeline are version 4. */
export function isNewBlueprint(blueprint: NewBlueprint | LegacyBlueprint): blueprint is NewBlueprint {
  return blueprint.version === 4;
}
