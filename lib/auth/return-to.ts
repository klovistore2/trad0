// OAuth can return to the conversation, but never to an arbitrary external URL.
export function accountReturnTo(value: unknown): string {
  return typeof value === "string" && /^\/(session|join)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : "/";
}
