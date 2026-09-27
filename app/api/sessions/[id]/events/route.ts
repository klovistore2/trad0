import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { isPeerEvent } from "@/lib/realtime/validation";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    checkOrigin(request); const { id } = await context.params; const me = await member(id);
    const event = await readJson(request);
    if (!isPeerEvent(event)) throw new HttpError(400, "Message invalide.");
    const metadata = JSON.stringify({ kind: event.kind, original: event.original, mode: event.mode, sourceLanguage: event.sourceLanguage, targetLanguage: event.targetLanguage, timing: event.timing, speech: event.speech });
    await db()`INSERT INTO adu_events(id,session_id,sender,turn_id,text,committed,metadata) VALUES(${event.id},${id},${me.slot},${event.turnId},${event.text},${event.committed},${metadata}::jsonb) ON CONFLICT(id) DO NOTHING`;
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    const { id } = await context.params; const me = await member(id);
    const after = new URL(request.url).searchParams.get("after");
    const sql = db();
    // The floor rides along on the existing poll: no extra query, no extra round trip.
    const reply = (events: Record<string, unknown>[], cursor?: string) =>
      json({ events: events.map(({ metadata, ...event }) => ({ ...event, ...(metadata as object) })), floor: me.floor_slot, ...(cursor ? { cursor } : {}) });
    // A page that (re)loads gets the last finished sentences to rebuild its screen and context,
    // then continues live from the newest event: replaying every streamed subtitle since the
    // start took tens of seconds after a long conversation. The cursor is read first, so an
    // event written in between is delivered by the next poll rather than skipped.
    if (after === null) {
      const [{ cursor }] = await sql`SELECT COALESCE(MAX(seq),0)::text AS cursor FROM adu_events WHERE session_id=${id}`;
      const recent = await sql`SELECT * FROM (SELECT seq::text, id, turn_id as "turnId", text, committed, metadata,
        (EXTRACT(EPOCH FROM (now()-created_at))*1000)::int as "ageMs" FROM adu_events
        WHERE session_id=${id} AND sender<>${me.slot} AND committed AND seq<=${cursor}::bigint ORDER BY seq DESC LIMIT 40) recent ORDER BY seq::bigint`;
      return reply(recent, cursor as string);
    }
    if (!/^\d{1,18}$/.test(after)) throw new HttpError(400, "Requête invalide.");
    // The age is computed by the database, so measuring latency never compares two device clocks.
    const events = await sql`SELECT seq::text, id, turn_id as "turnId", text, committed, metadata,
      (EXTRACT(EPOCH FROM (now()-created_at))*1000)::int as "ageMs" FROM adu_events
      WHERE session_id=${id} AND sender<>${me.slot} AND seq>${after}::bigint ORDER BY seq LIMIT 100`;
    return reply(events);
  } catch (error) { return failure(error); }
}
