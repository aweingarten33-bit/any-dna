// End-to-end test of the edge-function handlers against the fixture doubles.
//   deno test -A tests/
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@^1';
import { forgetJobs, getReviews, resolveApp, runPass } from '../server/lib/handlers.ts';
import { parseAppInput } from '../server/lib/itunes.ts';
import type { Competitor, FitCheck, Gaps, Idea } from '../server/lib/types.ts';
import { installFixtures, PASS_FIXTURES, SOURCE_ID } from '../dev/fixtures.ts';
import { takeAiCall } from '../server/main.ts';

Deno.env.set('META_MODEL_API_KEY', 'fixture-key');
Deno.env.delete('ANTHROPIC_API_KEY');
Deno.env.delete('AI_PROVIDER');
Deno.env.delete('DATABASE_URL');

async function call(handler: (req: Request) => Promise<Response>, body: unknown, { fresh = true } = {}) {
  // Pass results are kept on the server for a while; most tests want a real run each time.
  if (fresh) forgetJobs();
  const response = await handler(new Request('http://local/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}

Deno.test('parseAppInput reads links, IDs and names', () => {
  assertEquals(parseAppInput('https://apps.apple.com/gb/app/textnow-call-text/id314716233'), { appId: '314716233', term: null, country: 'gb' });
  assertEquals(parseAppInput('https://apps.apple.com/app/id314716233?mt=8'), { appId: '314716233', term: null, country: 'us' });
  assertEquals(parseAppInput('id314716233'), { appId: '314716233', term: null, country: 'us' });
  assertEquals(parseAppInput('  TextNow '), { appId: null, term: 'TextNow', country: 'us' });
});

Deno.test('full run: every claim about competitors and complaints comes from fetched data', async () => {
  const fixtures = installFixtures();
  try {
    const resolved = await call(resolveApp, { query: 'streakly' });
    assertEquals(resolved.status, 200);
    assertEquals(resolved.body.candidates[0].app_id, SOURCE_ID);

    const reviews = await call(getReviews, { app_id: SOURCE_ID });
    assertEquals(reviews.body.summary.low_star_count, 8);
    assertEquals(reviews.body.summary.scanned_count, 20);

    // dissect and gaps run at the same time; both must end up cached.
    const [dissect, gapsResponse] = await Promise.all([
      call(runPass, { pass: 'dissect', app_id: SOURCE_ID }),
      call(runPass, { pass: 'gaps', app_id: SOURCE_ID }),
    ]);
    assertEquals(dissect.body.cached, false);
    const gaps = gapsResponse.body.output as Gaps;
    // Counts are from the cited reviews; the single-review theme is dropped as not repeated.
    assertEquals(gaps.repeated_complaints.map((c) => [c.theme.slice(0, 12), c.evidence_count]), [['Streaks lost', 3], ['Streak prote', 2], ['Too many gui', 2]]);
    // Examples are verbatim review text.
    assertMatch(gaps.repeated_complaints[0].example, /200 day streak|time zone|crashed/);

    // One call returns the fit check and the idea; dissect and gaps come from the cache.
    const built = (await call(runPass, { pass: 'build', app_id: SOURCE_ID, audience: 'Dog owners' })).body.output as { fit_check: FitCheck; idea: Idea };
    assertEquals(built.fit_check.components.find((c) => c.status === 'survives')?.replacement, '');
    const idea = built.idea;
    assertEquals(idea.name, 'Walkies');
    assertEquals(fixtures.attempts.get('dissect'), 1);
    assertEquals(fixtures.attempts.get('gaps'), 1);

    assertEquals(idea.mvp.length, 5);

    // Competitors come from the App Store search, picked by code: no AI call.
    const competeResponse = await call(runPass, { pass: 'compete', app_id: SOURCE_ID, audience: 'Dog owners', idea });
    const competitors = competeResponse.body.competitors as Competitor[];
    assert(competitors.length > 0 && competitors.length <= 5);
    assert(competeResponse.body.searched.length >= 4);
    assert(!competeResponse.body.searched.some((app: { app_id: string }) => app.app_id === SOURCE_ID), 'source app is not its own competitor');
    assertMatch(competitors[0].overlap, /^Comes up when you search “/);
    // Apps that came up for more of the searches rank first.
    const hits = competitors.map((c) => c.matched_terms?.length ?? 1);
    assertEquals(hits, [...hits].sort((x, y) => y - x));

    // Audience-independent passes are cached for "Try a different audience".
    const again = await call(runPass, { pass: 'dissect', app_id: SOURCE_ID });
    assertEquals(again.body.cached, true);
    assertEquals(fixtures.attempts.get('dissect'), 1);

    // Every AI call went to Muse, standard tier, not stored, with the schema in the instructions.
    assertEquals(fixtures.aiRequests.length, 4); // dissect, gaps, and build's fit check and idea, side by side
    for (const { provider, body } of fixtures.aiRequests) {
      assertEquals(provider, 'muse');
      assertEquals(body.model, 'muse-spark-1.3');
      assertEquals(body.store, false);
      assertMatch(String(body.instructions), /JSON Schema/);
    }
  } finally {
    fixtures.restore();
  }
});

Deno.test('invalid JSON is retried once, then the run fails clearly', async () => {
  const once = installFixtures({ reply: (pass, attempt) => (pass === 'build' && attempt === 1 ? 'not json {' : undefined) });
  try {
    const ok = await call(runPass, { pass: 'build', app_id: SOURCE_ID, audience: 'Renters' });
    assertEquals(ok.status, 200);
    assertEquals(once.attempts.get('build'), 2);
  } finally {
    once.restore();
  }
  const always = installFixtures({ reply: (pass) => (pass === 'build' ? { idea: {} } : undefined) });
  try {
    const failed = await call(runPass, { pass: 'build', app_id: SOURCE_ID, audience: 'Renters' });
    assertEquals(failed.status, 502);
    assertMatch(failed.body.error, /invalid output twice/);
    assertEquals(always.attempts.get('build'), 2);
  } finally {
    always.restore();
  }
});

Deno.test('bad requests get a 400 with a reason', async () => {
  assertEquals((await call(runPass, { pass: 'nope', app_id: SOURCE_ID })).status, 400);
  assertEquals((await call(runPass, { pass: 'build', app_id: SOURCE_ID })).body.error, 'audience is required');
  assertEquals((await call(runPass, { pass: 'compete', app_id: SOURCE_ID, audience: 'x', idea: {} })).status, 400);
});

Deno.test('AI_PROVIDER=claude routes the same pass to Claude', async () => {
  Deno.env.set('AI_PROVIDER', 'claude');
  Deno.env.set('ANTHROPIC_API_KEY', 'fixture-key');
  const fixtures = installFixtures();
  try {
    const result = await call(runPass, { pass: 'build', app_id: SOURCE_ID, audience: 'Travelers' });
    assertEquals(result.status, 200);
    assertEquals(fixtures.aiRequests.every((request) => request.provider === 'claude'), true);
  } finally {
    fixtures.restore();
    Deno.env.delete('AI_PROVIDER');
    Deno.env.delete('ANTHROPIC_API_KEY');
  }
});

Deno.test('a Muse reply wrapped in a code fence still parses', async () => {
  const fixtures = installFixtures({ reply: (pass) => (pass === 'build' ? '```json\n' + JSON.stringify(PASS_FIXTURES.build) + '\n```' : undefined) });
  try {
    const result = await call(runPass, { pass: 'build', app_id: SOURCE_ID, audience: 'Renters' });
    assertEquals(result.status, 200);
    assertEquals(fixtures.attempts.get('build'), 1);
  } finally {
    fixtures.restore();
  }
});

Deno.test('rate limit: a visitor is stopped after the hourly allowance', () => {
  const now = Date.now();
  for (let i = 0; i < 30; i += 1) assertEquals(takeAiCall('203.0.113.9', now), null);
  assertMatch(takeAiCall('203.0.113.9', now) ?? '', /hourly limit/);
  assertEquals(takeAiCall('203.0.113.10', now), null);
  assertEquals(takeAiCall('203.0.113.9', now + 3601 * 1000), null);
});

Deno.test('build with nothing cached fetches the reviews once and keeps both analyses', async () => {
  const fixtures = installFixtures();
  try {
    // A fresh app ID in another store, so nothing is cached yet.
    const result = await call(runPass, { pass: 'build', app_id: SOURCE_ID, country: 'gb', audience: 'Renters' });
    assertEquals(result.status, 200);
    const feedPage1 = fixtures.calls.filter((path) => path.includes('/gb/rss/customerreviews/page=1/')).length;
    assertEquals(feedPage1, 1);
    const again = await call(runPass, { pass: 'dissect', app_id: SOURCE_ID, country: 'gb' });
    assertEquals(again.body.cached, true);
    const gapsAgain = await call(runPass, { pass: 'gaps', app_id: SOURCE_ID, country: 'gb' });
    assertEquals(gapsAgain.body.cached, true);
  } finally {
    fixtures.restore();
  }
});

Deno.test('a long pass answers "pending", and asking again joins the same job', async () => {
  Deno.env.set('PASS_WAIT_MS', '50');
  const { runPass: slowRunPass, forgetJobs: forgetSlow } = await import(`../server/lib/handlers.ts?wait=50`);
  const fixtures = installFixtures({ delayMs: 200 });
  try {
    forgetSlow();
    const body = { pass: 'build', app_id: SOURCE_ID, country: 'ca', audience: 'Home cooks' };
    const first = await call(slowRunPass, body, { fresh: false });
    assertEquals(first.status, 202);
    assertEquals(first.body.pending, true);
    let result = first;
    for (let i = 0; i < 100 && result.status === 202; i += 1) result = await call(slowRunPass, body, { fresh: false });
    assertEquals(result.status, 200);
    assertEquals(result.body.output.idea.name, PASS_FIXTURES.build.idea.name);
    assertEquals(fixtures.attempts.get('build'), 1);
    // Finished results are kept, so a dropped reply doesn't redo the work.
    assertEquals((await call(slowRunPass, body, { fresh: false })).status, 200);
    assertEquals(fixtures.attempts.get('build'), 1);
  } finally {
    fixtures.restore();
    Deno.env.delete('PASS_WAIT_MS');
  }
});
