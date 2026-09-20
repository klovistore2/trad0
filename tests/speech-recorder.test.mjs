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

test('only the time between listening and pausing is counted as speech', () => {
  const { recorder, advance, restore } = setup();
  try {
    const stream = {};
    recorder.listen(stream);
    advance(12_000);
    recorder.pause();
    advance(60_000); // the other person speaks: this must not count
    assert.equal(Math.round(recorder.seconds), 12);
    recorder.listen(stream);
    advance(8_000);
    recorder.pause();
    assert.equal(Math.round(recorder.seconds), 20, 'a second turn adds to the first');
  } finally { restore(); }
});

test('resuming the same stream continues one recording, a new stream starts a segment', () => {
  const { recorder, advance, restore } = setup();
  try {
    const first = {};
    recorder.listen(first);
    FakeRecorder.last.emit(4000);
    advance(30_000);
    recorder.pause();
    assert.equal(recorder.samples().length, 1, 'one container so far');
    recorder.listen(first);
    assert.equal(FakeRecorder.last.state, 'recording', 'the same stream resumes rather than restarting');
    FakeRecorder.last.emit(4000);
    advance(30_000);
    recorder.pause();
    assert.equal(recorder.samples().length, 1, 'still a single container');

    // A microphone torn down and reopened cannot continue the previous container.
    const second = {};
    recorder.listen(second);
    FakeRecorder.last.emit(4000);
    advance(30_000);
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
    advance(40_000);
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
