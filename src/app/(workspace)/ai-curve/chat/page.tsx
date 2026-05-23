import { listSessions } from "@/domain/rag-chat";
import { ChatApp } from "./_components/chat-app";

export const dynamic = "force-dynamic";

export default async function AiChatPage() {
  const sessions = await listSessions(50);
  return <ChatApp initialSessions={sessions} />;
}
