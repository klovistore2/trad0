import type { Language } from "@/types/session";
import type { PageContent } from "./types";
import { en } from "./en";
import { fr } from "./fr";
import { th } from "./th";
import { es } from "./es";
import { pt } from "./pt";
import { it } from "./it";
import { de } from "./de";
import { nl } from "./nl";
import { ja } from "./ja";
import { ko } from "./ko";
import { zh } from "./zh";
import { ru } from "./ru";
import { hi } from "./hi";
import { id } from "./id";
import { vi } from "./vi";

// Whole pages, never half of one: a language has its own text or reads the English. These
// translations are unverified by the project owner, like the rest of lib/i18n.
const content: Partial<Record<Language, PageContent>> = { en, fr, th, es, pt, it, de, nl, ja, ko, zh, ru, hi, id, vi };

export const pageContent = (language: Language): PageContent => content[language] ?? en;
export const isTranslated = (language: Language): boolean => language in content;
export type { PageContent, AboutContent, FaqContent } from "./types";
