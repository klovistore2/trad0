import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canStartConversation } from "@/lib/billing/credits";
import { Conversation } from "@/components/conversation/conversation";
import { homeMetadata } from "@/lib/i18n/home-metadata";
import { LANGUAGES, isLanguage } from "@/types/session";

// One address per language, so a search engine can index the page a reader would actually read.
// Unknown slugs are not served: `dynamicParams` keeps this segment from swallowing typos.
export const dynamicParams = false;
export const generateStaticParams = async () => LANGUAGES.map(lang => ({ lang }));

const read = async (params: Promise<{ lang: string }>) => {
  const { lang } = await params;
  return isLanguage(lang) ? lang : "en";
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return homeMetadata(await read(params));
}

export default async function LocalisedHome({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await read(params);
  if (lang === "en") redirect("/"); // English lives at the root: no second address for one page.
  const account = await auth();
  const blocked = account?.user?.id ? !await canStartConversation(account.user.id, account.user.email) : false;
  return <Conversation email={account?.user?.email ?? null} pageLanguage={lang} outOfCredits={blocked} />;
}
