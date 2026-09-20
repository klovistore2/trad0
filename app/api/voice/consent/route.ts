import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
import { VOICE_CONSENT } from "@/lib/voice/consent";

// Recorded once per session. Every clone tier checks it server side, so consent cannot be
// implied by the client simply posting audio.
export async function POST(request: Request, context: RouteContext<"/api/voice/consent">) {
  void context;
  try {
    checkOrigin(request);
    if (!process.env.CRON_SECRET) throw new HttpError(503, "La suppression automatique des voix doit être configurée avant le clonage.");
    const body = await readJson(request);
    if (body.consent !== VOICE_CONSENT) throw new HttpError(400, "Votre consentement est nécessaire pour utiliser votre voix.");
    if (typeof body.sessionId !== "string") throw new HttpError(400, "Session invalide.");
    const me = await member(body.sessionId);
    await db()`UPDATE adu_participants SET consent_at=now() WHERE session_id=${body.sessionId} AND slot=${me.slot} AND consent_at IS NULL`;
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
