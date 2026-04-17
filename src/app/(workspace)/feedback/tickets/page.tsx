import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_ORDER,
  FEEDBACK_STATUS_TONE,
  type FeedbackStatus,
  type FeedbackTicket,
} from "@/lib/feedback";
import { TicketCard } from "@/components/feedback/ticket-card";

export const dynamic = "force-dynamic";

export default async function TicketListPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_tickets")
    .select("*")
    .order("updated_at", { ascending: false });

  const tickets: FeedbackTicket[] = (data ?? []) as FeedbackTicket[];
  const grouped: Record<FeedbackStatus, FeedbackTicket[]> = {
    draft: [],
    in_progress: [],
    review: [],
    released: [],
  };
  for (const t of tickets) grouped[t.status].push(t);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">意見回饋看板</h1>
          <p className="text-sm text-slate-500 mt-1">
            客戶許願單與 Bug 回報；每張單附帶無限畫布可即時溝通
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 font-mono">
            共 {tickets.length} 筆
          </div>
          <Link
            href="/feedback/tickets/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm transition-colors"
          >
            <span className="material-symbols-outlined text-lg">add_comment</span>
            新增單據
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          載入失敗：{error.message}
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {FEEDBACK_STATUS_ORDER.map((status) => {
          const items = grouped[status];
          const tone = FEEDBACK_STATUS_TONE[status];
          return (
            <div key={status} className="flex flex-col min-h-[300px]">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                  <h2 className="text-sm font-semibold text-slate-700">
                    {FEEDBACK_STATUS_LABEL[status]}
                  </h2>
                </div>
                <span className="text-xs text-slate-400 font-mono">{items.length}</span>
              </div>
              <div className="flex-1 bg-slate-50/60 rounded-xl p-2 space-y-2 border border-slate-100">
                {items.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-8">
                    — 無單據 —
                  </div>
                ) : (
                  items.map((t) => <TicketCard key={t.id} ticket={t} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
