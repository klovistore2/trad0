export const VOICE_CONSENT = "session-voice-v1";
export const MIN_SAMPLE_SECONDS = 30;
export const MAX_SAMPLE_BYTES = 3_500_000;
export function validSample(file: File, seconds: number) {
  return seconds >= MIN_SAMPLE_SECONDS && seconds <= 65 && file.size >= 10_000 && file.size <= MAX_SAMPLE_BYTES
    && /^(audio\/(webm|mp4|ogg|mpeg|wav)|video\/mp4)(;.*)?$/.test(file.type);
}
