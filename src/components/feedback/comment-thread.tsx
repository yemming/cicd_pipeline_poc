"use client";

import { useRef, useState, useTransition } from "react";
import { addComment } from "@/lib/feedback-actions";

export type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  badge?: string; // e.g. "Support" for admin
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  return new Date(iso).toLocaleDateString("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({ name, badge }: { name: string | null; badge?: string }) {
  const isSupport = badge === "Support";
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isSupport ? "bg-[#C9A84C]" : "bg-[#1A1A2E]"
      }`}
      title={name ?? undefined}
    >
      <span className={`text-[11px] font-black leading-none ${isSupport ? "text-[#1A1A2E]" : "text-[#C9A84C]"}`}>
        {getInitials(name)}
      </span>
    </div>
  );
}

function LikeButton() {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  return (
    <button
      onClick={() => {
        setLiked((v) => !v);
        setCount((v) => (liked ? v - 1 : v + 1));
      }}
      className={`inline-flex items-center gap-1 text-[12px] rounded px-2 py-1 transition-colors ${
        liked
          ? "text-[#CC0000] bg-[#FFEBE6]"
          : "text-[#6B778C] hover:text-[#172B4D] hover:bg-[#F4F5F7]"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">thumb_up</span>
      {count > 0 ? count : "讚"}
    </button>
  );
}

export function CommentThread({
  ticketId,
  initial,
}: {
  ticketId: string;
  initial: CommentItem[];
}) {
  const [comments, setComments] = useState(initial);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setFocused(false);

    const optimistic: CommentItem = {
      id: `opt-${Date.now()}`,
      body: trimmed,
      created_at: new Date().toISOString(),
      author_id: null,
      author_name: "我",
    };

    setComments((prev) => [...prev, optimistic]);
    setText("");
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    startTransition(async () => {
      try {
        await addComment(ticketId, trimmed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "留言失敗");
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        setText(trimmed);
        setFocused(true);
      }
    });
  }

  return (
    <div>
      {/* Section header — Confluence style */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[15px] font-bold text-[#172B4D]">活動紀錄</h2>
        {comments.length > 0 && (
          <span className="text-[12px] text-[#6B778C]">{comments.length} 則留言</span>
        )}
      </div>

      {/* Comment list */}
      <div className="space-y-0">
        {comments.length === 0 && !focused ? null : (
          <div className="divide-y divide-[#F4F5F7]">
            {comments.map((c) => (
              <div key={c.id} className="py-4 flex gap-3 group">
                <Avatar name={c.author_name} badge={c.badge} />
                <div className="flex-1 min-w-0">
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[13px] font-bold text-[#172B4D]">
                      {c.author_name ?? "未知用戶"}
                    </span>
                    {c.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#C9A84C]/15 text-[#755b00] uppercase tracking-wide">
                        {c.badge}
                      </span>
                    )}
                    <span className="text-[12px] text-[#6B778C]">
                      {formatTime(c.created_at)}
                    </span>
                  </div>
                  {/* Body */}
                  <div className="text-[14px] text-[#172B4D] leading-relaxed whitespace-pre-wrap">
                    {c.body}
                  </div>
                  {/* Actions — show on hover */}
                  <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <LikeButton />
                    <button className="inline-flex items-center gap-1 text-[12px] text-[#6B778C] hover:text-[#172B4D] hover:bg-[#F4F5F7] rounded px-2 py-1 transition-colors">
                      <span className="material-symbols-outlined text-[14px]">reply</span>
                      回覆
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Add comment — Confluence style inline editor */}
      <div className="mt-4 flex gap-3">
        <div className="w-8 h-8 rounded-full bg-[#1A1A2E] flex items-center justify-center shrink-0 mt-1">
          <span className="text-[11px] font-black text-[#C9A84C] leading-none">我</span>
        </div>
        <div className="flex-1">
          {error && (
            <p className="text-[12px] text-[#BF2600] bg-[#FFEBE6] rounded px-3 py-2 mb-2">{error}</p>
          )}
          <div
            className={`border rounded transition-colors ${
              focused ? "border-[#4C9AFF] shadow-[0_0_0_2px_#4C9AFF22]" : "border-[#DFE1E6]"
            }`}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                if (e.key === "Escape") { setFocused(false); setText(""); }
              }}
              placeholder="新增留言…"
              rows={focused ? 4 : 2}
              className="w-full text-[14px] text-[#172B4D] px-3 py-2.5 resize-none focus:outline-none bg-transparent placeholder:text-[#6B778C]/60 transition-all"
              disabled={isPending}
            />
            {focused && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-[#DFE1E6] bg-[#F4F5F7] rounded-b">
                <span className="text-[11px] text-[#6B778C]">⌘Enter 送出 · Esc 取消</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setFocused(false); setText(""); }}
                    className="text-[12px] font-semibold text-[#6B778C] hover:text-[#172B4D] px-3 py-1.5 rounded hover:bg-[#DFE1E6] transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={submit}
                    disabled={!text.trim() || isPending}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                  >
                    {isPending ? "傳送中…" : "儲存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
