// Local API server for development: the same server as production.
// Run the web app with `npm run dev`; Vite forwards /api to this port.
//
//   deno run -A dev/server.ts             real Apple + Muse (needs META_MODEL_API_KEY)
//   deno run -A dev/server.ts --fixtures  fictional demo data, no network or key needed
import { handle } from '../server/main.ts';
import { installFixtures } from './fixtures.ts';

if (Deno.args.includes('--fixtures')) {
  Deno.env.set('META_MODEL_API_KEY', Deno.env.get('META_MODEL_API_KEY') ?? 'fixture-key');
  installFixtures({ delayMs: 900 });
  console.log('Demo mode: Apple and the AI are replaced by fictional fixture data.');
}

Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000) }, handle);
