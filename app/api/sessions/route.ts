import { auth } from "@/auth";
import { createSession } from "@/lib/session/store";
import { checkOrigin, failure, HttpError, json } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    // Creating a conversation needs an account; joining one never does.
    const account = await auth();
    if (!account?.user?.id) throw new HttpError(401, "Connectez-vous pour créer une conversation.");
    return json({ id: await createSession(account.user.id) });
  } catch (error) { return failure(error); }
}
