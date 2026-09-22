import { FaqArticle } from "@/components/site/faq-article";
import { PageShell } from "@/components/site/page-shell";
import { pageMetadata } from "@/lib/i18n/page-metadata";

export const metadata = pageMetadata("faq", "en");

export default function FaqPage() {
  return <PageShell language="en"><FaqArticle language="en" /></PageShell>;
}
