import { auth } from "@/auth";
import { Conversation } from "@/components/conversation/conversation";

export default async function Home() {
  const account = await auth();
  return <Conversation email={account?.user?.email ?? null} />;
}
