import { auth } from "@/auth";
import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { checkOrigin, failure, HttpError, json } from "@/lib/server/http";
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/account">) {
  try {
    checkOrigin(request);
    const account = await auth();
    if (!account?.user?.id) throw new HttpError(401, "Sign in with Google to keep your voice.");
    const { id } = await context.params; const me = await member(id);
    if (me.user_id && me.user_id !== account.user.id) throw new HttpError(409, "This participant already has an account.");
    if (!me.user_id && me.voice_id) throw new HttpError(409, "Remove the temporary voice in settings before saving a voice to your account.");
    // Linking a guest does not grant consent. Only an existing account consent may be restored.
    await db()`UPDATE adu_participants p SET user_id=${account.user.id},voice_id=v.provider_voice_id,
      voice_status=COALESCE(v.voice_status,'none'),voice_tier=COALESCE(v.voice_tier,0),
      voice_range=COALESCE(v.voice_range,p.voice_range),consent_at=v.consent_at,use_clone=COALESCE(v.use_clone,true)
      FROM (SELECT 1) seed LEFT JOIN adu_voice_profiles v ON v.user_id=${account.user.id}
      WHERE p.session_id=${id} AND p.slot=${me.slot} AND p.user_id IS NULL AND p.voice_id IS NULL`;
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
