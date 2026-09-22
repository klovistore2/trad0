import type { Metadata } from "next";
import { translator } from "@/lib/i18n/strings";
import { LANGUAGES, type Language } from "@/types/session";

// Open Graph wants a region with the language; these are the usual pairings, not a user setting.
const ogLocales: Record<Language, string> = {
  fr: "fr_FR", en: "en_US", th: "th_TH", es: "es_ES", pt: "pt_PT", it: "it_IT", de: "de_DE", nl: "nl_NL",
  ja: "ja_JP", ko: "ko_KR", zh: "zh_CN", ru: "ru_RU", hi: "hi_IN", id: "id_ID", vi: "vi_VN",
};

export const homePath = (language: Language) => (language === "en" ? "/" : `/${language}`);

// Each language page declares its siblings, so the right one is indexed for the right reader.
export function homeMetadata(language: Language): Metadata {
  const t = translator(language);
  const title = `Trad0 · ${t("homeEyebrow")}`;
  return {
    title,
    description: t("homeIntro"),
    alternates: {
      canonical: homePath(language),
      languages: {
        ...Object.fromEntries(LANGUAGES.map(code => [code, homePath(code)])),
        "x-default": homePath("en"),
      },
    },
    openGraph: {
      title, description: t("homeIntro"), url: homePath(language), type: "website", siteName: "Trad0",
      locale: ogLocales[language],
      alternateLocale: LANGUAGES.filter(code => code !== language).map(code => ogLocales[code]),
    },
    twitter: { card: "summary_large_image", title, description: t("homeIntro") },
  };
}
