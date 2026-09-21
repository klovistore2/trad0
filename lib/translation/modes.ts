import type { Participant } from "@/types/session";
export type ConversationMode = "direct" | "context";
export type ModePreference = "auto" | ConversationMode;
export const isMode = (value: unknown): value is ConversationMode => value === "direct" || value === "context";
export const isModePreference = (value: unknown): value is ModePreference => value === "auto" || isMode(value);
export function desiredMode(me: Pick<Participant, "preferredMode" | "voiceTier" | "consented" | "useClone" | "voiceStatus">): ConversationMode {
  if (me.preferredMode !== "auto") return me.preferredMode;
  // An existing clone stays selected during the refinement tier.
  return me.consented && me.useClone && me.voiceTier > 0 && me.voiceStatus !== "verification_required" ? "context" : "direct";
}
