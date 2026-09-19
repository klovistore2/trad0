import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/neon/db";
import { guestHash, member, validId } from "./auth";
import { HttpError } from "@/lib/server/http";
import type { Participant, SharedSession } from "@/types/session";

export async function createSession() {
  const sql = db(); const hash = await guestHash(true); const id = randomUUID();
  await sql.transaction([
    sql`INSERT INTO adu_sessions(id) VALUES(${id})`,
    sql`INSERT INTO adu_participants(session_id,slot,guest_hash,language) VALUES(${id},0,${hash},'fr')`,
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
  const rows = await sql`SELECT slot, language, voice_status as "voiceStatus", last_seen>now()-interval '15 seconds' as online FROM adu_participants WHERE session_id=${id} ORDER BY slot`;
  return { id, expiresAt: String(me.expires_at), me: rows.find(row => row.slot === me.slot) as Participant, peer: (rows.find(row => row.slot !== me.slot) as Participant | undefined) ?? null };
}

export async function targetLanguageForSession(id: string) {
  const me = await member(id);
  const rows = await db()`SELECT language FROM adu_participants WHERE session_id=${id} AND slot<>${me.slot}`;
  if (!rows[0]) throw new HttpError(409, "Attendez que l’autre personne rejoigne la conversation.");
  return rows[0].language as string;
}
