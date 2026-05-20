"use client";

/**
 * 售後休眠流失管理（/crm/aftersales/dormant-customers · M02-6）
 *
 * - Tab 雙 list：休眠（active dormant_60/120/180）/ 流失（lost）
 * - KpiCard 列：4 個（休眠總數 / 60 / 120 / 180 / 流失總數 / 本月新流失 / 重啟成功率）
 * - DonutChart：流失原因分佈（top 5）
 * - 操作：休眠 → 重新啟動 modal（選 SA → 自動建 D+0 電訪任務）
 *        流失 → 查看（顯示流失資訊）/ 取消流失（manual override）
 */

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import { DonutChart, type DonutDatum } from "@/components/charts";
import {
  LOST_REASON_LABEL,
  DORMANCY_LABEL,
  type AftersalesDormantKpi,
  type AftersalesDormantRow,
  type AftersalesLostReason,
  type AftersalesDormancyStatus,
  type SaAssigneeOption,
} from "@/domain/crm-aftersales-dormant.constants";
import {
  markAftersalesLostAction,
  reactivateAftersalesCustomerAction,
  unmarkAftersalesLostAction,
} from "@/lib/crm/aftersales-dormant-actions";

// ── 樣式 token ────────────────────────────────────────────────────────────
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

type Banner = { ok: boolean; msg: string } | null;
type Tab = "dormant" | "lost";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function StatusChip({ status }: { status: AftersalesDormancyStatus }) {
  const cls: Record<AftersalesDormancyStatus, string> = {
    active: "bg-[#EAF3DE] text-[#3B6D11]",
    dormant_60: "bg-[#FDF3E3] text-[#854F0B]",
    dormant_120: "bg-[#FDECEA] text-[#CC0000]",
    dormant_180: "bg-[#4A1010] text-[#FFB0B0]",
    lost: "bg-[#F2F2F2] text-[#5A5955]",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${cls[status]}`}
    >
      {DORMANCY_LABEL[status]}
    </span>
  );
}

function ReasonChip({ reason }: { reason: AftersalesLostReason | null }) {
  if (!reason) return <span className="text-[12px] text-[#9A9890]">—</span>;
  const cls: Record<AftersalesLostReason, string> = {
    maintenance_overdue: "bg-[#FDF3E3] text-[#854F0B]",
    low_nps: "bg-[#FDECEA] text-[#CC0000]",
    warranty_expired: "bg-[#EAF3DE] text-[#3B6D11]",
    desmo_overdue: "bg-[#EAF4FB] text-[#185FA5]",
    unreachable: "bg-[#F2F2F2] text-[#6B6A68]",
    other: "bg-[#EEEDFE] text-[#534AB7]",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${cls[reason]}`}
    >
      {LOST_REASON_LABEL[reason]}
    </span>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────
function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl border border-[#EEECE6] w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[16px] leading-none"
            aria-label="關閉"
          >
            ✕
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main board
// ──────────────────────────────────────────────────────────────────────────

export function AftersalesDormantBoard({
  rows,
  lostAll,
  kpi,
  saOptions,
  canEdit,
  currentTab,
  filters,
}: {
  rows: AftersalesDormantRow[];
  lostAll: AftersalesDormantRow[];
  kpi: AftersalesDormantKpi;
  saOptions: SaAssigneeOption[];
  canEdit: boolean;
  currentTab: Tab;
  filters: { status?: string; reason?: string; search?: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  // 篩選 state
  const [fStatus, setFStatus] = useState(filters.status ?? "all");
  const [fReason, setFReason] = useState(filters.reason ?? "all");
  const [fSearch, setFSearch] = useState(filters.search ?? "");

  // Modal state
  const [reactivateTarget, setReactivateTarget] = useState<AftersalesDormantRow | null>(null);
  const [reactivateSa, setReactivateSa] = useState<string>("");
  const [reactivateNotes, setReactivateNotes] = useState<string>("");

  const [lostTarget, setLostTarget] = useState<AftersalesDormantRow | null>(null);
  const [lostReason, setLostReason] = useState<AftersalesLostReason>("maintenance_overdue");
  const [lostNotes, setLostNotes] = useState<string>("");

  const [viewLostTarget, setViewLostTarget] = useState<AftersalesDormantRow | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // ── URL push ───────────────────────────────────────────────────────────
  const pushUrl = (patch: {
    tab?: Tab;
    status?: string | null;
    reason?: string | null;
    search?: string | null;
  }) => {
    const tab = patch.tab ?? currentTab;
    const next = new URLSearchParams();
    if (tab !== "dormant") next.set("tab", tab);
    const statusVal = patch.status === undefined ? fStatus : patch.status;
    const reasonVal = patch.reason === undefined ? fReason : patch.reason;
    const searchVal = patch.search === undefined ? fSearch : patch.search;
    if (statusVal && statusVal !== "all") next.set("status", statusVal);
    if (reasonVal && reasonVal !== "all") next.set("reason", reasonVal);
    if (searchVal && searchVal.trim()) next.set("search", searchVal.trim());
    const qs = next.toString();
    startTransition(() => {
      router.push(`/crm/aftersales/dormant-customers${qs ? `?${qs}` : ""}`);
    });
  };

  const submitFilters = () =>
    pushUrl({ status: fStatus, reason: fReason, search: fSearch });
  const resetFilters = () => {
    setFStatus("all");
    setFReason("all");
    setFSearch("");
    pushUrl({ status: "all", reason: "all", search: "" });
  };

  const switchTab = (next: Tab) => {
    setFStatus("all");
    setFReason("all");
    setFSearch("");
    pushUrl({ tab: next, status: "all", reason: "all", search: "" });
  };

  // ── 流失原因分佈（DonutChart 用，基於 lost 全集）─────────────────────────
  const lostReasonDistribution: DonutDatum[] = useMemo(() => {
    const counts = new Map<AftersalesLostReason, number>();
    for (const r of lostAll) {
      if (!r.lost_reason) continue;
      counts.set(r.lost_reason, (counts.get(r.lost_reason) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({
        name: LOST_REASON_LABEL[reason],
        value: count,
      }));
  }, [lostAll]);

  // ── Actions ────────────────────────────────────────────────────────────
  const submitReactivate = () => {
    if (!reactivateTarget) return;
    if (!reactivateSa) {
      showBanner({ ok: false, msg: "請指派電訪 SA" });
      return;
    }
    const customer = reactivateTarget;
    setActionPendingId(customer.id);
    startTransition(async () => {
      const res = await reactivateAftersalesCustomerAction({
        customer_id: customer.id,
        assignee_id: reactivateSa,
        notes: reactivateNotes.trim() || null,
      });
      setActionPendingId(null);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 已建立電訪任務（${customer.name}）`,
        });
        setReactivateTarget(null);
        setReactivateSa("");
        setReactivateNotes("");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitMarkLost = () => {
    if (!lostTarget) return;
    const customer = lostTarget;
    setActionPendingId(customer.id);
    startTransition(async () => {
      const res = await markAftersalesLostAction({
        customer_id: customer.id,
        reason: lostReason,
        notes: lostNotes.trim() || null,
      });
      setActionPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已標記流失（${customer.name}）` });
        setLostTarget(null);
        setLostReason("maintenance_overdue");
        setLostNotes("");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitUnmarkLost = (customer: AftersalesDormantRow) => {
    if (!confirm(`確定取消「${customer.name}」的流失標記？將回到一般客戶。`)) return;
    setActionPendingId(customer.id);
    startTransition(async () => {
      const res = await unmarkAftersalesLostAction(customer.id);
      setActionPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已取消流失標記" });
        setViewLostTarget(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // ── Columns ────────────────────────────────────────────────────────────
  const dormantColumns: DataGridColumn<AftersalesDormantRow>[] = [
    {
      id: "name",
      header: "客戶 / 車輛",
      width: 240,
      hideable: false,
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{r.name}</div>
          <div className="text-[11px] text-[#9A9890]">
            {r.code}{" "}
            {r.primary_license_plate ? `· ${r.primary_license_plate}` : ""}{" "}
            {r.primary_model_name ? `· ${r.primary_model_name}` : ""}
          </div>
        </div>
      ),
      sortValue: (r) => r.name,
      exportValue: (r) => `${r.name} (${r.code})`,
    },
    {
      id: "vehicle_count",
      header: "車輛",
      width: 60,
      align: "right",
      cell: (r) => <span className="text-[12px]">{r.vehicle_count}</span>,
      sortValue: (r) => r.vehicle_count,
      exportValue: (r) => r.vehicle_count,
    },
    {
      id: "last_visit",
      header: "最後進廠",
      width: 110,
      cell: (r) => (
        <span className="text-[12px] font-mono">{fmtDate(r.last_visit_at)}</span>
      ),
      sortValue: (r) => r.last_visit_at ?? "",
      exportValue: (r) => fmtDate(r.last_visit_at),
    },
    {
      id: "days_overdue",
      header: "逾期天數",
      width: 100,
      align: "right",
      cell: (r) =>
        r.days_overdue == null ? (
          <span className="text-[#9A9890]">—</span>
        ) : (
          <span
            className={`text-[12.5px] font-semibold font-mono ${
              r.days_overdue >= 180
                ? "text-[#4A1010]"
                : r.days_overdue >= 120
                  ? "text-[#CC0000]"
                  : r.days_overdue >= 60
                    ? "text-[#854F0B]"
                    : "text-[#185FA5]"
            }`}
          >
            {r.days_overdue} 天
          </span>
        ),
      sortValue: (r) => r.days_overdue ?? -1,
      exportValue: (r) => r.days_overdue ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => <StatusChip status={r.dormancy_status} />,
      sortValue: (r) => r.dormancy_status,
      exportValue: (r) => DORMANCY_LABEL[r.dormancy_status],
      sortable: false,
    },
    {
      id: "sa",
      header: "SA",
      width: 90,
      cell: (r) => (
        <span className="text-[12px]">{r.assigned_sa_name ?? "—"}</span>
      ),
      sortValue: (r) => r.assigned_sa_name ?? "",
      exportValue: (r) => r.assigned_sa_name ?? "",
    },
    {
      id: "phone",
      header: "電話",
      width: 110,
      cell: (r) => (
        <span className="text-[12px] font-mono">{r.phone ?? "—"}</span>
      ),
      exportValue: (r) => r.phone ?? "",
    },
  ];

  const lostColumns: DataGridColumn<AftersalesDormantRow>[] = [
    {
      id: "name",
      header: "客戶 / 車輛",
      width: 240,
      hideable: false,
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{r.name}</div>
          <div className="text-[11px] text-[#9A9890]">
            {r.code}{" "}
            {r.primary_license_plate ? `· ${r.primary_license_plate}` : ""}{" "}
            {r.primary_model_name ? `· ${r.primary_model_name}` : ""}
          </div>
        </div>
      ),
      sortValue: (r) => r.name,
      exportValue: (r) => `${r.name} (${r.code})`,
    },
    {
      id: "vehicle_count",
      header: "車輛",
      width: 60,
      align: "right",
      cell: (r) => <span className="text-[12px]">{r.vehicle_count}</span>,
      sortValue: (r) => r.vehicle_count,
      exportValue: (r) => r.vehicle_count,
    },
    {
      id: "last_visit",
      header: "最後進廠",
      width: 110,
      cell: (r) => (
        <span className="text-[12px] font-mono">{fmtDate(r.last_visit_at)}</span>
      ),
      sortValue: (r) => r.last_visit_at ?? "",
      exportValue: (r) => fmtDate(r.last_visit_at),
    },
    {
      id: "lost_reason",
      header: "流失原因",
      width: 110,
      cell: (r) => <ReasonChip reason={r.lost_reason} />,
      sortValue: (r) => r.lost_reason ?? "",
      exportValue: (r) => (r.lost_reason ? LOST_REASON_LABEL[r.lost_reason] : ""),
      sortable: false,
    },
    {
      id: "lost_at",
      header: "流失於",
      width: 110,
      cell: (r) => (
        <span className="text-[12px] font-mono">{fmtDate(r.lost_at)}</span>
      ),
      sortValue: (r) => r.lost_at ?? "",
      exportValue: (r) => fmtDate(r.lost_at),
    },
    {
      id: "sa",
      header: "SA",
      width: 90,
      cell: (r) => (
        <span className="text-[12px]">{r.assigned_sa_name ?? "—"}</span>
      ),
      sortValue: (r) => r.assigned_sa_name ?? "",
      exportValue: (r) => r.assigned_sa_name ?? "",
    },
  ];

  // ── KpiSlot ────────────────────────────────────────────────────────────
  const kpiSlot = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <KpiCard
        label="休眠總數"
        value={kpi.total_dormant}
        tone="amber"
        layout="vertical"
      />
      <KpiCard
        label="休眠分佈 60 / 120 / 180+"
        value={`${kpi.dormant_60} / ${kpi.dormant_120} / ${kpi.dormant_180}`}
        tone="amber"
        layout="vertical"
      />
      <KpiCard
        label="流失總數"
        value={kpi.total_lost}
        tone="red"
        layout="vertical"
      />
      <KpiCard
        label="重啟成功率（本月）"
        value={kpi.reactivate_rate == null ? "—" : `${kpi.reactivate_rate}%`}
        tone="green"
        layout="vertical"
      />
    </div>
  );

  const chartSlot =
    lostReasonDistribution.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
        <div className="md:col-span-2">
          <div className="text-[12px] font-semibold text-[#2C2C2A] mb-1">
            流失原因分佈 Top 5
          </div>
          <div className="text-[11px] text-[#9A9890]">
            基於目前頁面 lost 集合，導引下一輪喚醒策略
          </div>
          <div className="mt-2 space-y-1">
            {lostReasonDistribution.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-24 truncate">{d.name}</span>
                <span className="font-mono text-[#5A5955]">{d.value} 位</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <DonutChart
            data={lostReasonDistribution}
            size="sm"
            showLegend={false}
            centerLabel={`${kpi.total_lost}`}
            centerCaption="總流失"
          />
        </div>
      </div>
    ) : null;

  // ── Empty state ────────────────────────────────────────────────────────
  const emptyMsg =
    currentTab === "dormant"
      ? "目前沒有逾期未進廠的客戶 🎉"
      : "目前沒有流失客戶";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          售後休眠流失管理
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M02-6
        </span>
        <span className="text-[12px] text-[#9A9890]">
          追逾期未進廠客戶、判別流失原因、推動喚醒接觸
        </span>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-[#EEECE6]">
        <button
          onClick={() => switchTab("dormant")}
          disabled={isPending}
          className={`px-4 h-[40px] text-[12.5px] border-b-2 -mb-px ${
            currentTab === "dormant"
              ? "text-[#1A3A5C] font-semibold border-[#1A3A5C]"
              : "text-[#5A5955] border-transparent hover:bg-[#F8F7F4]"
          }`}
        >
          💤 休眠（{kpi.total_dormant}）
        </button>
        <button
          onClick={() => switchTab("lost")}
          disabled={isPending}
          className={`px-4 h-[40px] text-[12.5px] border-b-2 -mb-px ${
            currentTab === "lost"
              ? "text-[#1A3A5C] font-semibold border-[#1A3A5C]"
              : "text-[#5A5955] border-transparent hover:bg-[#F8F7F4]"
          }`}
        >
          🚫 已流失（{kpi.total_lost}）
        </button>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          {currentTab === "dormant" ? (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className={labelClass}>休眠等級</label>
              <select
                className={inputClass}
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value)}
                disabled={isPending}
              >
                <option value="all">全部</option>
                <option value="dormant_60">60 天內</option>
                <option value="dormant_120">60–120 天</option>
                <option value="dormant_180">120 天以上</option>
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className={labelClass}>流失原因</label>
              <select
                className={inputClass}
                value={fReason}
                onChange={(e) => setFReason(e.target.value)}
                disabled={isPending}
              >
                <option value="all">全部</option>
                {(Object.keys(LOST_REASON_LABEL) as AftersalesLostReason[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {LOST_REASON_LABEL[k]}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1 min-w-[200px] flex-1">
            <label className={labelClass}>搜尋（姓名 / 代號 / 車牌 / 電話）</label>
            <input
              className={inputClass}
              value={fSearch}
              onChange={(e) => setFSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitFilters();
              }}
              placeholder="輸入關鍵字..."
              disabled={isPending}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
        </span>
        {kpi.total_dormant === 0 && kpi.total_lost === 0 && !isPending ? (
          <span className="text-[11px] text-[#9A9890] ml-2">
            （目前 brand 尚無休眠或流失資料）
          </span>
        ) : null}
      </div>

      {/* DataGrid */}
      <DataGrid<AftersalesDormantRow>
        columns={currentTab === "dormant" ? dormantColumns : lostColumns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey={`crm/aftersales/dormant-customers/${currentTab}`}
        exportFileName={`aftersales-${currentTab}`}
        emptyMessage={emptyMsg}
        disabled={isPending}
        kpiSlot={kpiSlot}
        chartSlot={currentTab === "lost" ? chartSlot : undefined}
        rowActionsWidth={currentTab === "dormant" ? 200 : 180}
        rowActions={(r) =>
          currentTab === "dormant" ? (
            <>
              <button
                onClick={() => {
                  setReactivateTarget(r);
                  setReactivateSa(r.assigned_sa_user_id ?? "");
                  setReactivateNotes("");
                }}
                disabled={!canEdit || isPending || actionPendingId === r.id}
                className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {actionPendingId === r.id ? "處理中⋯" : "重新啟動"}
              </button>
              <button
                onClick={() => {
                  setLostTarget(r);
                  setLostReason("maintenance_overdue");
                  setLostNotes("");
                }}
                disabled={!canEdit || isPending || actionPendingId === r.id}
                className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50 ml-1"
              >
                標記流失
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setViewLostTarget(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                查看
              </button>
              {canEdit ? (
                <button
                  onClick={() => submitUnmarkLost(r)}
                  disabled={isPending || actionPendingId === r.id}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 ml-1"
                >
                  {actionPendingId === r.id ? "處理中⋯" : "取消流失"}
                </button>
              ) : null}
            </>
          )
        }
      />

      {/* Reactivate Modal */}
      <Modal
        open={!!reactivateTarget}
        title="重新啟動休眠客戶"
        onClose={() => setReactivateTarget(null)}
      >
        {reactivateTarget ? (
          <div className="space-y-3">
            <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded px-3 py-2 text-[12px]">
              <div className="font-semibold text-[#2C2C2A]">
                {reactivateTarget.name} · {reactivateTarget.code}
              </div>
              <div className="text-[#5A5955] mt-1">
                {reactivateTarget.primary_license_plate ?? "—"} ·
                逾期 {reactivateTarget.days_overdue ?? "—"} 天 ·
                <StatusChip status={reactivateTarget.dormancy_status} />
              </div>
            </div>
            <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded px-3 py-2 text-[11.5px] text-[#854F0B]">
              ⚡ 系統將建立一筆 D+0 售後電訪任務（kind=aftersales），指派給選定的 SA。
              通話成功並標記 completed 後會計入「重啟成功率」。
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>指派 SA *</label>
              <select
                className={inputClass}
                value={reactivateSa}
                onChange={(e) => setReactivateSa(e.target.value)}
                disabled={isPending}
              >
                <option value="">— 請選擇 —</option>
                {saOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>備註（可選）</label>
              <textarea
                className={`${inputClass} h-[60px] py-2 resize-none`}
                value={reactivateNotes}
                onChange={(e) => setReactivateNotes(e.target.value)}
                placeholder="例：客戶上次提及預計三月底回廠..."
                disabled={isPending}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReactivateTarget(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={submitReactivate}
                disabled={isPending || !reactivateSa}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "建立電訪任務"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Mark Lost Modal */}
      <Modal
        open={!!lostTarget}
        title="標記流失客戶"
        onClose={() => setLostTarget(null)}
      >
        {lostTarget ? (
          <div className="space-y-3">
            <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded px-3 py-2 text-[12px]">
              <div className="font-semibold text-[#2C2C2A]">
                {lostTarget.name} · {lostTarget.code}
              </div>
              <div className="text-[#5A5955] mt-1">
                逾期 {lostTarget.days_overdue ?? "—"} 天 · 進廠 {lostTarget.visit_count} 次
              </div>
            </div>
            <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded px-3 py-2 text-[11.5px] text-[#CC0000]">
              ⚠️ 標記流失後此客戶不再出現在休眠喚醒名單，且不可再建立電訪任務（除非取消流失）。
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>流失原因 *</label>
              <select
                className={inputClass}
                value={lostReason}
                onChange={(e) =>
                  setLostReason(e.target.value as AftersalesLostReason)
                }
                disabled={isPending}
              >
                {(Object.keys(LOST_REASON_LABEL) as AftersalesLostReason[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {LOST_REASON_LABEL[k]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>備註（可選）</label>
              <textarea
                className={`${inputClass} h-[60px] py-2 resize-none`}
                value={lostNotes}
                onChange={(e) => setLostNotes(e.target.value)}
                placeholder="補充流失情境，供後續主管 review..."
                disabled={isPending}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setLostTarget(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={submitMarkLost}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
              >
                {isPending ? "標記中⋯" : "確認標記流失"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* View Lost Modal */}
      <Modal
        open={!!viewLostTarget}
        title="流失客戶資料"
        onClose={() => setViewLostTarget(null)}
      >
        {viewLostTarget ? (
          <div className="space-y-3 text-[12.5px]">
            <div>
              <div className="text-[11px] text-[#9A9890] mb-0.5">客戶</div>
              <div className="font-semibold text-[#2C2C2A]">
                {viewLostTarget.name} · {viewLostTarget.code}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-[#9A9890] mb-0.5">最後進廠</div>
                <div className="font-mono">{fmtDate(viewLostTarget.last_visit_at)}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#9A9890] mb-0.5">進廠次數</div>
                <div>{viewLostTarget.visit_count} 次</div>
              </div>
              <div>
                <div className="text-[11px] text-[#9A9890] mb-0.5">流失原因</div>
                <ReasonChip reason={viewLostTarget.lost_reason} />
              </div>
              <div>
                <div className="text-[11px] text-[#9A9890] mb-0.5">流失於</div>
                <div className="font-mono">{fmtDate(viewLostTarget.lost_at)}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setViewLostTarget(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                關閉
              </button>
              {canEdit ? (
                <button
                  onClick={() => submitUnmarkLost(viewLostTarget)}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  {isPending ? "處理中⋯" : "取消流失標記"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
