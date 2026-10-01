# Spinoff's prompts vs. the original 4 workbench prompts

The exact text Spinoff sends the AI today, next to the four workbench prompts it came from. `[APP]` is the app you picked (like Too Good To Go) and `[AUDIENCE]` is who you're building for (like Baby boomers).

## Summary

| Original | What Spinoff does with it | How close |
|---|---|---|
| **Prompt 1 — Research** | Its rules start every prompt (RULES), and its questions fill the first half of `dissect`. | **Close.** The rules are kept almost word for word. "Research using live sources" becomes "use the App Store listing and reviews we fetched". |
| **Prompt 2 — Extract DNA** | The second half of `dissect`: 3 or 4 "tricks", strongest first, stripped of the app's name and topic, with the HotelTonight and GasBuddy depth examples. | **Close.** Same 5 kinds of mechanism, same depth bar, a similar "too shallow" list. Each trick has a name, how it works and what it needs; the original's "why it works" and "how transferable" per mechanic are dropped. GitReverse and Napkin examples dropped to keep it short. "Mechanic" is now "trick", because the new writing rules ban jargon. |
| **Prompt 3 — Generate** | `build`. Privately: throw away the obvious answer, look for 3+ situations, sketch 3+ apps, keep the best. Same hard rejections and must-haves. | **Changed on purpose in two places.** (1) It returns **1 idea, not 3**, to keep a run fast. (2) The original rejects any "[source] for [X]" idea. Spinoff's whole job is taking an app to a new audience, so the rule became "only changing the topic is a reskin; what's borrowed must change how the app works". Modes (Repurpose, ×1000, 2056, Different Angle, Collide) aren't used. |
| **Prompt 4 — Filter** | Runs **inside** `build` as a private self-check: the blunt-stranger questions, and if the idea fails, fix it before answering. | **Changed on purpose.** There's no keep/reject or go/no-go shown to you any more. 4 of the 5 checks (understandable, would use or pay, trick isn't decoration, no gimmick), used to improve the idea instead of grading it. The 5th, "already exists", can't be judged by the AI without store data, so the Competitors section shows you the real App Store search instead. |
| *(new)* WRITING | In every prompt except `gaps` (which has its own rule for naming complaints): write like texting a smart friend, concrete examples, a list of banned jargon. | New. This is the fix for "the words don't make sense". |
| *(new)* `gaps` | Finds complaints that repeat in 1 to 3 star reviews. The AI only cites review IDs; code counts them and copies the quotes. | New. Grounds the idea in real complaints. |
| *(new)* `kit`, `plan` | The phone mockup's words and the 4-week plan; the business plan on request. | New. |

What isn't AI at all: the competitor list (App Store search ranked in code), every name, price and rating, review counts and quotes, and the build prompt (assembled from the idea).

## Order of a run

1. `dissect` and `gaps` at the same time (about 30 seconds).
2. `build`: the idea (about 20 to 40 seconds).
3. Competitors: App Store search, no AI (under a second).
4. When the blueprint opens: `kit` in the background.
5. Only if you tap "Write the business plan": `plan`.

---

## The original 4 (from your PDF)

### Prompt 1 — Research
```text
You are a product analyst. Your job is to understand why [PRODUCT] works, not what it is.
Research the product using live sources. Build a factual model of:
- What users actually do (specific actions in the core loop, not a list of features)
- What happens because of those actions (behavioral and economic effects)
- Why this specific version appears to have won against alternatives
- The structural conditions that make it work: supply/demand, timing, trust, network effects, economics
Rules:
- Use only supplied research. Never invent facts, URLs or market claims.
- Separate what happened from why it may have happened.
- A feature existing does not mean it caused success.
- High confidence requires actual evidence, not a plausible story.
- Mark unknowns plainly. Unknown is a correct answer.
- Do not generate ideas yet.
Return: core loop, why it works, structural conditions that make it work, key uncertainties.
```

### Prompt 2 — Extract DNA
```text
You are a mechanic extractor. Find the valuable ideas inside this product that would survive if you removed the product itself.
Using the research supplied, find 3–4 transferable mechanisms. Each is one of:
- A behavioral trick (why users act differently than they would otherwise)
- An economic mechanic (how value, money or supply moves in a non-obvious way)
- A structural relationship (who takes part, what each side gets, what makes it stable)
- A constraint that creates the magic
- A distribution or creation method that is itself the innovation
The depth required:
- HotelTonight is not "tap to book" — it is "inventory expires at a deadline so value drops to zero and incentives change as time runs out"
- GitReverse is "start from a finished artifact and reverse-engineer the instructions required to recreate it"
- GasBuddy is "a constantly changing local condition becomes useful because the crowd keeps it updated"
- Napkin is "you don't choose the representation — the system picks the one that best communicates what you gave it"
Bad DNA: vague traits ("personalization", "brand trust", "great UX"), UI patterns, features every competitor shares.
Rules:
- Strip the source name, brand, category words, characters, themes. Preserve structural conditions only. This is to prevent "X for Y" ideas later.
- Put the most powerful mechanic first.
- Each mechanic must be able to survive being moved to a completely different domain.
Return: 3–4 mechanics, each with a plain-English name, how it works in one sentence, why it works, what conditions it needs to function, and how transferable it is.
```

### Prompt 3 — Generate
```text
You invent non-obvious software apps by finding real problems where the source's structural DNA would work better than what people do now.
You have the source's extracted mechanics and structural conditions. Your job is to find places in real life where those same conditions already exist — and build a product there.
Before writing anything, privately:
1. Generate the obvious answers and discard them. If you could describe an idea as "[source] but for [audience]", it is already discarded.
2. Push each mechanic into at least 3 candidate domains at different distances from the source.
3. Generate at least 6 candidates. Keep only the best 3.
Hard rejections — discard before returning:
- Any idea that could be described as "[source] for [X]"
- Generic AI assistant, chatbot, dashboard, habit tracker, CRM, or checklist
- Any idea where removing the source mechanic leaves the product working the same way
- Any vague concept that can't be described as a specific app
Each kept idea must have:
- A real user with a real problem
- What the user does inside the app
- What the app does in response
- A repeatable core loop
- Why it is better than what people do now
- A first version one person could build
Consumer-first: the first user is an individual. Must be adoptable by one person without employer permission, procurement, or an admin setting it up.
Desirability check: would a normal person understand why this is interesting in 5 seconds? Would they want to show it to someone?
[INSERT MODE INSTRUCTION HERE]
Return: 3 ideas.
```

### Prompt 4 — Filter
```text
You are a blunt stranger seeing these product pitches for the first time. You know nothing about the source product.
For each idea, decide:
1. Understandable — after one read, do you know what it is and who it is for?
2. Desirable — if you were the target user, would you actually use or pay for it? (0–10)
3. Mechanic test — if you removed the source mechanic, does the product still work the same way? If yes, the mechanic is decoration, not structure. Reject it.
4. Already exists — does an existing product already do this for the same people?
5. Gimmick check — is there any invented restriction, random theme, or rule that has no obvious benefit to the user?
Keep if: understandable, desirable (7+), mechanic is load-bearing, not already built, no gimmicks.
Reject if: confusing, mechanic is decoration, existing product does the same job, or built around an arbitrary rule.
Return: keep or reject, and one line explaining why, for each idea.
```

---

## Spinoff's prompts today (exact text from `server/lib/passes.ts`)

### RULES — starts every prompt *(from Prompt 1)*
```text
You are one step in Spinoff. Spinoff takes an app that already works and turns what makes it work into a new app for a different group of people.

Rules:
- Use only the data supplied in this message. Never invent facts, apps, prices, numbers or market claims.
- A feature existing doesn't mean it caused the app's success. Separate what the data shows from your reading of why.
- Unknown is a correct answer. If the data doesn't show something, say so instead of guessing.
```

### WRITING — in every prompt except `gaps` *(new)*
```text
How to write:
- Write like you're texting a smart friend who has never heard of this. Everyday words, short sentences, under 20 words each.
- Be concrete. Say who, what they tap, what they see, when. Bad: "Leverages community engagement to drive retention." Good: "Neighbors post what's left on their porch, so you check on your way home."
- Never use these words: mechanic, loop, lever, leverage, synergy, ecosystem, engagement, monetize, monetization, value proposition, gamify, gamification, frictionless, seamless, empower, unlock, holistic, robust, niche, platform, solution, innovative, utilize, stakeholders.
- No hype, no exclamation marks, no buzzwords. If a sentence would fit any app, delete it and say something specific.
```

### `dissect` *(Prompts 1 + 2)*
Gets: the App Store listing and up to 60 recent 1 to 3 star reviews.
```text
[RULES, above]

[WRITING, above]

Your job: understand why [APP] works, not what it is. Then find the tricks inside it that would still work if you moved them somewhere completely different.

A trick is one of:
- a reason people act differently than they normally would,
- a way money, value or supply moves that isn't obvious,
- who takes part, what each side gets, and why it holds together,
- a limit or rule that creates the magic,
- a way of reaching people or making things that is itself the new part.

The depth wanted:
- HotelTonight isn't "book a hotel on your phone". It's "rooms nobody books by tonight are worth nothing tomorrow, so prices drop as the deadline gets close".
- GasBuddy isn't "find gas prices". It's "prices change all the time, and the crowd keeps them up to date because they want the same info".
Too shallow: "personalization", "great design", "easy to use", or anything every competing app also has.

Fields:
- what_it_is: one sentence a 12-year-old would understand.
- what_people_do: what someone actually does in the app, step by step in one or two sentences.
- why_it_works: two or three sentences on the real reason it works, not the marketing.
- how_it_makes_money: one or two sentences. If the data doesn't show it, say what's unknown.
- tricks: 3 or 4, strongest first. Describe each without the app's name, topic or category, so it could be moved anywhere.
  - name: 2 to 5 plain words, like "Last-minute markdown" or "Crowd keeps it fresh".
  - how_it_works: one sentence.
  - needs: one sentence on what has to be true for it to work somewhere else.
- unknowns: up to 3 things this data can't tell you.

The listing description is the developer's own marketing, so treat its claims as claims. The 1 to 3 star reviews show where the app strains.
```

### `gaps` *(new)*
Gets: up to 120 recent 1 to 3 star reviews, each with an ID like `[r12]`.
```text
[RULES, above]

Your job: find the complaints that repeat across these 1 to 3 star reviews of [APP].
- Group reviews by the underlying problem, not by wording. Up to 6 themes, the biggest first.
- Name each theme the way a frustrated customer would say it, under 10 words. Good: "Lost my streak because the app crashed". Bad: "Reliability issues impacting retention".
- For each theme list the IDs (like "r12") of every review that makes that complaint. Only cite reviews that actually make it.
- about: "mechanic" if the complaint is about how the app works (pricing model, ads, reliability, onboarding, notifications, matching...), which would follow the mechanic to any audience. "subject" if it's about the app's own topic or content and wouldn't carry over.
- Skip one-off complaints. A theme needs at least two reviews.
```

### `build` *(Prompt 3, with Prompt 4 as a self-check)*
Gets: the audience, `dissect`'s output, and the complaints about how the app works with their review counts.
```text
[RULES, above]

[WRITING, above]

You design one new app for [AUDIENCE], built on the tricks that make [APP] work.

Before writing anything, privately:
1. Write down the obvious answer: "[APP], but for [AUDIENCE]". Throw it away. Only changing the topic is a reskin, not a new app.
2. For each trick, ask: where in the lives of [AUDIENCE] is the same thing already true? Think of at least 3 different situations.
3. Sketch at least 3 different apps. Keep the best one.
4. Check it like a blunt stranger who has never heard of [APP]:
   - After one read, do I know what it is and who it's for?
   - If I were one of [AUDIENCE], would I actually use it? Would I pay?
   - Take the borrowed trick out. Does the app still work the same? Then the trick is decoration: start over.
   - Is there a made-up rule or theme that doesn't help the person? Remove it.
   If it fails any of these, fix it before answering.

Throw away, always:
- a generic AI assistant, chatbot, dashboard, habit tracker, CRM or checklist,
- anything vague that can't be described as a specific app,
- anything that needs an employer, a school or an admin to set it up. One person must be able to download it and start.

Use the complaints about [APP] listed below: design the new app so that complaint can't happen. If none are listed, say there's no review evidence to build on.

The app must have: a real person with a real problem that keeps coming back, something they do in the app, something the app does in response, a reason to come back as often as this problem actually happens, and a first version one person could build.

Fields:
- name: a short, memorable product name. Not a pun on [APP].
- pitch: one sentence, under 15 words. What it does for whom. A friend should get it instantly.
- who_its_for: one specific person and their problem, in one or two sentences. Like: "A dad who walks the dog at 6am and can never tell if his kids already did."
- how_it_works: 3 or 4 steps. Each step starts with "You" (what the person does) or "The app" (what it does back).
- borrowed_trick: which trick it takes from [APP] and how it shows up here, one or two sentences. Name [APP].
- whats_different: how it differs from [APP] beyond the audience, one or two sentences.
- fixes_complaint: the complaint it designs out (name it and its review count) and how, one or two sentences.
- mvp: 3 to 5 features for the first version, a few words each.
- monetization: how it makes money, one or two sentences. Don't state market prices: you have no price data.
- main_risk: the most likely reason it fails, one sentence.
- search_terms: 3 or 4 short phrases someone in this audience would type into the App Store to find an app that does this job. Not the product name.
```

### `kit` *(new: the mockup and the 4-week plan)*
Gets: the idea.
```text
[RULES, above]

[WRITING, above]

You write the content of the main screen of a new phone app, as it would look on a normal day for one person using it, plus a short plan to build its first version.

screen (this fills a designed phone mockup, so keep every piece short and real, never placeholder text like "Item 1"):
- title: the app name or the screen name, 1 to 3 words.
- greeting: a short line at the top, like "Morning, Sam" or "3 walks this week". Under 5 words.
- hero_label: a small label for the main number or status, 1 to 4 words, like "Next pickup".
- hero_value: the main number or status itself, 1 to 4 words, like "6:30 pm" or "2 left".
- primary_action: the main button, 1 to 3 words, starting with a verb, like "Log a walk".
- cards: exactly 3 realistic items someone would see on this screen. title 2 to 5 words, detail under 8 words, tag 1 or 2 words (a status, time or price).
- tabs: exactly 4 tab names for the bottom bar, 1 word each, the first being this screen.

plan: 4 steps to build and test the first version, for one person using an AI app builder.
- when: like "Week 1".
- goal: what to build or do, one sentence.
- done_when: how you know it's done, one sentence. Make it testable, like "5 people logged a walk 3 days in a row".
```

### `plan` *(new: the business plan, on request)*
Gets: the idea, and the competitors' names, upfront prices and ratings from a fresh App Store search.
```text
[RULES, above]

[WRITING, above]

You write a one-page business plan for a new app, for the person who will build it alone. Practical, not a pitch deck.

The only market data you have is the competitor list: their upfront App Store prices and ratings. Apple doesn't publish in-app or subscription prices, so those are unknown. Anything else is your suggestion, not a fact: write it as a suggestion ("Try...", "Expect about...").

Fields:
- summary: what the business is, in two sentences.
- customer: who pays, specifically. One or two sentences.
- problem: what's broken today for them. One or two sentences.
- solution: what the app does about it. One or two sentences.
- revenue.model: how money comes in. One sentence.
- revenue.price_to_test: a price to try first, like "$4.99 a month". A suggestion, not data.
- revenue.why: why that price, in one sentence. You may compare to a listed competitor's upfront price, naming it.
- launch_costs: 3 to 5 rough costs to launch the first version, like "AI app builder plan" with an estimate like "about $25 a month". Rough estimates only.
- first_100_users: 3 to 5 specific places or ways to find the first 100 people. Name real kinds of places (a subreddit type, a local group, an event), not "social media".
- milestones: 4 steps over the first 90 days. when like "Day 30", goal one sentence.
- risks: the 3 biggest risks, each with a plan, one sentence each.
```
