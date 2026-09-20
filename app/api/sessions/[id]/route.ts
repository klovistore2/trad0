import { sessionState } from "@/lib/session/store";
import { failure, json } from "@/lib/server/http";
export async function GET(_request: Request, context: RouteContext<"/api/sessions/[id]">) {
  try { return json(await sessionState((await context.params).id)); }
  catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/sessions/[id]">) {
  try {
    const { checkOrigin } = await import("@/lib/server/http");
    const { member } = await import("@/lib/session/auth");
    const { db } = await import("@/lib/neon/db");
    const { deleteVoice } = await import("@/lib/elevenlabs/server");
    checkOrigin(request); const { id } = await context.params; await member(id, true); const sql = db();
    await sql`UPDATE adu_sessions SET closed=true WHERE id=${id}`;
    await sql`DELETE FROM adu_events WHERE session_id=${id}`;
    // Closing a conversation never deletes a voice saved to an account.
    const voices = await sql`SELECT voice_id FROM adu_participants WHERE session_id=${id} AND voice_id IS NOT NULL AND user_id IS NULL`;
    for (const voice of voices) {
      await deleteVoice(voice.voice_id);
      await sql`UPDATE adu_participants SET voice_id=NULL,voice_status='none',consent_at=NULL WHERE session_id=${id} AND voice_id=${voice.voice_id}`;
    }
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
