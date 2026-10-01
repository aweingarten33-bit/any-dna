# The prompts

The AI runs the owner's **Any DNA** system prompt. The canonical text is in `server/lib/prompts.ts`, copied word for word from the owner's version (an outer wrapper, the four canonical Workbench prompts, the mode instructions, and side rules). Everything the app adds is in `server/lib/prompt-additions.ts`, clearly labelled "APP ADDITIONS — NOT part of the canonical four". The four prompts themselves are never edited.

## How each step's instructions are put together

| Step | Instructions sent to the AI, in order | What it's given |
|---|---|---|
| `research` | Outer wrapper + app additions (people in images) → **Canonical Prompt 1** → side rule: source details / callbacks → return format | The normalized source (below) and its contents in `<source>` tags, plus any fetched research |
| `dna` | Outer wrapper + app additions (song depth examples, structural chain) → **Canonical Prompt 2** → return format | Prompt 1's research (not the source details: "these are not DNA") |
| `generate` | Outer wrapper + app additions (the app's inputs, the `<direction>` fence) → **Canonical Prompt 3** with the picked mode in its `[INSERT MODE INSTRUCTION HERE]` slot → side rules: callbacks, naming, user-facing writing → return format | Mechanics, structural conditions and source details; the audience; the typed direction; the proven trick; and, on a retry, the stranger's rejection reasons |
| `filter` | **Canonical Prompt 4** → side rule: competitor checking → return format | Only the pitches, each with real App Store search results ("You know nothing about the source product") |

The "return format" sections only name the fields the code reads. They never change the reasoning.

**Collide:** Prompts 1 and 2 run separately for each source, at the same time. Prompt 3's opening ("You have the source's extracted mechanics…") is replaced with Collide's own text, as the mode says. The rest of Prompt 3 stays: the private steps, hard rejections, must-haves, consumer-first and desirability checks.

## The app additions, and why

| Addition | Why |
|---|---|
| Depth examples for non-products (Kiss from a Rose, Superman) | Prompt 2's examples are all products; these show the same depth for songs and films |
| People in images | Privacy: never identify anyone in a photo, or describe how they look |
| Structural chain (A → B → C) | Prompt 2 doesn't return one; the app shows it on the loading screen and in "Where it came from" |
| Inputs from the person | Prompt 3 doesn't mention the audience, the typed direction, the proven trick or the source details |
| `<direction>` fence | The direction is typed by the person: a preference, never instructions |

## The normalized source

Before Prompt 1, each upload becomes a normalized source: category, type, title, creator, canonical URL, provenance, and **what's unavailable and why**. The AI is never told it watched, heard or read something it didn't:

- **Song file:** title and artist from its tags. Unavailable: the audio.
- **Video:** 4 still frames. Unavailable: the sound and the motion.
- **Spotify, Apple Music, YouTube, TikTok, Instagram link:** the public share preview. Unavailable: the song, video or post itself.
- **GitHub link:** description, stars, language, topics and the start of the README. Unavailable: the code.
- **Word document:** its text. Unavailable: images and formatting.

**Live research, gathered before Prompt 1:** Apple Music facts when the words name a song, and the App Store listing when the words are an app's name.

## Side rules the code follows (never sent to the AI)

- **Competitor checking:** before Prompt 4, each idea's search terms are searched on the App Store, and the real results go with the pitch.
- **Failed filter:** if every idea fails, Prompt 3 runs again with the reasons as corrective feedback, then Prompt 4 again, up to 2 retries (`src/lib/newrun.ts`). A rejected idea is never shown. If nothing passes, the screen says so and offers to change the mode or trick, the audience or direction, or the source.

## Outside the four

- `suggest`: who the app could be for.
- `kit`: the phone screen's words and the 4-week plan.
- `plan`: the business plan, on request.

These use the side rules for writing and naming.
