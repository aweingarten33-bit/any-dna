// Test double for Apple's API and the AI providers (Muse, Claude), for local runs and tests.
// installFixtures() swaps globalThis.fetch so the real edge-function code runs
// end to end without network access or an API key. Everything here is
// fictional demo data; it never ships with the functions.

export const SOURCE_ID = '1000000001';

const app = (id: number, name: string, genre: string, price: number, rating: number, count: number) => ({
  kind: 'software', wrapperType: 'software', trackId: id, trackName: name, artistName: `${name.split(' ')[0]} Labs (demo)`,
  artworkUrl512: '', averageUserRating: rating, userRatingCount: count, price, formattedPrice: price ? `$${price.toFixed(2)}` : 'Free',
  currency: 'USD', primaryGenreName: genre, genres: [genre], trackViewUrl: `https://apps.apple.com/us/app/id${id}`,
  description: `${name} is a fictional app used for Spinoff's demo mode.`,
});

export const SOURCE_APP = {
  ...app(Number(SOURCE_ID), 'Streakly (demo app)', 'Health & Fitness', 0, 4.6, 182340),
  description: 'Streakly (fictional demo app). Build habits with daily streaks. Check in once a day, keep your streak alive, compete with friends on weekly leaderboards. Streakly Plus unlocks streak freezes and unlimited habits.',
};

export const COMPETITORS = [
  app(2000000001, 'PawWalk Log (demo)', 'Lifestyle', 0, 4.4, 5120),
  app(2000000002, 'Dog Diary Pro (demo)', 'Lifestyle', 3.99, 4.1, 830),
  app(2000000003, 'Pack Walks (demo)', 'Social Networking', 0, 3.9, 2210),
  app(2000000004, 'Kibble Tracker (demo)', 'Health & Fitness', 1.99, 4.7, 9400),
];

const COMPLAINTS = [
  [1, 'Lost my streak', 'Lost a 200 day streak because the app did not sync at midnight. Support never answered.'],
  [2, 'Streak reset again', 'My streak reset again after a time zone change. Pointless if it can just vanish.'],
  [1, 'Paywall on freezes', 'They moved streak freezes behind the subscription. Feels like they punish you for having a life.'],
  [2, 'Notifications', 'Way too many notifications, it nags me five times a day.'],
  [3, 'Guilt trip', 'The guilt notifications when I miss a day make me want to quit entirely.'],
  [2, 'Freeze paywall', 'Freezes used to be free. Now it is $5 a month to not lose progress when you are sick.'],
  [1, 'Sync bug', 'Checked in, app crashed, streak gone. Third time this month.'],
  [3, 'Leaderboard', 'Leaderboard is full of people faking check-ins.'],
] as const;

function reviewFeed() {
  const entries = [
    ...COMPLAINTS.map(([rating, title, body], index) => ({ id: { label: `rev${index}` }, title: { label: title }, content: { label: body }, 'im:rating': { label: String(rating) }, updated: { label: '2026-09-20T10:00:00-07:00' } })),
    ...Array.from({ length: 12 }, (_, index) => ({ id: { label: `good${index}` }, title: { label: 'Love it' }, content: { label: 'Keeps me consistent.' }, 'im:rating': { label: '5' }, updated: { label: '2026-09-21T10:00:00-07:00' } })),
  ];
  return { feed: { entry: entries } };
}

// The low-star reviews arrive in feed order, so the gaps pass sees them as r1..r8.
// deno-lint-ignore no-explicit-any
const PARTS: Record<string, any> = {
  dissect: {
    what_it_is: 'An app that counts how many days in a row you did one small thing.',
    what_people_do: 'You do one small task, tap to check in, and watch the number of days grow.',
    why_it_works: 'The longer the count gets, the worse it feels to lose it, so people keep going. It charges money right when losing the count would hurt most.',
    how_it_makes_money: 'People pay for "freezes" that protect the count on days they miss.',
    tricks: [
      { name: 'Too much to lose', how_it_works: 'A number grows every day you show up, and missing one day resets it.', needs: 'Something people can do every single day.' },
      { name: 'Pay when it hurts', how_it_works: 'You can pay to protect your count right when you are about to lose it.', needs: 'A moment where losing progress feels bad.' },
      { name: 'Friends keep score', how_it_works: 'A weekly board shows friends next to you.', needs: 'People who know each other doing the same thing.' },
    ],
    unknowns: ['How many people pay', 'Whether the friends board keeps people around'],
  },
  gaps: {
    themes: [
      { theme: 'Streaks lost to sync or time zone bugs', review_ids: ['r1', 'r2', 'r7'], about: 'mechanic' },
      { theme: 'Streak protection moved behind the paywall', review_ids: ['r3', 'r6'], about: 'mechanic' },
      { theme: 'Too many guilt-trip notifications', review_ids: ['r4', 'r5'], about: 'mechanic' },
      { theme: 'Fake check-ins on the leaderboard', review_ids: ['r8'], about: 'subject' },
    ],
  },
  mutate: {
    name: 'Walkies',
    pitch: 'One shared walk record for your dog, so everyone at home knows it was walked.',
    who_its_for: 'A dad who walks the dog at 6am and can never tell if his kids already did.',
    how_it_works: ['You tap once when you get back from a walk.', 'The app tells everyone at home the dog was walked, and by whom.', 'You see the dog\'s week at a glance.'],
    borrowed_trick: 'Like Streakly\'s growing count, the dog\'s walk record grows each day, but it belongs to the dog, not you.',
    whats_different: 'It\'s shared by a household, and nobody pays to protect a number.',
    fixes_complaint: 'Designs out "Lost my streak because the app crashed" (3 reviews): walks can be added late, so a crash never erases a day.',
    mvp: ['Dog profile', 'One-tap walk log', 'Household invite', 'Weekly walk view', 'Late entry for missed logs', 'Extra item that must be cut'],
    monetization: 'Free to log. A paid vet-ready activity report.',
    main_risk: 'Households may stop logging once the novelty wears off.',
    search_terms: ['dog walk tracker', 'dog walking log', 'pet activity'],
  },
  kit: {
    screen: {
      title: 'Walkies', greeting: 'Morning, Sam', hero_label: 'Last walk', hero_value: '7:10 am', primary_action: 'Log a walk',
      cards: [
        { title: 'Mia walked Biscuit', detail: '25 minutes around the park', tag: '7:10 am' },
        { title: 'Evening walk due', detail: 'Nobody has claimed it yet', tag: 'Tonight' },
        { title: 'Biscuit\'s week', detail: '12 walks, 2 missed', tag: 'On track' },
      ],
      tabs: ['Today', 'Week', 'Family', 'Profile'],
    },
    plan: [
      { when: 'Week 1', goal: 'Build the dog profile and one-tap walk log.', done_when: 'You can log a walk in under 3 seconds.' },
      { when: 'Week 2', goal: 'Add household invites and shared history.', done_when: 'Two people see the same walks.' },
      { when: 'Week 3', goal: 'Give it to 5 households.', done_when: '3 of them log a walk on 5 days.' },
      { when: 'Week 4', goal: 'Fix what they hit and test the paid report.', done_when: 'One household says they would pay.' },
    ],
  },
  plan: {
    summary: 'Walkies is a shared walk log for households with a dog. It makes money from paid vet-ready reports.',
    customer: 'Families of 3 or more who share one dog.',
    problem: 'Nobody knows if the dog was walked, so it gets walked twice or not at all.',
    solution: 'One tap logs a walk and tells everyone at home.',
    revenue: { model: 'Free app with a paid monthly report.', price_to_test: '$2.99 a month', why: 'PawWalk Log (demo) is free, so the paid part must be extra.' },
    launch_costs: [{ item: 'AI app builder plan', estimate: 'about $25 a month' }, { item: 'Apple developer account', estimate: '$99 a year' }],
    first_100_users: ['Local dog park groups', 'Dog subreddits', 'Puppy training classes'],
    milestones: [{ when: 'Day 30', goal: 'First version live.' }, { when: 'Day 60', goal: '50 households.' }, { when: 'Day 90', goal: '100 households, 5 paying.' }],
    risks: [{ risk: 'People stop logging.', plan: 'A gentle evening reminder only when nobody logged.' }],
  },
  // The new front door: ideas from the upload itself.
  suggest: {
    audiences: ['Concertgoers', 'Festival crews', 'Sports fans', 'Theme park families'],
  },
  generate: {
    name: 'Crowdlight',
    tagline: 'Find your friends in any crowd, fast.',
    what_it_is: 'Crowdlight is a friend-finder for concerts and festivals. You see your crew as glowing dots on a simple map of the venue, so regrouping takes seconds.',
    pattern: 'SEPARATED → SIGNAL → REGROUP',
    job: 'When I lose my friends in a crowd, get us back together fast.',
    how_it_works: [
      'You open Crowdlight and see your crew as dots on the venue map.',
      'You tap "Beacon" and your dot pulses so friends can spot you.',
      'The app suggests a meeting point halfway between everyone.',
    ],
    killer_feature: 'The beacon: one tap makes your dot pulse on everyone\u2019s map, with no texting needed.',
    callbacks: [
      { detail: 'losing friends in the crowd', meaning: 'The whole app is about getting the crew back together.' },
      { detail: 'concert', meaning: 'It is built for loud places where you cannot hear your phone.' },
    ],
    what_its_not: 'Not a general friend tracker that runs all day and drains your battery.',
    why_use: 'You use it every time you go out with a group, because losing people keeps happening.',
    mvp: ['Crew dots on a venue map', 'Beacon pulse', 'Halfway meeting point', 'Battery-saver mode'],
    monetization: 'Free for crews. Venues pay for crowd-flow maps.',
    main_risk: 'Phones lose signal in packed venues, so dots go stale.',
    search_terms: ['find friends at concerts', 'concert buddy locator', 'festival crew map'],
  },
};

PARTS.research = {
  recognized: true,
  core_sequence: 'A group arrives together, splits up in a packed crowd, tries to signal each other over the noise, and regroups.',
  why_it_works: 'Being part of a crowd feels great until you lose your people. The relief of finding them again is the real high.',
  conditions: ['Loud, packed places', 'Small groups that split up', 'Short windows to regroup'],
  uncertainties: ['Which venue it is'],
  source_details: ['losing your friends in a packed crowd', 'phones that can\u2019t be heard over the music', 'the moment you spot them again'],
};

PARTS.dna = {
  mechanisms: [
    { name: 'Signal over noise', chain: 'SEPARATED → ONE CLEAR SIGNAL → REGROUP', how_it_works: 'One simple signal cuts through when nothing else can.', why_it_works: 'It removes the need to talk or text.', needs: 'A group that splits up and wants to reunite.', transferability: 'High: any noisy, crowded place.' },
    { name: 'Meet in the middle', chain: 'SCATTERED → SHARED POINT → TOGETHER', how_it_works: 'A meeting point fair to everyone ends the back-and-forth.', why_it_works: 'Nobody has to decide.', needs: 'People in different spots.', transferability: 'High.' },
  ],
};

const SECOND_IDEA = { ...PARTS.generate, name: 'Huddle', tagline: 'One tap tells your crew where to meet.' };
const THIRD_IDEA = { ...PARTS.generate, name: 'Glowstick', tagline: 'Your phone becomes a beacon your friends can see.' };

// deno-lint-ignore no-explicit-any
export const PASS_FIXTURES: Record<string, any> = {
  kit: PARTS.kit,
  plan: PARTS.plan,
  suggest: PARTS.suggest,
  research: PARTS.research,
  dna: PARTS.dna,
  generate: { ideas: [PARTS.generate, SECOND_IDEA, THIRD_IDEA] },
  // The stranger keeps the first and third, and rates the third higher.
  filter: { verdicts: [
    { index: 0, keep: true, desirability: 7, reason: 'Clear and useful.' },
    { index: 1, keep: false, desirability: 5, reason: 'Already exists.' },
    { index: 2, keep: true, desirability: 8, reason: 'Clear and fun to show.' },
  ] },
};

function whichPass(system: string) {
  if (system.includes('suggest 4 to 6 audiences')) return 'suggest';
  if (system.includes('CANONICAL PROMPT 1 — RESEARCH')) return 'research';
  if (system.includes('CANONICAL PROMPT 2 — EXTRACT DNA')) return 'dna';
  if (system.includes('CANONICAL PROMPT 3 — GENERATE')) return 'generate';
  if (system.includes('CANONICAL PROMPT 4 — FILTER')) return 'filter';
  if (system.includes('content of the main screen')) return 'kit';
  if (system.includes('one-page business plan')) return 'plan';
  throw new Error('Unknown pass prompt');
}

export type FixtureOptions = {
  /** Override a pass's reply. Return a string to send it raw (e.g. invalid JSON). */
  reply?: (pass: string, attempt: number, body: Record<string, unknown>) => unknown | undefined;
  /** Simulated Claude latency in ms, so the loading checklist is visible in demo mode. */
  delayMs?: number;
};

type Session = { options: FixtureOptions; attempts: Map<string, number>; calls: string[]; aiRequests: Array<{ provider: string; body: Record<string, unknown> }> };

const realFetch = globalThis.fetch;
let session: Session | null = null;
let installed = false;

// The Anthropic client keeps the fetch it was created with, so the stub is
// installed once and each installFixtures() call swaps in a new session.
export function installFixtures(options: FixtureOptions = {}) {
  const current: Session = { options, attempts: new Map(), calls: [], aiRequests: [] };
  session = current;
  if (!installed) {
    installed = true;
    globalThis.fetch = (input: Request | URL | string, init?: RequestInit) => (session ? fixtureFetch(session, input, init) : realFetch(input, init));
  }
  return { calls: current.calls, attempts: current.attempts, aiRequests: current.aiRequests, restore: () => { if (session === current) session = null; } };
}

async function fixtureFetch({ options, attempts, calls, aiRequests }: Session, input: Request | URL | string, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  calls.push(`${url.host}${url.pathname}`);
  // Apple serves its JSON as text/javascript; the Claude API uses application/json.
  const reply = (body: unknown, type = 'text/javascript') => new Response(JSON.stringify(body), { headers: { 'content-type': type } });

  if (url.host === 'itunes.apple.com') {
    if (url.pathname === '/lookup') {
      const id = url.searchParams.get('id');
      const hit = [SOURCE_APP, ...COMPETITORS].find((item) => String(item.trackId) === id);
      return reply({ resultCount: hit ? 1 : 0, results: hit ? [hit] : [] });
    }
    if (url.pathname === '/search' && url.searchParams.get('entity') === 'song') {
      const term = (url.searchParams.get('term') ?? '').toLowerCase();
      const songs = term.includes('rose')
        ? [{ trackName: 'Kiss from a Rose', artistName: 'Seal', collectionName: 'Seal II', primaryGenreName: 'Pop', releaseDate: '1994-05-23T07:00:00Z' }]
        : [{ trackName: 'Concerts', artistName: 'Someone', collectionName: 'X', primaryGenreName: 'Rock', releaseDate: '2001-01-01T00:00:00Z' }];
      return reply({ resultCount: songs.length, results: songs });
    }
    if (url.pathname === '/search') {
      const term = (url.searchParams.get('term') ?? '').toLowerCase();
      const results = term.includes('dog') || term.includes('pet') || term.includes('concert') || term.includes('friend') || term.includes('festival') || term.includes('crew') ? COMPETITORS : [SOURCE_APP];
      return reply({ resultCount: results.length, results });
    }
    if (url.pathname.includes('/rss/customerreviews/')) {
      return url.pathname.includes('page=1/') ? reply(reviewFeed()) : reply({ feed: {} });
    }
  }

  // Pasted links: what each service publicly shares.
  const html = (tags: Record<string, string>) => new Response(`<html><head>${Object.entries(tags).map(([k, v]) => `<meta property="${k}" content="${v}">`).join('')}</head></html>`, { headers: { 'content-type': 'text/html' } });
  if (url.host === 'www.youtube.com' && url.pathname === '/oembed') {
    return reply({ title: 'Superman Theme (Full Orchestra)', author_name: 'John Williams', thumbnail_url: 'https://i.ytimg.com/vi/demo/hqdefault.jpg' }, 'application/json');
  }
  if (url.host === 'www.tiktok.com' && url.pathname === '/oembed') {
    return reply({ title: 'POV: you lost your friends at the festival', author_name: 'festivalfran', thumbnail_url: 'https://p16.tiktokcdn.com/demo.jpeg' }, 'application/json');
  }
  if (url.host === 'api.github.com') {
    if (url.pathname === '/repos/someone/private-thing') return new Response('{}', { status: 404 });
    if (url.pathname.endsWith('/readme')) return new Response('# Moodboard\n\nTurn any playlist into a color palette. <img src="x">', { headers: { 'content-type': 'text/plain' } });
    return reply({ full_name: 'acme/moodboard', description: 'Turn playlists into color palettes', stargazers_count: 4321, language: 'TypeScript', topics: ['music', 'color'], owner: { login: 'acme' } }, 'application/json');
  }
  if (url.host === 'open.spotify.com') return html({ 'og:title': 'Kiss from a Rose', 'og:description': 'Seal · Seal II · Song · 1994', 'og:type': 'music.song', 'og:image': 'https://i.scdn.co/image/demo' });
  if (url.host === 'www.instagram.com') return html({ 'og:title': 'Instagram' });
  if (['i.ytimg.com', 'p16.tiktokcdn.com', 'i.scdn.co'].includes(url.host)) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });

  // Muse: Meta Model API (Responses API). Claude: matched by path, since the
  // Anthropic SDK honours ANTHROPIC_BASE_URL and the host can vary.
  const isMuse = url.host === 'api.meta.ai' && url.pathname === '/v1/responses';
  if (isMuse || url.pathname.endsWith('/v1/messages')) {
    const body = JSON.parse(String(init?.body ?? (input instanceof Request ? await input.text() : '{}')));
    aiRequests.push({ provider: isMuse ? 'muse' : 'claude', body });
    const pass = whichPass(String(isMuse ? body.instructions : body.system));
    const attempt = (attempts.get(pass) ?? 0) + 1;
    attempts.set(pass, attempt);
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const override = options.reply?.(pass, attempt, body);
    const payload = override ?? PASS_FIXTURES[pass];
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (isMuse) return reply({ id: `resp_fixture_${pass}_${attempt}`, status: 'completed', model: body.model, output_text: text }, 'application/json');
    return reply({
      id: `msg_fixture_${pass}_${attempt}`, type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }, 'application/json');
  }

  return realFetch(input, init);
}
