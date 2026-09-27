import "server-only";
import { neon } from "@neondatabase/serverless";
import { HttpError } from "@/lib/server/http";

export function db() {
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Shared sessions are not configured.");
  return neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store", signal: AbortSignal.timeout(10_000) } });
}
