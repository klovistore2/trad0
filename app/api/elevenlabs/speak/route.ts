import { speakerContext } from "@/lib/session/auth";
import { elevenHeaders, fallbackVoice } from "@/lib/elevenlabs/server";
import { checkOrigin, failure, HttpError, readJson } from "@/lib/server/http";
import { isSpeechMetadata, speechRequest, TTS_MODEL } from "@/lib/audio/speech-options";
import { requirePayer } from "@/lib/billing/credits";

export const maxDuration = 30;

// Speech is relayed instead of opening a browser websocket to the provider: the page only ever
// talks to this origin, which survives proxies and extensions that block third-party sockets.
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    if (body.speech !== undefined && !isSpeechMetadata(body.speech)) throw new HttpError(400, "Invalid speech options.");
    const speech = isSpeechMetadata(body.speech) ? body.speech : undefined;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 4000) throw new HttpError(400, "Invalid text.");
    const language = typeof body.language === "string" && /^[a-z]{2}$/.test(body.language) ? body.language : undefined;
    // Speech is paid for by a conversation's creator: without a live conversation, nothing is spoken.
    if (typeof body.sessionId !== "string") throw new HttpError(400, "Invalid session.");
    // One round trip for the listener, the speaker's voice and the creator's credits.
    const dbStarted = performance.now();
    const me = await speakerContext(body.sessionId);
    const dbMs = Math.round(performance.now() - dbStarted);
    requirePayer(me);
    const peer = me.peer;
    if (!peer) throw new HttpError(409, "The other person has not joined yet.");
    // The receiver hears the other participant's voice; a client supplied ID is never accepted.
    const voiceId = peer.voice_status === "ready" && peer.use_clone ? peer.voice_id ?? undefined : undefined;
    // The speaker's own range, so the receiver hears a fitting voice before any clone exists.
    const range = peer.voice_range === "low" || peer.voice_range === "high" ? peer.voice_range : undefined;
    // One model for every sentence: it is the only v3 member that covers Thai and the emotion
    // tags, so there is nothing left to resolve per language or per speaker.
    const model = TTS_MODEL;
    const voice = voiceId || await fallbackVoice(range);
    const spoken = speechRequest(text, model, speech);
    const started = performance.now();
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_22050_32`, {
      method: "POST",
      headers: { ...elevenHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken.text, model_id: model, ...(language ? { language_code: language } : {}),
        ...(spoken.stability === undefined ? {} : { voice_settings: { stability: spoken.stability, ...(spoken.style ? { style: spoken.style } : {}) } }) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok || !upstream.body) throw new HttpError(502, "The voice is unavailable. The text is still shown.");
    // Piped straight through: no audio is buffered, written or logged here.
    return new Response(upstream.body, { headers: {
      "Content-Type": "audio/mpeg", "Cache-Control": "no-store",
      // Development aid: lets the page show which voice was actually used.
      "X-Voice-Source": voiceId ? "clone" : `standard-${range ?? "neutral"}`,
      "X-TTS-Model": model,
      "X-TTS-Stability": spoken.stability === undefined ? "default" : String(spoken.stability),
      "X-TTS-Style": String(spoken.style ?? 0),
      "X-TTS-Headers-Ms": String(Math.round(performance.now() - started)),
      "X-DB-Ms": String(dbMs),
    } });
  } catch (error) { return failure(error); }
}
