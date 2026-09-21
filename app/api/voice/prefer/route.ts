import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { setProfileUseClone } from "@/lib/voice/profile";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";

// Turning the clone off keeps the model: it stops being used, nothing is deleted.
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    if (typeof body.sessionId !== "string" || typeof body.useClone !== "boolean") throw new HttpError(400, "Requête invalide.");
    const me = await member(body.sessionId);
    await db()`UPDATE adu_participants SET use_clone=${body.useClone} WHERE session_id=${body.sessionId} AND slot=${me.slot}`;
    if (me.user_id) await setProfileUseClone(me.user_id, body.useClone);
    return json({ useClone: body.useClone });
  } catch (error) { return failure(error); }
}
