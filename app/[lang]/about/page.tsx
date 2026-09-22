import { redirect } from "next/navigation";
import { AboutArticle } from "@/components/site/about-article";
import { PageShell } from "@/components/site/page-shell";
import { pageMetadata } from "@/lib/i18n/page-metadata";
import { languageParams, readLanguage } from "@/lib/i18n/lang-param";

export const dynamicParams = false;
export const generateStaticParams = languageParams;

type Params = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Params) {
  return pageMetadata("about", await readLanguage(params));
}

export default async function Page({ params }: Params) {
  const language = await readLanguage(params);
  if (language === "en") redirect("/about"); // English lives without a prefix.
  return <PageShell language={language}><AboutArticle language={language} /></PageShell>;
}
