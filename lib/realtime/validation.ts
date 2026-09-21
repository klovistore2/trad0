import { isLanguage } from "@/types/session";
import { isMode } from "@/lib/translation/modes";
import type { PeerEvent } from "@/types/session";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function isPeerEvent(value: unknown): value is PeerEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (event.kind !== undefined && event.kind !== "original" && event.kind !== "translation") return false;
  if (event.mode !== undefined && !isMode(event.mode)) return false;
  if (event.original !== undefined && (typeof event.original !== "string" || event.original.length > 4000)) return false;
  if (event.sourceLanguage !== undefined && !isLanguage(event.sourceLanguage)) return false;
  if (event.targetLanguage !== undefined && !isLanguage(event.targetLanguage)) return false;
  if (event.timing !== undefined) {
    if (!event.timing || typeof event.timing !== "object") return false;
    const timing = event.timing as Record<string, unknown>;
    if (!["waitMs", "translationMs", "publishMs", "contextTurns"].every(key => typeof timing[key] === "number" && Number.isFinite(timing[key]) && Number(timing[key]) >= 0 && Number(timing[key]) <= 300_000)
      || typeof timing.model !== "string" || timing.model.length > 100) return false;
  }
  return uuid(event.id) && uuid(event.turnId) && typeof event.text === "string" && event.text.length > 0 && event.text.length <= 4000 && typeof event.committed === "boolean";
}
