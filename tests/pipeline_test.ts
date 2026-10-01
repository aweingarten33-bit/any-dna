// End-to-end test of the edge-function handlers against the fixture doubles.
//   deno test -A tests/
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@^1';
import { getReviews, resolveApp, runPass } from '../supabase/functions/_shared/handlers.ts';
import { parseAppInput } from '../supabase/functions/_shared/itunes.ts';
import type { FitCheck, Gaps, Idea, Verdict } from '../supabase/functions/_shared/types.ts';
import { installFixtures, PASS_FIXTURES, SOURCE_ID } from '../dev/fixtures.ts';

Deno.env.set('ANTHROPIC_API_KEY', 'fixture-key');
Deno.env.delete('SUPABASE_URL');

async function call(handler: (req: Request) => Promise<Response>, body: unknown) {
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

    const dissect = await call(runPass, { pass: 'dissect', app_id: SOURCE_ID });
    assertEquals(dissect.body.cached, false);

    const gaps = (await call(runPass, { pass: 'gaps', app_id: SOURCE_ID })).body.output as Gaps;
    // Counts are from the cited reviews; the single-review theme is dropped as not repeated.
    assertEquals(gaps.repeated_complaints.map((c) => [c.theme.slice(0, 12), c.evidence_count]), [['Streaks lost', 3], ['Streak prote', 2], ['Too many gui', 2]]);
    // Examples are verbatim review text.
    assertMatch(gaps.repeated_complaints[0].example, /200 day streak|time zone|crashed/);

    const fit = (await call(runPass, { pass: 'fit_check', app_id: SOURCE_ID, audience: 'Dog owners' })).body.output as FitCheck;
    assertEquals(fit.components.find((c) => c.status === 'survives')?.replacement, '');

    const idea = (await call(runPass, { pass: 'mutate', app_id: SOURCE_ID, audience: 'Dog owners', fit_check: fit })).body.output as Idea;
    assertEquals(idea.name, 'Walkies');

    const verdictResponse = await call(runPass, { pass: 'verdict', app_id: SOURCE_ID, audience: 'Dog owners', idea });
    const verdict = verdictResponse.body.output as Verdict;
    // The made-up app ID is dropped; names and prices are copied from the listing.
    assertEquals(verdict.competitors.map((c) => c.app_id), ['2000000001', '2000000003']);
    assertEquals(verdict.competitors[0].name, 'PawWalk Log (demo)');
    assertEquals(verdict.competitors[0].formatted_price, 'Free');
    assert(verdictResponse.body.searched.length >= 4);
    assert(!verdictResponse.body.searched.some((app: { app_id: string }) => app.app_id === SOURCE_ID), 'source app is not its own competitor');
    assertEquals(verdict.mvp.length, 5);
    assertEquals(verdict.checks.desirability, 7);
    assertEquals(verdict.go_no_go, 'go');

    // Audience-independent passes are cached for "Try a different audience".
    const again = await call(runPass, { pass: 'dissect', app_id: SOURCE_ID });
    assertEquals(again.body.cached, true);
    assertEquals(fixtures.attempts.get('dissect'), 1);
  } finally {
    fixtures.restore();
  }
});

Deno.test('invalid JSON is retried once, then the run fails clearly', async () => {
  const once = installFixtures({ reply: (pass, attempt) => (pass === 'fit_check' && attempt === 1 ? 'not json {' : undefined) });
  try {
    const ok = await call(runPass, { pass: 'fit_check', app_id: SOURCE_ID, audience: 'Renters' });
    assertEquals(ok.status, 200);
    assertEquals(once.attempts.get('fit_check'), 2);
  } finally {
    once.restore();
  }
  const always = installFixtures({ reply: (pass) => (pass === 'fit_check' ? { components: 'wrong shape' } : undefined) });
  try {
    const failed = await call(runPass, { pass: 'fit_check', app_id: SOURCE_ID, audience: 'Renters' });
    assertEquals(failed.status, 502);
    assertMatch(failed.body.error, /invalid output twice/);
    assertEquals(always.attempts.get('fit_check'), 2);
  } finally {
    always.restore();
  }
});

Deno.test('a "go" that fails the checks becomes no-go', async () => {
  const verdict = PASS_FIXTURES.verdict as Record<string, unknown>;
  const fixtures = installFixtures({ reply: (pass) => (pass === 'verdict' ? { ...verdict, checks: { ...(verdict.checks as object), already_exists: true } } : undefined) });
  try {
    const idea = PASS_FIXTURES.mutate;
    const result = await call(runPass, { pass: 'verdict', app_id: SOURCE_ID, audience: 'Dog owners', idea });
    assertEquals(result.body.output.go_no_go, 'no_go');
    assertMatch(result.body.output.reason, /^Marked no-go/);
  } finally {
    fixtures.restore();
  }
});

Deno.test('bad requests get a 400 with a reason', async () => {
  assertEquals((await call(runPass, { pass: 'nope', app_id: SOURCE_ID })).status, 400);
  assertEquals((await call(runPass, { pass: 'fit_check', app_id: SOURCE_ID })).body.error, 'audience is required');
  assertEquals((await call(runPass, { pass: 'verdict', app_id: SOURCE_ID, audience: 'x', idea: {} })).status, 400);
});
