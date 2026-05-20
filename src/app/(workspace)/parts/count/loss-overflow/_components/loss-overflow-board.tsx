"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import { DonutChart, LineChart } from "@/components/charts";

import type {
  LossOverflowRow,
  LossOverflowAnalytics,
  ReasonBreakdown,
  TrendPoint,
} from "@/domain/loss-overflow";
import { APPROVAL_THRESHOLD } from "@/domain/loss-overflow.constants";
import {
  approveLossOverflowAction,
  rejectLossOverflowAction,
  createLossOverflowAction,
  updateLossOverflowAction,
  deleteLossOverflowAction,
  type LossOverflowInput,
} from "@/lib/parts-count/loss-overflow-actions";

type WarehouseOption = { id: string; name: string; code: string };
type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部原因" },
  { value: "damage", label: "毀損" },
  { value: "lost", label: "短少 / 遺失" },
  { value: "expired", label: "過期報廢" },
  { value: "count_error", label: "盤點誤差" },
  { value: "other", label: "其他" },
];

const REASON_CHIP: Record<string, { label: string; chip: string }> = {
  damage: { label: "毀損", chip: "bg-[#FDECEA] text-[#CC0000]" },
  lost: { label: "短少", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  expired: { label: "過期", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  count_error: { label: "盤點誤差", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  other: { label: "其他", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部狀態" },
  { value: "draft", label: "草稿" },
  { value: "submitted", label: "待審核" },
  { value: "posted", label: "已過帳" },
  { value: "rejected", label: "駁回" },
  { value: "cancelled", label: "已取消" },
];

const STATUS_CHIP: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  submitted: { label: "待審核", chip: "bg-[#EDE9FE] text-[#5B21B6]" },
  posted: { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  rejected: { label: "駁回", chip: "bg-[#FDECEA] text-[#CC0000]" },
  cancelled: { label: "已取消", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return "NT$ " + Math.round(n).toLocaleString("zh-TW");
}

export function LossOverflowBoard({
  rows,
  warehouses,
  analytics,
  reasonBreakdown,
  trend,
  canEdit,
  canApprove,
  initialFilters,
}: {
  rows: LossOverflowRow[];
  warehouses: WarehouseOption[];
  analytics: LossOverflowAnalytics;
  reasonBreakdown: ReasonBreakdown[];
  trend: TrendPoint[];
  canEdit: boolean;
  canApprove: boolean;
  initialFilters: {
    kind: string;
    reason: string;
    status: string;
    warehouse_id: string;
    date_from: string;
    date_to: string;
    amount_min: string;
    amount_max: string;
    q: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [kind, setKind] = useState(initialFilters.kind);
  const [reason, setReason] = useState(initialFilters.reason);
  const [status, setStatus] = useState(initialFilters.status);
  const [warehouseId, setWarehouseId] = useState(initialFilters.warehouse_id);
  const [dateFrom, setDateFrom] = useState(initialFilters.date_from);
  const [dateTo, setDateTo] = useState(initialFilters.date_to);
  const [amountMin, setAmountMin] = useState(initialFilters.amount_min);
  const [amountMax, setAmountMax] = useState(initialFilters.amount_max);
  const [q, setQ] = useState(initialFilters.q);

  const [createOpen, setCreateOpen] = useState(false);

  function flash(ok: boolean, msg: string, holdMs = ok ? 2200 : 5000) {
    setBanner({ ok, msg });
    if (holdMs > 0) setTimeout(() => setBanner(null), holdMs);
  }

  function buildHref(extra: Record<string, string | undefined> = {}) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      kind: kind || undefined,
      reason: reason || undefined,
      status: status || undefined,
      warehouse_id: warehouseId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      amount_min: amountMin || undefined,
      amount_max: amountMax || undefined,
      q: q || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/count/loss-overflow${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref()));
  }
  function resetFilter() {
    setKind("");
    setReason("");
    setStatus("");
    setWarehouseId("");
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
    setQ("");
    startTransition(() => router.push("/parts/count/loss-overflow"));
  }

  function handleApprove(row: LossOverflowRow) {
    if (busyId) return;
    setBusyId(row.id);
    startTransition(async () => {
      const res = await approveLossOverflowAction(row.id);
      setBusyId(null);
      if (res.ok) {
        flash(true, `✓ 已審核：${row.adj_no}`);
        router.refresh();
      } else {
        flash(false, res.error);
      }
    });
  }

  function handleReject(row: LossOverflowRow) {
    if (busyId) return;
    if (!confirm(`確定要駁回 ${row.adj_no} 嗎？`)) return;
    setBusyId(row.id);
    startTransition(async () => {
      const res = await rejectLossOverflowAction(row.id);
      setBusyId(null);
      if (res.ok) {
        flash(true, `✓ 已駁回：${row.adj_no}`);
        router.refresh();
      } else {
        flash(false, res.error);
      }
    });
  }

  function handleDelete(row: LossOverflowRow) {
    if (busyId) return;
    if (!confirm(`刪除 ${row.adj_no}？此動作無法復原`)) return;
    setBusyId(row.id);
    startTransition(async () => {
      const res = await deleteLossOverflowAction(row.id);
      setBusyId(null);
      if (res.ok) {
        flash(true, `✓ 已刪除：${row.adj_no}`);
        router.refresh();
      } else {
        flash(false, res.error);
      }
    });
  }

  const columns = useMemo<DataGridColumn<LossOverflowRow>[]>(() => {
    return [
      {
        id: "adj_no",
        header: "單號",
        width: 160,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[#1A3A5C]">{r.adj_no}</span>
        ),
        exportValue: (r) => r.adj_no,
        sortValue: (r) => r.adj_no,
      },
      {
        id: "kind",
        header: "類型",
        width: 80,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              r.kind === "loss"
                ? "bg-[#FDECEA] text-[#CC0000]"
                : "bg-[#EAF3DE] text-[#3B6D11]"
            }`}
          >
            {r.kind === "loss" ? "報損" : "報溢"}
          </span>
        ),
        exportValue: (r) => (r.kind === "loss" ? "報損" : "報溢"),
        sortValue: (r) => r.kind,
      },
      {
        id: "reason_kind",
        header: "原因",
        width: 110,
        cell: (r) => {
          const def = REASON_CHIP[r.reason_kind ?? "other"] ?? REASON_CHIP.other;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          REASON_CHIP[r.reason_kind ?? "other"]?.label ?? r.reason,
        sortValue: (r) => r.reason_kind ?? "",
      },
      {
        id: "warehouse",
        header: "倉庫",
        width: 130,
        cell: (r) => r.warehouse_name ?? "—",
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "amount",
        header: "金額影響",
        width: 130,
        align: "right",
        cell: (r) => (
          <span
            className={`font-mono text-[12px] font-semibold ${
              r.total_amount < 0
                ? "text-[#CC0000]"
                : r.total_amount > 0
                  ? "text-[#3B6D11]"
                  : "text-[#9A9890]"
            }`}
          >
            {r.total_amount > 0 ? "+" : ""}
            {fmtMoney(r.total_amount)}
          </span>
        ),
        exportValue: (r) => String(r.total_amount),
        sortValue: (r) => r.abs_amount,
      },
      {
        id: "requires_approval",
        header: "審核",
        width: 110,
        cell: (r) => {
          if (!r.requires_approval) {
            return (
              <span className="text-[11px] text-[#9A9890]">無需審核</span>
            );
          }
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
              需主管審核
            </span>
          );
        },
        exportValue: (r) => (r.requires_approval ? "需主管審核" : "無需審核"),
        sortValue: (r) => (r.requires_approval ? 1 : 0),
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        cell: (r) => {
          const def = STATUS_CHIP[r.status] ?? {
            label: r.status,
            chip: "bg-[#F2F2F2] text-[#6B6A68]",
          };
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => STATUS_CHIP[r.status]?.label ?? r.status,
        sortValue: (r) => r.status,
      },
      {
        id: "created_at",
        header: "建立日期",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.created_at ? r.created_at.slice(0, 10) : "—"}
          </span>
        ),
        exportValue: (r) => r.created_at?.slice(0, 10) ?? "",
        sortValue: (r) => r.created_at ?? "",
      },
      {
        id: "notes",
        header: "備註",
        width: 220,
        defaultHidden: true,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.notes ?? "—"}</span>
        ),
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
      },
    ];
  }, []);

  // Donut chart data — 排除 0 件的 reason
  const donutData = useMemo(
    () =>
      reasonBreakdown
        .filter((r) => r.amount > 0 || r.count > 0)
        .map((r) => ({ name: r.label, value: r.amount })),
    [reasonBreakdown],
  );

  const totalLossAmt = useMemo(
    () => reasonBreakdown.reduce((s, r) => s + r.amount, 0),
    [reasonBreakdown],
  );

  // KPI slot
  const kpiSlot = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="本月報損金額"
        value={fmtMoney(analytics.month_loss_amount)}
        tone="red"
        layout="vertical"
        icon={<span className="material-symbols-outlined text-[18px]">trending_down</span>}
      />
      <KpiCard
        label="本月報溢金額"
        value={fmtMoney(analytics.month_overflow_amount)}
        tone="green"
        layout="vertical"
        icon={<span className="material-symbols-outlined text-[18px]">trending_up</span>}
      />
      <KpiCard
        label="待主管審核件數"
        value={analytics.pending_approval_count}
        tone="amber"
        layout="vertical"
        icon={<span className="material-symbols-outlined text-[18px]">pending_actions</span>}
      />
      <KpiCard
        label="待審金額"
        value={fmtMoney(analytics.pending_approval_amount)}
        tone="amber"
        layout="vertical"
        icon={<span className="material-symbols-outlined text-[18px]">request_quote</span>}
      />
    </div>
  );

  // Chart slot — Donut + LineChart 並排
  const chartSlot = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 報損原因分佈（近 90 天）
          </h2>
        </header>
        <div className="p-3">
          {donutData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-[12px] text-[#9A9890]">
              近 90 天無報損紀錄
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row items-center gap-4">
              <div className="w-full lg:w-[55%]">
                <DonutChart
                  data={donutData}
                  size="md"
                  showTooltip
                  centerLabel={fmtMoney(totalLossAmt)}
                  centerCaption="總金額"
                />
              </div>
              <div className="w-full lg:w-[45%] flex flex-col gap-1.5">
                {reasonBreakdown.map((r, i) => {
                  const pct =
                    totalLossAmt > 0 ? (r.amount / totalLossAmt) * 100 : 0;
                  const colors = [
                    "#EF4444",
                    "#F59E0B",
                    "#8B5CF6",
                    "#3B82F6",
                    "#6B7280",
                  ];
                  return (
                    <div
                      key={r.reason}
                      className="flex items-center gap-2 text-[12px]"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: colors[i % colors.length] }}
                      />
                      <span className="text-[#5A5955] flex-1">{r.label}</span>
                      <span className="font-mono text-[11.5px] text-[#9A9890]">
                        {r.count} 筆
                      </span>
                      <span className="font-mono text-[12px] text-[#2C2C2A] w-[80px] text-right">
                        {fmtMoney(r.amount)}
                      </span>
                      <span className="font-mono text-[11px] text-[#9A9890] w-[40px] text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 近 6 個月報損/報溢趨勢
          </h2>
        </header>
        <div className="p-3">
          <LineChart
            data={trend}
            xKey="label"
            yKey={[
              { key: "loss_amount", label: "報損", color: "#EF4444" },
              { key: "overflow_amount", label: "報溢", color: "#22C55E" },
            ]}
            size="md"
            showLegend
            showTooltip
          />
        </div>
      </section>
    </div>
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">報損報溢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          庫存 · 8.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          報損/報溢紀錄與品質分析 — 單筆 ≥ NT$ {APPROVAL_THRESHOLD.toLocaleString()} 需主管審核
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>單號</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="LG20260510-001"
              className={`${inputClass} w-[170px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={`${inputClass} w-[110px]`}
            >
              <option value="">全部</option>
              <option value="loss">報損</option>
              <option value="overflow">報溢</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>原因</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${inputClass} w-[140px]`}
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={`${inputClass} w-[160px]`}
            >
              <option value="">全部倉庫</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} ・ {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} w-[120px]`}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>日期起</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${inputClass} w-[140px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>日期迄</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${inputClass} w-[140px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>金額下限</label>
            <input
              type="number"
              min="0"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder="0"
              className={`${inputClass} w-[110px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>金額上限</label>
            <input
              type="number"
              min="0"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder="無上限"
              className={`${inputClass} w-[110px]`}
            />
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增報損報溢
              </button>
            )}
          </div>
        </div>
      </section>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/count/loss-overflow"
        exportFileName="loss-overflow"
        emptyMessage="沒有符合條件的報損報溢單"
        disabled={isPending}
        kpiSlot={kpiSlot}
        chartSlot={chartSlot}
        rowActionsWidth={canApprove ? 260 : 80}
        rowActions={(r) => {
          const busy = busyId === r.id;
          const showApprove =
            canApprove && (r.status === "submitted" || r.status === "draft");
          return (
            <div className="flex gap-1.5 flex-wrap">
              {showApprove && (
                <>
                  <button
                    type="button"
                    disabled={busy || isPending}
                    onClick={() => handleApprove(r)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    {busy ? "處理中⋯" : "審核"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || isPending}
                    onClick={() => handleReject(r)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  >
                    駁回
                  </button>
                </>
              )}
              {canEdit && (r.status === "draft" || r.status === "rejected") && (
                <button
                  type="button"
                  disabled={busy || isPending}
                  onClick={() => handleDelete(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              )}
              {!showApprove &&
                !(canEdit && (r.status === "draft" || r.status === "rejected")) && (
                  <span className="text-[11px] text-[#9A9890]">—</span>
                )}
            </div>
          );
        }}
      />

      {createOpen && (
        <CreateLossOverflowModal
          warehouses={warehouses}
          onClose={() => setCreateOpen(false)}
          onCreated={(adjNo) => {
            setCreateOpen(false);
            flash(true, `✓ 已建立：${adjNo}`);
            router.refresh();
          }}
          onError={(msg) => flash(false, msg)}
        />
      )}
    </main>
  );
}

function CreateLossOverflowModal({
  warehouses,
  onClose,
  onCreated,
  onError,
}: {
  warehouses: WarehouseOption[];
  onClose: () => void;
  onCreated: (adjNo: string) => void;
  onError: (msg: string) => void;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [kind, setKind] = useState<"loss" | "overflow">("loss");
  const [reasonKind, setReasonKind] = useState<LossOverflowInput["reason_kind"]>("damage");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onError("金額必須為正數");
      return;
    }
    startTransition(async () => {
      const res = await createLossOverflowAction({
        warehouse_id: warehouseId,
        kind,
        reason_kind: reasonKind,
        amount: amt,
        notes: notes.trim() || null,
      });
      if (res.ok) {
        onCreated("新單據");
      } else {
        onError(res.error);
      }
    });
  }

  const requiresApproval = Number(amount) >= APPROVAL_THRESHOLD;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-[480px] max-w-[95vw] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">新增報損報溢</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[#9A9890] hover:text-[#2C2C2A] text-[20px] leading-none"
          >
            ×
          </button>
        </header>
        <div className="p-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型 *</label>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 text-[12.5px]">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "loss"}
                  onChange={() => setKind("loss")}
                />
                報損
              </label>
              <label className="flex items-center gap-1 text-[12.5px]">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "overflow"}
                  onChange={() => setKind("overflow")}
                />
                報溢
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫 *</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={inputClass}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} ・ {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>原因 *</label>
            <select
              value={reasonKind}
              onChange={(e) =>
                setReasonKind(e.target.value as LossOverflowInput["reason_kind"])
              }
              className={inputClass}
            >
              <option value="damage">毀損</option>
              <option value="lost">短少 / 遺失</option>
              <option value="expired">過期報廢</option>
              <option value="count_error">盤點誤差</option>
              <option value="other">其他</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>金額 (NT$, 正數) *</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例：3500"
              className={inputClass}
            />
            {requiresApproval && (
              <span className="text-[11px] text-[#854F0B]">
                此金額需主管審核
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>備註</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="說明事由（建議填寫，利於後續審核）"
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !warehouseId || !amount}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "建立中⋯" : "建立"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// Mark `updateLossOverflowAction` as referenced for future detail-page wiring
// (kept here to centralise imports for the loss-overflow page surface).
void updateLossOverflowAction;
