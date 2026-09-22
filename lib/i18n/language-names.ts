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

// One flag per language, from its most populous or best-known country: a visual cue to find a
// language faster, never a claim about who speaks it. The name beside it stays the reference.
export const languageFlags: Record<Language, string> = {
  fr: "🇫🇷", en: "🇬🇧", th: "🇹🇭", es: "🇪🇸", pt: "🇵🇹", it: "🇮🇹", de: "🇩🇪", nl: "🇳🇱",
  ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", ru: "🇷🇺", hi: "🇮🇳", id: "🇮🇩", vi: "🇻🇳",
};

// Sorted by the name the reader actually sees, in the reader's own alphabet.
export function languageOptions(locale: Language) {
  const options = LANGUAGES.map(code => ({ code, name: languageLabel(code, locale) }));
  let compare: (a: string, b: string) => number;
  try { compare = new Intl.Collator(locale).compare; } catch { compare = (a, b) => a.localeCompare(b); }
  return options.sort((a, b) => compare(a.name, b.name))
    .map(({ code, name }) => ({ code, label: `${languageFlags[code]} ${name}` }));
}
