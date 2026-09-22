import type { MetadataRoute } from "next";
import { homePath } from "@/lib/i18n/home-metadata";
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
  return [...home,
    { url: absolute("/about"), changeFrequency: "monthly" as const, priority: 0.6 },
    { url: absolute("/faq"), changeFrequency: "monthly" as const, priority: 0.6 }];
}
