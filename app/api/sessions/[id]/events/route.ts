import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { isPeerEvent } from "@/lib/realtime/validation";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    checkOrigin(request); const { id } = await context.params; const me = await member(id);
    const event = await readJson(request);
    if (!isPeerEvent(event)) throw new HttpError(400, "Message invalide.");
    await db()`INSERT INTO adu_events(id,session_id,sender,turn_id,text,committed) VALUES(${event.id},${id},${me.slot},${event.turnId},${event.text},${event.committed}) ON CONFLICT(id) DO NOTHING`;
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    const { id } = await context.params; const me = await member(id);
    const cursor = new URL(request.url).searchParams.get("after") || "0";
    if (!/^\d{1,18}$/.test(cursor)) throw new HttpError(400, "Requête invalide.");
    const events = await db()`SELECT seq::text, id, turn_id as "turnId", text, committed FROM adu_events
      WHERE session_id=${id} AND sender<>${me.slot} AND seq>${cursor}::bigint ORDER BY seq LIMIT 100`;
    // The floor rides along on the existing poll: no extra query, no extra round trip.
    return json({ events, floor: me.floor_slot });
  } catch (error) { return failure(error); }
}
