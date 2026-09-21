import "server-only";
import { db } from "@/lib/neon/db";
import { deleteVoice, elevenHeaders } from "@/lib/elevenlabs/server";
import { HttpError } from "@/lib/server/http";

export async function cleanupSessions() {
  const sql = db();
  await sql`DELETE FROM adu_events WHERE EXISTS(SELECT 1 FROM adu_sessions s WHERE s.id=adu_events.session_id AND (s.closed=true OR s.expires_at<=now()))`;
  const expired = await sql`SELECT id FROM adu_sessions WHERE closed=true OR expires_at<=now() LIMIT 100`;
  let cleaned = 0;
  for (const { id } of expired) {
    await sql`DELETE FROM adu_events WHERE session_id=${id}`;
    await sql`DELETE FROM adu_audio_links WHERE session_id=${id}`;
    // Also find a clone whose creation succeeded remotely after a local timeout.
    const params = new URLSearchParams({ search: `adu-${id}-`, page_size: "100" });
    const response = await fetch(`https://api.elevenlabs.io/v2/voices?${params}`, { headers: elevenHeaders(), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new HttpError(502, "La suppression des voix doit être réessayée.");
    const data = await response.json();
    for (const voice of data.voices ?? []) {
      if (voice.labels?.app === "a-deux-session" && voice.labels?.session === id && typeof voice.voice_id === "string") await deleteVoice(voice.voice_id);
    }
    // A voice saved to an account outlives its sessions: only session scoped clones are purged.
    const participants = await sql`SELECT voice_id FROM adu_participants WHERE session_id=${id} AND voice_id IS NOT NULL AND user_id IS NULL`;
    for (const participant of participants) await deleteVoice(participant.voice_id);
    // Keep a tombstone for 24h so late provider responses can still be swept.
    await sql`UPDATE adu_participants SET voice_id=NULL,voice_status='none',consent_at=NULL WHERE session_id=${id}`;
    cleaned++;
  }
  await sql`DELETE FROM adu_sessions WHERE expires_at<now()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM adu_participants p WHERE p.session_id=adu_sessions.id AND (p.voice_id IS NOT NULL OR p.cloning_until>now()))`;
  return cleaned;
}
