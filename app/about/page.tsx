import { AboutArticle } from "@/components/site/about-article";
import { PageShell } from "@/components/site/page-shell";
import { pageMetadata } from "@/lib/i18n/page-metadata";

export const metadata = pageMetadata("about", "en");

export default function AboutPage() {
  return <PageShell language="en"><AboutArticle language="en" /></PageShell>;
}
