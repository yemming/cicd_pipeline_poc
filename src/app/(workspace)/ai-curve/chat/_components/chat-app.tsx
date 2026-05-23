"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createSession,
  deleteSession,
  getSessionMessages,
  askInSession,
  type ChatSession,
  type ChatMessage,
} from "@/domain/rag-chat";
import { ChatMessageBubble } from "./chat-message";

export function ChatApp({
  initialSessions,
}: {
  initialSessions: ChatSession[];
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(
    initialSessions[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // 切 session → 載 message
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeId) {
        if (!cancelled) setMessages([]);
        return;
      }
      const msgs = await getSessionMessages(activeId);
      if (!cancelled) setMessages(msgs);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // auto scroll to bottom on new messages
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length, isPending]);

  async function onNewSession() {
    const r = await createSession();
    if (r.ok) {
      setActiveId(r.data.id);
      router.refresh();
    } else {
      setBanner(r.error);
    }
  }

  function onDeleteSession(id: string) {
    if (!confirm("刪除這個對話？")) return;
    startTransition(async () => {
      const r = await deleteSession(id);
      if (r.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeId === id) setActiveId(null);
        router.refresh();
      } else {
        setBanner(r.error);
      }
    });
  }

  function onSubmit() {
    const q = input.trim();
    if (!q) return;
    if (!activeId) {
      // 沒選 session → 開新的再送
      startTransition(async () => {
        const r = await createSession();
        if (!r.ok) {
          setBanner(r.error);
          return;
        }
        setActiveId(r.data.id);
        await sendQuestion(r.data.id, q);
      });
    } else {
      startTransition(async () => {
        await sendQuestion(activeId, q);
      });
    }
  }

  async function sendQuestion(sessionId: string, q: string) {
    setInput("");
    // 樂觀更新：先 push user message
    const tempUser: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content: q,
      retrieved_chunks: null,
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);

    const r = await askInSession(sessionId, q);
    if (!r.ok) {
      setBanner(r.error);
      // 移除 temp user message
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
      return;
    }
    // 用真實的 user message + assistant 取代
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== tempUser.id),
      r.data.userMessage,
      r.data.assistantMessage,
    ]);

    // 把 session 移到列表頂端 + 更新 title
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === sessionId);
      const updated: ChatSession = {
        id: sessionId,
        title:
          prev[idx]?.title ?? q.slice(0, 30) ?? null,
        created_at: prev[idx]?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const others = prev.filter((s) => s.id !== sessionId);
      return [updated, ...others];
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <main className="flex h-[calc(100vh-64px)] -mx-6 -my-5 bg-[#F8F7F4]">
      {/* Session list */}
      <aside className="w-[240px] shrink-0 border-r border-[#EEECE6] bg-white overflow-y-auto flex flex-col">
        <div className="px-3 py-3 border-b border-[#EEECE6]">
          <button
            onClick={onNewSession}
            disabled={isPending}
            className="w-full h-[36px] rounded-md bg-[#185FA5] text-white text-[12.5px] font-medium hover:bg-[#0F2A45] disabled:opacity-50"
          >
            ＋ 新對話
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 && (
            <div className="text-[11.5px] text-[#9A9890] px-3 py-2">
              還沒對話。按上方「新對話」開始
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer text-[12.5px] ${
                activeId === s.id
                  ? "bg-[#EAF4FB] border-l-2 border-l-[#185FA5]"
                  : "hover:bg-[#F8F7F4] border-l-2 border-l-transparent"
              }`}
            >
              <span className="material-symbols-outlined text-[16px] text-[#9A9890]">
                chat_bubble
              </span>
              <span className="flex-1 truncate text-[#2C2C2A]">
                {s.title ?? "（未命名對話）"}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(s.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-[#9A9890] hover:text-[#CC0000] text-[14px]"
                aria-label="刪除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat thread */}
      <section className="flex-1 flex flex-col min-w-0">
        <header className="px-5 py-3 border-b border-[#EEECE6] bg-white">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#185FA5]">
              auto_awesome
            </span>
            <h1 className="text-[14px] font-semibold text-[#2C2C2A]">
              AI 問答（手冊 + 修車紀錄 + 客戶資料）
            </h1>
          </div>
          <div className="text-[11px] text-[#9A9890] mt-0.5">
            Gemini 2.5 Flash・RAG 從 brand 內所有知識庫檢索
          </div>
        </header>

        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
        >
          {!activeId && messages.length === 0 && (
            <div className="text-center text-[12.5px] text-[#9A9890] py-10">
              選一個對話或開新的，問我任何事 ─ 例如：
              <ul className="mt-3 text-left max-w-md mx-auto space-y-1 text-[12px]">
                <li>・ Panigale V4 第一次保養多少里程？</li>
                <li>・ 上次幫車牌 ABC-123 換過什麼？</li>
                <li>・ 王先生家那台車保險到什麼時候？</li>
                <li>・ Diavel V4 換煞車碟盤的工時是多少？</li>
              </ul>
            </div>
          )}
          {messages.map((m) => (
            <ChatMessageBubble key={m.id} message={m} />
          ))}
          {isPending && (
            <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
              <span className="w-3 h-3 rounded-full border-2 border-[#185FA5]/30 border-t-[#185FA5] animate-spin" />
              AI 思考中⋯
            </div>
          )}
        </div>

        <div className="border-t border-[#EEECE6] bg-white p-3">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="輸入問題（Enter 送出、Shift+Enter 換行）"
              rows={2}
              disabled={isPending}
              className="flex-1 border border-[#D5D3CB] rounded-lg px-3 py-2 text-[13px] focus:border-[#185FA5] outline-none resize-none"
            />
            <button
              onClick={onSubmit}
              disabled={isPending || !input.trim()}
              className="h-[44px] px-5 rounded-full bg-[#185FA5] text-white text-[13px] font-semibold hover:bg-[#0F2A45] disabled:opacity-50"
            >
              {isPending ? "送出中⋯" : "送出"}
            </button>
          </div>
        </div>
      </section>

      {banner && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD] z-50">
          {banner}
          <button
            onClick={() => setBanner(null)}
            className="ml-3 text-[#CC0000]"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}
