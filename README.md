# Spinoff

Drop anything (a photo, a video, a song, a document, or a few words), say who it's for, and get a real app idea that's recognizably inspired by it, with a blueprint to build it.

## The flow

1. **Drop anything.** A pasted Spotify, Apple Music, YouTube, TikTok, Instagram or GitHub link, a photo, video (4 still frames are taken on the phone), song (its title and artist are read from the file), PDF, Word doc, or typed words such as a song title.
2. **Who's it for.** Suggested audiences for the upload, a free-text option, and an optional "Anything else?" box for the niche or the feel.
3. **Add a proven trick?** Optional templates, each a trick from a real app (a countdown like Too Good To Go, a map like Find My, a streak like Duolingo...), shown with a preview of the screen it makes.
4. **Inventing your app.** The main system prompt runs in the four workbench stages (below). What each stage finds appears as it lands. If the upload names a song or film the AI doesn't actually know, it asks the user what it's about instead of guessing.
5. **Pick your app** from the ideas that passed.
6. **The blueprint:** the idea (the pattern underneath, how it works, the killer feature, the callbacks to the upload), Build it (a phone mockup in the template's layout, first-version features, a copy-paste build prompt, links to Lovable, Bolt, Replit, Claude Code and Cursor, a four-week plan), real App Store competitors, a business plan on request, and where it came from. Save as PDF prints a paper-styled report.

Ideas are saved on the device. Uploads are never stored.

## The main system prompt

It follows the owner's four workbench prompts, worded as close to the originals as the change of subject (an upload instead of a product) allows. The full text is in `server/lib/passes.ts`.

| Stage | Call | What it does |
|---|---|---|
| 1 Research + 2 Extract DNA | `read` | What the upload really is and means, then 3–4 transferable mechanics, strongest first |
| 3 Generate | `invent` | 6 private candidates, keep the best 3, with the original hard rejections and must-haves plus a callback rule |
| 4 Filter | `filter` | The blunt-stranger checks plus a resemblance check, using real App Store search results for "already exists". Only kept ideas are shown; the verdicts never are |

Everything the user typed or uploaded goes inside `<upload>` tags, with a rule that it is material to read, never instructions.

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
| `AI_CALLS_PER_HOUR` | no | `60` | Per visitor (a run is about 5 calls) |
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
