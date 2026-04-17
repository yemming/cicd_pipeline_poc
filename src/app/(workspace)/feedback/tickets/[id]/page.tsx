import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { StatusBadge } from "@/components/feedback/status-badge";
import { StatusActions } from "@/components/feedback/status-actions";
import type { FeedbackTicket } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: ticketData }, { data: canvasData }, { isAdmin }] = await Promise.all([
    supabase.from("feedback_tickets").select("*").eq("id", id).maybeSingle(),
    supabase.from("feedback_canvas_snapshots").select("updated_at").eq("ticket_id", id).maybeSingle(),
    getCurrentUserAndAdmin(),
  ]);

  if (!ticketData) notFound();
  const ticket = ticketData as FeedbackTicket;
  const canvasUpdatedAt = (canvasData?.updated_at as string | undefined) ?? null;

  return (
    <div className="max-w-4xl space-y-8">
      {/* Back */}
      <Link
        href="/feedback/tickets"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-600 transition-colors"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        回看板
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight leading-snug flex-1 min-w-0">
            {ticket.title}
          </h1>
          <StatusBadge status={ticket.status} />
        </div>
        <div className="text-xs text-slate-400 font-mono">
          #{ticket.id.slice(0, 8)} · 建立於 {new Date(ticket.created_at).toLocaleString("zh-TW")}
        </div>
      </div>

      {/* Fields */}
      <dl className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-y-4 gap-x-6 bg-white rounded-xl border border-slate-200 p-6">
        <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-0.5">網址</dt>
        <dd className="text-sm font-mono text-slate-700 break-all">
          {ticket.url ? (
            ticket.url.startsWith("http") ? (
              <a href={ticket.url} target="_blank" rel="noreferrer" className="text-violet-600 hover:underline">
                {ticket.url}
              </a>
            ) : (
              ticket.url
            )
          ) : (
            <span className="text-slate-400 italic">未提供</span>
          )}
        </dd>

        <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-0.5">問題與建議</dt>
        <dd className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {ticket.description || <span className="text-slate-400 italic">未填寫</span>}
        </dd>
      </dl>

      {/* Status actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <StatusActions ticketId={ticket.id} current={ticket.status} isAdmin={isAdmin} />
      </div>

      {/* Canvas entry */}
      <Link
        href={`/feedback/tickets/${ticket.id}/canvas`}
        className="group block bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl p-6 text-white shadow-sm hover:shadow-md transition-all"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70 mb-1">
              Communication Canvas
            </div>
            <div className="text-xl font-bold mb-1">展開溝通畫布</div>
            <div className="text-sm opacity-90">
              無限畫布 · 便利貼 · 手繪 · 貼圖 —— 溝通歷程與最終確定內容
            </div>
            {canvasUpdatedAt && (
              <div className="text-[11px] opacity-70 mt-2">
                上次更新：{new Date(canvasUpdatedAt).toLocaleString("zh-TW")}
              </div>
            )}
          </div>
          <span className="material-symbols-outlined text-5xl opacity-80 group-hover:translate-x-1 transition-transform">
            arrow_forward
          </span>
        </div>
      </Link>
    </div>
  );
}
