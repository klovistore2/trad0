import { auth } from "@/auth";
import { Conversation } from "@/components/conversation/conversation";
import { homeMetadata } from "@/lib/i18n/home-metadata";
import { userBalance } from "@/lib/billing/credits";

// The bare path is English; every other language has its own address under /[lang].
export const metadata = homeMetadata("en");

export default async function Home() {
  const account = await auth();
  const balance = account?.user?.id ? await userBalance(account.user.id) : null;
  return <Conversation email={account?.user?.email ?? null} pageLanguage="en" outOfCredits={balance !== null && balance <= 0} />;
}
