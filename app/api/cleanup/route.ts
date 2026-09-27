import { timingSafeEqual } from "node:crypto";
import { cleanupSessions } from "@/lib/session/cleanup";
import { failure, json } from "@/lib/server/http";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret}`); const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: "Unauthorized." }, 401);
  try {
    // A partial failure is still reported as one, so the cron log shows sessions left to retry.
    const result = await cleanupSessions();
    return json(result, result.failed ? 502 : 200);
  } catch (error) { return failure(error); }
}
