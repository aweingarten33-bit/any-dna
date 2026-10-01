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
export const PASS_FIXTURES: Record<string, unknown> = {
  dissect: {
    core_loop: 'Do one small action once a day, check in, and watch an unbroken count grow.',
    frequency_required: 'Daily. The loop breaks if a day is missed.',
    reward_type: 'A growing number that represents accumulated effort, plus rank among friends.',
    retention_lever: 'Fear of losing the count; the longer it gets, the more it costs to walk away.',
    monetization_trigger: 'Paying to protect the count when life gets in the way (streak freezes).',
    network_effect: 'Weak. Friends on a weekly leaderboard add some pull.',
    dependencies: ['A behavior people can do every day', 'A reliable daily clock and sync'],
    why_it_works: 'Loss aversion grows with the streak, so the habit gets stickier the longer it runs. Money is made at the moment that loss feels biggest.',
    unknowns: ['How many paying users there are', 'Whether the leaderboard drives retention'],
  },
  gaps: {
    themes: [
      { theme: 'Streaks lost to sync or time zone bugs', review_ids: ['r1', 'r2', 'r7'], about: 'mechanic' },
      { theme: 'Streak protection moved behind the paywall', review_ids: ['r3', 'r6'], about: 'mechanic' },
      { theme: 'Too many guilt-trip notifications', review_ids: ['r4', 'r5'], about: 'mechanic' },
      { theme: 'Fake check-ins on the leaderboard', review_ids: ['r8'], about: 'subject' },
    ],
  },
  fit_check: {
    components: [
      { component: 'core_loop', status: 'survives', audience_behavior: 'Dog owners walk their dog every day, usually twice.', reason: 'The daily action already exists and does not need to be invented.', replacement: '' },
      { component: 'frequency_required', status: 'survives', audience_behavior: 'Walks happen daily without prompting.', reason: 'The dog sets the rhythm.', replacement: '' },
      { component: 'reward_type', status: 'adapts', audience_behavior: 'Owners care about the dog\'s health more than their own score.', reason: 'A personal count matters less than the dog\'s routine.', replacement: 'The streak belongs to the dog, shown as the dog\'s walk record.' },
      { component: 'retention_lever', status: 'adapts', audience_behavior: 'Owners already feel responsible for the walk.', reason: 'Guilt is already present; nagging adds nothing.', replacement: 'A shared household record so whoever walked gets credit.' },
      { component: 'monetization_trigger', status: 'breaks', audience_behavior: 'Owners pay for things that help the dog, not to protect a number.', reason: 'Paying to save a streak feels wrong when the dog was walked anyway.', replacement: 'Paid vet-ready activity reports.' },
      { component: 'network_effect', status: 'adapts', audience_behavior: 'Owners share walking duty with family and dog walkers.', reason: 'The network is the household, not strangers.', replacement: 'Household members join one dog\'s record.' },
    ],
  },
  mutate: {
    name: 'Walkies',
    pitch: 'One shared walk record for your dog, so the whole household knows it\'s been walked.',
    core_loop: 'Whoever walks the dog taps once; everyone in the household sees it, and the dog\'s record grows.',
    what_broke_and_replaced: 'Paying to protect a streak broke. It\'s replaced by paid vet-ready activity reports.',
    first_session_flow: ['Add your dog', 'Invite your household', 'Log today\'s walk with one tap', 'See the dog\'s week'],
    differentiator_from_gaps: 'Designs out "streaks lost to sync bugs" (3 reviews): walks are logged with a time and can be added late, so a missed sync never erases history.',
    search_terms: ['dog walk tracker', 'dog walking log', 'pet activity'],
  },
  verdict: {
    competitors: [
      { app_id: '2000000001', overlap: 'Also logs walks, but for one owner; no shared household record.' },
      { app_id: '2000000003', overlap: 'Social walking groups, a different job.' },
      { app_id: '9999999999', overlap: 'Not in the fetched list; must be dropped.' },
    ],
    mvp: ['Dog profile', 'One-tap walk log', 'Household invite', 'Weekly walk view', 'Late entry for missed logs', 'Extra item that must be cut'],
    monetization: 'Free to log. A paid vet-ready activity report. PawWalk Log (demo) is listed as Free; in-app prices are unknown.',
    main_risk: 'Households may not bother logging once the novelty wears off.',
    checks: { understandable: true, desirability: 7.4, mechanic_load_bearing: true, already_exists: false, gimmick: false },
    go_no_go: 'go',
    reason: 'The daily behavior already exists, and the closest app is single-owner. Worth a two-week test with five households.',
  },
};

function whichPass(system: string) {
  if (system.includes('understand why this app works')) return 'dissect';
  if (system.includes('find the complaints that repeat')) return 'gaps';
  if (system.includes('test whether each mechanic')) return 'fit_check';
  if (system.includes('build one new app')) return 'mutate';
  if (system.includes('blunt stranger')) return 'verdict';
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
    if (url.pathname === '/search') {
      const term = (url.searchParams.get('term') ?? '').toLowerCase();
      const results = term.includes('dog') || term.includes('pet') ? COMPETITORS : [SOURCE_APP];
      return reply({ resultCount: results.length, results });
    }
    if (url.pathname.includes('/rss/customerreviews/')) {
      return url.pathname.includes('page=1/') ? reply(reviewFeed()) : reply({ feed: {} });
    }
  }

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
