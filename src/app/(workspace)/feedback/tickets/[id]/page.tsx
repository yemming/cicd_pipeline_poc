import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getFeedbackTicketDetailPageData } from "@/domain/feedback-tickets";
import { StatusBadge } from "@/components/feedback/status-badge";
import { StatusActions } from "@/components/feedback/status-actions";
import { CommentThread } from "@/components/feedback/comment-thread";
import { CanvasPanel } from "@/components/feedback/canvas-panel";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [data, { isAdmin }] = await Promise.all([
    getFeedbackTicketDetailPageData(id),
    getCurrentUserAndAdmin(),
  ]);

  if (!data) notFound();
  const { ticket, snapshot, comments } = data;

  return (
    // 抵銷 workspace shell padding（p-4/md:p-6/lg:p-8）讓 split panel 貼齊邊緣
    // 桌機（lg+）：左右 50/50 split + 滿高
    // 平板/手機（<lg）：上下 stack，左欄正常流，右側 canvas 給固定高度
    <div className="-m-4 md:-m-6 lg:-m-8 flex flex-col lg:flex-row lg:h-[calc(100dvh-4rem)] lg:overflow-hidden">

      {/* ── Left: ticket info + comments (scrollable on desktop) ── */}
      <div className="w-full lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-[#DFE1E6] lg:overflow-y-auto min-w-0">
        <div className="flex-1 px-4 md:px-6 lg:px-8 py-6 space-y-5 min-w-0">

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
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 px-5 py-3">
                <dt className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide sm:w-20 shrink-0 pt-0.5">
                  網址
                </dt>
                <dd className="text-[13px] font-mono text-[#172B4D] break-all min-w-0">
                  {ticket.url ? (
                    <a
                      href={ticket.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#0052CC] hover:underline"
                    >
                      {ticket.url}
                    </a>
                  ) : (
                    <span className="text-[#6B778C] italic font-sans">未提供</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 px-5 py-3">
                <dt className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide sm:w-20 shrink-0 pt-0.5">
                  問題與建議
                </dt>
                <dd className="text-[13px] text-[#172B4D] whitespace-pre-wrap leading-relaxed min-w-0">
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

      {/* ── Right: canvas panel ──
           平板/手機給固定 70vh 避免 Excalidraw 在 0 高度容器內初始化失敗 */}
      <div className="w-full lg:w-1/2 flex flex-col h-[70dvh] lg:h-auto min-w-0">
        <CanvasPanel
          ticketId={ticket.id}
          initialSnapshot={snapshot}
        />
      </div>
    </div>
  );
}
