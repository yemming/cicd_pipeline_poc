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
  parent_id?: string | null;
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

function Avatar({ name, badge, size = "md" }: { name: string | null; badge?: string; size?: "md" | "sm" }) {
  const isSupport = badge === "Support";
  const dim = size === "sm" ? "w-6 h-6" : "w-8 h-8";
  const font = size === "sm" ? "text-[9px]" : "text-[11px]";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isSupport ? "bg-[#C9A84C]" : "bg-[#1A1A2E]"
      }`}
      title={name ?? undefined}
    >
      <span className={`${font} font-black leading-none ${isSupport ? "text-[#1A1A2E]" : "text-[#C9A84C]"}`}>
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

// ── Inline reply editor (mini version, shown under a specific comment) ──
function InlineReplyEditor({
  ticketId,
  parentId,
  parentAuthorName,
  onSubmitted,
  onCancel,
}: {
  ticketId: string;
  parentId: string;
  parentAuthorName: string | null;
  onSubmitted: (item: CommentItem) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(parentAuthorName ? `@${parentAuthorName} ` : "");
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    // place cursor at end
    const el = textareaRef.current;
    if (el) el.selectionStart = el.selectionEnd = el.value.length;
  }, []);

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
      if (oversize) setError(`「${oversize.name}」超過 ${FEEDBACK_ATTACHMENT_MAX_SIZE / 1024 / 1024}MB 上限`);
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      attachments: [],
      pending: true,
      parent_id: parentId,
    };

    const fd = new FormData();
    fd.set("body", trimmed);
    fd.set("parent_id", parentId);
    for (const f of files) fd.append("files", f);

    const prevText = text;
    const prevFiles = files;
    setText("");
    setFiles([]);

    startTransition(async () => {
      try {
        await addComment(ticketId, fd);
        onSubmitted(optimistic);
      } catch (e) {
        setError(e instanceof Error ? e.message : "回覆失敗");
        setText(prevText);
        setFiles(prevFiles);
      }
    });
  }

  return (
    <div
      className={`mt-2 border rounded transition-colors border-[#4C9AFF] shadow-[0_0_0_2px_#4C9AFF22] ${
        isPending ? "opacity-70 pointer-events-none" : ""
      }`}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
    >
      {isPending && (
        <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0052CC] bg-[#DEEBFF] border border-[#B3D4FF] rounded px-2 py-1">
          <span className="inline-block w-3 h-3 border-[2px] border-[#0052CC]/30 border-t-[#0052CC] rounded-full animate-spin" aria-hidden />
          儲存中…
        </div>
      )}
      {error && (
        <p className="text-[12px] text-[#BF2600] bg-[#FFEBE6] rounded-t px-3 py-2">{error}</p>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="回覆…（⌘Enter 送出）"
        rows={3}
        disabled={isPending}
        className="w-full text-[13px] text-[#172B4D] px-3 py-2.5 resize-none focus:outline-none bg-transparent placeholder:text-[#6B778C]/60"
      />
      {files.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 text-[11px] text-[#172B4D] bg-[#F4F5F7] border border-[#DFE1E6] rounded px-2 py-1">
              <span className="material-symbols-outlined text-[13px] text-[#6B778C]">
                {f.type.startsWith("image/") ? "image" : "attach_file"}
              </span>
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="ml-0.5 text-[#6B778C] hover:text-[#BF2600]">
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
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
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="text-[12px] font-semibold text-[#6B778C] hover:text-[#172B4D] px-3 py-1.5 rounded hover:bg-[#DFE1E6] transition-colors"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={(!text.trim() && files.length === 0) || isPending}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-60 disabled:cursor-wait text-white transition-colors"
          >
            {isPending && <span className="inline-block w-3 h-3 border-[2px] border-white/40 border-t-white rounded-full animate-spin" aria-hidden />}
            {isPending ? "傳送中…" : "回覆"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Single comment row (used for both top-level and replies) ──
function CommentRow({
  c,
  isReply,
  onReply,
}: {
  c: CommentItem;
  isReply: boolean;
  onReply: (id: string, name: string | null) => void;
}) {
  return (
    <div className={`flex gap-3 group transition-opacity ${c.pending ? "opacity-60" : ""}`}>
      <Avatar name={c.author_name} badge={c.badge} size={isReply ? "sm" : "md"} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className={`font-bold text-[#172B4D] ${isReply ? "text-[12px]" : "text-[13px]"}`}>
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
            <span className="inline-block w-3 h-3 border-[2px] border-[#0052CC]/30 border-t-[#0052CC] rounded-full animate-spin" aria-hidden />
          )}
        </div>
        {c.body && c.body !== "(附件)" && (
          <div className={`text-[#172B4D] leading-relaxed whitespace-pre-wrap ${isReply ? "text-[13px]" : "text-[14px]"}`}>
            {c.body}
          </div>
        )}
        {c.attachments && c.attachments.length > 0 && (
          <AttachmentList attachments={c.attachments} />
        )}
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <LikeButton />
          {!c.pending && (
            <button
              className="inline-flex items-center gap-1 text-[12px] text-[#6B778C] hover:text-[#172B4D] hover:bg-[#F4F5F7] rounded px-2 py-1 transition-colors"
              onClick={() => onReply(c.id, c.author_name)}
            >
              <span className="material-symbols-outlined text-[14px]">reply</span>
              回覆
            </button>
          )}
        </div>
      </div>
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
  useEffect(() => {
    setComments(initial);
  }, [initial]);

  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string | null } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // top-level comments only
  const roots = comments.filter((c) => !c.parent_id);
  // replies keyed by parent_id
  const repliesOf = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

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
      if (oversize) setError(`「${oversize.name}」超過 ${FEEDBACK_ATTACHMENT_MAX_SIZE / 1024 / 1024}MB 上限`);
      return combined;
    });
    setFocused(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      attachments: [],
      pending: true,
      parent_id: null,
    };

    const fd = new FormData();
    fd.set("body", trimmed);
    for (const f of files) fd.append("files", f);

    setComments((prev) => [...prev, optimistic]);
    const prevText = text;
    const prevFiles = files;
    setText("");
    setFiles([]);
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

  function handleReplySubmitted(item: CommentItem) {
    setComments((prev) => [...prev, item]);
    setReplyingTo(null);
  }

  const totalCount = comments.filter((c) => !c.pending).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[15px] font-bold text-[#172B4D]">活動紀錄</h2>
        {totalCount > 0 && (
          <span className="text-[12px] text-[#6B778C]">{totalCount} 則留言</span>
        )}
      </div>

      {/* Comment list — newest first (roots reversed, replies in asc order) */}
      <div ref={topRef} className="space-y-0">
        {roots.length > 0 && (
          <div className="divide-y divide-[#F4F5F7]">
            {[...roots].reverse().map((root) => {
              const replies = repliesOf(root.id);
              const showReplyEditor = replyingTo?.id === root.id;
              return (
                <div key={root.id} className="py-4">
                  <CommentRow
                    c={root}
                    isReply={false}
                    onReply={(id, name) => setReplyingTo({ id, name })}
                  />

                  {/* Replies — nested with left indent line */}
                  {(replies.length > 0 || showReplyEditor) && (
                    <div className="mt-3 ml-11 pl-4 border-l-2 border-[#DFE1E6] space-y-3">
                      {replies.map((r) => (
                        <div key={r.id}>
                          <CommentRow
                            c={r}
                            isReply={true}
                            onReply={(id, name) => setReplyingTo({ id, name })}
                          />
                          {/* reply-to-reply: re-target to the root */}
                          {replyingTo?.id === r.id && (
                            <div className="mt-2">
                              <InlineReplyEditor
                                ticketId={ticketId}
                                parentId={root.id}
                                parentAuthorName={r.author_name}
                                onSubmitted={handleReplySubmitted}
                                onCancel={() => setReplyingTo(null)}
                              />
                            </div>
                          )}
                        </div>
                      ))}

                      {showReplyEditor && (
                        <InlineReplyEditor
                          ticketId={ticketId}
                          parentId={root.id}
                          parentAuthorName={replyingTo.name}
                          onSubmitted={handleReplySubmitted}
                          onCancel={() => setReplyingTo(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      {roots.length > 0 && (
        <div className="mt-6 mb-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#DFE1E6]" />
          <span className="text-[11px] font-semibold text-[#6B778C] uppercase tracking-wider">新增留言</span>
          <div className="flex-1 h-px bg-[#DFE1E6]" />
        </div>
      )}

      {/* New top-level comment */}
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
            onDragOver={(e) => { if (isPending) return; e.preventDefault(); setFocused(true); }}
            onDrop={(e) => { if (isPending) return; e.preventDefault(); addFiles(e.dataTransfer.files); }}
          >
            {isPending && (
              <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0052CC] bg-[#DEEBFF] border border-[#B3D4FF] rounded px-2 py-1 pointer-events-auto">
                <span className="inline-block w-3 h-3 border-[2px] border-[#0052CC]/30 border-t-[#0052CC] rounded-full animate-spin" aria-hidden />
                儲存中…
              </div>
            )}
            <textarea
              ref={textareaRef}
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

            {files.length > 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 text-[11px] text-[#172B4D] bg-[#F4F5F7] border border-[#DFE1E6] rounded px-2 py-1">
                    <span className="material-symbols-outlined text-[13px] text-[#6B778C]">
                      {f.type.startsWith("image/") ? "image" : "attach_file"}
                    </span>
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <span className="text-[10px] text-[#6B778C]">{formatBytes(f.size)}</span>
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="ml-0.5 text-[#6B778C] hover:text-[#BF2600]">
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
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
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
                      <span className="inline-block w-3 h-3 border-[2px] border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
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
