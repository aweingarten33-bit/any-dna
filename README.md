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
| Complaint themes, review counts, quoted reviews | Fetched reviews. The AI groups them and cites review IDs; the code counts the IDs and copies the review text verbatim | From N reviews |
| Competitors, with names, prices, ratings | App Store search for the new idea's search terms. Code, not the AI, keeps the 5 apps that came up for the most searches, then by search rank | From App Store |
| DNA, the idea, mockup content, build plan, business plan | The AI's judgment | Unverified |

**Known data limits**
- Apple's API reports only the upfront price. In-app purchase and subscription prices aren't available, so they're never shown as fact.
- Apple's public review feed returns roughly the 500 most recent reviews per country.

## Architecture

One web service: a Deno server that answers the API at `/api/*` and serves the built web app for everything else.

```
src/                         React + Vite web app (mobile first)
  screens/home.tsx           the original homepage
  screens/flow.tsx           confirm, dividers, audience, loading checklist
  screens/result.tsx         the six blueprint cards
  screens/saved.tsx          saved ideas
  lib/run.ts                 runs the steps in order; retries from the failed step
  lib/ideas-store.ts         saved ideas on the device (swap for a server store when accounts land)
server/
  main.ts                    the web server: /api routes, rate limits, static files
  schema.sql                 app_cache and ideas tables (applied on startup)
  lib/handlers.ts            resolve-app · get-reviews · run-pass
  lib/passes.ts              the prompts: dissect · gaps · build · kit · plan (see docs/PROMPTS.md)
  lib/ai.ts                  one structured AI call: validate with Zod, retry once
  lib/muse.ts, lib/claude.ts the AI providers
  lib/itunes.ts              Apple's App Store API
  lib/reviews.ts             swappable review providers
  lib/cache.ts               Postgres cache (memory without DATABASE_URL)
dev/                         local API server + fictional fixture data for demo mode
tests/                       pipeline tests (Deno)
```

Each pass is its own request, so no single request runs long. A run is 3 AI calls in 2 rounds: reading the app and mining the reviews run at the same time, then the idea. Competitors are then found by an App Store search in plain code, which takes about a second. When the blueprint opens, a fourth call writes the phone mockup's content and the four-week plan in the background; the business plan is a fifth call, made only when asked for. The build prompt is assembled in code from the idea, so it costs no AI time. Every prompt shares one set of writing rules (plain words, concrete examples, a list of banned jargon). A pass that runs longer than 20 seconds answers "pending" and the browser asks again, joining the same job. Each pass returns JSON matching a schema, is validated with Zod, and is retried once if invalid. The `dissect` and `gaps` passes don't depend on the audience, so they're cached next to the listing and reviews.

"Save as PDF" prints a separate, paper-styled report (`src/screens/report.tsx`) that only appears when printing.

### AI provider

**Muse** (Meta Model API, `muse-spark-1.3`) runs every pass. The JSON Schema for each pass goes into Muse's instructions, and the reply is validated in code. Requests are sent with `store: false`, and contributor-tier models (which let Meta train on prompts) are refused at startup.

Claude is available as an alternative: set `AI_PROVIDER=claude` and `ANTHROPIC_API_KEY`. It's also used automatically if only an Anthropic key is set.

### Prompts

The pass prompts are adapted from the four workbench prompts:

- **Prompt 1 (Research)** supplies the rules every pass follows: use only the supplied data, separate what happened from why, and treat "unknown" as a correct answer.
- **Prompts 1 and 2 (Research, Extract DNA)** feed `dissect`: why the app works, not what it is, with mechanics stripped of their topic and the HotelTonight/GasBuddy depth examples.
- **Prompt 3 (Generate)** feeds `build`: privately sketch at least 3 candidates and keep the best, a real person, a repeatable reason to come back, buildable by one person, consumer-first, the 5-second test, and no generic assistants or habit trackers. The "[source] for [X]" rejection becomes "only changing the topic is a reskin", since moving a proven app to a new audience is what Spinoff does.
- **Prompt 4 (Filter)** runs inside `build` as a private self-check that fixes the idea before it's returned, instead of a go/no-go verdict shown to the user.

The full comparison is in [docs/PROMPTS.md](docs/PROMPTS.md).

The prompts' mode instructions (Repurpose, ×1000, 2056, Different Angle, Collide) aren't used.

## Deploy on Render

One **web service** (Node runtime) from this repo:

| Setting | Value |
|---|---|
| Build command | `npm run render-build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `META_MODEL_API_KEY` | **yes** | | Muse key from the Meta Model API |
| `META_MODEL` | no | `muse-spark-1.3` | Muse model (standard tier only) |
| `DATABASE_URL` | no | memory | Postgres for the App Store cache. Without it the cache resets on every deploy, which only costs speed. |
| `AI_CALLS_PER_HOUR` | no | `30` | Per visitor (one full run is 4 calls) |
| `AI_CALLS_PER_DAY` | no | `300` | Across all visitors; caps what strangers can spend |
| `REVIEW_PROVIDER` | no | `apple-rss` | `apple-rss`, `scraper` (fill in `scraperProvider` in `server/lib/reviews.ts`), or `none` |

Deno comes from npm (the `deno` package), so Render's Node runtime is all that's needed. The build caches the server's dependencies in `.deno/`, which the start command reuses.

## Local development

```bash
npm install
npm run api:demo     # API on :8000 with fictional demo data: no key or network needed
npm run dev          # web app on :5173; /api is forwarded to :8000

npm run api:dev      # real Apple + Muse instead of demo data (export META_MODEL_API_KEY first)
npm test             # pipeline tests
npm run typecheck
```

`TEST_DATABASE_URL=postgres://… npm test` also runs the pipeline against a real Postgres.

## Adding accounts later

The `ideas` table already has `device_id` and `user_id` columns. To add accounts, implement the `IdeaStore` interface in `src/lib/ideas-store.ts` against that table and swap it in.
