import { member } from "@/lib/session/auth";
import { db } from "@/lib/neon/db";
import { voiceCredentials } from "@/lib/elevenlabs/server";
import { checkOrigin, failure, json, readJson, HttpError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    let voiceId: string | undefined;
    if (body.sessionId !== undefined) {
      if (typeof body.sessionId !== "string") throw new HttpError(400, "Session invalide.");
      const me = await member(body.sessionId);
      const rows = await db()`SELECT voice_id, voice_status FROM adu_participants WHERE session_id=${body.sessionId} AND slot<>${me.slot}`;
      if (!rows[0]) throw new HttpError(409, "L’autre personne n’a pas encore rejoint.");
      if (rows[0].voice_status === "ready") voiceId = rows[0].voice_id;
    }
    return json(await voiceCredentials(voiceId));
  } catch (error) { return failure(error); }
}
