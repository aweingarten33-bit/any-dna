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

export type Dissect = {
  core_loop: string;
  frequency_required: string;
  reward_type: string;
  retention_lever: string;
  monetization_trigger: string;
  network_effect: string;
  dependencies: string[];
  why_it_works: string;
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

export type FitComponent = {
  component: string;
  status: 'survives' | 'adapts' | 'breaks';
  audience_behavior: string;
  reason: string;
  replacement: string;
};

export type FitCheck = { components: FitComponent[] };

export type Idea = {
  name: string;
  pitch: string;
  core_loop: string;
  what_broke_and_replaced: string;
  first_session_flow: string[];
  differentiator_from_gaps: string;
  /** The smallest version that tests the core loop, at most 5 features. */
  mvp: string[];
  monetization: string;
  main_risk: string;
  search_terms: string[];
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

/** Saved ideas from before the competitor check was plain code still carry this. */
export type LegacyVerdict = { competitors: Competitor[]; mvp: string[]; monetization: string; main_risk: string };

export type PassName = 'dissect' | 'gaps' | 'build' | 'compete';

export type PassOutputs = {
  dissect: Dissect;
  gaps: Gaps;
  build: { fit_check: FitCheck; idea: Idea };
  compete: { competitors: Competitor[]; searched: CompetitorListing[] };
};

/** Everything one run produces. Saved on the device as ideas.output_json. */
export type Blueprint = {
  app: AppListing;
  audience: string;
  reviews: ReviewsSummary;
  dissect: Dissect;
  gaps: Gaps;
  fit_check: FitCheck;
  idea: Idea;
  /** Every App Store search result for the idea's search terms. */
  searched: CompetitorListing[];
  /** The closest of those: the apps that came up for the most searches, then the highest ranked. */
  competitors: Competitor[];
  /** Only on ideas saved before the change. */
  verdict?: LegacyVerdict;
};

export type SavedIdea = {
  id: string;
  created_at: string;
  source_app_id: string;
  audience: string;
  output_json: Blueprint;
};
