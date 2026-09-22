import { isLanguage, LANGUAGES, type Language } from "@/types/session";

// Every page under /[lang] is built for the known languages only; anything else is not served.
export const languageParams = async () => LANGUAGES.map(lang => ({ lang }));

export async function readLanguage(params: Promise<{ lang: string }>): Promise<Language> {
  const { lang } = await params;
  return isLanguage(lang) ? lang : "en";
}
