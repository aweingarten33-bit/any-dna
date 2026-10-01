// Local API server for development: the same server as production.
// Run the web app with `npm run dev`; Vite forwards /api to this port.
//
//   deno run -A dev/server.ts             real Apple + Muse (needs META_MODEL_API_KEY)
//   deno run -A dev/server.ts --fixtures  fictional demo data, no network or key needed
//   add --reject-all to see the "nothing passed" screen (the stranger rejects every idea)
import { handle } from '../server/main.ts';
import { installFixtures } from './fixtures.ts';

if (Deno.args.includes('--fixtures')) {
  Deno.env.set('META_MODEL_API_KEY', Deno.env.get('META_MODEL_API_KEY') ?? 'fixture-key');
  const rejectAll = Deno.args.includes('--reject-all');
  installFixtures({
    delayMs: 900,
    reply: (pass) => (rejectAll && pass === 'filter' ? { verdicts: [0, 1, 2].map((index) => ({ index, keep: false, desirability: 3, reason: 'Already exists.' })) } : undefined),
  });
  console.log('Demo mode: Apple and the AI are replaced by fictional fixture data.');
}

Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000) }, handle);
