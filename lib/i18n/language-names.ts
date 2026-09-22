import { LANGUAGES, languageNames, type Language } from "@/types/session";

// A menu is read in the language of the page around it: "ไทย" tells an English reader nothing.
// Intl knows these names; the endonyms stay as the fallback when a runtime lacks the data.
export function languageLabel(code: Language, locale: Language): string {
  try {
    const display = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
    const name = display.of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch { /* an incomplete ICU build is not a reason to show no menu at all */ }
  return languageNames[code];
}

export const languageOptions = (locale: Language) =>
  LANGUAGES.map(code => ({ code, label: languageLabel(code, locale) }));
