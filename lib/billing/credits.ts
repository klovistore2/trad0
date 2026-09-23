import "server-only";
import { db } from "@/lib/neon/db";
import { HttpError } from "@/lib/server/http";

import { CREDIT_PRICES, type CreditUse } from "./prices";
export { CREDIT_PRICES, type CreditUse };

// Offered once per account so a first real conversation, clone included, costs nothing.
// WELCOME_CREDITS overrides the default; 0 turns the offer off.
export function welcomeCredits() {
  const configured = process.env.WELCOME_CREDITS?.trim();
  if (!configured) return 300;
  const value = Number(configured);
  return Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : 300;
}
export async function grantWelcome(userId: string) {
  const amount = welcomeCredits();
  if (!amount) return;
  try {
    await db()`INSERT INTO adu_credit_ledger(user_id,kind,amount) VALUES(${userId},'welcome',${amount})
      ON CONFLICT (user_id) WHERE kind='welcome' DO NOTHING`;
  } catch (error) { console.error("Welcome credits failed", error instanceof Error ? error.message : "unknown"); }
}

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
        AND (SELECT COALESCE(SUM(l.amount),0) FROM adu_credit_ledger l JOIN adu_participants p ON p.user_id=l.user_id
          WHERE p.session_id=${sessionId} AND p.slot=0)>0
      RETURNING id`;
    if (claimed.length) await charge(sessionId, "minute");
  } catch (error) { console.error("Minute billing failed", error instanceof Error ? error.message : "unknown"); }
}

// Balance of whoever pays for this conversation: its creator. Null when it cannot be read, in
// which case nothing is blocked: a billing outage must not silence a conversation.
export async function payerBalance(sessionId: string) {
  try {
    const rows = await db()`SELECT COALESCE((SELECT SUM(amount) FROM adu_credit_ledger WHERE user_id=p.user_id),0)::int AS balance
      FROM adu_participants p WHERE p.session_id=${sessionId} AND p.slot=0 AND p.user_id IS NOT NULL`;
    return rows.length ? rows[0].balance as number : null;
  } catch { return null; }
}
export async function userBalance(userId: string) {
  try {
    const rows = await db()`SELECT COALESCE(SUM(amount),0)::int AS balance FROM adu_credit_ledger WHERE user_id=${userId}`;
    return rows[0].balance as number;
  } catch { return null; }
}
// Every paid request checks it: with no credits left, the conversation stops for both people.
export async function requireCredits(sessionId: string) {
  const balance = await payerBalance(sessionId);
  if (balance !== null && balance <= 0) throw new HttpError(402, "No credits left.");
}
// DEV only: brings a balance back to the welcome amount with one adjusting line, so the ledger
// keeps its history. The welcome grant itself is untouched and is never given twice.
export async function resetCredits(userId: string) {
  const balance = await userBalance(userId);
  if (balance === null) throw new HttpError(503, "Credits unavailable.");
  const adjustment = welcomeCredits() - balance;
  if (adjustment) await db()`INSERT INTO adu_credit_ledger(user_id,kind,amount) VALUES(${userId},'grant',${adjustment})`;
  return welcomeCredits();
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
