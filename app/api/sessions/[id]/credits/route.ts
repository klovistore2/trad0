import { db } from "@/lib/neon/db";
import { member } from "@/lib/session/auth";
import { isAdmin } from "@/lib/auth/admin";
import { resetCredits } from "@/lib/billing/credits";
import { checkOrigin, failure, HttpError, json } from "@/lib/server/http";

// DEV only: resets the balance of the conversation's creator, when that creator is an admin.
// The admin's test partner can use it too, as with the DEV panel itself.
export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/credits">) {
  try {
    checkOrigin(request);
    const { id } = await context.params;
    await member(id);
    const rows = await db()`SELECT u.id, u.email FROM adu_participants p JOIN adu_users u ON u.id=p.user_id
      WHERE p.session_id=${id} AND p.slot=0`;
    if (!rows[0] || !isAdmin(rows[0].email)) throw new HttpError(403, "Not available.");
    return json({ balance: await resetCredits(rows[0].id as string) });
  } catch (error) { return failure(error); }
}
