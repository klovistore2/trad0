import { member } from "@/lib/session/auth";
import { db } from "@/lib/neon/db";
import { elevenHeaders, fallbackVoice } from "@/lib/elevenlabs/server";
import { checkOrigin, failure, HttpError, readJson } from "@/lib/server/http";

export const maxDuration = 30;

// Speech is relayed instead of opening a browser websocket to the provider: the page only ever
// talks to this origin, which survives proxies and extensions that block third-party sockets.
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 4000) throw new HttpError(400, "Texte invalide.");
    const language = typeof body.language === "string" && /^[a-z]{2}$/.test(body.language) ? body.language : undefined;
    let voiceId: string | undefined;
    let range: "low" | "high" | undefined;
    if (body.sessionId !== undefined) {
      if (typeof body.sessionId !== "string") throw new HttpError(400, "Session invalide.");
      const me = await member(body.sessionId);
      const rows = await db()`SELECT voice_id, voice_status, voice_range, use_clone FROM adu_participants WHERE session_id=${body.sessionId} AND slot<>${me.slot}`;
      if (!rows[0]) throw new HttpError(409, "L’autre personne n’a pas encore rejoint.");
      // The receiver hears the other participant's voice; a client supplied ID is never accepted.
      if (rows[0].voice_status === "ready" && rows[0].use_clone) voiceId = rows[0].voice_id;
      // The speaker's own range, so the receiver hears a fitting voice before any clone exists.
      if (rows[0].voice_range === "low" || rows[0].voice_range === "high") range = rows[0].voice_range;
    }
    const model = process.env.ELEVENLABS_TTS_MODEL?.trim();
    if (!model) throw new HttpError(503, "Le modèle vocal n’est pas configuré.");
    const voice = voiceId || await fallbackVoice(range);
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_22050_32`, {
      method: "POST",
      headers: { ...elevenHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: model, ...(language ? { language_code: language } : {}) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok || !upstream.body) throw new HttpError(502, "La voix est indisponible. Le texte reste accessible.");
    // Piped straight through: no audio is buffered, written or logged here.
    return new Response(upstream.body, { headers: {
      "Content-Type": "audio/mpeg", "Cache-Control": "no-store",
      // Development aid: lets the page show which voice was actually used.
      "X-Voice-Source": voiceId ? "clone" : `standard-${range ?? "neutral"}`,
    } });
  } catch (error) { return failure(error); }
}
