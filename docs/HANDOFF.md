# Handoff: Spinoff → the new project

Paste everything below the line into ChatGPT. It explains the project and tells it what to do.

---

## Prompt for ChatGPT

You're picking up a project from another AI assistant. Read this whole message before doing anything. The code is in the GitHub repo **aweingarten33-bit/app-dna** (branch `main`). Read `README.md`, `docs/PROMPTS.md` and this file before you start.

### Who you're working with

The owner isn't a developer and wants plain, logical answers: no jargon, no long surveys of options, and a clear recommendation. They care most about two things:

1. **Output quality is what sells.** The ideas and their wording must be great and must make sense to a normal person.
2. **Speed.** Runs must feel fast. They got very frustrated with multi-minute runs.

Things they explicitly rejected, so don't bring them back:

- A Go / No-go verdict. They don't want the app judging whether an idea is good; the user decides.
- Anything from a Mark Cuban speech they shared earlier (patents, bill of materials, vendors, incorporation, Delaware/NY/Texas filings). None of it is wanted.
- Extra "divider" screens between steps. Go straight to the next useful screen.
- Jargon in outputs ("core loop", "retention lever", "mechanic", "monetization trigger").

### What exists today: Spinoff

A mobile-first web app. You type the name of a successful App Store app and pick an audience. Spinoff then:

1. Pulls real data from Apple: the app's listing, its recent 1 to 3 star reviews, and real competitors with real prices.
2. Uses an AI to find the "tricks" that make the app work, and the complaints that repeat in its reviews.
3. Writes one new app idea that borrows those tricks for the new audience and designs out the complaints.

The results have five sections:

| Section | What's in it |
|---|---|
| The idea | Who it's for, how it works step by step, the borrowed trick, the complaint it fixes, the biggest risk |
| Build it | A phone mockup, the first-version features, a build prompt with a Copy button, links to Lovable (prompt pre-filled), Bolt and Replit, notes on Claude Code and Cursor, and a 4-week plan |
| Competitors | Real App Store search results |
| Business plan | Made only when the person taps the button |
| Where it came from | The original app's tricks and its review complaints |

There's also **Save as PDF**, which prints a clean report.

Technical details:

- **Stack:** Vite, React 19, TypeScript and Tailwind 4 on the front end. A Deno server (`server/main.ts`) serves the API and the built site.
- **Hosting:** Render, Starter plan, auto-deploys from `main`. Build command: `npm run render-build`. Start command: `npm start`.
- **AI provider:** Meta Muse (`muse-spark-1.3`) through Meta's Responses API, `https://api.meta.ai/v1/responses`, with saving turned off. The owner requires Muse. The key is in Render's environment settings as `META_MODEL_API_KEY`; never put it in code or chat. Claude is a fallback the code supports but doesn't use.
- **Prompts:** in `server/lib/passes.ts`. `docs/PROMPTS.md` compares them with the owner's 4 original "workbench" prompts: Research, Extract DNA, Generate and Filter.
- **Every AI step:** returns JSON matching a schema (`server/lib/schemas.ts`), is checked with Zod, and is retried once if invalid.
- **Long AI steps:** run as server jobs. A request waits up to 20 seconds, then answers "pending", and the browser asks again and joins the same job. This exists because long single requests were breaking on phones.
- **Speed lesson:** Muse's time depends on how much it writes, about 50 to 125 tokens a second. Keep AI outputs short. Run independent steps at the same time. Do anything that doesn't need AI (competitor search, the build prompt) in plain code.
- **Tests:** `npm test`, using fixtures in `dev/fixtures.ts`. `npm run api:demo` runs the app with fake data and needs no key.

### Why it's changing

A free tool already does "app ideas": RapidNative's "Free AI App Idea Generator" (rapidnative.com). It gives 5 ideas with made-up "market opportunity" scores and no real data. The ideas are shallow, often just a TV show's catchphrases turned into apps. It exists to sell RapidNative's app builder, which covers prompt to design, PRD to app, image to app and App Store deploys.

The lesson: don't compete on building apps. Compete on **what's worth building, grounded in real data**, then hand off to any builder.

### The new project

The owner wants a new front door, combining how **Kaiber AI** and **Videoleap** work.

**Step 1 — Drop anything.** Upload a photo (a selfie, your kids, a tree, a concert), a video, a song, a Word document or a PDF. Or describe something, or type an app's name as Spinoff does today.

**Step 2 — Tell us more (like Kaiber's describe step).** Who it's for and the niche. Suggest audiences based on what was dropped, as tappable choices, plus a free-text box.

**Step 3 — Pick a template (like Videoleap templates).**
- Each template is a proven trick from a real app. For example:
  - "Last-minute deal" (Too Good To Go)
  - "Crowd keeps it fresh" (GasBuddy)
  - "Don't break the streak" (Duolingo)
  - "See your people on a map" (Find My)
  - "Swipe to match" (Tinder)
- Include a "Surprise me" option that picks the best fit.
- Templates must fill in **automatically**, like Videoleap, not like a Word template you have to fill in yourself.

**Step 4 — The whole blueprint fills in by itself.** Use the same results as Spinoff today. Everything is editable afterward, and each section has its own "Redo" button.

**Keep the real-data edge.** Tie every template to a real App Store app, so its reviews, complaints and competitors are still fetched live from Apple.

What each input can be, as far as the previous assistant could find:

| Input | How to read it |
|---|---|
| Photo | Muse accepts images, by URL or uploaded file. Confirm the exact format before relying on it. |
| PDF | Muse lists PDFs as a supported input. |
| Video | Muse lists video as supported, but phone videos are large, so limit length and size. |
| Word doc | Extract the text on the server, then send it as text. |
| Song | Muse doesn't take audio. Read the title and artist from the file's tags, or ask the user, then look the song up with Apple's iTunes Search API. |

**Privacy.** Photos of people and kids must never be stored. Send them to Muse with saving off, and show "Your photo isn't stored" on screen.

**Design.** Keep Spinoff's look: the dark homepage with the ink video background, high-end editorial styling, mobile-first. Copy Kaiber's step-by-step creation flow and Videoleap's template gallery, not their exact visuals.

**The AI must turn the upload into a real moment and a real problem first.** For example, "a concert crowd" becomes "fans who lose their friends in the crowd", not "an app about concerts". Then it matches the moment to a proven app's trick. Otherwise you get the shallow output RapidNative produces.

### Your first tasks

1. **Study Kaiber and Videoleap.** The previous assistant only looked at their main upload, describe and template steps, not their full feature sets. Look at every part of both products: Kaiber's Superstudio, canvas, flows, styles and audio-reactive features, and Videoleap's templates, AI effects and editing tools. Report back with a list of what's worth borrowing for this project, and why.
2. **Propose the screen-by-screen flow and the template list.** Start with about 12 templates, each tied to a real app. Get the owner's OK before building.
3. **Confirm with Meta's docs** (ai.developer.meta.com/docs) exactly how to send images, PDFs and video to the Responses API.
4. **Build in this order:** photo, PDF and Word doc, plus templates, first. Add video and songs after those work.
5. **After every change:** run the tests and the demo mode, keep runs fast, and explain changes to the owner in plain words.

### Not finished in the current code

- The new plain-language version hasn't been tested with real Muse output yet. Do one real run before building on it, and read the step timings in Render's logs: each step logs a `[pass]` line, and each Muse call logs a `[muse]` line.
- The Lovable link format (`https://lovable.dev/?autosubmit=true#prompt=...`) is unverified. Check it against Lovable's "Build with URL" docs.
- Other ideas that were suggested but not built:
  - export the build prompt as a full PRD that plugs into any builder (RapidNative has a "PRD to App" feature);
  - a "Save screen as image" button on the mockup, so builders that accept images can use it;
  - an optional Render Postgres database, so analysis isn't lost on every redeploy.
