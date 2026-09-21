import { auth } from "@/auth";
import { SharedConversation } from "@/components/conversation/shared-conversation";
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  return <SharedConversation signedIn={!!(await auth())?.user?.id} id={(await params).id} />;
}
