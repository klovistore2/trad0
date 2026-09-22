import type { Metadata } from "next";
import { pageContent } from "@/lib/i18n/pages";
import { LANGUAGES, type Language } from "@/types/session";

type Page = "about" | "faq";

export const pagePath = (page: Page, language: Language) =>
  language === "en" ? `/${page}` : `/${language}/${page}`;

// Each language has its own text at its own address, so each one is canonical for itself and
// declares the others as alternates.
export function pageMetadata(page: Page, language: Language): Metadata {
  const { metaTitle: title, metaDescription: description } = pageContent(language)[page];
  return {
    title, description,
    alternates: {
      canonical: pagePath(page, language),
      languages: {
        ...Object.fromEntries(LANGUAGES.map(code => [code, pagePath(page, code)])),
        "x-default": pagePath(page, "en"),
      },
    },
    openGraph: { title, description, url: pagePath(page, language), type: "article", siteName: "Trad0" },
  };
}
