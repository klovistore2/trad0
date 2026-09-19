export type TranslationMessage =
  | { kind: "original" | "translation"; delta: string }
  | { kind: "error" | "closed" };

// Keep provider event names at this boundary; ignore unknown events.
export function parseTranslationMessage(data: string): TranslationMessage | null {
  let event: unknown;
  try { event = JSON.parse(data); } catch { return null; }
  if (!event || typeof event !== "object" || !("type" in event)) return null;
  if (event.type === "error") return { kind: "error" };
  if (event.type === "session.closed") return { kind: "closed" };
  if (!("delta" in event) || typeof event.delta !== "string" || !event.delta) return null;
  if (event.type === "session.output_transcript.delta") return { kind: "translation", delta: event.delta };
  if (event.type === "session.input_transcript.delta") return { kind: "original", delta: event.delta };
  return null;
}
