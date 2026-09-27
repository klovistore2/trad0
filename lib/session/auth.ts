import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/neon/db";
import { HttpError } from "@/lib/server/http";
import type { Language } from "@/types/session";

export const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export async function guestHash(create = false) {
  const store = await cookies();
  let token = store.get("adu_guest")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) throw new HttpError(401, "Rejoignez la conversation pour continuer.");
    token = randomBytes(32).toString("hex");
    store.set("adu_guest", token, { httpOnly: true, sameSite: "lax", secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false, maxAge: 86400, path: "/" });
  }
  return createHash("sha256").update(token).digest("hex");
}
export type Membership = { slot: number; language: Language; voice_id: string | null; voice_status: string; expires_at: string; floor_slot: number | null; user_id: string | null };
export async function member(id: string, allowClosed = false): Promise<Membership> {
  if (!validId(id)) throw new HttpError(404, "Cette conversation n’existe pas.");
  const hash = await guestHash();
  const rows = await db()`SELECT p.slot, p.language, p.voice_id, p.voice_status, p.user_id, s.expires_at, s.floor_slot
    FROM adu_participants p JOIN adu_sessions s ON s.id=p.session_id
    WHERE s.id=${id} AND p.guest_hash=${hash} AND (${allowClosed} OR (s.closed=false AND s.expires_at>now()))`;
  if (!rows[0]) throw new HttpError(403, "Cette conversation est terminée ou inaccessible.");
  return rows[0] as Membership;
}

export type Peer = { slot: number; language: Language; voice_id: string | null; voice_status: string; voice_range: string | null; use_clone: boolean };
export type SpeakerContext = Membership & { peer: Peer | null; payerEmail: string | null; payerBalance: number };
// Everything a paid request needs, in one round trip: the caller's place, the other participant
// and the creator's balance. Each Neon query is a network round trip (about 110 ms from a
// developer machine in Europe), so member, then credits, then the peer used to add up per sentence.
export async function speakerContext(id: string): Promise<SpeakerContext> {
  if (!validId(id)) throw new HttpError(404, "Cette conversation n’existe pas.");
  const hash = await guestHash();
  const rows = await db()`SELECT p.slot, p.language, p.voice_id, p.voice_status, p.user_id, s.expires_at, s.floor_slot,
      o.slot AS peer_slot, o.language AS peer_language, o.voice_id AS peer_voice_id, o.voice_status AS peer_voice_status,
      o.voice_range AS peer_voice_range, o.use_clone AS peer_use_clone, u.email AS payer_email,
      COALESCE((SELECT SUM(l.amount) FROM adu_credit_ledger l WHERE l.user_id=c.user_id), 0)::int AS payer_balance
    FROM adu_participants p JOIN adu_sessions s ON s.id=p.session_id
    LEFT JOIN adu_participants o ON o.session_id=s.id AND o.slot<>p.slot
    LEFT JOIN adu_participants c ON c.session_id=s.id AND c.slot=0
    LEFT JOIN adu_users u ON u.id=c.user_id
    WHERE s.id=${id} AND p.guest_hash=${hash} AND s.closed=false AND s.expires_at>now()`;
  const row = rows[0];
  if (!row) throw new HttpError(403, "Cette conversation est terminée ou inaccessible.");
  return {
    slot: row.slot, language: row.language, voice_id: row.voice_id, voice_status: row.voice_status, user_id: row.user_id,
    expires_at: row.expires_at, floor_slot: row.floor_slot,
    peer: row.peer_slot === null ? null : { slot: row.peer_slot, language: row.peer_language, voice_id: row.peer_voice_id,
      voice_status: row.peer_voice_status, voice_range: row.peer_voice_range, use_clone: row.peer_use_clone },
    payerEmail: row.payer_email ?? null, payerBalance: row.payer_balance ?? 0,
  };
}
