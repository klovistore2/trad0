import { joinSession, sessionState } from "@/lib/session/store";
import { checkOrigin, failure, json } from "@/lib/server/http";
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/join">) {
  try { checkOrigin(request); const { id } = await context.params; await joinSession(id); return json(await sessionState(id)); }
  catch (error) { return failure(error); }
}
