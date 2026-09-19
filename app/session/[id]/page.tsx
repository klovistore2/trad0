import { SharedConversation } from "@/components/conversation/shared-conversation";
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  return <SharedConversation id={(await params).id} />;
}
