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
      throw new HttpError(503, "Voice cloning is not available. The standard voice stays in use.");
    }
    const body = await readJson(request);
    if (body.consent !== VOICE_CONSENT) throw new HttpError(400, "Consent is required to use your voice.");
    if (typeof body.sessionId !== "string") throw new HttpError(400, "Invalid session.");
    const me = await member(body.sessionId);
    if (!me.user_id) throw new HttpError(403, "Sign in with Google before enabling voice cloning.");
    await db()`UPDATE adu_participants SET consent_at=now() WHERE session_id=${body.sessionId} AND slot=${me.slot} AND consent_at IS NULL`;
    // An account keeps the agreement, so the dialog is not asked again on the next conversation.
    if (me.user_id) await saveProfileConsent(me.user_id, true);
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
