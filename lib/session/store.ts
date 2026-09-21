import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/neon/db";
import { guestHash, member, validId } from "./auth";
import { HttpError } from "@/lib/server/http";
import { saveProfileRange } from "@/lib/voice/profile";
import type { Participant, SharedSession } from "@/types/session";

// Only the creator has an account: their slot carries it so a saved voice can be reused.
export async function createSession(userId: string) {
  const sql = db(); const hash = await guestHash(true); const id = randomUUID();
  await sql.transaction([
    sql`INSERT INTO adu_sessions(id) VALUES(${id})`,
    // A saved voice is carried into the session, so no clone and no credit is spent again.
    sql`INSERT INTO adu_participants(session_id,slot,guest_hash,language,user_id,voice_id,voice_status,voice_tier,voice_range,consent_at,use_clone)
      SELECT ${id},0,${hash},'fr',${userId}, v.provider_voice_id, COALESCE(v.voice_status,'none'),
        COALESCE(v.voice_tier,0), v.voice_range, v.consent_at, COALESCE(v.use_clone,true)
      FROM (SELECT 1) AS seed LEFT JOIN adu_voice_profiles v ON v.user_id=${userId}`,
  ]);
  return id;
}
export async function joinSession(id: string) {
  if (!validId(id)) throw new HttpError(404, "Le lien n’est pas valide.");
  const sql = db(); const hash = await guestHash(true);
  // Slot 1 has a unique primary key: concurrent third joiners cannot take a seat.
  await sql`INSERT INTO adu_participants(session_id,slot,guest_hash,language)
    SELECT id,1,${hash},'en' FROM adu_sessions
    WHERE id=${id} AND closed=false AND expires_at>now()
      AND NOT EXISTS(SELECT 1 FROM adu_participants WHERE session_id=${id} AND guest_hash=${hash})
    ON CONFLICT DO NOTHING`;
  await member(id);
}
export async function sessionState(id: string): Promise<SharedSession> {
  const me = await member(id); const sql = db();
  await sql`UPDATE adu_participants SET last_seen=now() WHERE session_id=${id} AND slot=${me.slot}`;
  const rows = await sql`SELECT slot, language, voice_status as "voiceStatus", voice_range as "voiceRange", voice_tier as "voiceTier", use_clone as "useClone", consent_at IS NOT NULL as consented, last_seen>now()-interval '15 seconds' as online FROM adu_participants WHERE session_id=${id} ORDER BY slot`;
  return { id, expiresAt: String(me.expires_at), floor: me.floor_slot, me: rows.find(row => row.slot === me.slot) as Participant, peer: (rows.find(row => row.slot !== me.slot) as Participant | undefined) ?? null };
}

// Taking the floor is unilateral; the database serializes simultaneous requests.
export async function takeFloor(id: string) {
  const me = await member(id);
  await db()`UPDATE adu_sessions SET floor_slot=${me.slot} WHERE id=${id} AND closed=false AND expires_at>now()`;
  return me.slot;
}
// Releasing leaves both microphones closed, which is the resting state of a session.
export async function releaseFloor(id: string) {
  const me = await member(id);
  await db()`UPDATE adu_sessions SET floor_slot=NULL WHERE id=${id} AND floor_slot=${me.slot}`;
  return null;
}

export async function setVoiceRange(id: string, range: "low" | "high") {
  const me = await member(id);
  await db()`UPDATE adu_participants SET voice_range=${range} WHERE session_id=${id} AND slot=${me.slot}`;
  if (me.user_id) await saveProfileRange(me.user_id, range);
}

export async function targetLanguageForSession(id: string) {
  const me = await member(id);
  const rows = await db()`SELECT language FROM adu_participants WHERE session_id=${id} AND slot<>${me.slot}`;
  if (!rows[0]) throw new HttpError(409, "Attendez que l’autre personne rejoigne la conversation.");
  return rows[0].language as string;
}
