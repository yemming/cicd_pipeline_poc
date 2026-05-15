"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { RO_STATUS_OPTIONS } from "@/domain/repair-orders.constants";
import type {
  RoLinesSummaryFilters,
  RoLinesSummaryPageData,
  RoLinesSummaryRow,
} from "@/domain/repair-order-lines";

const labelClass = "text-[11px] text-[#9A9890] font-medium";
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";

function statusChipClass(status: string): string {
  switch (status) {
    case "進行中":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "維修中":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "待結帳":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "已關單":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "已取消":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

const fmtMoney = (n: number) => `NT$${Math.round(n).toLocaleString()}`;

export function LinesLandingBoard({
  data,
  filters,
  canEdit,
}: {
  data: RoLinesSummaryPageData;
  filters: RoLinesSummaryFilters;
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "核對明細",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "核對明細" },
    ],
    hideSearch: false,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [statusVal, setStatusVal] = useState(filters.status ?? "all");
  const [qVal, setQVal] = useState(filters.q ?? "");
  const [dateFrom, setDateFrom] = useState(filters.date_from ?? "");
  const [dateTo, setDateTo] = useState(filters.date_to ?? "");
  const [emptyOnly, setEmptyOnly] = useState(!!filters.empty_only);

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    const set = (k: string, v: string) => {
      if (v && v !== "all" && v !== "") params.set(k, v);
      else params.delete(k);
    };
    set("status", statusVal);
    set("q", qVal);
    set("date_from", dateFrom);
    set("date_to", dateTo);
    if (emptyOnly) params.set("empty_only", "1");
    else params.delete("empty_only");
    startTransition(() => {
      router.push(`/parts/aftersales/repair-orders/lines?${params.toString()}`);
    });
  }

  function resetFilters() {
    setStatusVal("all");
    setQVal("");
    setDateFrom("");
    setDateTo("");
    setEmptyOnly(false);
    startTransition(() => {
      router.push("/parts/aftersales/repair-orders/lines");
    });
  }

  // 統計
  const stats = useMemo(() => {
    const rows = data.rows;
    const empty = rows.filter((r) => !r.has_lines).length;
    const lowStock = rows.filter((r) => r.has_low_stock).length;
    const totalSum = rows.reduce((s, r) => s + r.total, 0);
    return { total: rows.length, empty, lowStock, totalSum };
  }, [data.rows]);

  const columns: DataGridColumn<RoLinesSummaryRow>[] = useMemo(
    () => [
      {
        id: "ro_code",
        header: "工單編號",
        width: 180,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/repair-orders/${r.id}/lines`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r.ro_code}
          </Link>
        ),
        exportValue: (r) => r.ro_code,
        sortValue: (r) => r.ro_code,
      },
      {
        id: "issue_date",
        header: "開單日",
        width: 110,
        cell: (r) => <span className="font-mono text-[12px]">{r.issue_date}</span>,
        exportValue: (r) => r.issue_date,
        sortValue: (r) => r.issue_date,
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChipClass(r.status)}`}
          >
            {r.status}
          </span>
        ),
        exportValue: (r) => r.status,
        sortValue: (r) => r.status,
      },
      {
        id: "customer_name",
        header: "客戶",
        width: 130,
        cell: (r) => r.customer_name ?? "—",
        exportValue: (r) => r.customer_name ?? "",
      },
      {
        id: "vehicle",
        header: "車輛",
        width: 170,
        cell: (r) => (
          <div className="leading-tight">
            <div className="font-mono text-[12px] text-[#2C2C2A]">
              {r.vehicle_license_plate ?? "—"}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              {r.vehicle_model_name ?? ""}
            </div>
          </div>
        ),
        exportValue: (r) =>
          [r.vehicle_license_plate, r.vehicle_model_name].filter(Boolean).join(" "),
        sortValue: (r) => r.vehicle_license_plate ?? "",
      },
      {
        id: "sa_name",
        header: "SA",
        width: 90,
        cell: (r) => r.sa_name ?? "—",
        exportValue: (r) => r.sa_name ?? "",
      },
      {
        id: "labor_summary",
        header: "工項",
        width: 110,
        align: "right",
        cell: (r) => (
          <div className="leading-tight text-right">
            <div className="text-[12px] text-[#2C2C2A]">
              {r.labor_count} 項{" "}
              <span className="text-[11px] text-[#9A9890]">
                ({r.labor_units_total.toFixed(1)} LU)
              </span>
            </div>
            <div className="text-[11px] text-[#5A5955] font-mono">
              {fmtMoney(r.labor_subtotal)}
            </div>
          </div>
        ),
        exportValue: (r) =>
          `${r.labor_count}項/${r.labor_units_total.toFixed(1)}LU/${fmtMoney(r.labor_subtotal)}`,
        sortValue: (r) => r.labor_subtotal,
      },
      {
        id: "parts_summary",
        header: "零件",
        width: 130,
        align: "right",
        cell: (r) => (
          <div className="leading-tight text-right">
            <div className="text-[12px] text-[#2C2C2A]">
              {r.parts_count} 項
              {r.has_low_stock && (
                <span className="ml-1 inline-flex items-center px-1 py-0 rounded text-[10px] bg-[#FDF3E3] text-[#854F0B]">
                  低庫存
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#5A5955] font-mono">
              {fmtMoney(r.parts_subtotal)}
            </div>
          </div>
        ),
        exportValue: (r) =>
          `${r.parts_count}項/${fmtMoney(r.parts_subtotal)}${r.has_low_stock ? "/低庫存" : ""}`,
        sortValue: (r) => r.parts_subtotal,
      },
      {
        id: "discount_pct",
        header: "折扣",
        width: 70,
        align: "right",
        cell: (r) =>
          r.discount_pct > 0 ? (
            <span className="font-mono text-[12px] text-[#CC0000]">
              -{r.discount_pct}%
            </span>
          ) : (
            <span className="text-[11px] text-[#9A9890]">—</span>
          ),
        exportValue: (r) => (r.discount_pct > 0 ? `-${r.discount_pct}%` : ""),
        sortValue: (r) => r.discount_pct,
      },
      {
        id: "total",
        header: "總計（含稅）",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono font-semibold text-[#1A3A5C] text-[12.5px]">
            {fmtMoney(r.total)}
          </span>
        ),
        exportValue: (r) => fmtMoney(r.total),
        sortValue: (r) => r.total,
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">核對明細</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          以 RO 為單位的工項／零件明細與費用彙總，點工單編號進入維護。
        </span>
      </header>

      {/* KPI 列 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="工單總數" value={stats.total.toLocaleString()} accent="#1A3A5C" />
        <KpiCard
          label="未核對（無明細）"
          value={stats.empty.toLocaleString()}
          accent="#854F0B"
          hint={stats.empty > 0 ? "需開立明細" : "全部已核對"}
        />
        <KpiCard
          label="低庫存提示"
          value={stats.lowStock.toLocaleString()}
          accent={stats.lowStock > 0 ? "#CC0000" : "#3B6D11"}
          hint={stats.lowStock > 0 ? "請確認供貨" : "無風險"}
        />
        <KpiCard
          label="本批合計"
          value={fmtMoney(stats.totalSum)}
          accent="#185FA5"
          mono
        />
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value)}
              className={inputClass}
              disabled={isPending}
            >
              <option value="all">全部</option>
              {RO_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>工單編號</label>
            <input
              type="text"
              value={qVal}
              onChange={(e) => setQVal(e.target.value)}
              placeholder="MN-CP-..."
              className={`${inputClass} w-44`}
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>開單日（起）</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputClass}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>開單日（迄）</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputClass}
              disabled={isPending}
            />
          </div>
          <label className="flex items-center gap-1.5 h-[30px] text-[12px] text-[#5A5955] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={emptyOnly}
              onChange={(e) => setEmptyOnly(e.target.checked)}
              className="accent-[#1A3A5C]"
              disabled={isPending}
            />
            僅顯示未核對
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            <Link
              href="/parts/aftersales/repair-orders/new"
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center text-white ${
                canEdit
                  ? "bg-[#0F6E56] hover:bg-[#0a5742]"
                  : "bg-[#0F6E56] opacity-50 pointer-events-none"
              }`}
            >
              ＋ 開新工單
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{data.totalCount}</b> 張工單
          {filters.empty_only ? "（未核對）" : ""}
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={data.rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/repair-orders/lines"
        exportFileName="ro-lines-summary"
        emptyMessage="沒有符合條件的工單。建立 RO 後即可在此核對明細。"
        disabled={isPending}
        rowActionsWidth={180}
        rowActions={(r) => (
          <Link
            href={`/parts/aftersales/repair-orders/${r.id}/lines`}
            className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
          >
            維護明細 →
          </Link>
        )}
      />
    </main>
  );
}

function KpiCard({
  label,
  value,
  accent,
  hint,
  mono,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-2.5">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[18px] font-semibold leading-tight ${mono ? "font-mono" : ""}`}
        style={{ color: accent }}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-[#9A9890] mt-0.5">{hint}</div>}
    </div>
  );
}
