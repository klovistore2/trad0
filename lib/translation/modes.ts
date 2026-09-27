import type { Participant, Language } from "@/types/session";
// Output languages of the direct translation model, distinct from its input languages.
export const DIRECT_OUTPUT_LANGUAGES: readonly Language[] = ["en", "fr", "es", "pt", "ja", "ru", "zh", "de", "ko", "hi", "id", "vi", "it"];
export const supportsDirectOutput = (language: string) => (DIRECT_OUTPUT_LANGUAGES as readonly string[]).includes(language);
export function modeForLanguage(preference: ConversationMode, language: string | undefined, directUnavailable = false): ConversationMode {
  return preference === "direct" && (directUnavailable || (language !== undefined && !supportsDirectOutput(language))) ? "context" : preference;
}
export type ConversationMode = "direct" | "context";
export type ModePreference = "auto" | ConversationMode;
export const isMode = (value: unknown): value is ConversationMode => value === "direct" || value === "context";
export const isModePreference = (value: unknown): value is ModePreference => value === "auto" || isMode(value);
// The mode follows the speaker's own settings: their voice, or their tone, needs the context
// route; with neither, the faster direct route. `tone` is the caller's already account-checked choice.
export function desiredMode(me: Pick<Participant, "preferredMode" | "voiceTier" | "consented" | "useClone" | "voiceStatus">, tone = false): ConversationMode {
  if (me.preferredMode !== "auto") return me.preferredMode;
  // An existing clone stays selected during the refinement tier.
  const clone = me.consented && me.useClone && me.voiceTier > 0 && me.voiceStatus !== "verification_required";
  return clone || tone ? "context" : "direct";
}
