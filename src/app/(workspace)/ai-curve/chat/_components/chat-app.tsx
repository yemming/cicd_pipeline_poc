"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createSession,
  deleteSession,
  deleteMessages,
  getSessionMessages,
  type ChatSession,
  type ChatMessage,
} from "@/domain/rag-chat";
import { ChatMessageBubble } from "./chat-message";

const PROMPT_SUGGESTIONS: { icon: string; label: string; q: string }[] = [
  {
    icon: "📘",
    label: "手冊技術問題",
    q: "Desert X 第一次保養多少里程？",
  },
  {
    icon: "🔧",
    label: "歷史維修紀錄",
    q: "車牌 IMC-001 的車最近修過什麼？",
  },
  {
    icon: "👤",
    label: "客戶身家",
    q: "客戶林志玲名下有什麼車？最近回廠是什麼時候？",
  },
  {
    icon: "🎤",
    label: "接待追蹤",
    q: "最近的接待錄音裡，哪些客戶意向是 4 分以上？",
  },
];

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
  const [streaming, setStreaming] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // mobile：sidebar 預設收起，桌機（md+）保持常駐
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // auto scroll
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // 切回 tab 自動 reconcile：SSE 在 iOS 切到背景常被 kill，但後端會把答案寫完進 DB。
  // 切回前景時若還卡在 streaming 或 thread 內還掛著 temp- 訊息，就直接 fetch DB 蓋掉，避免使用者卡在「回答中」永遠不動。
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (!activeId) return;
      const hasTemps = messages.some((m) => m.id.startsWith("temp-"));
      if (streaming || hasTemps) {
        getSessionMessages(activeId)
          .then((fresh) => {
            setMessages(fresh);
            setStreaming(false);
          })
          .catch(() => {
            // 網路掛了就讓使用者自己重試 — 不蓋現有訊息
          });
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [activeId, streaming, messages]);

  async function onNewSession() {
    const r = await createSession();
    if (r.ok) {
      setActiveId(r.data.id);
      setSidebarOpen(false); // mobile：開新對話自動關 drawer 看 chat
      router.refresh();
      inputRef.current?.focus();
    } else {
      setBanner(r.error);
    }
  }

  function selectSession(id: string) {
    setActiveId(id);
    setSidebarOpen(false); // mobile：選 session 自動關 drawer
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

  async function onSubmit() {
    const q = input.trim();
    if (!q || streaming) return;

    let sessionId = activeId;
    if (!sessionId) {
      const r = await createSession();
      if (!r.ok) {
        setBanner(r.error);
        return;
      }
      sessionId = r.data.id;
      setActiveId(sessionId);
    }
    setInput("");
    await streamAnswer(sessionId, q);
  }

  function pickSuggestion(q: string) {
    setInput(q);
    inputRef.current?.focus();
  }

  async function streamAnswer(sessionId: string, q: string) {
    setStreaming(true);

    // 樂觀 push 一條 user message + 一條 assistant placeholder（空 content、邊收邊填）
    const tempUserId = `temp-u-${Date.now()}`;
    const tempAssistantId = `temp-a-${Date.now()}`;
    const tempUser: ChatMessage = {
      id: tempUserId,
      session_id: sessionId,
      role: "user",
      content: q,
      retrieved_chunks: null,
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
      created_at: new Date().toISOString(),
    };
    const tempAssistant: ChatMessage = {
      id: tempAssistantId,
      session_id: sessionId,
      role: "assistant",
      content: "",
      retrieved_chunks: null,
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser, tempAssistant]);

    let streamError: Error | null = null;

    try {
      const resp = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, question: q }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.text();
        throw new Error(err || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accText = "";
      let metaUser: ChatMessage | null = null;
      let finalAssistant: ChatMessage | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const evRaw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!evRaw.startsWith("data: ")) continue;
          const ev = JSON.parse(evRaw.slice(6));
          if (ev.type === "meta") {
            metaUser = ev.userMessage as ChatMessage;
            // 把 user temp 換成真實 row
            setMessages((prev) =>
              prev.map((m) => (m.id === tempUserId && metaUser ? metaUser : m)),
            );
          } else if (ev.type === "text") {
            accText += ev.text as string;
            const snapshot = accText;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, content: snapshot } : m,
              ),
            );
          } else if (ev.type === "done") {
            finalAssistant = ev.assistantMessage as ChatMessage | null;
          }
        }
      }

      // 用真實 assistant row 取代（含 token / latency / retrieved）
      if (finalAssistant) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempAssistantId ? finalAssistant! : m)),
        );
      }
    } catch (e) {
      // 不要直接拿掉 temp — 後端可能已經把答案寫進 DB（client 端 stream 被 mobile 切背景 / proxy timeout kill）
      // 留給下面 DB reconcile 步驟收尾
      streamError = e as Error;
    }

    // 不管成功 / 失敗，最後都從 DB 撈一次當 truth source。
    // 解決 iOS 切背景被 kill streaming 時 user 看到「永遠回答中」、或 catch 把答案誤清掉的問題。
    let dbReconciled = false;
    try {
      const fresh = await getSessionMessages(sessionId);
      setMessages(fresh);
      dbReconciled = true;
    } catch {
      // DB 也撈不到 → 等下走錯誤分支
    }

    // 判斷是否真的失敗：streamError 存在、且 DB 裡也沒有對應 assistant row → 才顯示 banner
    if (streamError) {
      // reconcile 後沒有 assistant 訊息 = 真的失敗
      const allMsgs = await getSessionMessages(sessionId).catch(() => null);
      const hasAssistantNow =
        allMsgs?.some(
          (m) =>
            m.role === "assistant" &&
            m.content.trim().length > 0 &&
            Date.now() - new Date(m.created_at).getTime() < 60_000,
        ) ?? false;
      if (!hasAssistantNow) {
        // DB 也沒有答案，才當真的失敗 — 把 temp 拿掉避免畫面殘留
        if (!dbReconciled) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId),
          );
        }
        setBanner(`AI 出錯：${streamError.message}`);
      }
      // 否則 stream 雖然斷了但後端有完成 — 安靜收尾，DB reconcile 已經把答案撈出來
    }

    // 更新左側 sessions 列表（move 到 top + title）
    setSessions((prev) => {
      const cur = prev.find((s) => s.id === sessionId);
      const updated: ChatSession = {
        id: sessionId,
        title: cur?.title ?? q.slice(0, 30),
        created_at: cur?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return [updated, ...prev.filter((s) => s.id !== sessionId)];
    });

    setStreaming(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  /** 重新生成 assistant 答案：找上一條 user message、刪 user+assistant、重發 */
  async function regenerate(assistantMessageId: string) {
    if (streaming || !activeId) return;
    const idx = messages.findIndex((m) => m.id === assistantMessageId);
    if (idx < 1) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== "user") return;

    const r = await deleteMessages([userMsg.id, assistantMessageId]);
    if (!r.ok) {
      setBanner(`刪除舊訊息失敗：${r.error}`);
      return;
    }
    setMessages((prev) =>
      prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMessageId),
    );
    await streamAnswer(activeId, userMsg.content);
  }

  /** 編輯重發：刪此 user message 及之後所有、用新內容重發 */
  async function editAndResend(userMessageId: string, originalContent: string) {
    if (streaming || !activeId) return;
    const next = window.prompt("編輯問題", originalContent);
    if (!next || !next.trim() || next.trim() === originalContent.trim()) return;

    const idx = messages.findIndex((m) => m.id === userMessageId);
    if (idx < 0) return;
    const toDelete = messages.slice(idx).map((m) => m.id);

    const r = await deleteMessages(toDelete);
    if (!r.ok) {
      setBanner(`刪除舊訊息失敗：${r.error}`);
      return;
    }
    setMessages((prev) => prev.slice(0, idx));
    await streamAnswer(activeId, next.trim());
  }

  return (
    <main className="flex h-[calc(100dvh-52px)] -mx-6 -my-5 bg-[#F8F7F4] relative overscroll-contain">
      {/* Mobile backdrop（< md，sidebar 開啟時顯示） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Session list — 手機 drawer / 桌機常駐 */}
      <aside
        className={`
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
          fixed md:relative inset-y-0 left-0 z-40
          w-[260px] md:w-[240px] shrink-0
          border-r border-[#EEECE6] bg-white
          flex flex-col
          transition-transform duration-200 ease-out
        `}
      >
        <div className="px-3 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <button
            onClick={onNewSession}
            disabled={isPending || streaming}
            className="flex-1 h-[36px] rounded-md bg-gradient-to-br from-[#185FA5] to-[#1A3A5C] text-white text-[12.5px] font-medium hover:from-[#0F2A45] hover:to-[#0F2A45] shadow disabled:opacity-50"
          >
            ＋ 新對話
          </button>
          {/* mobile 關閉鈕 */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-9 h-9 rounded-md border border-[#EEECE6] text-[#5A5955] hover:bg-[#F8F7F4] flex items-center justify-center"
            aria-label="關閉"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
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
              onClick={() => selectSession(s.id)}
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
                className="md:opacity-0 md:group-hover:opacity-100 text-[#9A9890] hover:text-[#CC0000] text-[14px] w-6 h-6 flex items-center justify-center"
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
        <header className="px-3 sm:px-5 py-3 border-b border-[#EEECE6] bg-white">
          <div className="flex items-center gap-2">
            {/* mobile hamburger — 開 sidebar */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-9 h-9 rounded-md border border-[#EEECE6] text-[#5A5955] hover:bg-[#F8F7F4] flex items-center justify-center shrink-0"
              aria-label="開啟對話列表"
            >
              <span className="material-symbols-outlined text-[20px]">menu</span>
            </button>
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#185FA5] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[14px] text-white">
                auto_awesome
              </span>
            </div>
            <h1 className="text-[14px] font-semibold text-[#2C2C2A] shrink-0">
              AI 問答
            </h1>
            <span className="text-[11px] text-[#9A9890] truncate hidden sm:inline">
              ・ Gemini 2.5 Flash ・ RAG 從手冊 / 工單 / 客戶 / 接待錄音 檢索
            </span>
          </div>
        </header>

        {/* 訊息流：mobile 100%、平板 max-w-2xl、桌機 max-w-3xl — 鎖三尺寸，視窗變大不會把訊息拉超寬難讀 */}
        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 py-4"
        >
          <div className="w-full mx-auto md:max-w-2xl lg:max-w-3xl space-y-4">
            {messages.length === 0 ? (
              <EmptyState onPick={pickSuggestion} />
            ) : (
              messages.map((m) => (
                <ChatMessageBubble
                  key={m.id}
                  message={m}
                  isStreaming={streaming && m.id.startsWith("temp-a-") && !m.content}
                  onRegenerate={
                    m.role === "assistant" && !m.id.startsWith("temp-")
                      ? () => regenerate(m.id)
                      : undefined
                  }
                  onEdit={
                    m.role === "user" && !m.id.startsWith("temp-")
                      ? (content) => editAndResend(m.id, content)
                      : undefined
                  }
                />
              ))
            )}
            {streaming && messages.length > 0 && (
              <StreamingHint />
            )}
          </div>
        </div>

        <div className="border-t border-[#EEECE6] bg-white p-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          <div className="flex gap-2 items-end mx-auto w-full md:max-w-2xl lg:max-w-3xl">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="輸入問題（Enter 送出、Shift+Enter 換行）"
              rows={2}
              disabled={streaming}
              // iOS Safari focus 時 font-size < 16px 會自動 zoom 1.x — mobile 強制 16px 避免畫面亂跳；
              // sm+（≥640px）才回到設計尺寸 13px。
              className="flex-1 border border-[#D5D3CB] rounded-xl px-3 py-2 text-[16px] sm:text-[13px] focus:border-[#185FA5] outline-none resize-none shadow-sm disabled:bg-[#F8F7F4]"
            />
            <button
              onClick={onSubmit}
              disabled={streaming || !input.trim()}
              className="h-[44px] px-5 rounded-full bg-gradient-to-br from-[#185FA5] to-[#1A3A5C] text-white text-[13px] font-semibold shadow hover:from-[#0F2A45] disabled:opacity-50 disabled:from-[#9A9890] disabled:to-[#9A9890] inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">
                {streaming ? "more_horiz" : "send"}
              </span>
              {streaming ? "回答中" : "送出"}
            </button>
          </div>
        </div>
      </section>

      {banner && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD] z-50 max-w-md">
          {banner}
          <button
            onClick={() => setBanner(null)}
            className="ml-3 text-[#CC0000] font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}

// ─── Empty state with prompt chips ────────────────────────

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center px-4">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#185FA5] flex items-center justify-center mb-4 shadow-lg">
        <span className="material-symbols-outlined text-[28px] text-white">
          auto_awesome
        </span>
      </div>
      <h2 className="text-[18px] font-semibold text-[#2C2C2A] mb-1">
        我能查 brand 內所有知識
      </h2>
      <p className="text-[12.5px] text-[#5A5955] mb-6 max-w-md">
        手冊 / 修車工單 / 客戶資料 / 接待錄音 / 名片掃描 都已索引。試試這些問題：
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl w-full">
        {PROMPT_SUGGESTIONS.map((s) => (
          <button
            key={s.q}
            onClick={() => onPick(s.q)}
            className="text-left p-3 rounded-lg bg-white border border-[#EEECE6] hover:border-[#185FA5] hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-2">
              <span className="text-[16px] mt-0.5">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] font-semibold text-[#9A9890] group-hover:text-[#185FA5] uppercase tracking-wider mb-1">
                  {s.label}
                </div>
                <div className="text-[13px] text-[#2C2C2A] leading-snug">
                  {s.q}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Streaming hint（思考中動畫，等首個 chunk 到來） ─────────

function StreamingHint() {
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-[#9A9890] pl-11">
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#185FA5] animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#185FA5] animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#185FA5] animate-bounce [animation-delay:300ms]" />
      </span>
      <span>檢索 + 思考中⋯</span>
    </div>
  );
}
