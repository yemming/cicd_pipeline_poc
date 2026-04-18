"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addComment } from "@/lib/feedback-actions";
import {
  FEEDBACK_ATTACHMENT_MAX_COUNT,
  FEEDBACK_ATTACHMENT_MAX_SIZE,
  type FeedbackAttachment,
} from "@/lib/feedback";

export type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  badge?: string;
  attachments?: FeedbackAttachment[];
  pending?: boolean;
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

function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
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
          ? "text-[#0052CC] bg-[#DEEBFF]"
          : "text-[#6B778C] hover:text-[#172B4D] hover:bg-[#F4F5F7]"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">thumb_up</span>
      {count > 0 ? count : "讚"}
    </button>
  );
}

function AttachmentList({ attachments }: { attachments: FeedbackAttachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => {
        const url = a.signed_url ?? undefined;
        if (isImage(a.mime_type) && url) {
          return (
            <a
              key={a.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block group/att"
              title={`${a.file_name} · ${formatBytes(a.size_bytes)}`}
            >
              <img
                src={url}
                alt={a.file_name}
                className="max-w-[200px] max-h-[160px] rounded border border-[#DFE1E6] object-cover group-hover/att:ring-2 group-hover/att:ring-[#4C9AFF]"
              />
            </a>
          );
        }
        return (
          <a
            key={a.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded border border-[#DFE1E6] bg-[#F4F5F7] hover:bg-white transition-colors max-w-[320px]"
            title={a.file_name}
          >
            <span className="material-symbols-outlined text-[16px] text-[#6B778C]">attach_file</span>
            <span className="text-[12px] text-[#172B4D] truncate">{a.file_name}</span>
            {a.size_bytes != null && (
              <span className="text-[10px] text-[#6B778C] shrink-0">{formatBytes(a.size_bytes)}</span>
            )}
          </a>
        );
      })}
    </div>
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
  // server action 跑完後 revalidatePath 會讓 page re-render 並傳新的 initial 進來，
  // 在非 pending 時才同步，避免 optimistic update 被提早覆蓋。
  useEffect(() => {
    setComments(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const incoming = Array.from(picked);
    setError(null);
    setFiles((prev) => {
      const combined = [...prev, ...incoming];
      if (combined.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
        setError(`附件最多 ${FEEDBACK_ATTACHMENT_MAX_COUNT} 個`);
        return combined.slice(0, FEEDBACK_ATTACHMENT_MAX_COUNT);
      }
      const oversize = combined.find((f) => f.size > FEEDBACK_ATTACHMENT_MAX_SIZE);
      if (oversize) {
        setError(`「${oversize.name}」超過 ${FEEDBACK_ATTACHMENT_MAX_SIZE / 1024 / 1024}MB 上限`);
      }
      return combined;
    });
    setFocused(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function submit() {
    if (isPending) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    setError(null);

    const optimistic: CommentItem = {
      id: `opt-${Date.now()}`,
      body: trimmed || "(附件)",
      created_at: new Date().toISOString(),
      author_id: null,
      author_name: "我",
      // 上傳中不顯示預覽；儲存成功後會被 revalidate 刷新帶回
      attachments: [],
      pending: true,
    };

    const fd = new FormData();
    fd.set("body", trimmed);
    for (const f of files) fd.append("files", f);

    setComments((prev) => [...prev, optimistic]);
    const prevText = text;
    const prevFiles = files;
    setText("");
    setFiles([]);
    // 表單保持展開但整體 disabled，防止 pending 期間重複輸入/送出
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    startTransition(async () => {
      try {
        await addComment(ticketId, fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "留言失敗");
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        setText(prevText);
        setFiles(prevFiles);
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

      {/* Comment list — newest first */}
      <div ref={topRef} className="space-y-0">
        {comments.length === 0 && !focused ? null : (
          <div className="divide-y divide-[#F4F5F7]">
            {[...comments].reverse().map((c) => (
              <div
                key={c.id}
                className={`py-4 flex gap-3 group transition-opacity ${
                  c.pending ? "opacity-60" : ""
                }`}
              >
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
                      {c.pending ? "傳送中…" : formatTime(c.created_at)}
                    </span>
                    {c.pending && (
                      <span
                        className="inline-block w-3 h-3 border-[2px] border-[#0052CC]/30 border-t-[#0052CC] rounded-full animate-spin"
                        aria-hidden
                      />
                    )}
                  </div>
                  {/* Body */}
                  {c.body && c.body !== "(附件)" && (
                    <div className="text-[14px] text-[#172B4D] leading-relaxed whitespace-pre-wrap">
                      {c.body}
                    </div>
                  )}
                  {/* Attachments */}
                  {c.attachments && c.attachments.length > 0 && (
                    <AttachmentList attachments={c.attachments} />
                  )}
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
      </div>

      {/* Divider between thread and new-comment form */}
      {comments.length > 0 && (
        <div className="mt-6 mb-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#DFE1E6]" />
          <span className="text-[11px] font-semibold text-[#6B778C] uppercase tracking-wider">
            新增留言
          </span>
          <div className="flex-1 h-px bg-[#DFE1E6]" />
        </div>
      )}

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
            aria-busy={isPending}
            className={`relative border rounded transition-colors ${
              focused ? "border-[#4C9AFF] shadow-[0_0_0_2px_#4C9AFF22]" : "border-[#DFE1E6]"
            } ${isPending ? "opacity-70 pointer-events-none" : ""}`}
            onDragOver={(e) => {
              if (isPending) return;
              e.preventDefault();
              setFocused(true);
            }}
            onDrop={(e) => {
              if (isPending) return;
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            {isPending && (
              <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0052CC] bg-[#DEEBFF] border border-[#B3D4FF] rounded px-2 py-1 pointer-events-auto">
                <span
                  className="inline-block w-3 h-3 border-[2px] border-[#0052CC]/30 border-t-[#0052CC] rounded-full animate-spin"
                  aria-hidden
                />
                儲存中…
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                if (e.key === "Escape") { setFocused(false); setText(""); setFiles([]); }
              }}
              placeholder="新增留言…（可拖曳檔案或附上文件）"
              rows={focused ? 4 : 2}
              className="w-full text-[14px] text-[#172B4D] px-3 py-2.5 resize-none focus:outline-none bg-transparent placeholder:text-[#6B778C]/60 transition-all"
              disabled={isPending}
            />

            {/* Selected files preview */}
            {files.length > 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1 text-[11px] text-[#172B4D] bg-[#F4F5F7] border border-[#DFE1E6] rounded px-2 py-1"
                  >
                    <span className="material-symbols-outlined text-[13px] text-[#6B778C]">
                      {f.type.startsWith("image/") ? "image" : "attach_file"}
                    </span>
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <span className="text-[10px] text-[#6B778C]">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-0.5 text-[#6B778C] hover:text-[#BF2600]"
                      title="移除"
                    >
                      <span className="material-symbols-outlined text-[13px]">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {focused && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-[#DFE1E6] bg-[#F4F5F7] rounded-b gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isPending || files.length >= FEEDBACK_ATTACHMENT_MAX_COUNT}
                    className="inline-flex items-center gap-1 text-[12px] text-[#6B778C] hover:text-[#172B4D] hover:bg-[#DFE1E6] rounded px-2 py-1 transition-colors disabled:opacity-40"
                    title="附加檔案"
                  >
                    <span className="material-symbols-outlined text-[15px]">attach_file</span>
                    附件
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                  <span className="text-[11px] text-[#6B778C]">⌘Enter 送出 · Esc 取消</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setFocused(false); setText(""); setFiles([]); }}
                    className="text-[12px] font-semibold text-[#6B778C] hover:text-[#172B4D] px-3 py-1.5 rounded hover:bg-[#DFE1E6] transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={submit}
                    disabled={(!text.trim() && files.length === 0) || isPending}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded bg-[#0052CC] hover:bg-[#0747A6] disabled:bg-[#0747A6]/70 disabled:cursor-wait text-white transition-colors"
                  >
                    {isPending && (
                      <span
                        className="inline-block w-3 h-3 border-[2px] border-white/40 border-t-white rounded-full animate-spin"
                        aria-hidden
                      />
                    )}
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
