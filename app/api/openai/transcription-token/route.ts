import { member } from "@/lib/session/auth";
import { requireCredits } from "@/lib/billing/credits";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const body = await readJson(request);
    if (typeof body.sessionId !== "string") throw new HttpError(400, "Invalid session.");
    await member(body.sessionId);
    await requireCredits(body.sessionId);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new HttpError(503, "Transcription is unavailable.");
    const model = process.env.OPENAI_INPUT_TRANSCRIPTION_MODEL?.trim() || "gpt-realtime-whisper";
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session: { type: "transcription", audio: { input: { transcription: { model }, turn_detection: null } } } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new HttpError(502, "Transcription is unavailable. Try again.");
    const data = await response.json();
    if (typeof data.value !== "string" || !data.value.trim()) throw new HttpError(502, "Transcription is unavailable.");
    return json({ value: data.value });
  } catch (error) { return failure(error); }
}
