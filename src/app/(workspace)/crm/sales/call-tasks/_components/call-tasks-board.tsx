"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CallTaskCard,
  CrmKpiCard,
  CrmSidebar,
  type CrmSidebarGroup,
} from "@/components/crm";
import {
  deleteCallTaskAction,
  recordCallResultAction,
  rescheduleCallTaskAction,
  skipCallTaskTodayAction,
  startCallTaskAction,
} from "@/lib/sales/call-tasks-actions";
import {
  AFTERSALES_CALL_TYPES,
  CALL_RESULT_OPTIONS,
  CALL_SCRIPT_TEMPLATES,
  CALL_TASK_RANGE_OPTIONS,
  CALL_TYPE_COLOR,
  CALL_TYPE_LABEL,
  CALL_TYPE_SHORT_LABEL,
  RESULT_LABEL,
  SALES_CALL_TYPES,
  type CallTaskBoardFilters,
  type CallTaskBoardKpi,
  type CallTaskBoardRange,
  type CallTaskBoardRow,
  type CallTaskResult,
  type CallTaskType,
  type SurveyKind,
} from "@/domain/sales-call-tasks.constants";
import type { CallTaskCardChipColor } from "@/components/crm";

type Banner = { ok: boolean; msg: string } | null;

type EditState = {
  result: CallTaskResult | null;
  nextDate: string;
  competitor: string;
  note: string;
  /** 售後 D+3 / NPS 任務專用，0–10 整數，未填為 null */
  npsScore: number | null;
};

type HistoryEntry = {
  date: string;
  result: string;
  note?: string;
  tone?: "teal" | "blue" | "amber" | "red" | "gray";
};

const KIND_LABEL: Record<SurveyKind, string> = {
  sales: "銷售電訪",
  aftersales: "售後電訪",
};

const STATUS_LABEL: Record<string, string> = {
  all: "全部任務",
  overdue: "逾期未完成",
  today: "今日待跟進",
  done: "今日已完成",
  scheduled: "未來已排程",
};

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    const t = new Date(d.getTime() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16)
      .replace("T", " ");
    return t;
  } catch {
    return "—";
  }
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().slice(0, 10);
}

function buildHistory(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.slice(0, 5);
}

/** 進廠資訊條（aftersales topInfoBar slot） — work_order 不存在不渲染 */
function buildWorkOrderInfoBar(
  wo: CallTaskBoardRow["work_order"],
): import("react").ReactNode {
  if (!wo) return null;
  const opened = wo.opened_at
    ? new Date(wo.opened_at).toISOString().slice(0, 10)
    : "—";
  const mileage =
    wo.mileage_in != null ? `${wo.mileage_in.toLocaleString()} km` : "—";
  const amount =
    wo.total_amount != null
      ? `NT$ ${wo.total_amount.toLocaleString()}`
      : "—";
  return (
    <div className="bg-[#EAF3DE] border border-[#C5DC9F] rounded px-3 py-2 text-[11.5px] text-[#3B6D11] flex items-center gap-4 flex-wrap">
      <span>🔧 RO {wo.ro_no}</span>
      <span>📅 進廠日 {opened}</span>
      <span>📏 里程 {mileage}</span>
      <span>💰 消費 {amount}</span>
      {wo.status ? (
        <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-white/60 text-[#3B6D11]">
          {wo.status}
        </span>
      ) : null}
    </div>
  );
}

export function CallTasksBoard({
  rows,
  kpi,
  byCallType,
  dateTotal,
  canEdit,
  filters,
  historyMap,
  basePath = "/crm/sales/call-tasks",
  rangeLabel,
}: {
  rows: CallTaskBoardRow[];
  kpi: CallTaskBoardKpi;
  byCallType: Record<string, number>;
  dateTotal: number;
  canEdit: boolean;
  filters: CallTaskBoardFilters;
  /** future: 用於 assignee=mine filter；目前先未用 */
  currentUserId?: string | null;
  historyMap: Record<string, HistoryEntry[]>;
  basePath?: string;
  /** range 視窗摘要（如「本週 (5/12 ~ 5/18)」），由 server 計算傳下來 */
  rangeLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editMap, setEditMap] = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const today = todayIso();

  const callTypeList: CallTaskType[] =
    filters.kind === "sales" ? SALES_CALL_TYPES : AFTERSALES_CALL_TYPES;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // ── URL helpers ─────────────────────────────────────
  const pushFilters = (patch: Partial<CallTaskBoardFilters>) => {
    const u = new URLSearchParams();
    const merged = { ...filters, ...patch };
    u.set("kind", merged.kind);
    // user 改日期時要強制寫 ?date=YYYY-MM-DD，避免被 server 的 nearest-date fallback 覆蓋
    if (merged.date) u.set("date", merged.date);
    if (merged.range && merged.range !== "1d") u.set("range", merged.range);
    if (merged.status !== "all") u.set("status", merged.status);
    if (merged.call_type !== "all") u.set("call_type", merged.call_type);
    if (merged.assignee !== "all") u.set("assignee", merged.assignee);
    startTransition(() =>
      router.push(`${basePath}?${u.toString()}`),
    );
  };

  const navDate = (days: number) =>
    pushFilters({ date: shiftDate(filters.date, days) });
  const goToday = () => pushFilters({ date: today, range: "1d" });
  const setRange = (r: CallTaskBoardRange) => pushFilters({ range: r });

  // ── Card edit state helpers ─────────────────────────
  const getEdit = (row: CallTaskBoardRow): EditState => {
    return (
      editMap[row.id] ?? {
        result: row.call_result,
        nextDate: row.next_followup_date ?? "",
        competitor: row.competitor_brand ?? "",
        note: row.notes ?? "",
        npsScore: row.nps_score,
      }
    );
  };
  const setEdit = (id: string, patch: Partial<EditState>) => {
    setEditMap((m) => ({
      ...m,
      [id]: {
        ...(m[id] ?? {
          result: null,
          nextDate: "",
          competitor: "",
          note: "",
          npsScore: null,
        }),
        ...patch,
      },
    }));
  };

  const toggleExpand = (id: string) =>
    setExpandedId((cur) => (cur === id ? null : id));

  // ── Actions ─────────────────────────────────────────
  const onSaveCall = (row: CallTaskBoardRow) => {
    const e = getEdit(row);
    if (!e.result) {
      showBanner({ ok: false, msg: "請先選擇通話結果" });
      return;
    }
    setSavingId(row.id);
    startTransition(async () => {
      const res = await recordCallResultAction(row.id, {
        result: e.result!,
        nextDate: e.nextDate || null,
        competitor: e.competitor || null,
        note: e.note || null,
        // 售後 D+3 / NPS 任務專用，sales 任務 client 不會渲染 input 所以一定是 null
        npsScore:
          filters.kind === "aftersales" && e.npsScore != null
            ? e.npsScore
            : null,
      });
      setSavingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存通話記錄" });
        setExpandedId(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onSkipToday = (row: CallTaskBoardRow) => {
    setSavingId(row.id);
    startTransition(async () => {
      const res = await skipCallTaskTodayAction(row.id);
      setSavingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已延至明日，繼續下一通" });
        setExpandedId(null);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const onStart = (row: CallTaskBoardRow) => {
    startTransition(async () => {
      const res = await startCallTaskAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已開始撥打" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const onReschedule = (row: CallTaskBoardRow) => {
    const next = prompt(
      "改期到（YYYY-MM-DD）：",
      shiftDate(filters.date, 1),
    );
    if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    startTransition(async () => {
      const res = await rescheduleCallTaskAction(row.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已改期到 ${next}` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const onDelete = (row: CallTaskBoardRow) => {
    if (
      !confirm(
        `確定刪除任務「${row.customer_code ?? "—"} ${row.customer_name ?? ""}」？\n此動作不可復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCallTaskAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除任務" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  // ── Sidebar ─────────────────────────────────────────
  const statusGroups: CrmSidebarGroup[] = useMemo(
    () => [
      {
        key: "status",
        title: "狀態篩選",
        items: [
          { key: "status:all", label: "全部任務", count: kpi.total, active: filters.status === "all", onClick: () => pushFilters({ status: "all" }) },
          { key: "status:overdue", label: "逾期未完成", count: kpi.overdue, icon: "warning", active: filters.status === "overdue", onClick: () => pushFilters({ status: "overdue" }) },
          { key: "status:today", label: "今日待跟進", count: kpi.today, active: filters.status === "today", onClick: () => pushFilters({ status: "today" }) },
          { key: "status:done", label: "今日已完成", count: kpi.done_today, active: filters.status === "done", onClick: () => pushFilters({ status: "done" }) },
          { key: "status:scheduled", label: "未來已排程", count: kpi.scheduled, active: filters.status === "scheduled", onClick: () => pushFilters({ status: "scheduled" }) },
        ],
      },
      {
        key: "type",
        title: "電訪類型",
        items: callTypeList.map((t) => ({
          key: `type:${t}`,
          label: CALL_TYPE_LABEL[t],
          count: byCallType[t] ?? 0,
          active: filters.call_type === t,
          onClick: () => pushFilters({ call_type: t }),
        })),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kpi, byCallType, filters, callTypeList],
  );

  const quickTools =
    filters.kind === "sales"
      ? [
          { key: "customers", label: "客戶基盤", href: "/crm/sales/customer-base", icon: "groups" },
          { key: "surveys", label: "問卷設定", href: "/crm/sales/survey-templates", icon: "quiz" },
          { key: "newcard", label: "開新手卡", href: "/sales/reception/handcard/new", icon: "post_add" },
        ]
      : [
          { key: "customers", label: "客戶基盤", href: "/crm/aftersales/customer-base", icon: "groups" },
          { key: "ro", label: "建立工單", href: "/aftersales/repair-orders/new", icon: "build" },
          { key: "nps", label: "NPS 看板", href: "/crm/aftersales/nps", icon: "sentiment_satisfied" },
        ];

  // ── Tab pills ───────────────────────────────────────
  const tabs = [
    { key: "all", label: "全部", count: kpi.total },
    ...callTypeList.map((t) => ({
      key: t,
      label: CALL_TYPE_SHORT_LABEL[t],
      count: byCallType[t] ?? 0,
    })),
  ];

  // ── Render ──────────────────────────────────────────
  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {KIND_LABEL[filters.kind]}工作台
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {filters.kind === "sales" ? "CRM03A" : "CRM03B"}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          日期導覽・電訪分類・話術提示・通話結果一鍵記錄
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={`${basePath}/new?kind=${filters.kind}`}
            aria-disabled={!canEdit}
            data-testid="call-tasks-create-link"
            className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
          >
            ＋ 新增電訪任務
          </Link>
        </div>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
          data-testid="call-tasks-banner"
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Date Nav + Range Tabs + Tab Pills */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
        {/* date-nav — 1d 視角才意義最大；其他 range 仍可選 anchor 日 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navDate(-1)}
            disabled={isPending}
            aria-label="前一天"
            className="w-7 h-7 rounded border border-[#D5D3CB] bg-white hover:border-[#9A9890] text-[#5A5955] flex items-center justify-center disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">chevron_left</span>
          </button>
          <input
            type="date"
            value={filters.date}
            disabled={isPending}
            onChange={(e) => pushFilters({ date: e.target.value })}
            className="h-7 border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono text-[#1A3A5C] font-semibold focus:border-[#185FA5] outline-none"
            data-testid="call-tasks-date-input"
          />
          <button
            type="button"
            onClick={() => navDate(1)}
            disabled={isPending}
            aria-label="後一天"
            className="w-7 h-7 rounded border border-[#D5D3CB] bg-white hover:border-[#9A9890] text-[#5A5955] flex items-center justify-center disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">chevron_right</span>
          </button>
          <button
            type="button"
            onClick={goToday}
            disabled={isPending || (filters.date === today && filters.range === "1d")}
            className="ml-1 h-7 px-2.5 rounded text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            今天
          </button>
        </div>
        <span className="w-px h-5 bg-[#EEECE6]" aria-hidden />

        {/* range-tabs — 單日 / 近 7 天 / 本週 / 本月（quick filter） */}
        <div
          className="flex items-center gap-1"
          role="tablist"
          aria-label="日期範圍篩選"
          data-testid="call-tasks-range-tabs"
        >
          {CALL_TASK_RANGE_OPTIONS.map((opt) => {
            const active = filters.range === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active}
                title={opt.hint}
                onClick={() => setRange(opt.key)}
                disabled={isPending}
                data-testid={`call-tasks-range-${opt.key}`}
                className={`h-7 px-2.5 rounded text-[12px] font-medium border transition-colors ${
                  active
                    ? "bg-[#EAF4FB] text-[#185FA5] border-[#BFDFF7]"
                    : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                } disabled:opacity-60`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="w-px h-5 bg-[#EEECE6]" aria-hidden />

        {/* tab-pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map((t) => {
            const active = filters.call_type === t.key || (t.key === "all" && filters.call_type === "all");
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pushFilters({ call_type: t.key })}
                disabled={isPending}
                aria-pressed={active}
                className={`h-7 px-2.5 rounded-full text-[12px] font-medium border transition-colors ${
                  active
                    ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                    : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                } disabled:opacity-60`}
              >
                {t.label}
                {t.count > 0 ? (
                  <span className={`ml-1 text-[10.5px] ${active ? "text-white/80" : "text-[#9A9890]"}`}>
                    ({t.count})
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <span className="ml-auto text-[12px] text-[#9A9890]">
          {filters.range === "1d"
            ? filters.date === today
              ? "今日任務："
              : `${filters.date} 任務：`
            : `${rangeLabel ?? filters.range} 任務：`}
          <b className="text-[#2C2C2A]" data-testid="call-tasks-date-total">
            {dateTotal}
          </b>{" "}
          筆（顯示 {rows.length} 筆）
        </span>
      </section>

      {/* KPI 5 卡 */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <CrmKpiCard
          icon="task_alt"
          label="全部任務"
          value={kpi.total}
          sub={today}
          accent="navy"
          active={filters.status === "all"}
          onClick={() => pushFilters({ status: "all" })}
        />
        <CrmKpiCard
          icon="warning"
          label="逾期未完成"
          value={kpi.overdue}
          sub={kpi.overdue > 0 ? "需優先處理" : "✓ 暢通"}
          accent="red"
          active={filters.status === "overdue"}
          onClick={() => pushFilters({ status: "overdue" })}
        />
        <CrmKpiCard
          icon="phone_in_talk"
          label="今日待跟進"
          value={kpi.today}
          sub="本日到期"
          accent="amber"
          active={filters.status === "today"}
          onClick={() => pushFilters({ status: "today" })}
        />
        <CrmKpiCard
          icon="check_circle"
          label="今日已完成"
          value={kpi.done_today}
          sub={`完成率 ${kpi.total > 0 ? Math.round((kpi.done_today / kpi.total) * 100) : 0}%`}
          accent="teal"
          active={filters.status === "done"}
          onClick={() => pushFilters({ status: "done" })}
        />
        {filters.kind === "aftersales" ? (
          <CrmKpiCard
            icon="sentiment_satisfied"
            label="本月 NPS 均分"
            value={kpi.nps_monthly_avg != null ? kpi.nps_monthly_avg : "—"}
            sub={
              kpi.nps_monthly_count > 0
                ? `${kpi.nps_monthly_count} 份回收 · /10`
                : "本月尚無 NPS 回收"
            }
            accent="blue"
          />
        ) : (
          <CrmKpiCard
            icon="schedule"
            label="未來已排程"
            value={kpi.scheduled}
            sub="未來 30 日"
            accent="blue"
            active={filters.status === "scheduled"}
            onClick={() => pushFilters({ status: "scheduled" })}
          />
        )}
      </section>

      {/* Sidebar + main cards */}
      <section className="flex gap-3 items-start">
        <CrmSidebar groups={statusGroups} quickTools={quickTools} />

        <div className={`flex-1 min-w-0 space-y-2 ${isPending ? "opacity-90" : ""}`}>
          {rows.length === 0 ? (
            <div
              className="bg-white border border-[#EEECE6] rounded-lg px-6 py-12 text-center"
              data-testid="call-tasks-empty"
            >
              {filters.status !== "all" || filters.call_type !== "all" ? (
                <p className="text-[13px] text-[#9A9890]">
                  {STATUS_LABEL[filters.status] ?? "篩選結果"}沒有任務，調整篩選或切換日期/範圍
                </p>
              ) : filters.range === "1d" ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-[#9A9890]">
                    {filters.date === today
                      ? "今日無待辦電訪任務"
                      : `${filters.date} 沒有電訪任務`}
                    ，要看本週或本月嗎？
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRange("week")}
                      disabled={isPending}
                      data-testid="call-tasks-empty-cta-week"
                      className="h-[30px] inline-flex items-center px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                    >
                      看本週
                    </button>
                    <button
                      type="button"
                      onClick={() => setRange("7d")}
                      disabled={isPending}
                      data-testid="call-tasks-empty-cta-7d"
                      className="h-[30px] inline-flex items-center px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      看近 7 天
                    </button>
                    <button
                      type="button"
                      onClick={() => setRange("month")}
                      disabled={isPending}
                      data-testid="call-tasks-empty-cta-month"
                      className="h-[30px] inline-flex items-center px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      看本月
                    </button>
                  </div>
                  <p className="text-[11.5px] text-[#9A9890]">
                    或點右上「＋ 新增電訪任務」開始建檔
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-[#9A9890]">
                  {rangeLabel ?? filters.range} 區間內沒有電訪任務，可改回單日視角或調整 anchor 日期。
                </p>
              )}
            </div>
          ) : null}

          {rows.map((row) => {
            const expanded = expandedId === row.id;
            const edit = getEdit(row);
            const ct = (row.call_type ?? "custom") as CallTaskType;
            const script = CALL_SCRIPT_TEMPLATES[ct];
            const history = buildHistory(historyMap[row.customer_id] ?? []);
            const cardStatus =
              row.derived_status === "today" ? "pending" : row.derived_status === "skipped" ? "done" : row.derived_status;
            const badgeColor: CallTaskCardChipColor = CALL_TYPE_COLOR[ct];

            // ── 售後 D+3 / NPS 訪談特化條件 ──
            const isAftersalesD3 =
              filters.kind === "aftersales" && ct === "aftersales_d3";
            const allowsNps =
              filters.kind === "aftersales" &&
              (ct === "aftersales_d3" || ct === "nps_interview");

            const chips: { key: string; label: string; color?: CallTaskCardChipColor }[] = [];
            if (row.rs_name) chips.push({ key: "rs", label: `👤 ${row.rs_name}`, color: "gray" });
            if (row.attempt_count > 0)
              chips.push({ key: "att", label: `已嘗試 ${row.attempt_count} 次`, color: "gray" });
            if (row.call_result)
              chips.push({ key: "res", label: RESULT_LABEL[row.call_result], color: "teal" });
            if (row.work_order?.ro_no)
              chips.push({
                key: "ro",
                label: `🔧 ${row.work_order.ro_no}`,
                color: "teal",
              });
            if (row.nps_score != null)
              chips.push({
                key: "nps",
                label: `NPS ${row.nps_score}/10`,
                color:
                  row.nps_score >= 9
                    ? "teal"
                    : row.nps_score >= 7
                      ? "amber"
                      : "red",
              });

            // 進廠資訊條（aftersales 才渲染）+ D+3 藍色提示（疊在 topInfoBar 之後）
            const topInfoBar =
              filters.kind === "aftersales" ? (
                <div className="space-y-2">
                  {buildWorkOrderInfoBar(row.work_order)}
                  {isAftersalesD3 ? (
                    <div className="bg-[#EAF4FB] border border-[#BFDFF7] rounded px-3 py-2 text-[11.5px] text-[#185FA5] flex items-start gap-2">
                      <span
                        className="material-symbols-outlined text-[16px] leading-none mt-0.5"
                        aria-hidden
                      >
                        priority_high
                      </span>
                      <span>
                        <b>D+3 滿意度回訪</b>：請優先確認維修品質、SA
                        態度、是否願意推薦給朋友。如客戶願意，請於下方填入 NPS
                        評分（0–10）。
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : undefined;

            return (
              <CallTaskCard
                key={row.id}
                taskType={ct}
                taskTypeBadge={CALL_TYPE_LABEL[ct]}
                taskTypeColor={badgeColor}
                customerName={row.customer_name ?? "—"}
                customerCode={row.customer_code ?? undefined}
                scheduledLabel={fmtDateTime(row.scheduled_at)}
                status={cardStatus}
                chips={chips}
                expanded={expanded}
                onToggle={() => toggleExpand(row.id)}
                disabled={isPending && savingId !== row.id}
                saving={savingId === row.id}
                topInfoBar={topInfoBar}
                scriptText={script?.text}
                scriptTagLabel={script?.tag}
                scriptHints={script?.hints}
                history={history}
                callResults={CALL_RESULT_OPTIONS}
                selectedResult={edit.result}
                onSelectResult={(k) => setEdit(row.id, { result: k as CallTaskResult })}
                nextFollowUpDate={edit.nextDate}
                onChangeNextDate={(d) => setEdit(row.id, { nextDate: d })}
                competitorBrand={edit.competitor}
                onChangeCompetitor={
                  filters.kind === "sales"
                    ? (b) => setEdit(row.id, { competitor: b })
                    : undefined
                }
                note={edit.note}
                onChangeNote={(n) => setEdit(row.id, { note: n })}
                extraFormBottom={
                  allowsNps ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-[#9A9890] font-medium">
                        NPS 評分（0–10，0=不推薦，10=極力推薦）
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: 11 }, (_, i) => i).map((score) => {
                          const selected = edit.npsScore === score;
                          const tint =
                            score >= 9
                              ? "bg-[#0F6E56] text-white border-[#0F6E56]"
                              : score >= 7
                                ? "bg-[#854F0B] text-white border-[#854F0B]"
                                : "bg-[#CC0000] text-white border-[#CC0000]";
                          return (
                            <button
                              key={score}
                              type="button"
                              disabled={!canEdit || isPending}
                              aria-pressed={selected}
                              onClick={() =>
                                setEdit(row.id, {
                                  npsScore:
                                    edit.npsScore === score ? null : score,
                                })
                              }
                              className={`h-[28px] w-[34px] rounded text-[12.5px] font-mono font-semibold border transition-colors ${
                                selected
                                  ? tint
                                  : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                              } disabled:opacity-60`}
                            >
                              {score}
                            </button>
                          );
                        })}
                        {edit.npsScore != null ? (
                          <button
                            type="button"
                            onClick={() =>
                              setEdit(row.id, { npsScore: null })
                            }
                            className="h-[28px] px-2 ml-1 rounded text-[11.5px] text-[#9A9890] hover:bg-[#F2F2F2]"
                          >
                            清除
                          </button>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-[#9A9890]">
                        儲存後自動寫入 NPS 看板（call_task_id 連結，重複儲存會產生新紀錄）。
                      </p>
                    </div>
                  ) : null
                }
                onSave={canEdit ? () => onSaveCall(row) : undefined}
                onSkip={canEdit ? () => onSkipToday(row) : undefined}
                footerHint={
                  row.goal ? (
                    <span>
                      🎯 目標：<span className="text-[#2C2C2A]">{row.goal}</span>
                    </span>
                  ) : null
                }
                actions={
                  <>
                    {row.customer_phone ? (
                      <a
                        href={`tel:${row.customer_phone}`}
                        className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                      >
                        📞 {row.customer_phone}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      disabled={!canEdit || row.status === "completed" || isPending}
                      onClick={() => onStart(row)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      title="標記為進行中"
                    >
                      撥打
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit || isPending}
                      onClick={() => onReschedule(row)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      改期
                    </button>
                    <Link
                      href={`${basePath}/${row.id}`}
                      className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      詳情
                    </Link>
                    <button
                      type="button"
                      disabled={!canEdit || isPending}
                      onClick={() => onDelete(row)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      </section>
    </main>
  );
}
