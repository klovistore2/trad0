import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';

const { browserLanguage, enoughForLanguageDetection } = createLoader()('lib/translation/language.ts');
const context = { params: Promise.resolve({ id: 'room' }) };
const request = (body, method = 'POST', origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/sessions/room/language', {
  method, headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const transcript = 'This is a sufficiently long English speech transcript.';

function setup(detect = async () => 'en', initial = {}) {
  const state = { auto: true, detected: false, revision: 0, attempts: 0, language: 'fr', ...initial };
  let calls = 0;
  const queries = [];
  const sql = async (parts, ...args) => {
    const query = parts.join('?'); queries.push({ query, args });
    if (query.includes('language_attempts=language_attempts+1')) {
      if (!state.auto || state.detected || state.revision !== args[2] || state.attempts >= 3) return [];
      state.attempts++; return [{ language_revision: state.revision }];
    }
    if (query.includes('language_detected=true')) {
      if (!state.auto || state.revision !== args[3]) return [];
      state.language = args[0]; state.detected = true; return [{ language: state.language }];
    }
    if (query.includes('language_revision=language_revision+1')) {
      if (!args[0]) state.language = args[1];
      state.auto = args[2]; state.detected = false; state.revision++;
      return [{ language: state.language }];
    }
    assert.fail(query);
  };
  const route = createLoader({
    '@/lib/session/auth': { member: async () => ({ slot: 1 }) },
    '@/lib/neon/db': { db: () => sql },
    '@/lib/openai/detect-language': { detectLanguage: async text => { calls++; return detect(text); } },
  })('app/api/sessions/[id]/language/route.ts');
  return { ...route, state, queries, calls: () => calls };
}

test('initial browser suggestion supports regional locales and never forces French', () => {
  assert.equal(browserLanguage(['pt-BR']), 'pt');
  assert.equal(browserLanguage(['xx', 'ja-JP']), 'ja');
  assert.equal(browserLanguage([]), 'en');
  assert.equal(enoughForLanguageDetection('OK 123456789012345678901234567890'), false);
  assert.equal(enoughForLanguageDetection('วันนี้ฉันอยากไปเดินเล่นที่ตลาดกับคุณ'), true);
});

test('speech detection updates only the authenticated participant', async () => {
  const app = setup();
  const res = await app.POST(request({ text: transcript, revision: 0, slot: 0 }), context);
  assert.equal(res.status, 200); assert.equal((await res.json()).applied, true);
  assert.equal(app.state.language, 'en'); assert.equal(app.state.detected, true);
  assert.equal(app.queries[0].args[1], 1);
  await app.POST(request({ text: transcript, revision: 0 }), context);
  assert.equal(app.calls(), 1);
});

test('short or oversized transcripts and foreign origins never reach detection', async () => {
  const app = setup();
  for (const text of ['hello', 'x'.repeat(601)]) assert.equal((await app.POST(request({ text, revision: 0 }), context)).status, 400);
  assert.equal((await app.POST(request({ text: transcript, revision: 0 }, 'POST', 'https://foreign.example'), context)).status, 403);
  assert.equal(app.calls(), 0);
});

test('ambiguous speech stays undecided and the server limits detection attempts', async () => {
  const app = setup(async () => null);
  for (let i = 0; i < 5; i++) await app.POST(request({ text: transcript, revision: 0 }), context);
  assert.equal(app.calls(), 3); assert.equal(app.state.language, 'fr'); assert.equal(app.state.detected, false);
});

test('a manual choice wins over an in-flight detection, even after returning to Auto', async () => {
  let resolve; let entered;
  const started = new Promise(done => { entered = done; });
  const app = setup(async () => { entered(); return new Promise(done => { resolve = done; }); });
  const pending = app.POST(request({ text: transcript, revision: 0 }), context);
  await started;
  assert.equal((await app.PATCH(request({ slot: 1, language: 'ja' }, 'PATCH'), context)).status, 200);
  await app.PATCH(request({ slot: 1, language: 'auto' }, 'PATCH'), context);
  resolve('en');
  assert.equal((await (await pending).json()).applied, false);
  assert.equal(app.state.language, 'ja'); assert.equal(app.state.auto, true);
});

test('manual languages and invalid menu values cannot trigger detection', async () => {
  const app = setup(undefined, { auto: false });
  await app.POST(request({ text: transcript, revision: 0 }), context);
  assert.equal(app.calls(), 0);
  for (const body of [{ slot: 3, language: 'en' }, { slot: 0, language: 'invalid' }]) {
    assert.equal((await app.PATCH(request(body, 'PATCH'), context)).status, 400);
  }
});

test('creation carries both selected languages and modes to storage', async () => {
  const calls = [];
  const { POST } = createLoader({
    '@/auth': { auth: async () => ({ user: { id: 'account' } }) },
    '@/lib/session/store': { createSession: async (...args) => { calls.push(args); return 'room'; } },
  })('app/api/sessions/route.ts');
  assert.equal((await POST(request({ language: 'de', peerLanguage: 'ja', languageAuto: false, peerLanguageAuto: true }))).status, 200);
  assert.deepEqual(calls, [['account', 'ja', 'de', false, true]]);
  assert.equal((await POST(request({ language: 'invalid', peerLanguage: 'ja', languageAuto: true, peerLanguageAuto: true }))).status, 400);
});

test('classification sends bounded text with storage disabled and accepts only supported languages', async () => {
  const oldFetch = globalThis.fetch; const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-secret';
  try {
    const { detectLanguage } = createLoader()('lib/openai/detect-language.ts');
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false); assert.equal(body.messages[1].content, transcript);
      assert.equal(body.response_format.json_schema.strict, true);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"language":"de"}' } }] });
    };
    assert.equal(await detectLanguage(transcript), 'de');
    for (const content of ['{"language":"unknown"}', '{"language":"xx"}', 'invalid']) {
      globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });
      assert.equal(await detectLanguage(transcript), null);
    }
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});
