"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/domain/rag-chat";
import { recordFeedback } from "@/domain/rag-chat";

export function ChatMessageBubble({
  message,
  isStreaming,
  onRegenerate,
  onEdit,
}: {
  message: ChatMessage;
  /** true 時：assistant message 還在 streaming、顯示 cursor + 不渲染 footer */
  isStreaming?: boolean;
  /** assistant bubble hover 「↻ 重新生成」會呼叫 */
  onRegenerate?: () => void;
  /** user bubble hover 「✏️ 編輯」會呼叫、傳 current content + messageId */
  onEdit?: (currentContent: string) => void;
}) {
  const [fb, setFb] = useState<'up' | 'down' | null>(
    message.feedback?.rating ?? null,
  );
  const [, startFb] = useTransition();
  const isUser = message.role === "user";

  function rate(rating: 'up' | 'down') {
    // 樂觀更新：同 rating 撤回、不同改評
    const prev = fb;
    const next = prev === rating ? null : rating;
    setFb(next);
    startFb(async () => {
      const r = await recordFeedback(message.id, rating);
      if (!r.ok) setFb(prev); // rollback
    });
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Avatar — assistant 在左 */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#185FA5] flex items-center justify-center text-white shadow">
          <span className="material-symbols-outlined text-[18px]">
            auto_awesome
          </span>
        </div>
      )}

      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className={`rounded-2xl px-4 py-2.5 shadow-sm ${
            isUser
              ? "bg-gradient-to-br from-[#185FA5] to-[#1A3A5C] text-white rounded-tr-md"
              : "bg-white border border-[#EEECE6] text-[#2C2C2A] rounded-tl-md"
          }`}
        >
          {isUser ? (
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>
          ) : (
            <MarkdownBody content={message.content} streaming={isStreaming} />
          )}
        </div>

        {/* Action row + Footer — assistant 才有 */}
        {!isUser && !isStreaming && (
          <div className="flex items-center gap-2 pl-1 mt-0.5">
            {/* 👍 */}
            <button
              onClick={() => rate('up')}
              title={fb === 'up' ? '取消讚' : '答得好'}
              className={`w-7 h-7 rounded-md flex items-center justify-center text-[14px] transition-colors ${
                fb === 'up'
                  ? 'bg-[#EAF3DE] text-[#3B6D11]'
                  : 'text-[#9A9890] hover:bg-[#F8F7F4] hover:text-[#3B6D11]'
              }`}
            >
              👍
            </button>
            {/* 👎 */}
            <button
              onClick={() => rate('down')}
              title={fb === 'down' ? '取消踩' : '答錯了 / 不好'}
              className={`w-7 h-7 rounded-md flex items-center justify-center text-[14px] transition-colors ${
                fb === 'down'
                  ? 'bg-[#FDECEA] text-[#CC0000]'
                  : 'text-[#9A9890] hover:bg-[#F8F7F4] hover:text-[#CC0000]'
              }`}
            >
              👎
            </button>
            {/* ↻ 重新生成 */}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                title="重新生成"
                className="w-7 h-7 rounded-md flex items-center justify-center text-[14px] text-[#9A9890] hover:bg-[#F8F7F4] hover:text-[#185FA5]"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
              </button>
            )}
            {/* token / latency hover tooltip */}
            {(message.tokens_in || message.latency_ms) && (
              <div
                className="text-[10.5px] text-[#9A9890] tabular-nums ml-1 cursor-help select-none"
                title={`輸入 ${message.tokens_in ?? 0} tokens / 輸出 ${
                  message.tokens_out ?? 0
                } tokens / 延遲 ${message.latency_ms ?? 0} ms`}
              >
                {((message.latency_ms ?? 0) / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        )}

        {/* User bubble action — hover 出「編輯」 */}
        {isUser && onEdit && (
          <div className="flex items-center gap-2 pr-1 mt-0.5 self-end">
            <button
              onClick={() => onEdit(message.content)}
              title="編輯重發"
              className="w-7 h-7 rounded-md flex items-center justify-center text-[14px] text-[#9A9890] hover:bg-[#F8F7F4] hover:text-[#185FA5]"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
          </div>
        )}
      </div>

      {/* user avatar 在右 */}
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-[#2C2C2A] flex items-center justify-center text-white text-[12.5px] font-medium shadow">
          我
        </div>
      )}
    </div>
  );
}

// ─── Markdown 渲染 ────────────────────────────────────────

function MarkdownBody({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="text-[13px] leading-relaxed prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="my-0">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[#1A3A5C]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 bg-[#F8F7F4] border border-[#EEECE6] rounded text-[12px] font-mono">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-[#F8F7F4] border border-[#EEECE6] rounded p-2 my-2 text-[12px] font-mono overflow-x-auto">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#185FA5] hover:underline"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => <h1 className="text-[15px] font-semibold mt-2 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[14px] font-semibold mt-2 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[13.5px] font-semibold mt-1.5 mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#185FA5]/40 pl-2 my-1.5 text-[#5A5955]">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table className="border-collapse my-2 text-[12px]">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-[#EEECE6] bg-[#F8F7F4] px-2 py-1 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[#EEECE6] px-2 py-1">{children}</td>
          ),
        }}
      >
        {content || ""}
      </ReactMarkdown>
      {streaming && (
        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-[#185FA5] align-middle animate-pulse" />
      )}
    </div>
  );
}

