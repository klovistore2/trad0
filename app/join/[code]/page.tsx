import { SharedConversation } from "@/components/conversation/shared-conversation";
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  return <SharedConversation id={(await params).code} />;
}
