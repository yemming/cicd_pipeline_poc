"use client";

import { useState } from "react";
import type { ChatMessage } from "@/domain/rag-chat";
import type { RetrievedChunk, RagSourceType } from "@/lib/ai/rag-retrieve";

function sourceTypeLabel(t: RagSourceType): string {
  switch (t) {
    case "manual":
      return "📘 手冊";
    case "repair_order":
      return "🔧 工單";
    case "final_inspection":
      return "✓ 檢驗";
    case "customer":
      return "👤 客戶";
    case "handcard_voice":
      return "🎤 接待錄音";
    case "business_card":
      return "💳 名片";
  }
}

function citationShortLabel(chunk: RetrievedChunk): string {
  const m = chunk.metadata;
  switch (chunk.sourceType) {
    case "manual": {
      const title = (m.title as string) ?? "手冊";
      const page = m.page as number | null | undefined;
      return page ? `${title} P.${page}` : title;
    }
    case "repair_order":
      return (m.ro_code as string) ?? "工單";
    case "final_inspection":
      return (m.inspection_no as string) ?? "檢驗";
    case "customer":
      return (m.customer_code as string) ?? "客戶";
    case "handcard_voice":
      return "接待錄音";
    case "business_card":
      return "名片";
  }
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const [showCitations, setShowCitations] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-[#185FA5] text-white"
            : "bg-white border border-[#EEECE6] text-[#2C2C2A]"
        }`}
      >
        <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Citations */}
        {!isUser &&
          message.retrieved_chunks &&
          message.retrieved_chunks.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#EEECE6]">
              <button
                onClick={() => setShowCitations((v) => !v)}
                className="text-[11px] text-[#185FA5] hover:underline"
              >
                {showCitations ? "收起" : "展開"}引用源（
                {message.retrieved_chunks.length} 筆）
              </button>
              {showCitations && (
                <div className="mt-2 space-y-1.5">
                  {message.retrieved_chunks.map((c, idx) => (
                    <details
                      key={c.chunkId || idx}
                      className="bg-[#F8F7F4] rounded border border-[#EEECE6] px-2 py-1.5"
                    >
                      <summary className="text-[11.5px] cursor-pointer flex items-center gap-2">
                        <span className="text-[#9A9890]">#{idx + 1}</span>
                        <span>{sourceTypeLabel(c.sourceType)}</span>
                        <span className="font-mono text-[#5A5955]">
                          {citationShortLabel(c)}
                        </span>
                        <span className="ml-auto text-[10.5px] text-[#185FA5]">
                          {(c.similarity * 100).toFixed(0)}%
                        </span>
                      </summary>
                      <div className="mt-1.5 text-[11.5px] text-[#5A5955] whitespace-pre-wrap leading-relaxed">
                        {c.content}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Token / latency footer (assistant only) */}
        {!isUser && (message.tokens_in || message.latency_ms) && (
          <div className="mt-1 text-[10.5px] text-[#9A9890] tabular-nums">
            {message.latency_ms ?? 0} ms ・ {message.tokens_in ?? 0} in /{" "}
            {message.tokens_out ?? 0} out tokens
          </div>
        )}
      </div>
    </div>
  );
}
