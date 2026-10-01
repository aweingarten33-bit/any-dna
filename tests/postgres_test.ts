// Runs the pipeline against a real Postgres. Skipped unless TEST_DATABASE_URL is set:
//   TEST_DATABASE_URL=postgres://user@localhost:5432/spinoff deno test -A tests/postgres_test.ts
import { assertEquals } from 'jsr:@std/assert@^1';
import postgres from 'npm:postgres@^3.4.5';
import { installFixtures, SOURCE_ID } from '../dev/fixtures.ts';

const url = Deno.env.get('TEST_DATABASE_URL');

Deno.test({
  name: 'Postgres cache: schema applies twice, rows round-trip, analysis is reused',
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    Deno.env.set('DATABASE_URL', url!);
    Deno.env.set('META_MODEL_API_KEY', 'fixture-key');
    const { migrate } = await import('../server/lib/cache.ts');
    const { getReviews, resolveApp, runPass } = await import('../server/lib/handlers.ts');
    const schema = await Deno.readTextFile(new URL('../server/schema.sql', import.meta.url));
    const sql = postgres(url!);
    await sql`drop table if exists app_cache, ideas`;
    assertEquals(await migrate(schema), true);
    assertEquals(await migrate(schema), true); // idempotent

    const fixtures = installFixtures();
    const call = async (handler: (req: Request) => Promise<Response>, body: unknown) =>
      (await handler(new Request('http://local/', { method: 'POST', body: JSON.stringify(body) }))).json();
    try {
      await call(resolveApp, { query: 'streakly' });
      await call(getReviews, { app_id: SOURCE_ID });
      const first = await call(runPass, { pass: 'dissect', app_id: SOURCE_ID });
      assertEquals(first.cached, false);
      const second = await call(runPass, { pass: 'dissect', app_id: SOURCE_ID });
      assertEquals(second.cached, true);
      assertEquals(fixtures.attempts.get('dissect'), 1);

      const [row] = await sql`select listing_json->>'name' as name, jsonb_array_length(reviews_json->'reviews') as reviews,
        analysis_json ? 'dissect' as has_dissect from app_cache where app_id = ${SOURCE_ID} and country = 'us'`;
      assertEquals(row.name, 'Streakly (demo app)');
      assertEquals(row.reviews, 8);
      assertEquals(row.has_dissect, true);
    } finally {
      fixtures.restore();
      await sql.end();
    }
  },
});
