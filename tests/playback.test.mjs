// Sentences follow each other without waiting for the provider: the next one is prepared while the
// current one plays, one download at a time, and dropped as soon as playback stops.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';

// Playback is ended by the test itself, when it chooses.
class FakeAudio {
  constructor() { FakeAudio.last = this; this.onended = null; }
  setAttribute() {}
  pause() {}
  play() { return Promise.resolve(); }
}
const settle = async (condition, label) => {
  for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail(`timed out: ${label}`);
};
function setup() {
  const previous = { Audio: globalThis.Audio, fetch: globalThis.fetch };
  globalThis.Audio = FakeAudio;
  const requests = [];
  // Each request is answered when the test releases it, so "still downloading" can be observed.
  globalThis.fetch = (url, init) => new Promise(resolve => {
    requests.push({ text: JSON.parse(init.body).text, signal: init.signal,
      release: () => resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } })) });
  });
  const { ElevenLabsVoiceProvider } = createLoader()('lib/elevenlabs/voice-provider.ts');
  const voice = new ElevenLabsVoiceProvider();
  const say = (id, text) => voice.speakStream({ id, sessionId: 'room', language: 'fr', textStream: (async function* () { yield text; })() });
  return { voice, say, requests, restore: () => Object.assign(globalThis, previous) };
}

test('the next sentence waits for the current audio, then is prepared and played without a new request', async () => {
  const { voice, say, requests, restore } = setup();
  try {
    const first = say('a', 'Bonjour. ');
    await settle(() => requests.length === 1, 'first request');
    voice.prefetch({ id: 'b', sessionId: 'room', language: 'fr', text: 'Deuxième phrase. ' });
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1, 'one download at a time: the next one waits for this audio');
    requests[0].release();
    await settle(() => requests.length === 2, 'prepared once the audio has arrived');
    assert.equal(requests[1].text, 'Deuxième phrase. ');
    await settle(() => typeof FakeAudio.last.onended === 'function', 'first playing');
    FakeAudio.last.onended(); await first;
    requests[1].release();
    const second = say('b', 'Deuxième phrase. ');
    await settle(() => typeof FakeAudio.last.onended === 'function', 'second playing');
    assert.equal(requests.length, 2, 'the prepared synthesis is played, not requested again');
    assert.equal(voice.lastSynthesis.prefetched, true);
    FakeAudio.last.onended(); await second;
  } finally { restore(); }
});

test('stopping playback drops the prepared sentence', async () => {
  const { voice, requests, restore } = setup();
  try {
    voice.prefetch({ id: 'c', sessionId: 'room', language: 'fr', text: 'Plus tard. ' });
    await settle(() => requests.length === 1, 'prepared');
    voice.stop();
    assert.equal(requests[0].signal.aborted, true);
    voice.prefetch({ id: 'd', sessionId: 'room', language: 'fr', text: '…' });
    assert.equal(requests.length, 1, 'nothing to pronounce is never requested');
  } finally { restore(); }
});
