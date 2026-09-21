import { isLanguage, type Language } from "@/types/session";

// Only a starting suggestion, never presented as a detected spoken language.
export function browserLanguage(languages: readonly string[]): Language {
  for (const locale of languages) {
    const code = locale.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) return code;
  }
  return "en";
}

export function enoughForLanguageDetection(text: string): boolean {
  return (text.match(/\p{L}/gu)?.length ?? 0) >= 24;
}
