import "server-only";
import { db } from "@/lib/neon/db";

// Credits per use. Placeholder values until real provider costs are measured: change them here,
// nowhere else. A minute covers transcription, translation and speech in both directions.
export const CREDIT_PRICES = { minute: 10, tone: 1, clone: 50 } as const;
export type CreditUse = keyof typeof CREDIT_PRICES;

// The creator of a conversation pays for everything in it, the guest's cloning and tone included.
// Metering must never break the conversation it measures: a failed write is logged and dropped.
export async function charge(sessionId: string, use: CreditUse) {
  try {
    await db()`INSERT INTO adu_credit_ledger(user_id,session_id,kind,amount)
      SELECT user_id, ${sessionId}, ${use}, ${-CREDIT_PRICES[use]} FROM adu_participants
      WHERE session_id=${sessionId} AND slot=0 AND user_id IS NOT NULL`;
  } catch (error) { console.error("Credit charge failed", use, error instanceof Error ? error.message : "unknown"); }
}

// Called on every state poll. Bills one started minute while both people are online, claimed
// atomically so two phones polling together never bill it twice. After a pause the clock jumps
// forward rather than billing the gap.
export async function chargeActiveMinute(sessionId: string) {
  try {
    const claimed = await db()`UPDATE adu_sessions
      SET billed_at=CASE WHEN billed_at IS NULL THEN now() ELSE GREATEST(billed_at+interval '1 minute', now()-interval '15 seconds') END
      WHERE id=${sessionId} AND closed=false AND expires_at>now()
        AND (billed_at IS NULL OR billed_at<=now()-interval '1 minute')
        AND (SELECT count(*) FROM adu_participants WHERE session_id=${sessionId} AND last_seen>now()-interval '15 seconds')=2
      RETURNING id`;
    if (claimed.length) await charge(sessionId, "minute");
  } catch (error) { console.error("Minute billing failed", error instanceof Error ? error.message : "unknown"); }
}

// What the creator sees: this conversation's usage and the account balance. Null for anyone else.
export async function creditSummary(sessionId: string, userId: string | null) {
  if (!userId) return null;
  try {
    const rows = await db()`SELECT
      COALESCE(-SUM(amount) FILTER (WHERE session_id=${sessionId}), 0)::int AS "sessionUsed",
      COALESCE(SUM(amount), 0)::int AS balance
      FROM adu_credit_ledger WHERE user_id=${userId}`;
    return rows[0] as { sessionUsed: number; balance: number };
  } catch { return null; }
}
