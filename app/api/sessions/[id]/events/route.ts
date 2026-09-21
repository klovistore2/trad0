import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { isPeerEvent } from "@/lib/realtime/validation";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    checkOrigin(request); const { id } = await context.params; const me = await member(id);
    const event = await readJson(request);
    if (!isPeerEvent(event)) throw new HttpError(400, "Message invalide.");
    const metadata = JSON.stringify({ kind: event.kind, original: event.original, mode: event.mode, sourceLanguage: event.sourceLanguage, targetLanguage: event.targetLanguage, timing: event.timing });
    await db()`INSERT INTO adu_events(id,session_id,sender,turn_id,text,committed,metadata) VALUES(${event.id},${id},${me.slot},${event.turnId},${event.text},${event.committed},${metadata}::jsonb) ON CONFLICT(id) DO NOTHING`;
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    const { id } = await context.params; const me = await member(id);
    const cursor = new URL(request.url).searchParams.get("after") || "0";
    if (!/^\d{1,18}$/.test(cursor)) throw new HttpError(400, "Requête invalide.");
    // The age is computed by the database, so measuring latency never compares two device clocks.
    const events = await db()`SELECT seq::text, id, turn_id as "turnId", text, committed, metadata,
      (EXTRACT(EPOCH FROM (now()-created_at))*1000)::int as "ageMs" FROM adu_events
      WHERE session_id=${id} AND sender<>${me.slot} AND seq>${cursor}::bigint ORDER BY seq LIMIT 100`;
    // The floor rides along on the existing poll: no extra query, no extra round trip.
    return json({ events: events.map(({ metadata, ...event }) => ({ ...event, ...(metadata as object) })), floor: me.floor_slot });
  } catch (error) { return failure(error); }
}
