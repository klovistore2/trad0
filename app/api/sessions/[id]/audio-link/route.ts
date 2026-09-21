import { db } from "@/lib/neon/db";
import { member, validId } from "@/lib/session/auth";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/audio-link">) {
  try {
    checkOrigin(request); const body = await readJson(request);
    if (!validId(body.epoch) || (body.targetEpoch !== undefined && !validId(body.targetEpoch))) throw new HttpError(400, "Invalid audio connection.");
    const description = body.description as { type?: unknown; sdp?: unknown } | undefined;
    if (description && ((description.type !== "offer" && description.type !== "answer") || typeof description.sdp !== "string" || description.sdp.length > 16_000)) throw new HttpError(400, "Invalid audio connection.");
    const { id } = await context.params; const me = await member(id);
    if (description && description.type !== (me.slot === 0 ? "offer" : "answer")) throw new HttpError(400, "Invalid audio connection.");
    await db()`INSERT INTO adu_audio_links(session_id,slot,epoch,target_epoch,description)
      VALUES(${id},${me.slot},${body.epoch},${body.targetEpoch ?? null},${description ? JSON.stringify({ type: description.type, sdp: description.sdp }) : null}::jsonb)
      ON CONFLICT(session_id,slot) DO UPDATE SET epoch=EXCLUDED.epoch,target_epoch=EXCLUDED.target_epoch,description=EXCLUDED.description,updated_at=now()`;
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function GET(_request: Request, context: RouteContext<"/api/sessions/[id]/audio-link">) {
  try {
    const { id } = await context.params; const me = await member(id);
    const rows = await db()`SELECT epoch,target_epoch as "targetEpoch",description FROM adu_audio_links WHERE session_id=${id} AND slot<>${me.slot}`;
    // Supply authenticated TURN/STUN configuration. Never use application/provider API keys here.
    const iceServers = JSON.parse(process.env.WEBRTC_ICE_SERVERS || "[]");
    if (!Array.isArray(iceServers)) throw new HttpError(503, "Invalid audio relay configuration.");
    return json({ peer: rows[0] ?? null, iceServers });
  } catch (error) { return failure(error); }
}
