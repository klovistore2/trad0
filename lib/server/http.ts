import "server-only";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function checkOrigin(request: Request) {
  let expected: string;
  try { expected = new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || request.url).origin; }
  catch { throw new HttpError(503, "The site address is misconfigured."); }
  if (request.headers.get("origin") !== expected) throw new HttpError(403, "Origin not allowed.");
}
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  // Never log provider payloads, SQL parameters, guest tokens, audio or transcripts.
  if (process.env.NODE_ENV === "development") console.error("Request failed", error instanceof Error ? error.name : "unknown");
  return json({ error: "The service is unavailable. Try again." }, 503);
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Invalid request.");
  const text = await request.text();
  if (text.length > 20_000) throw new HttpError(413, "Request too long.");
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, "Invalid request."); }
}
