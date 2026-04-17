"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_ORDER,
  type FeedbackStatus,
  type FeedbackTicket,
} from "@/lib/feedback";
import { TicketCard } from "./ticket-card";
import { StatusBadge } from "./status-badge";

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

// Jira-style column header indicator
const STATUS_INDICATOR: Record<FeedbackStatus, { dot: string; check?: boolean }> = {
  draft:       { dot: "bg-[#6B778C]" },
  in_progress: { dot: "bg-[#C9A84C]" },
  review:      { dot: "bg-[#FF8B00]" },
  released:    { dot: "bg-[#36B37E]", check: true },
};

type View = "kanban" | "list";

export function TicketsBoard({
  tickets,
  authorMap = {},
}: {
  tickets: FeedbackTicket[];
  authorMap?: Record<string, string>;
}) {
  const [view, setView] = useState<View>("kanban");

  const grouped: Record<FeedbackStatus, FeedbackTicket[]> = {
    draft: [],
    in_progress: [],
    review: [],
    released: [],
  };
  for (const t of tickets) grouped[t.status].push(t);

  return (
    <div className="space-y-4">
      {/* ── Board Header (Jira style) ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-[#172B4D] tracking-tight">單據看板</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B778C] font-mono border border-[#DFE1E6] rounded px-2 py-1">
            共 {tickets.length} 筆
          </span>

          {/* View toggle — Jira-like pill tabs */}
          <div className="flex items-center border border-[#DFE1E6] rounded overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                view === "kanban"
                  ? "bg-[#1A1A2E] text-[#C9A84C]"
                  : "bg-white text-[#6B778C] hover:bg-[#F4F5F7]"
              }`}
            >
              <span className="material-symbols-outlined text-sm">view_kanban</span>
              看板
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium transition-colors border-l border-[#DFE1E6] ${
                view === "list"
                  ? "bg-[#1A1A2E] text-[#C9A84C]"
                  : "bg-white text-[#6B778C] hover:bg-[#F4F5F7]"
              }`}
            >
              <span className="material-symbols-outlined text-sm">table_rows</span>
              列表
            </button>
          </div>

          <Link
            href="/feedback/tickets/new"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-semibold bg-[#CC0000] hover:bg-[#AA0000] text-white transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            新增單據
          </Link>
        </div>
      </div>

      {/* ── Kanban view (Jira style) ── */}
      {view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-0 border border-[#DFE1E6] rounded-md overflow-hidden bg-[#F4F5F7]">
          {FEEDBACK_STATUS_ORDER.map((status, idx) => {
            const items = grouped[status];
            const ind = STATUS_INDICATOR[status];
            const isLast = idx === FEEDBACK_STATUS_ORDER.length - 1;

            return (
              <div
                key={status}
                className={`flex flex-col min-h-[500px] ${!isLast ? "border-r border-[#DFE1E6]" : ""}`}
              >
                {/* Column header */}
                <div className="px-3 pt-3 pb-2 flex items-center gap-2 border-b border-[#DFE1E6] bg-[#F4F5F7]">
                  {ind.check ? (
                    <span className="material-symbols-outlined text-[14px] text-[#36B37E]">check_circle</span>
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-sm ${ind.dot}`} />
                  )}
                  <span className="text-[11px] font-bold text-[#6B778C] uppercase tracking-wider">
                    {FEEDBACK_STATUS_LABEL[status]}
                  </span>
                  <span className="text-[11px] text-[#6B778C] font-bold ml-1">{items.length}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {items.length === 0 ? (
                    <div className="text-center text-[12px] text-[#6B778C]/50 py-10 italic">
                      — 無單據 —
                    </div>
                  ) : (
                    items.map((t) => (
                      <TicketCard
                        key={t.id}
                        ticket={t}
                        authorName={t.created_by ? authorMap[t.created_by] : undefined}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {view === "list" && (
        <div className="bg-white rounded border border-[#DFE1E6] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#DFE1E6] bg-[#F4F5F7]">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-[#6B778C] uppercase tracking-wide w-8">
                  T
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-[#6B778C] uppercase tracking-wide">
                  標題
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-[#6B778C] uppercase tracking-wide">
                  狀態
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-[#6B778C] uppercase tracking-wide hidden lg:table-cell">
                  網址
                </th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-[#6B778C] uppercase tracking-wide">
                  更新
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F5F7]">
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-[#6B778C]/50 italic">
                    — 尚無單據 —
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-[#F4F5F7] transition-colors group">
                    <td className="px-4 py-3">
                      <span className="material-symbols-outlined text-[14px] text-[#C9A84C]">feedback</span>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <Link
                        href={`/feedback/tickets/${t.id}`}
                        className="text-[13px] font-medium text-[#172B4D] group-hover:text-[#CC0000] transition-colors line-clamp-1"
                      >
                        {t.title}
                      </Link>
                      <div className="text-[11px] text-[#6B778C] font-mono mt-0.5">
                        #{t.id.slice(0, 6)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={t.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell max-w-[200px]">
                      {t.url ? (
                        <span className="text-[11px] text-[#6B778C] font-mono truncate block">{t.url}</span>
                      ) : (
                        <span className="text-[11px] text-[#6B778C]/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[11px] text-[#6B778C] whitespace-nowrap">
                      {formatRelative(t.updated_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
