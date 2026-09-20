export const VOICE_CONSENT = "session-voice-v1";
export const MIN_SAMPLE_SECONDS = 25;
// Later tiers send the whole conversation sample, so the ceiling follows the payload cap
// rather than a single recording session.
export const MAX_SAMPLE_SECONDS = 400;
export const MAX_SAMPLE_BYTES = 3_500_000;
// Tiers are cumulative samples of the same voice: a first usable clone, then a better one.
export const VOICE_TIERS = [{ tier: 1, seconds: 30 }, { tier: 2, seconds: 150 }] as const;
export const FINAL_TIER = VOICE_TIERS[VOICE_TIERS.length - 1].tier;
const SAMPLE_TYPE = /^(audio\/(webm|mp4|ogg|mpeg|wav)|video\/mp4)(;.*)?$/;
// A microphone stream that was torn down cannot be resumed in the same container, so a
// sample may arrive as several complete recordings of the same voice.
export function validSamples(files: File[], seconds: number) {
  if (!files.length || !(seconds >= MIN_SAMPLE_SECONDS) || seconds > MAX_SAMPLE_SECONDS) return false;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total < 10_000 || total > MAX_SAMPLE_BYTES) return false;
  return files.every(file => SAMPLE_TYPE.test(file.type));
}
export function validSample(file: File, seconds: number) {
  return validSamples([file], seconds);
}

