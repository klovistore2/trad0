import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
import { VOICE_CONSENT } from "@/lib/voice/consent";
import { saveProfileConsent } from "@/lib/voice/profile";

// Recorded once per session. Every clone tier checks it server side, so consent cannot be
// implied by the client simply posting audio.
export async function POST(request: Request, context: RouteContext<"/api/voice/consent">) {
  void context;
  try {
    checkOrigin(request);
    if (!process.env.CRON_SECRET) {
      // Detailed cause stays in the development log; the user only needs to know the fallback holds.
      if (process.env.NODE_ENV === "development") console.error("CRON_SECRET is missing: cloning stays disabled until the purge is configured.");
      throw new HttpError(503, "La voix personnalisée n’est pas disponible. La voix standard reste utilisée.");
    }
    const body = await readJson(request);
    if (body.consent !== VOICE_CONSENT) throw new HttpError(400, "Votre consentement est nécessaire pour utiliser votre voix.");
    if (typeof body.sessionId !== "string") throw new HttpError(400, "Session invalide.");
    const me = await member(body.sessionId);
    await db()`UPDATE adu_participants SET consent_at=now() WHERE session_id=${body.sessionId} AND slot=${me.slot} AND consent_at IS NULL`;
    // An account keeps the agreement, so the dialog is not asked again on the next conversation.
    if (me.user_id) await saveProfileConsent(me.user_id, true);
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
