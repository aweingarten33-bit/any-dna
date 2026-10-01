# Spinoff

Give Spinoff an app that already works and an audience. It reads the app's real App Store listing and its 1 to 3 star reviews, then returns a startup blueprint: the app's DNA, what survives and what breaks for the new audience, the new idea, real competitors with real prices, a 5-item MVP, and a go or no-go.

It doesn't build the app or predict revenue. It tells you whether the idea is worth testing.

## The flow

One screen at a time:

1. **Home**: the original homepage. Type an app name or paste an App Store link. The **+** button picks the App Store region.
2. **Confirm**: icon, name, rating, category and price. "Is this the right app?" If the name matched several apps, you can step through the other matches.
3. *Divider*, then **Audience**: chips (Dog owners, Home cooks, Jam band fans, Fantasy sports players, Side hustlers, Renters, Travelers) or free text.
4. **Loading**: a checklist that ticks off *Reading the app → Mining reviews → Building your idea → Checking competitors*. If a step fails, you can retry from that step.
5. *Divider*, then **Result**: six swipeable cards: DNA · What survives and what breaks · The idea · Competitors · MVP · Verdict.
6. **Saved ideas** (the top-right menu): every blueprint, with **Try a different audience**. That rerun reuses the cached app data and only runs the passes that depend on the audience.

## Where every claim comes from

| Shown | Source | Label |
|---|---|---|
| App name, rating, category, upfront price | Apple iTunes Lookup/Search API | From App Store |
| Complaint themes, review counts, quoted reviews | Fetched reviews. Claude groups them and cites review IDs; the code counts the IDs and copies the review text verbatim | From N reviews |
| Competitor names, prices, ratings | App Store search for the new idea's search terms. Claude can only pick apps from that list by ID; the code drops unknown IDs and fills in names and prices itself | From App Store |
| DNA, fit check, the idea, MVP, verdict, overlap notes | Claude's judgment | Unverified |

The verdict is **go** only if the idea passes all five checks: understandable, desirability of at least 7/10, the core loop does real work, it doesn't already exist, and it has no gimmick. A "go" that fails a check is changed to no-go in code.

**Known data limits**
- Apple's API reports only the upfront price. In-app purchase and subscription prices aren't available, so they're never shown as fact.
- Apple's public review feed returns roughly the 500 most recent reviews per country.

## Architecture

```
src/                         React + Vite web app (mobile first)
  screens/home.tsx           the original homepage
  screens/flow.tsx           confirm, dividers, audience, loading checklist
  screens/result.tsx         the six blueprint cards
  screens/saved.tsx          saved ideas
  lib/run.ts                 runs the steps in order; retries from the failed step
  lib/ideas-store.ts         saved ideas on the device (swap for Supabase when auth lands)
supabase/
  migrations/                app_cache and ideas tables
  functions/resolve-app      step 1: link or name → App Store listing(s)
  functions/get-reviews      step 2: 1 to 3 star reviews via a swappable provider
  functions/run-pass         step 3: dissect · gaps · fit_check · mutate · verdict
  functions/_shared/         Apple client, review providers, cache, prompts, schemas
dev/                         local server + fictional fixture data for demo mode
tests/                       pipeline tests (Deno)
```

Each pass is its own request, so no single edge function runs long. Each pass returns JSON constrained by a schema (structured outputs), is validated with Zod, and is retried once if invalid. The `dissect` and `gaps` passes don't depend on the audience, so they're cached in `app_cache` next to the listing and reviews.

### Prompts

The pass prompts are adapted from the four workbench prompts:

- **Prompt 1 (Research)** supplies the rules every pass follows: use only the supplied data, separate what happened from why, and treat "unknown" as a correct answer.
- **Prompts 1 and 2 (Research, Extract DNA)** feed `dissect`: why the app works, not what it is, with mechanics stripped of their topic and the HotelTonight/GasBuddy depth examples.
- **Prompt 3 (Generate)** feeds `mutate`: a real user, a repeatable loop, buildable by one person, consumer-first, the 5-second test, and no generic assistants or habit trackers. The "[source] for [X]" rejection is dropped on purpose, since moving a proven app to a new audience is what Spinoff does. A plain reskin is still rejected.
- **Prompt 4 (Filter)** becomes `verdict`: the blunt-stranger checks, run against the fetched competitor list instead of memory.

The prompts' mode instructions (Repurpose, ×1000, 2056, Different Angle, Collide) aren't used.

## Setup

You need a Supabase project, the [Supabase CLI](https://supabase.com/docs/guides/cli), Node 20+ and an Anthropic API key.

```bash
npm install

# Backend
supabase link --project-ref YOUR-PROJECT-REF
supabase db push                                    # creates app_cache and ideas
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy resolve-app get-reviews run-pass

# Frontend
cp .env.example .env.local    # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Optional secrets:

| Secret | Default | Purpose |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for every pass. `claude-sonnet-5-5` is cheaper. |
| `REVIEW_PROVIDER` | `apple-rss` | `apple-rss`, `scraper` (fill in `scraperProvider` in `_shared/reviews.ts`), or `none` |

Claude requests use server-side fallbacks (`fallbacks: "default"`). If a request is declined by a safety classifier, it re-runs on Anthropic's recommended fallback model instead of failing.

**Cost:** one full run makes five Claude calls (three when you try a different audience). On Opus 5.5 I estimate it costs well under a dollar per run, but I haven't measured it.

## Local development

Local development needs [Deno](https://deno.com) 2.

```bash
npm run functions:demo   # all three functions on :54321 with fictional demo data, no key or network
npm run functions:dev    # same, but real Apple + Claude (export ANTHROPIC_API_KEY first)
VITE_SUPABASE_URL=http://localhost:54321 npm run dev

npm run functions:test   # pipeline tests
npm run typecheck
```

Without `SUPABASE_URL`, the functions cache in memory.

## Adding auth later

The `ideas` table already has `device_id` and `user_id` columns and an owner-only RLS policy. To add accounts, implement the `IdeaStore` interface in `src/lib/ideas-store.ts` against that table and swap it in. Nothing else changes.
