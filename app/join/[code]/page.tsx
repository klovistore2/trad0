import { auth } from "@/auth";
import { SharedConversation } from "@/components/conversation/shared-conversation";
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  return <SharedConversation signedIn={!!(await auth())?.user?.id} id={(await params).code} />;
}
