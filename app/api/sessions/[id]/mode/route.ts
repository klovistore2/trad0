import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
import { isMode, isModePreference } from "@/lib/translation/modes";
export async function PATCH(request: Request, context: RouteContext<"/api/sessions/[id]/mode">) {
  try {
    checkOrigin(request); const body = await readJson(request);
    const { id } = await context.params; const me = await member(id);
    if (body.preference !== undefined) {
      if (!isModePreference(body.preference)) throw new HttpError(400, "Invalid mode.");
      await db()`UPDATE adu_participants SET preferred_mode=${body.preference} WHERE session_id=${id} AND slot=${me.slot}`;
    } else {
      if (!isMode(body.active)) throw new HttpError(400, "Invalid mode.");
      await db()`UPDATE adu_participants SET active_mode=${body.active} WHERE session_id=${id} AND slot=${me.slot}`;
    }
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
