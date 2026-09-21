// This is the shared, server-validated catalogue. Adding a provider requires an adapter,
// not an arbitrary model ID supplied by a browser.
export const TTS_MODELS = ["auto", "eleven_flash_v2_5", "eleven_v3", "eleven_v3_conversational"] as const;
export const TONE_MODELS = ["gpt-audio-mini", "gpt-audio"] as const;
export const TONES = ["neutral", "happy", "sad", "angry", "excited", "whispering", "unknown"] as const;
export type Tone = typeof TONES[number];
export type SpeechOptions = { ttsModel: typeof TTS_MODELS[number]; emotion: boolean; toneModel: typeof TONE_MODELS[number]; toneWaitMs: number };
export const DEFAULT_SPEECH_OPTIONS: SpeechOptions = { ttsModel: "auto", emotion: false, toneModel: "gpt-audio-mini", toneWaitMs: 250 };
export type ToneResult = { tone: Tone; strength: "low" | "medium" | "high"; status: "estimated" | "disabled" | "no_audio" | "busy" | "unavailable" | "timeout"; analysisMs: number; model: string };
export type SpeechMetadata = { options: SpeechOptions; tone: ToneResult; extraWaitMs: number };
const oneOf = (values: readonly unknown[], value: unknown) => values.includes(value);
export function isSpeechOptions(value: unknown): value is SpeechOptions {
  if (!value || typeof value !== "object") return false;
  const v = value as SpeechOptions;
  return oneOf(TTS_MODELS, v.ttsModel) && typeof v.emotion === "boolean" && oneOf(TONE_MODELS, v.toneModel) && oneOf([0, 250, 1000], v.toneWaitMs);
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
export function resolveTtsModel(options: SpeechOptions, language: string | undefined, configured: string) {
  const requested = options.ttsModel === "auto" ? configured : options.ttsModel;
  const requiresV3 = language === "th" || options.emotion;
  const isV3 = requested === "eleven_v3" || requested === "eleven_v3_conversational";
  return { model: requiresV3 && !isV3 ? "eleven_v3_conversational" : requested,
    reason: requiresV3 && !isV3 ? (language === "th" ? "Thai requires v3" : "Emotion tags require v3") : "" };
}
export function expressiveText(text: string, model: string, speech?: SpeechMetadata) {
  if (model !== "eleven_v3" && model !== "eleven_v3_conversational") return text;
  // Only our own allowlisted tags become directives. Preserve literal content as words.
  const clean = text.replace(/[\[\]［］]/g, "");
  const tone = speech?.tone;
  if (!speech?.options.emotion || tone?.status !== "estimated" || tone.strength === "low") return clean;
  const tags: Partial<Record<Tone, string>> = { happy: "happily", sad: "sad", angry: "angry", excited: "excited", whispering: "whispers" };
  const tag = tags[tone.tone];
  return tag ? `[${tag}] ${clean}` : clean;
}
