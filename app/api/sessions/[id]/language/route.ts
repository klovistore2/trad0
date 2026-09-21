import { member } from "@/lib/session/auth";
import { db } from "@/lib/neon/db";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
import { isLanguage } from "@/types/session";
import { detectLanguage } from "@/lib/openai/detect-language";
import { enoughForLanguageDetection } from "@/lib/translation/language";

export async function PATCH(request: Request, context: RouteContext<"/api/sessions/[id]/language">) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    if ((body.slot !== 0 && body.slot !== 1) || (body.language !== "auto" && !isLanguage(body.language))) throw new HttpError(400, "Invalid language.");
    const { id } = await context.params;
    await member(id);
    const automatic = body.language === "auto";
    const sql = db();
    const rows = await sql`UPDATE adu_participants SET
      language=CASE WHEN ${automatic} THEN language ELSE ${body.language} END,
      language_auto=${automatic}, language_detected=false, language_revision=language_revision+1
      WHERE session_id=${id} AND slot=${body.slot}
        AND EXISTS(SELECT 1 FROM adu_sessions WHERE id=${id} AND closed=false AND expires_at>now())
      RETURNING language`;
    if (!rows[0]) throw new HttpError(409, "The participant is unavailable.");
    return json({ ok: true });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/language">) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    if (typeof body.text !== "string" || body.text.length > 600 || !enoughForLanguageDetection(body.text)
      || !Number.isInteger(body.revision) || Number(body.revision) < 0) throw new HttpError(400, "Insufficient transcript.");
    const { id } = await context.params;
    const me = await member(id);
    const sql = db();
    // Atomic budget: at most three attempts per participant, including reloads and concurrent tabs.
    const claimed = await sql`UPDATE adu_participants SET language_attempts=language_attempts+1, language_checked_at=now()
      WHERE session_id=${id} AND slot=${me.slot} AND language_auto=true AND language_detected=false
        AND language_revision=${body.revision} AND language_attempts<3
        AND (language_checked_at IS NULL OR language_checked_at<now()-interval '10 seconds')
      RETURNING language_revision`;
    if (!claimed[0]) return json({ applied: false });
    const language = await detectLanguage(body.text);
    if (!language) return json({ applied: false });
    // A menu correction wins even if classification was already running.
    const updated = await sql`UPDATE adu_participants SET language=${language}, language_detected=true
      WHERE session_id=${id} AND slot=${me.slot} AND language_auto=true AND language_revision=${body.revision}
        AND EXISTS(SELECT 1 FROM adu_sessions WHERE id=${id} AND closed=false AND expires_at>now())
      RETURNING language`;
    return json({ applied: updated.length > 0 });
  } catch (error) { return failure(error); }
}
