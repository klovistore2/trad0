import { LANGUAGES } from "@/types/session";

const conversation = /^\/(session|join)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const home = new Set<string>(["/", ...LANGUAGES.map(code => `/${code}`)]);

// OAuth can return to the conversation or to a home page, but never to an arbitrary external URL.
export function accountReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/";
  return conversation.test(value) || home.has(value) ? value : "/";
}
