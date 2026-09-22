import { auth } from "@/auth";
import { Conversation } from "@/components/conversation/conversation";
import { homeMetadata } from "@/lib/i18n/home-metadata";

// The bare path is English; every other language has its own address under /[lang].
export const metadata = homeMetadata("en");

export default async function Home() {
  const account = await auth();
  return <Conversation email={account?.user?.email ?? null} pageLanguage="en" />;
}
