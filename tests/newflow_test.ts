
// The new front door: ideas from the upload itself.
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@^1';
import { flowPass, forgetJobs } from '../server/lib/handlers.ts';
import type { GeneratedIdea, Kit } from '../server/lib/types.ts';
import { installFixtures } from '../dev/fixtures.ts';
import { zipSync } from 'npm:fflate@^0.8.2';

Deno.env.set('META_MODEL_API_KEY', 'fixture-key');
Deno.env.delete('ANTHROPIC_API_KEY');
Deno.env.delete('AI_PROVIDER');
Deno.env.delete('DATABASE_URL');

async function flowCall(body: unknown, { fresh = true } = {}) {
  if (fresh) forgetJobs();
  const response = await flowPass(new Request('http://local/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}

const TEXT_UPLOAD = { kind: 'text', text: 'an app for people who lose their friends at concerts' };

Deno.test('new flow: upload → audiences → research + DNA → 3 ideas → stranger filter → competitors', async () => {
  const fixtures = installFixtures();
  try {
    const upload = TEXT_UPLOAD;
    const suggest = await flowCall({ pass: 'suggest', upload });
    assertEquals(suggest.status, 200);
    assert((suggest.body.output.audiences as string[]).length >= 4, 'suggests several audiences');

    const audience = 'Concertgoers';
    const direction = 'something for festival weekends';
    // Stages 1 and 2: the upload researched, and its DNA.
    const read = await flowCall({ pass: 'read', upload, audience, direction });
    assertEquals(read.status, 200);
    assert(read.body.output.mechanics.length >= 2);
    const readCall = fixtures.aiRequests.find((r) => String(r.body.instructions).includes('PART 2 — Extract DNA'));
    assertMatch(JSON.stringify(readCall?.body.input), /festival weekends/);

    // Stage 3: three ideas, built from the reading (no upload bytes needed).
    const invent = await flowCall({ pass: 'invent', audience, direction, read: read.body.output, templateId: 'people-map' });
    assertEquals(invent.status, 200);
    const ideas = invent.body.output as GeneratedIdea[];
    assertEquals(ideas.length, 3);
    const inventCall = fixtures.aiRequests.find((r) => String(r.body.instructions).includes('Return: 3 ideas'));
    assertMatch(String(inventCall?.body.input), /Find My/);

    // Stage 4: the blunt stranger keeps the good ones, best first; the rejected one is dropped.
    const filter = await flowCall({ pass: 'filter', ideas, read: read.body.output });
    assertEquals(filter.status, 200);
    const kept = filter.body.output as GeneratedIdea[];
    assertEquals(kept.map((idea) => idea.name), ['Glowstick', 'Crowdlight']);

    // Competitors come from a real App Store search, no AI.
    const compete = await flowCall({ pass: 'compete', audience, idea: kept[0] });
    assertEquals(compete.status, 200);
    assert(compete.body.competitors.length > 0 && compete.body.competitors.length <= 5);

    const kit = await flowCall({ pass: 'kit', audience, idea: kept[0] });
    assertEquals(kit.status, 200);
    assertEquals((kit.body.output as Kit).screen.cards.length, 3);
  } finally {
    fixtures.restore();
  }
});

Deno.test('if the stranger rejects every idea, the best-rated one is still shown', async () => {
  const fixtures = installFixtures({ reply: (pass) => (pass === 'filter' ? { verdicts: [
    { index: 0, keep: false, desirability: 4, reason: 'x' }, { index: 1, keep: false, desirability: 6, reason: 'y' }, { index: 2, keep: false, desirability: 2, reason: 'z' },
  ] } : undefined) });
  try {
    const read = await flowCall({ pass: 'read', upload: TEXT_UPLOAD, audience: 'Concertgoers' });
    const invent = await flowCall({ pass: 'invent', audience: 'Concertgoers', read: read.body.output });
    const filter = await flowCall({ pass: 'filter', ideas: invent.body.output, read: read.body.output });
    assertEquals((filter.body.output as GeneratedIdea[]).map((idea) => idea.name), ['Huddle']);
  } finally {
    fixtures.restore();
  }
});

Deno.test('flow-pass rejects bad uploads with a reason', async () => {
  const fixtures = installFixtures();
  try {
    const empty = await flowCall({ pass: 'suggest', upload: { kind: 'text', text: '   ' } });
    assertEquals(empty.status, 400);

    const unknown = await flowCall({ pass: 'suggest', upload: { kind: 'video' } });
    assertEquals(unknown.status, 400);

    const big = await flowCall({
      pass: 'suggest',
      upload: { kind: 'photo', dataUrl: `data:image/jpeg;base64,${'A'.repeat(15 * 1024 * 1024)}`, filename: 'big.jpg' },
    });
    assertEquals(big.status, 400);
    assertMatch(big.body.error, /too big/);

    const bmp = await flowCall({ pass: 'suggest', upload: { kind: 'photo', dataUrl: 'data:image/bmp;base64,AAAA', filename: 'a.bmp' } });
    assertEquals(bmp.status, 400);
    assertMatch(bmp.body.error, /cannot read/);
  } finally {
    fixtures.restore();
  }
});

Deno.test('a photo upload reaches Muse as an image block', async () => {
  const fixtures = installFixtures();
  try {
    const upload = { kind: 'photo', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ', filename: 'crowd.jpg' };
    const suggest = await flowCall({ pass: 'suggest', upload });
    assertEquals(suggest.status, 200);
    const museCall = fixtures.aiRequests.find((r) => r.provider === 'muse');
    const input = JSON.stringify(museCall?.body.input);
    assertMatch(input, /"type":"input_image"/);
    assertMatch(input, /data:image\/jpeg;base64/);
    // Saving is off: the user's photo is never stored.
    assertEquals(museCall?.body.store, false);
  } finally {
    fixtures.restore();
  }
});

Deno.test('a Word document is read as text, never sent as a file', async () => {
  const fixtures = installFixtures();
  try {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>concert</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>`;
    const zipped = zipSync({ 'word/document.xml': new TextEncoder().encode(xml) });
    let binary = '';
    zipped.forEach((byte) => { binary += String.fromCharCode(byte); });
    const upload = {
      kind: 'document',
      dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${btoa(binary)}`,
      filename: 'notes.docx',
    };
    const suggest = await flowCall({ pass: 'suggest', upload });
    assertEquals(suggest.status, 200);
    const museCall = fixtures.aiRequests.find((r) => r.provider === 'muse');
    const input = JSON.stringify(museCall?.body.input);
    assertMatch(input, /Hello concert/);
    assertMatch(input, /Second paragraph/);
    assert(!input.includes('input_file'), 'a docx becomes text, not a file block');
  } finally {
    fixtures.restore();
  }
});
