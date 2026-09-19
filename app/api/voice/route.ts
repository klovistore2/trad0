import { member } from "@/lib/session/auth";
import { db } from "@/lib/neon/db";
import { deleteVoice } from "@/lib/elevenlabs/server";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function DELETE(request: Request) {
  try {
    checkOrigin(request); const body = await readJson(request);
    if (typeof body.sessionId !== "string") throw new HttpError(400, "Session invalide.");
    const me = await member(body.sessionId, true);
    if (me.voice_status === "learning") throw new HttpError(409, "La création est en cours. Terminez la session pour annuler son utilisation.");
    if (me.voice_id) await deleteVoice(me.voice_id);
    await db()`UPDATE adu_participants SET voice_id=NULL,voice_status='none',consent_at=NULL WHERE session_id=${body.sessionId} AND slot=${me.slot}`;
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
