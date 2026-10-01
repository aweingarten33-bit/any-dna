# Spinoff

Drop anything (a photo, a video, a song, a document, or a few words), say who it's for, and get a real app idea that's recognizably inspired by it, with a blueprint to build it.

## The flow

1. **Drop anything.** A pasted Spotify, Apple Music, YouTube, TikTok, Instagram or GitHub link, a photo, video (4 still frames are taken on the phone), song (its title and artist are read from the file), PDF, Word doc, or typed words such as a song title.
2. **Who's it for.** Suggested audiences for the upload, a free-text option, and an optional "Anything else?" box for the niche or the feel.
3. **How should it think?** An optional mode (Repurpose, ×1000, 30 years from now, Different angle, or Collide with a second source), and optional templates, each a trick from a real app (a countdown like Too Good To Go, a map like Find My, a streak like Duolingo...), shown with a preview of the screen it makes.
4. **Inventing your app.** The four canonical prompts run in order (below). What each stage finds appears as it lands. If the upload names a song or film the AI doesn't actually know, it asks the user what it's about instead of guessing.
5. **Pick your app** from the ideas that passed.
6. **The blueprint:** the idea (the pattern underneath, how it works, the killer feature, the callbacks to the upload), Build it (a phone mockup in the template's layout, first-version features, a copy-paste build prompt, links to Lovable, Bolt, Replit, Claude Code and Cursor, a four-week plan), real App Store competitors, a business plan on request, and where it came from. Save as PDF prints a paper-styled report.

Ideas are saved on the device. Uploads are never stored.

## The main system prompt

The owner's **Any DNA** prompt, word for word, in `server/lib/prompts.ts`: an outer wrapper, the four canonical Workbench prompts, the mode instructions and side rules. The app's own additions sit beside them in `server/lib/prompt-additions.ts`. See `docs/PROMPTS.md` for exactly what each step sends.

| Step | Prompt | What it does |
|---|---|---|
| `research` | Canonical Prompt 1 | Why the source works: the core loop, why it works, its conditions, the unknowns, plus 3–6 source details for callbacks |
| `dna` | Canonical Prompt 2 | 3–4 transferable mechanics, strongest first |
| `generate` | Canonical Prompt 3 + the mode | The best 3 ideas for the audience, in the picked mode (Repurpose, ×1000, 30 Years From Now, Different Angle, Collide) |
| `filter` | Canonical Prompt 4 | A blunt stranger keeps or rejects each idea, using real App Store search results. If all fail, the app generates again with the reasons, up to 2 times, then says honestly that nothing passed |

Source contents go inside `<source>` tags and are treated as material, never instructions. The AI is told exactly what was and wasn't available (for example, that a song's audio was never heard).

Real data: competitors, prices and ratings come from Apple's App Store search; song facts come from Apple Music search. The AI never supplies them.

## Architecture

- `src/`: the web app (Vite, React, TypeScript, Tailwind).
- `server/main.ts`: a Deno server for the API (`/api/flow-pass`) and the built site.
- `server/lib/passes.ts`: the prompts. `handlers.ts`: the steps, upload checks, and jobs. `templates.ts`: the templates.
- Each AI step runs as a server job. A request waits up to 20 seconds and then answers "pending"; the browser checks in again (sending only the upload's fingerprint, not the file) and joins the same job.

### AI provider

**Muse** (Meta Model API, `muse-spark-1.3`) runs every step. The JSON Schema for each step goes into Muse's instructions, and the reply is validated in code and retried once if invalid. Requests are sent with `store: false`, and contributor-tier models (which let Meta train on prompts) are refused at startup. Claude is available as an alternative: set `AI_PROVIDER=claude` and `ANTHROPIC_API_KEY`.

## Deploy on Render

One **web service** (Node runtime):

| Setting | Value |
|---|---|
| Build command | `npm run render-build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `META_MODEL_API_KEY` | **yes** | | Muse key from the Meta Model API |
| `META_MODEL` | no | `muse-spark-1.3` | Muse model (standard tier only) |
| `AI_CALLS_PER_HOUR` | no | `60` | Per visitor (a run is about 6 calls; up to 12 with retries or Collide) |
| `AI_CALLS_PER_DAY` | no | `1000` | Across all visitors |
| `GITHUB_TOKEN` | no | | Raises GitHub's limit for reading pasted repos (60 an hour without it). Any token, no scopes needed |

## Local development

```bash
npm install
npm run api:demo     # API on :8000 with fictional demo data: no key or network needed
npm run dev          # web app on :5173; /api is forwarded to :8000
npm run api:dev      # real Muse instead of demo data (export META_MODEL_API_KEY first)
npm test
npm run typecheck
```

## Skills for AI assistants

`.claude/skills/` holds frontend-design, webapp-testing, systematic-debugging and prompt-engineering (see `skills-lock.json` for sources).
