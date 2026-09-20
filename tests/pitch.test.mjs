// Vocal range detection: a pitch estimate, deliberately not a claim about the speaker.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyRange, estimatePitch, medianPitch, RANGE_MIN_FRAMES } from '../lib/audio/pitch.ts';

const rate = 16000;
function tone(frequency, amplitude = 0.3, size = 2048) {
  const samples = new Float32Array(size);
  for (let i = 0; i < size; i++) samples[i] = Math.sin((i * 2 * Math.PI * frequency) / rate) * amplitude;
  return samples;
}

test('pitch estimation tracks the fundamental across the human speech range', () => {
  for (const frequency of [95, 120, 180, 240]) {
    const estimate = estimatePitch(tone(frequency), rate);
    assert.ok(Math.abs(estimate - frequency) / frequency < 0.05, `${frequency} Hz estimated as ${estimate}`);
  }
});

test('silence and noise are reported as unvoiced instead of a wrong pitch', () => {
  assert.equal(estimatePitch(new Float32Array(2048), rate), 0, 'digital silence');
  assert.equal(estimatePitch(tone(150, 0.001), rate), 0, 'a signal below the speech threshold');
  const noise = new Float32Array(2048);
  let seed = 12345;
  for (let i = 0; i < noise.length; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; noise[i] = (seed / 2147483648) * 0.6 - 0.3; }
  assert.equal(estimatePitch(noise, rate), 0, 'aperiodic noise');
});

test('a range is only declared once enough voiced frames agree', () => {
  assert.equal(classifyRange(Array(RANGE_MIN_FRAMES - 1).fill(110)), null, 'too few frames to decide');
  assert.equal(classifyRange(Array(RANGE_MIN_FRAMES).fill(110)), 'low');
  assert.equal(classifyRange(Array(RANGE_MIN_FRAMES).fill(210)), 'high');
  assert.equal(classifyRange(Array(RANGE_MIN_FRAMES * 2).fill(0)), null, 'unvoiced frames never decide');
});

test('the median ignores outliers so one cracked syllable cannot flip the range', () => {
  const pitches = [...Array(RANGE_MIN_FRAMES).fill(115), 380, 390, 400];
  assert.equal(medianPitch(pitches), 115);
  assert.equal(classifyRange(pitches), 'low');
});
