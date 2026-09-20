// The capture that feeds progressive cloning: only the speaker's own turns, counted honestly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';

class FakeRecorder {
  static supported = true;
  static isTypeSupported() { return FakeRecorder.supported; }
  constructor(stream, options = {}) {
    this.stream = stream; this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive'; FakeRecorder.last = this;
  }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; }
  emit(bytes) { this.ondataavailable({ data: new Blob([new Uint8Array(bytes)]) }); }
}

// Transcript fragments arrive several times a second while someone talks; anything sparser
// would be treated as separate short bursts, which is the point of the tail.
function speak(recorder, advance, ms) {
  recorder.heard();
  for (let elapsed = 0; elapsed < ms; elapsed += 500) { advance(500); recorder.heard(); }
}

function setup() {
  globalThis.MediaRecorder = FakeRecorder;
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  const { SpeechRecorder } = createLoader()('lib/audio/speech-recorder.ts');
  return {
    recorder: new SpeechRecorder(),
    advance: ms => { clock += ms; },
    restore: () => { Date.now = realNow; delete globalThis.MediaRecorder; },
  };
}

test('an open microphone with nobody speaking counts as no speech at all', () => {
  const { recorder, advance, restore } = setup();
  try {
    recorder.listen({});
    advance(120_000); // reading the screen, waiting for the other person, thinking
    assert.equal(recorder.seconds, 0, 'holding the floor is not speaking');
    recorder.pause();
    assert.equal(recorder.seconds, 0);
  } finally { restore(); }
});

test('speech runs from the first transcript fragment to the last, plus a short tail', () => {
  const { recorder, advance, restore } = setup();
  try {
    recorder.listen({});
    advance(20_000);
    speak(recorder, advance, 10_000);
    assert.equal(recorder.seconds, 10, 'the stretch in progress is counted as it runs');
    advance(60_000); // a long silence must not be credited
    assert.equal(recorder.seconds, 11.5, 'only the tail is added once the voice stops');
    speak(recorder, advance, 4_000);
    assert.equal(recorder.seconds, 15.5, 'a later stretch adds to the first');
  } finally { restore(); }
});

test('pausing closes the stretch instead of crediting the silence that follows', () => {
  const { recorder, advance, restore } = setup();
  try {
    recorder.listen({});
    speak(recorder, advance, 6_000);
    recorder.pause();
    const counted = recorder.seconds;
    assert.equal(counted, 6);
    advance(300_000);
    assert.equal(recorder.seconds, counted, 'time while the other person talks is never counted');
  } finally { restore(); }
});

test('resuming the same stream continues one recording, a new stream starts a segment', () => {
  const { recorder, advance, restore } = setup();
  try {
    const first = {};
    recorder.listen(first);
    FakeRecorder.last.emit(4000);
    speak(recorder, advance, 30_000);
    recorder.pause();
    assert.equal(recorder.samples().length, 1, 'one container so far');
    recorder.listen(first);
    assert.equal(FakeRecorder.last.state, 'recording', 'the same stream resumes rather than restarting');
    FakeRecorder.last.emit(4000);
    speak(recorder, advance, 30_000);
    recorder.pause();
    assert.equal(recorder.samples().length, 1, 'still a single container');

    // A microphone torn down and reopened cannot continue the previous container.
    const second = {};
    recorder.listen(second);
    FakeRecorder.last.emit(4000);
    speak(recorder, advance, 30_000);
    recorder.pause();
    const samples = recorder.samples();
    assert.equal(samples.length, 2, 'the finished recording is kept whole beside the new one');
    assert.ok(samples.every(blob => blob.size > 0));
    assert.equal(Math.round(recorder.seconds), 90, 'speech time survives the stream change');
  } finally { restore(); }
});

test('discarding frees the audio once the final clone exists', () => {
  const { recorder, advance, restore } = setup();
  try {
    recorder.listen({});
    FakeRecorder.last.emit(4000);
    speak(recorder, advance, 40_000);
    recorder.pause();
    assert.equal(recorder.samples().length, 1);
    recorder.discard();
    assert.deepEqual(recorder.samples(), [], 'nothing is kept in memory afterwards');
  } finally { restore(); }
});

test('an unsupported browser degrades to no capture instead of throwing', () => {
  const realNow = Date.now;
  delete globalThis.MediaRecorder;
  const { SpeechRecorder } = createLoader()('lib/audio/speech-recorder.ts');
  try {
    const recorder = new SpeechRecorder();
    recorder.listen({});
    recorder.pause();
    assert.equal(recorder.seconds, 0);
    assert.deepEqual(recorder.samples(), []);
  } finally { Date.now = realNow; }
});
