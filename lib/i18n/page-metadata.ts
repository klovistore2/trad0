import type { Metadata } from "next";
import { LANGUAGES, type Language } from "@/types/session";

type Page = "about" | "faq";
const copy: Record<Page, { title: string; description: string }> = {
  about: {
    title: "About Trad0 · Live voice translation for two people",
    description:
      "Trad0 translates a face-to-face conversation out loud, in real time. Two phones, two languages, nothing to install — you speak, the other person hears you in their own language.",
  },
  faq: {
    title: "FAQ · How Trad0 translates a live conversation",
    description:
      "Answers about Trad0: no app to install, nothing for your guest to sign up for, how two phones take turns, which languages are supported, and what happens to what you say.",
  },
};

export const pagePath = (page: Page, language: Language) =>
  language === "en" ? `/${page}` : `/${language}/${page}`;

// These two pages are written in English at every address. The canonical therefore points at the
// English one: a language prefix keeps the reader's navigation, it does not make a new text.
export function pageMetadata(page: Page, language: Language): Metadata {
  const { title, description } = copy[page];
  return {
    title, description,
    alternates: {
      canonical: pagePath(page, "en"),
      languages: Object.fromEntries(LANGUAGES.map(code => [code, pagePath(page, code)])),
    },
    openGraph: { title, description, url: pagePath(page, language), type: "article", siteName: "Trad0" },
  };
}
