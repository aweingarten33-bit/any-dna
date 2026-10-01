
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

Deno.test('new flow: upload → audiences → headline → idea → competitors', async () => {
  const fixtures = installFixtures();
  try {
    const upload = TEXT_UPLOAD;
    const suggest = await flowCall({ pass: 'suggest', upload });
    assertEquals(suggest.status, 200);
    const audiences = suggest.body.output.audiences as string[];
    assert(audiences.length >= 4, 'suggests several audiences');

    const audience = 'Concertgoers';
    const headline = await flowCall({ pass: 'headline', upload, audience });
    assertEquals(headline.status, 200);
    assertEquals(headline.body.output.name, 'Crowdlight');

    const generate = await flowCall({ pass: 'generate', upload, audience, headline: headline.body.output });
    assertEquals(generate.status, 200);
    const idea = generate.body.output as GeneratedIdea;
    // The headline is kept exactly.
    assertEquals(idea.name, 'Crowdlight');
    assertEquals(idea.tagline, 'Find your friends in any crowd, fast.');
    assert(idea.pattern.length > 0);
    assert(idea.callbacks.length > 0);
    assert(idea.search_terms.length > 0);

    // A template steer reaches the prompt.
    const steered = await flowCall({ pass: 'generate', upload, audience, headline: headline.body.output, templateId: 'people-map' });
    assertEquals(steered.status, 200);
    const steeredCall = fixtures.aiRequests.find((r) => r.provider === 'muse' && JSON.stringify(r.body.input).includes('Find My'));
    assert(steeredCall, 'the template steer reaches the generate prompt');

    // Competitors come from a real App Store search, no AI.
    const compete = await flowCall({ pass: 'compete', upload, audience, idea });
    assertEquals(compete.status, 200);
    assert(compete.body.competitors.length > 0 && compete.body.competitors.length <= 5);

    // The mockup words still work with the new idea shape.
    const kit = await flowCall({ pass: 'kit', upload, audience, idea });
    assertEquals(kit.status, 200);
    assertEquals((kit.body.output as Kit).screen.cards.length, 3);
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
