"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_ORDER,
  type FeedbackStatus,
  type FeedbackTicket,
} from "@/lib/feedback";
import { TicketCard } from "./ticket-card";
import { StatusBadge } from "./status-badge";
import {
  archiveTicket,
  unarchiveTicket,
  deleteTicket,
  updateTicketStatus,
} from "@/lib/feedback-actions";

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
  isAdmin = false,
}: {
  tickets: FeedbackTicket[];
  authorMap?: Record<string, string>;
  isAdmin?: boolean;
}) {
  const [view, setView] = useState<View>("kanban");
  // List view 是否顯示封存單（僅 admin 有此切換）
  const [showArchived, setShowArchived] = useState(false);
  // 拖拉狀態切換的樂觀更新副本（admin 才會用）。
  // server prop 變化（revalidatePath 重撈）時 render 階段比對 prop ref 重置 local，
  // 避免 useEffect setState（react-hooks/set-state-in-effect 禁止）。
  const [localTickets, setLocalTickets] = useState<FeedbackTicket[]>(tickets);
  const [prevPropTickets, setPrevPropTickets] = useState(tickets);
  if (prevPropTickets !== tickets) {
    setPrevPropTickets(tickets);
    setLocalTickets(tickets);
  }
  const [dndBanner, setDndBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [, startDndTransition] = useTransition();

  // 8px 拖拉啟動門檻：避免點擊卡片進 detail 時誤觸拖拉
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const ticketId = String(active.id);
    const nextStatus = String(over.id) as FeedbackStatus;
    if (!FEEDBACK_STATUS_ORDER.includes(nextStatus)) return;
    const cur = localTickets.find((t) => t.id === ticketId);
    if (!cur || cur.status === nextStatus) return;
    const prevStatus = cur.status;

    // 樂觀：立刻搬卡片到目標欄
    setLocalTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: nextStatus } : t)),
    );
    startDndTransition(async () => {
      try {
        await updateTicketStatus(ticketId, nextStatus);
        setDndBanner({
          ok: true,
          msg: `✓ 已切換為「${FEEDBACK_STATUS_LABEL[nextStatus]}」`,
        });
        setTimeout(() => setDndBanner(null), 2200);
      } catch (err) {
        // 失敗：rollback + 紅 banner
        setLocalTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: prevStatus } : t)),
        );
        setDndBanner({
          ok: false,
          msg: err instanceof Error ? err.message : "狀態切換失敗",
        });
      }
    });
  }

  // Kanban 永遠排除 archived；用 localTickets 才能反映拖拉樂觀更新
  const activeTickets = useMemo(
    () => localTickets.filter((t) => !t.archived_at),
    [localTickets],
  );

  // List：非 admin 只看未封存；admin 可切換
  const listTickets = useMemo(() => {
    if (!isAdmin) return activeTickets;
    return showArchived ? localTickets.filter((t) => t.archived_at) : activeTickets;
  }, [localTickets, activeTickets, isAdmin, showArchived]);

  const grouped: Record<FeedbackStatus, FeedbackTicket[]> = {
    draft: [],
    in_progress: [],
    review: [],
    released: [],
  };
  for (const t of activeTickets) grouped[t.status].push(t);

  const archivedCount = isAdmin
    ? tickets.filter((t) => !!t.archived_at).length
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Board Header (Jira style) ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-[#172B4D] tracking-tight">單據看板</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B778C] font-mono border border-[#DFE1E6] rounded px-2 py-1">
            共 {view === "kanban" ? activeTickets.length : listTickets.length} 筆
          </span>

          {/* Admin-only: Archive filter (只在 list view 顯示) */}
          {isAdmin && view === "list" && (
            <div className="flex items-center border border-[#DFE1E6] rounded overflow-hidden">
              <button
                onClick={() => setShowArchived(false)}
                className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  !showArchived
                    ? "bg-[#0052CC] text-white"
                    : "bg-white text-[#42526E] hover:bg-[#F4F5F7]"
                }`}
              >
                啟用中
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium transition-colors border-l border-[#DFE1E6] ${
                  showArchived
                    ? "bg-[#0052CC] text-white"
                    : "bg-white text-[#42526E] hover:bg-[#F4F5F7]"
                }`}
                title="顯示已封存單據（僅管理員）"
              >
                <span className="material-symbols-outlined text-sm">inventory_2</span>
                已封存 {archivedCount > 0 && <span className="ml-0.5 font-bold">{archivedCount}</span>}
              </button>
            </div>
          )}

          {/* View toggle — Jira-like pill tabs */}
          <div className="flex items-center border border-[#DFE1E6] rounded overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                view === "kanban"
                  ? "bg-[#0052CC] text-white"
                  : "bg-white text-[#42526E] hover:bg-[#F4F5F7]"
              }`}
            >
              <span className="material-symbols-outlined text-sm">view_kanban</span>
              看板
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium transition-colors border-l border-[#DFE1E6] ${
                view === "list"
                  ? "bg-[#0052CC] text-white"
                  : "bg-white text-[#42526E] hover:bg-[#F4F5F7]"
              }`}
            >
              <span className="material-symbols-outlined text-sm">table_rows</span>
              列表
            </button>
          </div>

          <Link
            href="/feedback/tickets/new"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-semibold bg-[#0052CC] hover:bg-[#0747A6] text-white transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            新增單據
          </Link>
        </div>
      </div>

      {/* ── Kanban view (Jira style) — 永不顯示 archived，也沒有 archive 群組 ──
          Admin 可拖拉卡片切換狀態；非 admin 純檢視（拖拉 listener 不註冊）
          server `updateTicketStatus` 自帶 admin gate，client 不過是 UX 層 */}
      {view === "kanban" && (
        <DndContext
          sensors={sensors}
          onDragStart={isAdmin ? handleDragStart : undefined}
          onDragEnd={isAdmin ? handleDragEnd : undefined}
          onDragCancel={isAdmin ? () => setActiveDragId(null) : undefined}
        >
          {isAdmin ? (
            <p className="text-[11.5px] text-[#6B778C] mb-2">
              💡 拖拉卡片到目標欄切換狀態（拖到「工作中」= 派 sub-agent 接手開發）
            </p>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-0 border border-[#DFE1E6] rounded-md overflow-hidden bg-[#F4F5F7]">
            {FEEDBACK_STATUS_ORDER.map((status, idx) => {
              const items = grouped[status];
              const ind = STATUS_INDICATOR[status];
              const isLast = idx === FEEDBACK_STATUS_ORDER.length - 1;
              return (
                <DroppableColumn
                  key={status}
                  status={status}
                  enabled={isAdmin}
                  isLast={isLast}
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
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[420px]">
                    {items.length === 0 ? (
                      <div className="text-center text-[12px] text-[#6B778C]/50 py-10 italic">
                        — 無單據 —
                      </div>
                    ) : (
                      items.map((t) => (
                        <DraggableTicketCard
                          key={t.id}
                          ticket={t}
                          authorName={t.created_by ? authorMap[t.created_by] : undefined}
                          enabled={isAdmin}
                        />
                      ))
                    )}
                  </div>
                </DroppableColumn>
              );
            })}
          </div>
          {/* DragOverlay：把拖拉中的卡片 portal 到 body、跳出所有 overflow / stacking context */}
          <DragOverlay dropAnimation={null}>
            {activeDragId
              ? (() => {
                  const t = localTickets.find((x) => x.id === activeDragId);
                  return t ? (
                    <div className="cursor-grabbing shadow-2xl rotate-1">
                      <TicketCard
                        ticket={t}
                        authorName={t.created_by ? authorMap[t.created_by] : undefined}
                      />
                    </div>
                  ) : null;
                })()
              : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* DnD banner（樂觀更新成功/失敗提示） */}
      {dndBanner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            dndBanner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {dndBanner.msg}
        </div>
      ) : null}

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
                {isAdmin && (
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold text-[#6B778C] uppercase tracking-wide w-[150px]">
                    管理
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F5F7]">
              {listTickets.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-sm text-[#6B778C]/50 italic">
                    {showArchived ? "— 無已封存單據 —" : "— 尚無單據 —"}
                  </td>
                </tr>
              ) : (
                listTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-[#F4F5F7] transition-colors group">
                    <td className="px-4 py-3">
                      <span className="material-symbols-outlined text-[14px] text-[#0052CC]">feedback</span>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/feedback/tickets/${t.id}`}
                          className="text-[13px] font-medium text-[#172B4D] group-hover:text-[#0052CC] transition-colors line-clamp-1"
                        >
                          {t.title}
                        </Link>
                        {t.archived_at && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#6B778C] bg-[#DFE1E6] px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                            <span className="material-symbols-outlined text-[11px]">inventory_2</span>
                            封存
                          </span>
                        )}
                      </div>
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
                    {isAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <RowAdminActions ticket={t} />
                      </td>
                    )}
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

/** Admin-only inline actions：未封存顯示 Archive；已封存顯示 Unarchive + Delete */
function RowAdminActions({ ticket }: { ticket: FeedbackTicket }) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const archived = !!ticket.archived_at;

  function run(fn: () => Promise<void>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-1">
      {archived ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => unarchiveTicket(ticket.id))}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded text-[#172B4D] bg-white border border-[#DFE1E6] hover:bg-[#F4F5F7] disabled:opacity-40 transition-colors"
            title="取消封存"
          >
            <span className="material-symbols-outlined text-[13px]">unarchive</span>
            還原
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm(`確定刪除「${ticket.title}」？此動作不可還原，留言與附件會一併清空。`)) return;
              run(() => deleteTicket(ticket.id));
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded text-white bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-40 transition-colors"
            title="永久刪除（僅限已封存）"
          >
            <span className="material-symbols-outlined text-[13px]">delete</span>
            刪除
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => archiveTicket(ticket.id))}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded text-[#172B4D] bg-white border border-[#DFE1E6] hover:bg-[#F4F5F7] disabled:opacity-40 transition-colors"
          title="封存"
        >
          <span className="material-symbols-outlined text-[13px]">inventory_2</span>
          封存
        </button>
      )}
      {err && (
        <span className="text-[10px] text-[#BF2600] ml-1" title={err}>
          {err.length > 14 ? err.slice(0, 14) + "…" : err}
        </span>
      )}
    </div>
  );
}

// ── DnD wrappers（admin only；非 admin 走 pass-through 不註冊 listener） ──

function DroppableColumn({
  status,
  enabled,
  isLast,
  children,
}: {
  status: FeedbackStatus;
  enabled: boolean;
  isLast: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !enabled });
  return (
    <div
      ref={enabled ? setNodeRef : undefined}
      className={`flex flex-col min-h-[500px] transition-colors ${
        !isLast ? "border-r border-[#DFE1E6]" : ""
      } ${isOver && enabled ? "bg-[#DEEBFF]" : ""}`}
    >
      {children}
    </div>
  );
}

function DraggableTicketCard({
  ticket,
  authorName,
  enabled,
}: {
  ticket: FeedbackTicket;
  authorName?: string;
  enabled: boolean;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: ticket.id,
    disabled: !enabled,
  });
  if (!enabled) {
    return <TicketCard ticket={ticket} authorName={authorName} />;
  }
  return (
    <div
      ref={setNodeRef}
      // 不套 transform：DragOverlay 接管拖拉中視覺定位
      // 來源卡片留在原位、僅淡化作為「已被拿起」提示
      style={{
        opacity: isDragging ? 0.35 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      {...listeners}
      {...attributes}
      // 拖拉狀態下禁止 Link 點擊跳轉（避免拖完誤觸進 detail）
      onClickCapture={isDragging ? (e) => e.preventDefault() : undefined}
    >
      <TicketCard ticket={ticket} authorName={authorName} />
    </div>
  );
}
