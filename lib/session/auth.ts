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
export type Membership = { slot: number; language: Language; voice_id: string | null; voice_status: string; expires_at: string };
export async function member(id: string): Promise<Membership> {
  if (!validId(id)) throw new HttpError(404, "Cette conversation n’existe pas.");
  const hash = await guestHash();
  const rows = await db()`SELECT p.slot, p.language, p.voice_id, p.voice_status, s.expires_at
    FROM adu_participants p JOIN adu_sessions s ON s.id=p.session_id
    WHERE s.id=${id} AND p.guest_hash=${hash} AND s.closed=false AND s.expires_at>now()`;
  if (!rows[0]) throw new HttpError(403, "Cette conversation est terminée ou inaccessible.");
  return rows[0] as Membership;
}
