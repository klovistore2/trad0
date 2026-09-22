import { redirect } from "next/navigation";
import { FaqArticle } from "@/components/site/faq-article";
import { PageShell } from "@/components/site/page-shell";
import { pageMetadata } from "@/lib/i18n/page-metadata";
import { languageParams, readLanguage } from "@/lib/i18n/lang-param";

export const dynamicParams = false;
export const generateStaticParams = languageParams;

type Params = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Params) {
  return pageMetadata("faq", await readLanguage(params));
}

export default async function Page({ params }: Params) {
  const language = await readLanguage(params);
  if (language === "en") redirect("/faq"); // English lives without a prefix.
  return <PageShell language={language}><FaqArticle language={language} /></PageShell>;
}
