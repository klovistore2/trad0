import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { checkOrigin, failure, HttpError, json } from "@/lib/server/http";
import { deleteVoice, elevenHeaders } from "@/lib/elevenlabs/server";
import { VOICE_CONSENT, validSample } from "@/lib/voice/consent";

export const maxDuration = 60;
export async function POST(request: Request) {
  let sessionId: string | undefined; let slot: number | undefined; let locked = false;
  try {
    checkOrigin(request);
    if (!process.env.CRON_SECRET) throw new HttpError(503, "La suppression automatique des voix doit être configurée avant le clonage.");
    // Bound the multipart payload before parsing it. No audio is written to disk.
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "Enregistrement manquant.");
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 4_000_000) { await reader.cancel(); throw new HttpError(413, "L’enregistrement est trop volumineux."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    if (form.get("consent") !== VOICE_CONSENT) throw new HttpError(400, "Votre consentement est nécessaire pour utiliser votre voix.");
    const id = form.get("sessionId"); const sample = form.get("sample"); const seconds = Number(form.get("seconds"));
    if (typeof id !== "string" || !(sample instanceof File) || !validSample(sample, seconds)) throw new HttpError(400, "Enregistrez votre voix pendant 30 à 60 secondes, au calme.");
    sessionId = id; const me = await member(id); slot = me.slot; const sql = db();
    const rows = await sql`UPDATE adu_participants SET voice_status='learning', consent_at=now(), cloning_until=now()+interval '2 minutes'
      WHERE session_id=${id} AND slot=${me.slot} AND voice_id IS NULL AND (cloning_until IS NULL OR cloning_until<now()) RETURNING slot`;
    if (!rows[0]) throw new HttpError(409, "Une voix existe déjà ou est en cours de création.");
    locked = true;
    const payload = new FormData();
    payload.set("name", `adu-${id}-${me.slot}`);
    payload.set("description", "Temporary guest voice. Delete after session expiry.");
    payload.set("labels", JSON.stringify({ app: "a-deux-session", session: id, slot: String(me.slot) }));
    payload.append("files", sample, sample.name);
    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: elevenHeaders(), body: payload, signal: AbortSignal.timeout(45_000) });
    const data = await response.json();
    if (!response.ok || typeof data.voice_id !== "string") throw new HttpError(502, "La création de voix a échoué. Vérifiez votre accès au clonage ElevenLabs ; la voix standard reste disponible.");
    const status = data.requires_verification ? "verification_required" : "ready";
    // If the session ended while ElevenLabs was processing, delete the new voice.
    const saved = await sql`UPDATE adu_participants SET voice_id=${data.voice_id}, voice_status=${status}, cloning_until=NULL
      WHERE session_id=${id} AND slot=${me.slot} AND EXISTS(SELECT 1 FROM adu_sessions WHERE id=${id} AND closed=false AND expires_at>now()) RETURNING slot`;
    if (!saved[0]) { await deleteVoice(data.voice_id); throw new HttpError(409, "La conversation s’est terminée pendant la création."); }
    return json({ status });
  } catch (error) {
    if (locked && sessionId !== undefined && slot !== undefined) {
      // Keep the short lease after ambiguous timeouts to avoid duplicate clones.
      await db()`UPDATE adu_participants SET voice_status='none' WHERE session_id=${sessionId} AND slot=${slot} AND voice_id IS NULL`.catch(() => {});
    }
    return failure(error);
  }
}
