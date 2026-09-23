import { isLanguage } from "@/types/session";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let expectedOrigin: string;
  try {
    const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || request.url);
    if (!["http:", "https:"].includes(appUrl.protocol)) throw new Error("Invalid protocol");
    expectedOrigin = appUrl.origin;
  } catch {
    return json({ error: "L’adresse du site est mal configurée. Vérifiez NEXT_PUBLIC_APP_URL." }, 503);
  }
  if (!origin || origin !== expectedOrigin) return json({ error: "Origine non autorisée." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Requête invalide." }, 415);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  if (!body || typeof body !== "object" || !("targetLanguage" in body) || !isLanguage(body.targetLanguage)) {
    return json({ error: "Cette langue n’est pas disponible." }, 400);
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_REALTIME_TRANSLATION_MODEL?.trim();
  // Source-language transcripts (session.input_transcript.delta) are only emitted when input
  // transcription is configured. The conversation screen shows them so a speaker can check what
  // was actually recognised, so this is on by default and overridable like any other model id.
  const transcriptionModel = process.env.OPENAI_INPUT_TRANSCRIPTION_MODEL?.trim() || "gpt-realtime-whisper";
  if (!key || !model) return json({ error: "La traduction n’est pas encore configurée." }, 503);
  let targetLanguage = body.targetLanguage;
  if ("sessionId" in body) {
    if (typeof body.sessionId !== "string") return json({ error: "Session invalide." }, 400);
    try {
      const { targetLanguageForSession } = await import("@/lib/session/store");
      targetLanguage = await targetLanguageForSession(body.sessionId);
    } catch { return json({ error: "Rejoignez une conversation active pour continuer." }, 403); }
    const { payerBalance } = await import("@/lib/billing/credits");
    const balance = await payerBalance(body.sessionId);
    if (balance !== null && balance <= 0) return json({ error: "No credits left." }, 402);
  }
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/translations/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Also documented for this session and deliberately left off for now, because the current
      // behaviour is good enough: audio.input.noise_reduction, "near_field" for a phone held in
      // the hand or "far_field" for a device on a table. Worth trying against the acoustic echo
      // between two phones on speaker — see the echo note in AGENTS.md. To enable, add it here:
      //   input: { transcription: { model: transcriptionModel }, noise_reduction: { type: "near_field" } }
      // The model does NOT accept instructions, prompts or conversation context: verified against
      // the current guide and cookbook, which state it "does not support custom prompting".
      body: JSON.stringify({
        session: {
          model,
          audio: {
            input: { transcription: { model: transcriptionModel } },
            output: { language: targetLanguage },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (!response.ok) {
      if (process.env.NODE_ENV === "development") console.error("Translation credential request failed", response.status);
      return json({ error: response.status === 429 ? "Le service est occupé. Réessayez dans un instant." : "La traduction est indisponible. Vérifiez la configuration du service." }, 502);
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("value" in data) || typeof data.value !== "string" || !data.value.trim()) return json({ error: "La traduction est indisponible." }, 502);
    return json({ value: data.value });
  } catch {
    return json({ error: "Le service ne répond pas. Réessayez." }, 504);
  }
}
