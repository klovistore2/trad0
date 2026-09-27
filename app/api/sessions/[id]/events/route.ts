import { db } from "@/lib/neon/db";
import { guestHash, member, validId } from "@/lib/session/auth";
import { isPeerEvent } from "@/lib/realtime/validation";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    checkOrigin(request); const { id } = await context.params;
    if (!validId(id)) throw new HttpError(404, "Cette conversation n’existe pas.");
    const event = await readJson(request);
    if (!isPeerEvent(event)) throw new HttpError(400, "Message invalide.");
    const metadata = JSON.stringify({ kind: event.kind, original: event.original, mode: event.mode, sourceLanguage: event.sourceLanguage, targetLanguage: event.targetLanguage, timing: event.timing, speech: event.speech });
    // Membership and insertion in one round trip: every sentence and subtitle goes through here.
    const hash = await guestHash();
    const [{ member: isMember }] = await db()`WITH me AS (SELECT p.slot FROM adu_participants p JOIN adu_sessions s ON s.id=p.session_id
        WHERE s.id=${id} AND p.guest_hash=${hash} AND s.closed=false AND s.expires_at>now()),
      saved AS (INSERT INTO adu_events(id,session_id,sender,turn_id,text,committed,metadata)
        SELECT ${event.id},${id},me.slot,${event.turnId},${event.text},${event.committed},${metadata}::jsonb FROM me ON CONFLICT(id) DO NOTHING)
      SELECT count(*)::int AS member FROM me`;
    if (!isMember) throw new HttpError(403, "Cette conversation est terminée ou inaccessible.");
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request, context: RouteContext<"/api/sessions/[id]/events">) {
  try {
    const { id } = await context.params;
    const after = new URL(request.url).searchParams.get("after");
    const sql = db();
    // The floor rides along on the existing poll: no extra query, no extra round trip.
    const reply = (events: Record<string, unknown>[], floor: unknown, cursor?: string) =>
      json({ events: events.map(({ metadata, ...event }) => ({ ...event, ...(metadata as object) })), floor, ...(cursor ? { cursor } : {}) });
    // A page that (re)loads gets the last finished sentences to rebuild its screen and context,
    // then continues live from the newest event: replaying every streamed subtitle since the
    // start took tens of seconds after a long conversation. The cursor is read first, so an
    // event written in between is delivered by the next poll rather than skipped.
    if (after === null) {
      const me = await member(id);
      const [{ cursor }] = await sql`SELECT COALESCE(MAX(seq),0)::text AS cursor FROM adu_events WHERE session_id=${id}`;
      const recent = await sql`SELECT * FROM (SELECT seq::text, id, turn_id as "turnId", text, committed, metadata,
        (EXTRACT(EPOCH FROM (now()-created_at))*1000)::int as "ageMs" FROM adu_events
        WHERE session_id=${id} AND sender<>${me.slot} AND committed AND seq<=${cursor}::bigint ORDER BY seq DESC LIMIT 40) recent ORDER BY seq::bigint`;
      return reply(recent, me.floor_slot, cursor as string);
    }
    if (!/^\d{1,18}$/.test(after)) throw new HttpError(400, "Requête invalide.");
    if (!validId(id)) throw new HttpError(404, "Cette conversation n’existe pas.");
    // The live poll runs every 500 ms on both phones: membership, floor and new events come in one
    // round trip. A participant with nothing new still gets one row, with empty event columns.
    // The age is computed by the database, so measuring latency never compares two device clocks.
    const hash = await guestHash();
    const rows = await sql`WITH me AS (SELECT p.slot, s.floor_slot FROM adu_participants p JOIN adu_sessions s ON s.id=p.session_id
        WHERE s.id=${id} AND p.guest_hash=${hash} AND s.closed=false AND s.expires_at>now())
      SELECT me.floor_slot AS "floorSlot", e.seq::text AS seq, e.id, e.turn_id AS "turnId", e.text, e.committed, e.metadata,
        (EXTRACT(EPOCH FROM (now()-e.created_at))*1000)::int AS "ageMs"
      FROM me LEFT JOIN LATERAL (SELECT * FROM adu_events WHERE session_id=${id} AND sender<>me.slot AND seq>${after}::bigint ORDER BY seq LIMIT 100) e ON true
      ORDER BY e.seq`;
    if (!rows[0]) throw new HttpError(403, "Cette conversation est terminée ou inaccessible.");
    const floor = rows[0].floorSlot;
    for (const row of rows) delete row.floorSlot;
    return reply(rows.filter(row => row.seq !== null), floor);
  } catch (error) { return failure(error); }
}
