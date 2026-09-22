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
export function desiredMode(me: Pick<Participant, "preferredMode" | "voiceTier" | "consented" | "useClone" | "voiceStatus">): ConversationMode {
  if (me.preferredMode !== "auto") return me.preferredMode;
  // An existing clone stays selected during the refinement tier.
  return me.consented && me.useClone && me.voiceTier > 0 && me.voiceStatus !== "verification_required" ? "context" : "direct";
}
