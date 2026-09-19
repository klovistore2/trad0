import type { PeerEvent } from "@/types/session";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function isPeerEvent(value: unknown): value is PeerEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return uuid(event.id) && uuid(event.turnId) && typeof event.text === "string" && event.text.length > 0 && event.text.length <= 4000 && typeof event.committed === "boolean";
}
