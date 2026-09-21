import { auth } from "@/auth";
import { createSession } from "@/lib/session/store";
import { checkOrigin, failure, HttpError, json, readJson } from "@/lib/server/http";
import { isLanguage } from "@/types/session";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    // Creating a conversation needs an account; joining one never does.
    const account = await auth();
    if (!account?.user?.id) throw new HttpError(401, "Connectez-vous pour créer une conversation.");
    const body = await readJson(request);
    if (!isLanguage(body.peerLanguage)) throw new HttpError(400, "Cette langue n’est pas disponible.");
    return json({ id: await createSession(account.user.id, body.peerLanguage) });
  } catch (error) { return failure(error); }
}
