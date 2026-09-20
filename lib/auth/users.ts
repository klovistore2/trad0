import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/neon/db";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Google has already proved the address, so the account is created on first sign in.
// The saved voice is keyed on this id, which is why it must stay stable across sign ins.
export async function upsertOAuthUser(email: unknown, provider: string) {
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()) || email.length > 320) return null;
  const address = email.trim();
  const rows = await db()`INSERT INTO adu_users(id,email,provider) VALUES(${randomUUID()},${address},${provider})
    ON CONFLICT (lower(email)) DO UPDATE SET email=EXCLUDED.email RETURNING id`;
  return (rows[0]?.id as string | undefined) ?? null;
}
