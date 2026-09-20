import { setVoiceRange } from "@/lib/session/store";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";

export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/voice-range">) {
  try {
    checkOrigin(request);
    const { id } = await context.params;
    const body = await readJson(request);
    if (body.range !== "low" && body.range !== "high") throw new HttpError(400, "Registre invalide.");
    await setVoiceRange(id, body.range);
    return json({ range: body.range });
  } catch (error) { return failure(error); }
}
