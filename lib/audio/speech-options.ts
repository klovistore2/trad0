// This is the shared, server-validated catalogue. Adding a provider requires an adapter,
// not an arbitrary model ID supplied by a browser.
// One speaking model: v3 Conversational is the realtime member of the v3 family and the only
// one that covers Thai and the emotion tags. Plain v3 is tuned for narration and measured
// slower, so a conversation never benefits from offering the choice.
export const TTS_MODEL = "eleven_v3_conversational";
export const TONE_MODELS = ["gpt-audio-mini", "gpt-audio"] as const;
export const TONES = ["neutral", "happy", "sad", "angry", "excited", "whispering", "unknown"] as const;
export type Tone = typeof TONES[number];
// Only the trade-off the speaker actually decides. Everything it implies is derived below,
// so the panel never asks a question whose answer follows from another answer.
export type SpeechOptions = { emotion: boolean };
export const DEFAULT_SPEECH_OPTIONS: SpeechOptions = { emotion: false };
export type ToneResult = { tone: Tone; strength: "low" | "medium" | "high"; status: "estimated" | "disabled" | "no_audio" | "busy" | "unavailable" | "timeout"; analysisMs: number; model: string };
export type SpeechMetadata = { options: SpeechOptions; tone: ToneResult; extraWaitMs: number };
// Always the faster audio model: the estimate is useless once it arrives after the sentence.
export const TONE_MODEL: typeof TONE_MODELS[number] = "gpt-audio-mini";
// Asking for tone is asking to wait for it; refusing it must cost nothing. There is no middle
// setting to pick because no speaker can weigh milliseconds against emotional accuracy.
export const toneWaitMs = (options: SpeechOptions) => options.emotion ? 1000 : 0;
const oneOf = (values: readonly unknown[], value: unknown) => values.includes(value);
export function isSpeechOptions(value: unknown): value is SpeechOptions {
  if (!value || typeof value !== "object") return false;
  return typeof (value as SpeechOptions).emotion === "boolean";
}
export function isToneResult(value: unknown): value is ToneResult {
  if (!value || typeof value !== "object") return false;
  const v = value as ToneResult;
  return oneOf(TONES, v.tone) && oneOf(["low", "medium", "high"], v.strength)
    && oneOf(["estimated", "disabled", "no_audio", "busy", "unavailable", "timeout"], v.status)
    && Number.isFinite(v.analysisMs) && v.analysisMs >= 0 && v.analysisMs <= 300_000
    && oneOf(TONE_MODELS, v.model);
}
export function isSpeechMetadata(value: unknown): value is SpeechMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as SpeechMetadata;
  return isSpeechOptions(v.options) && isToneResult(v.tone) && Number.isFinite(v.extraWaitMs) && v.extraWaitMs >= 0 && v.extraWaitMs <= 300_000;
}
export function expressiveText(text: string, model: string, speech?: SpeechMetadata) {
  if (model !== TTS_MODEL) return text;
  // Only our own allowlisted tags become directives. Preserve literal content as words.
  const clean = text.replace(/[\[\]［］]/g, "");
  const tone = speech?.tone;
  if (!speech?.options.emotion || tone?.status !== "estimated" || tone.strength === "low") return clean;
  const tags: Partial<Record<Tone, string>> = { happy: "happily", sad: "sad", angry: "angry", excited: "excited", whispering: "whispers" };
  const tag = tags[tone.tone];
  return tag ? `[${tag}] ${clean}` : clean;
}
