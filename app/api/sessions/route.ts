import { createSession } from "@/lib/session/store";
import { checkOrigin, failure, json } from "@/lib/server/http";
export async function POST(request: Request) {
  try { checkOrigin(request); return json({ id: await createSession() }); }
  catch (error) { return failure(error); }
}
