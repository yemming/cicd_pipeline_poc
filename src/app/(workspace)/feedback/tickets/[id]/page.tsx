import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getFeedbackTicketDetailPageData } from "@/domain/feedback-tickets";
import {
  getTicketScope,
  getTicketAcceptance,
  getTicketEvidence,
  TICKET_E2E_TONE,
} from "@/lib/feedback";
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
  const { ticket, snapshot, comments, ticketAttachments } = data;

  // DevOps 4 層（②③④ 從 metadata 解析；① 意圖即 title/description）
  const scope = getTicketScope(ticket.metadata);
  const acceptance = getTicketAcceptance(ticket.metadata);
  const evidence = getTicketEvidence(ticket.metadata);
  const e2eStatus = evidence?.e2e?.status ?? "none";
  const e2eTone = TICKET_E2E_TONE[e2eStatus];

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

          {/* ② 範圍 Scope — 這張單動到的唯一位置 */}
          {scope && (
            <div className="bg-white border border-[#DFE1E6] rounded-md px-5 py-3">
              <div className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide mb-1.5">
                範圍 · 改哪裡
              </div>
              <a
                href={scope.route}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-mono text-[#0052CC] hover:underline break-all"
              >
                {scope.route}
              </a>
              {scope.area && <div className="text-[12px] text-[#6B778C] mt-0.5">{scope.area}</div>}
            </div>
          )}

          {/* ③ 驗收 Acceptance — given-when-then 原子斷言（同時是 E2E 規格） */}
          <div className="bg-white border border-[#DFE1E6] rounded-md px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide">
                驗收條件（{acceptance.length}）· 做完長怎樣
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${e2eTone.bg} ${e2eTone.text}`}>
                E2E：{e2eTone.label}
                {evidence?.e2e && (evidence.e2e.passed != null || evidence.e2e.failed != null)
                  ? `（${evidence.e2e.passed ?? 0}✓ / ${evidence.e2e.failed ?? 0}✗）`
                  : ""}
              </span>
            </div>
            {acceptance.length === 0 ? (
              <p className="text-[12px] text-[#6B778C] italic">
                尚未定義驗收條件 — 沒有條件就無法自動測。建議補上「做完長怎樣」。
              </p>
            ) : (
              <ol className="space-y-2">
                {acceptance.map((c) => (
                  <li key={c.id} className="bg-[#F4F5F7] rounded px-3 py-2 text-[12.5px] leading-relaxed">
                    <span className="font-mono font-bold text-[#6B778C] mr-2">{c.id}</span>
                    <span className="text-[#172B4D]">
                      <b className="text-[#6B778C]">給定</b> {c.given || "—"}
                      <b className="text-[#6B778C]">當</b> {c.when || "—"}
                      <b className="text-[#6B778C]">則</b> {c.then || "—"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ④ 證據 Evidence — commit + E2E 結果（pipeline 回填） */}
          {evidence && (evidence.sha || (evidence.e2e && evidence.e2e.status !== "none")) && (
            <div className="bg-white border border-[#DFE1E6] rounded-md px-5 py-3">
              <div className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide mb-1.5">
                證據 · 實作與測試
              </div>
              <dl className="text-[12.5px] text-[#172B4D] space-y-1">
                <div className="flex gap-3">
                  <dt className="text-[#6B778C] w-16 shrink-0">commit</dt>
                  <dd className="font-mono">{evidence.sha ? evidence.sha.slice(0, 10) : "—"}</dd>
                </div>
                {evidence.e2e?.ran_at && (
                  <div className="flex gap-3">
                    <dt className="text-[#6B778C] w-16 shrink-0">最後測試</dt>
                    <dd>{new Date(evidence.e2e.ran_at).toLocaleString("zh-TW")}</dd>
                  </div>
                )}
                {evidence.e2e?.report && (
                  <div className="flex gap-3">
                    <dt className="text-[#6B778C] w-16 shrink-0">摘要</dt>
                    <dd className="whitespace-pre-wrap">{evidence.e2e.report}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Ticket-level 附件（建單時上傳的、跟著 ticket 走） */}
          {ticketAttachments.length > 0 && (
            <div className="bg-white border border-[#DFE1E6] rounded-md px-5 py-3">
              <div className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wide mb-2">
                附件（{ticketAttachments.length}）
              </div>
              <ul className="space-y-1.5">
                {ticketAttachments.map((a) => (
                  <li key={a.storage_path}>
                    <a
                      href={a.signed_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded border border-[#DFE1E6] hover:bg-[#F4F5F7] transition-colors max-w-full ${
                        a.signed_url ? "" : "pointer-events-none opacity-50"
                      }`}
                      title={a.file_name}
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#6B778C]">
                        {a.mime_type.startsWith("image/") ? "image" : "attach_file"}
                      </span>
                      <span className="text-[12.5px] text-[#172B4D] truncate">{a.file_name}</span>
                      <span className="text-[10.5px] text-[#6B778C] shrink-0">
                        {a.size_bytes < 1024 * 1024
                          ? `${(a.size_bytes / 1024).toFixed(1)} KB`
                          : `${(a.size_bytes / 1024 / 1024).toFixed(1)} MB`}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
