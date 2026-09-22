import type { MetadataRoute } from "next";
import { homePath } from "@/lib/i18n/home-metadata";
import { pagePath } from "@/lib/i18n/page-metadata";
import { absolute } from "@/lib/i18n/site-url";
import { LANGUAGES } from "@/types/session";

// Only the pages meant to be found: a conversation address belongs to two people, not to a crawler.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LANGUAGES.map(code => [code, absolute(homePath(code))]));
  // English first: it is the address the others are alternates of.
  const ordered = ["en" as const, ...LANGUAGES.filter(code => code !== "en")];
  const home = ordered.map(code => ({
    url: absolute(homePath(code)),
    changeFrequency: "weekly" as const,
    priority: code === "en" ? 1 : 0.8,
    alternates: { languages },
  }));
  // About and FAQ are translated too, so every language's address is listed with its siblings.
  const pages = (["about", "faq"] as const).flatMap(page => {
    const siblings = Object.fromEntries(LANGUAGES.map(code => [code, absolute(pagePath(page, code))]));
    return ordered.map(code => ({
      url: absolute(pagePath(page, code)),
      changeFrequency: "monthly" as const,
      priority: code === "en" ? 0.6 : 0.5,
      alternates: { languages: siblings },
    }));
  });
  return [...home, ...pages];
}
