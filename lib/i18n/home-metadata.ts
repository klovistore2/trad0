import type { Metadata } from "next";
import { translator } from "@/lib/i18n/strings";
import { LANGUAGES, type Language } from "@/types/session";

export const homePath = (language: Language) => (language === "en" ? "/" : `/${language}`);

// Each language page declares its siblings, so the right one is indexed for the right reader.
export function homeMetadata(language: Language): Metadata {
  const t = translator(language);
  return {
    title: `Trad0 · ${t("homeTitle")} ${t("homeTitleEm")}`,
    description: t("homeIntro"),
    alternates: {
      canonical: homePath(language),
      languages: Object.fromEntries(LANGUAGES.map(code => [code, homePath(code)])),
    },
  };
}
