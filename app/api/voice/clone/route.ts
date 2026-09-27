import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { checkOrigin, failure, HttpError, json } from "@/lib/server/http";
import { deleteVoice, elevenHeaders } from "@/lib/elevenlabs/server";
import { FINAL_TIER, VOICE_CONSENT, validSamples } from "@/lib/voice/consent";
import { saveProfile } from "@/lib/voice/profile";
import { charge, requireCredits } from "@/lib/billing/credits";

export const maxDuration = 60;
export async function POST(request: Request) {
  let sessionId: string | undefined; let slot: number | undefined; let locked = false;
  try {
    checkOrigin(request);
    if (!process.env.CRON_SECRET) {
      // Detailed cause stays in the development log; the user only needs to know the fallback holds.
      if (process.env.NODE_ENV === "development") console.error("CRON_SECRET is missing: cloning stays disabled until the purge is configured.");
      throw new HttpError(503, "Voice cloning is not available. The standard voice stays in use.");
    }
    // Bound the multipart payload before parsing it. No audio is written to disk.
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "Missing recording.");
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 4_000_000) { await reader.cancel(); throw new HttpError(413, "Recording too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    if (form.get("consent") !== VOICE_CONSENT) throw new HttpError(400, "Consent is required to use your voice.");
    const id = form.get("sessionId"); const seconds = Number(form.get("seconds"));
    const samples = form.getAll("sample").filter((value): value is File => value instanceof File);
    const tier = Number(form.get("tier"));
    if (!Number.isInteger(tier) || tier < 1 || tier > FINAL_TIER) throw new HttpError(400, "Invalid voice tier.");
    if (typeof id !== "string" || !validSamples(samples, seconds)) throw new HttpError(400, "Invalid voice sample: too little speech, too large, or an unsupported format.");
    sessionId = id; const me = await member(id); slot = me.slot;
    if (!me.user_id) throw new HttpError(403, "Sign in with Google before enabling voice cloning.");
    await requireCredits(id);
    const sql = db();
    // Consent is read from the row, never implied by this request carrying audio. The lease
    // returns the clone being replaced so it can be deleted once the swap has committed.
    const rows = await sql`UPDATE adu_participants SET voice_status='learning', cloning_until=now()+interval '2 minutes'
      WHERE session_id=${id} AND slot=${me.slot} AND consent_at IS NOT NULL AND voice_tier<${tier}
        AND (cloning_until IS NULL OR cloning_until<now()) RETURNING voice_id as "previousVoiceId"`;
    if (!rows[0]) throw new HttpError(409, "This voice tier already exists, or no consent was given.");
    const previousVoiceId = rows[0].previousVoiceId as string | null;
    locked = true;
    const payload = new FormData();
    // Cloning needs an account, so every voice is labelled by account: the session purge's
    // orphan sweep only looks for the session labels of older guest clones, never this one.
    payload.set("name", `adu-user-${me.user_id}`);
    payload.set("description", "Saved account voice. Deleted when the account asks.");
    payload.set("labels", JSON.stringify({ app: "a-deux-user", user: me.user_id }));
    for (const sample of samples) payload.append("files", sample, sample.name);
    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: elevenHeaders(), body: payload, signal: AbortSignal.timeout(45_000) });
    const data = await response.json();
    if (!response.ok || typeof data.voice_id !== "string") {
      // The provider explains itself; throwing that away cost a long investigation once.
      if (process.env.NODE_ENV === "development") console.error("Voice cloning refused:", JSON.stringify(data?.detail ?? data).slice(0, 400));
      throw new HttpError(502, "ElevenLabs refused to create the voice: check the plan's cloning access. The standard voice stays available.");
    }
    const status = data.requires_verification ? "verification_required" : "ready";
    // If the session ended while ElevenLabs was processing, delete the new voice.
    const saved = await sql`UPDATE adu_participants SET voice_id=${data.voice_id}, voice_status=${status}, voice_tier=${tier}, cloning_until=NULL
      WHERE session_id=${id} AND slot=${me.slot} AND EXISTS(SELECT 1 FROM adu_sessions WHERE id=${id} AND closed=false AND expires_at>now()) RETURNING slot`;
    if (!saved[0]) { await deleteVoice(data.voice_id); throw new HttpError(409, "The conversation ended while the voice was being created."); }
    // Only now is the previous clone unreferenced: never delete before the swap has committed.
    await saveProfile(me.user_id, data.voice_id, status, tier);
    if (previousVoiceId && previousVoiceId !== data.voice_id) await deleteVoice(previousVoiceId).catch(() => {});
    // Billed to the conversation's creator, whoever's voice it is.
    await charge(id, "clone");
    return json({ status, tier });
  } catch (error) {
    if (locked && sessionId !== undefined && slot !== undefined) {
      // Keep the short lease after ambiguous timeouts to avoid duplicate clones, and leave an
      // earlier clone in service rather than downgrading the session to the standard voice.
      await db()`UPDATE adu_participants SET voice_status=CASE WHEN voice_id IS NULL THEN 'none' ELSE 'ready' END
        WHERE session_id=${sessionId} AND slot=${slot} AND voice_status='learning'`.catch(() => {});
    }
    return failure(error);
  }
}
