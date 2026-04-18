import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { StatusBadge } from "@/components/feedback/status-badge";
import { StatusActions } from "@/components/feedback/status-actions";
import { CommentThread, type CommentItem } from "@/components/feedback/comment-thread";
import { CanvasPanel } from "@/components/feedback/canvas-panel";
import type { FeedbackTicket, FeedbackAttachment } from "@/lib/feedback";
import { FEEDBACK_ATTACHMENT_BUCKET } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const [
    { data: ticketData },
    { data: canvasData },
    { isAdmin },
    { data: commentsRaw },
  ] = await Promise.all([
    supabase.from("feedback_tickets").select("*").eq("id", id).maybeSingle(),
    supabase.from("feedback_canvas_snapshots").select("snapshot").eq("ticket_id", id).maybeSingle(),
    getCurrentUserAndAdmin(),
    supabase
      .from("feedback_comments")
      .select("id, body, created_at, author_id")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!ticketData) notFound();
  const ticket = ticketData as FeedbackTicket;

  const authorIds = [...new Set((commentsRaw ?? []).map((c) => c.author_id).filter(Boolean))] as string[];
  const profileMap: Record<string, string> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      if (p.id && p.name) profileMap[p.id] = p.name;
    }
  }

  const commentIds = (commentsRaw ?? []).map((c) => c.id);
  const attachmentsByComment: Record<string, FeedbackAttachment[]> = {};
  if (commentIds.length > 0) {
    const { data: atts } = await supabase
      .from("feedback_comment_attachments")
      .select("id, comment_id, file_name, mime_type, size_bytes, storage_path, created_at")
      .in("comment_id", commentIds)
      .order("created_at", { ascending: true });

    // 產 signed URL（1 小時）供前端直接顯示
    const rows = (atts ?? []) as FeedbackAttachment[];
    if (rows.length > 0) {
      const paths = rows.map((r) => r.storage_path);
      const { data: signed } = await supabase
        .storage
        .from(FEEDBACK_ATTACHMENT_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      const urlMap: Record<string, string> = {};
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlMap[s.path] = s.signedUrl;
      }
      for (const r of rows) {
        r.signed_url = urlMap[r.storage_path] ?? null;
        (attachmentsByComment[r.comment_id] ??= []).push(r);
      }
    }
  }

  const comments: CommentItem[] = (commentsRaw ?? []).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    author_id: c.author_id,
    author_name: c.author_id ? (profileMap[c.author_id] ?? null) : null,
    attachments: attachmentsByComment[c.id] ?? [],
  }));

  return (
    // -m-8 undoes workspace padding so the split panel fills edge-to-edge
    <div className="-m-8 flex h-[calc(100dvh-4rem)] overflow-hidden">

      {/* ── Left: ticket info + comments (scrollable) ── */}
      <div className="w-1/2 flex flex-col border-r border-[#DFE1E6] overflow-y-auto">
        <div className="flex-1 px-8 py-6 space-y-5">

          {/* Back */}
          <Link
            href="/feedback/tickets"
            className="inline-flex items-center gap-1 text-[12px] text-[#6B778C] hover:text-[#172B4D] transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            回看板
          </Link>

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-[20px] font-bold text-[#172B4D] leading-snug mb-1">
                {ticket.title}
              </h1>
              <div className="text-[11px] text-[#6B778C] font-mono">
                #{ticket.id.slice(0, 8)}&nbsp;·&nbsp;建立於&nbsp;
                {new Date(ticket.created_at).toLocaleString("zh-TW")}
              </div>
            </div>
            <StatusBadge status={ticket.status} />
          </div>

          {/* Fields */}
          <div className="bg-white border border-[#DFE1E6] rounded-md overflow-hidden">
            <div className="divide-y divide-[#F4F5F7]">
              <div className="flex gap-6 px-5 py-3">
                <dt className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide w-20 shrink-0 pt-0.5">
                  網址
                </dt>
                <dd className="text-[13px] font-mono text-[#172B4D] break-all">
                  {ticket.url ? (
                    ticket.url.startsWith("http") ? (
                      <a href={ticket.url} target="_blank" rel="noreferrer" className="text-[#0052CC] hover:underline">
                        {ticket.url}
                      </a>
                    ) : ticket.url
                  ) : (
                    <span className="text-[#6B778C] italic font-sans">未提供</span>
                  )}
                </dd>
              </div>
              <div className="flex gap-6 px-5 py-3">
                <dt className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide w-20 shrink-0 pt-0.5">
                  問題與建議
                </dt>
                <dd className="text-[13px] text-[#172B4D] whitespace-pre-wrap leading-relaxed">
                  {ticket.description || (
                    <span className="text-[#6B778C] italic">未填寫</span>
                  )}
                </dd>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="bg-white border border-[#DFE1E6] rounded-md px-5 py-3">
            <StatusActions ticketId={ticket.id} current={ticket.status} isAdmin={isAdmin} />
          </div>

          {/* Comment thread */}
          <CommentThread ticketId={ticket.id} initial={comments} />
        </div>
      </div>

      {/* ── Right: canvas panel ── */}
      <div className="w-1/2 flex flex-col">
        <CanvasPanel
          ticketId={ticket.id}
          initialSnapshot={canvasData?.snapshot ?? null}
        />
      </div>
    </div>
  );
}
