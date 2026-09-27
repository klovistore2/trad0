import "server-only";
import { db } from "@/lib/neon/db";
import { deleteVoice, elevenHeaders } from "@/lib/elevenlabs/server";
import { HttpError } from "@/lib/server/http";

// Leaves room under the route's 60 s limit for the final delete: a session not reached in time
// is simply taken first at the next run.
const SWEEP_BUDGET_MS = 40_000;

// Each ended session is handled on its own: a provider failure is retried at the next run and
// never stops the others, nor the final delete.
export async function cleanupSessions() {
  const sql = db();
  const deadline = Date.now() + SWEEP_BUDGET_MS;
  await sql`DELETE FROM adu_events WHERE EXISTS(SELECT 1 FROM adu_sessions s WHERE s.id=adu_events.session_id AND (s.closed=true OR s.expires_at<=now()))`;
  await sql`DELETE FROM adu_audio_links WHERE EXISTS(SELECT 1 FROM adu_sessions s WHERE s.id=adu_audio_links.session_id AND (s.closed=true OR s.expires_at<=now()))`;
  // Only a participant without an account can hold a session scoped clone, or have left a
  // creation unfinished (its lease). Cloning needs an account since 21 September 2026, so only
  // older rows qualify: the provider is not called for anything else.
  const pending = await sql`SELECT s.id FROM adu_sessions s WHERE (s.closed=true OR s.expires_at<=now())
    AND EXISTS(SELECT 1 FROM adu_participants p WHERE p.session_id=s.id AND p.user_id IS NULL AND (p.voice_id IS NOT NULL OR p.cloning_until IS NOT NULL))
    ORDER BY s.expires_at LIMIT 100`;
  let swept = 0; let failed = 0;
  for (const { id } of pending) {
    if (Date.now() > deadline) break;
    try { await sweepSessionVoices(id); swept++; }
    catch { failed++; }
  }
  // Session ids are join links: only counts are logged.
  if (failed) console.error("Voice purge failed for sessions", failed);
  // A voice saved to an account outlives its sessions. A session is kept while one of its guest
  // voices is still unswept, so a failed sweep is retried rather than forgotten.
  await sql`DELETE FROM adu_sessions WHERE expires_at<now()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM adu_participants p
    WHERE p.session_id=adu_sessions.id AND (p.cloning_until>now() OR (p.user_id IS NULL AND (p.voice_id IS NOT NULL OR p.cloning_until IS NOT NULL))))`;
  return { swept, failed, remaining: pending.length - swept - failed };
}

async function sweepSessionVoices(id: string) {
  const sql = db();
  // Also find a clone whose creation succeeded remotely after a local timeout.
  const params = new URLSearchParams({ search: `adu-${id}-`, page_size: "100" });
  const response = await fetch(`https://api.elevenlabs.io/v2/voices?${params}`, { headers: elevenHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new HttpError(502, "Deleting voices must be retried.");
  const data = await response.json();
  for (const voice of data.voices ?? []) {
    if (voice.labels?.app === "a-deux-session" && voice.labels?.session === id && typeof voice.voice_id === "string") await deleteVoice(voice.voice_id);
  }
  const participants = await sql`SELECT voice_id FROM adu_participants WHERE session_id=${id} AND voice_id IS NOT NULL AND user_id IS NULL`;
  for (const participant of participants) await deleteVoice(participant.voice_id);
  // Clearing the lease marks the session as swept, which lets the final delete remove it.
  await sql`UPDATE adu_participants SET voice_id=NULL,voice_status='none',consent_at=NULL,cloning_until=NULL WHERE session_id=${id} AND user_id IS NULL`;
}
