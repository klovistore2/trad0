import { member } from "@/lib/session/auth";
import { db } from "@/lib/neon/db";
import { deleteVoice } from "@/lib/elevenlabs/server";
import { clearProfileVoice } from "@/lib/voice/profile";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function DELETE(request: Request) {
  try {
    checkOrigin(request); const body = await readJson(request);
    if (typeof body.sessionId !== "string") throw new HttpError(400, "Session invalide.");
    const me = await member(body.sessionId, true);
    if (me.voice_status === "learning") throw new HttpError(409, "La création est en cours. Terminez la session pour annuler son utilisation.");
    if (me.voice_id) await deleteVoice(me.voice_id);
    // A reset drops the model and starts the tiers over; consent is only cleared on a withdrawal.
    const reset = body.reset === true;
    await db()`UPDATE adu_participants SET voice_id=NULL,voice_status='none',voice_tier=0,
      consent_at=CASE WHEN ${reset} THEN consent_at ELSE NULL END
      WHERE session_id=${body.sessionId} AND slot=${me.slot}`;
    // The saved voice is the one the account will reuse: deleting here must forget it too.
    if (me.user_id) await clearProfileVoice(me.user_id, reset);
    return json({ ok: true, reset });
  } catch (error) { return failure(error); }
}
