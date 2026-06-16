"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { exportToXlsx } from "@/components/data-grid/excel-io";
import {
  PREFIX_P1_DEFS,
  RO_STATUS_OPTIONS,
} from "@/domain/repair-orders.constants";
import type {
  RepairOrderListFilters,
  RepairOrderListRow,
  RoSearchPageData,
} from "@/domain/repair-orders";

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

function p1ChipClass(p1: string): string {
  // 業務類型彩色 badge 配色（partner 設計稿 10_工單查詢）：
  // PD=紫 / WC=綠 / RP=琥珀 / AC=紅 / MN=深藍 / OT=靛
  switch (p1) {
    case "PD":
      return "bg-[#EEEDFE] text-[#534AB7]";
    case "WC":
      return "bg-[#E5F5EE] text-[#0F6E56]";
    case "RP":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "AC":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "MN":
      return "bg-[#E8EFF8] text-[#1A3A5C]";
    case "OT":
      return "bg-[#EAF4FB] text-[#185FA5]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

/** PD 工單（fee_allocation='vehicle_cost'）= 內部整備作業，費用計入整車成本 */
function isVehicleCostRo(r: RepairOrderListRow): boolean {
  return r.prefix_p1 === "PD" || r.fee_allocation === "vehicle_cost";
}

function formatCurrency(v: number): string {
  return `NT$${v.toLocaleString()}`;
}

/** 台北今日 YYYY-MM-DD（client 端） */
function taipeiToday(): string {
  const tz = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  return `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-${String(tz.getDate()).padStart(2, "0")}`;
}

/** Walk-in（臨時進廠）判定：無預約來源、且非 PD 內部整備 */
function isWalkInRo(r: RepairOrderListRow): boolean {
  return !r.appointment_id && r.prefix_p1 !== "PD";
}

export function RoSearchBoard({
  data,
  filters,
  myEmployeeId,
}: {
  data: RoSearchPageData;
  filters: RepairOrderListFilters;
  myEmployeeId: string | null;
}) {
  useSetPageHeader({
    title: "工單查詢",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "工單查詢" },
    ],
    hideSearch: false,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  const [statusVal, setStatusVal] = useState(filters.status ?? "all");
  const [p1Val, setP1Val] = useState(filters.prefix_p1 ?? "all");
  const [saVal, setSaVal] = useState(filters.sa_id ?? "all");
  const [qVal, setQVal] = useState(filters.q ?? "");
  const [monthVal, setMonthVal] = useState(filters.business_month ?? "");

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    const set = (k: string, v: string) => {
      if (v && v !== "all" && v !== "") params.set(k, v);
      else params.delete(k);
    };
    set("status", statusVal);
    set("prefix_p1", p1Val);
    set("sa_id", saVal);
    set("q", qVal);
    set("business_month", monthVal);
    startTransition(() => {
      router.push(`/parts/aftersales/ro-search?${params.toString()}`);
    });
  }

  function resetFilters() {
    setStatusVal("all");
    setP1Val("all");
    setSaVal("all");
    setQVal("");
    setMonthVal("");
    startTransition(() => {
      router.push("/parts/aftersales/ro-search");
    });
  }

  /** 匯出當前篩選後的工單清單為 Excel（呼叫與 DataGrid 內部相同的 exportToXlsx） */
  async function handleFilterBarExport() {
    if (data.rows.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      await exportToXlsx({
        fileName: "ro-search.xlsx",
        sheetName: "工單查詢",
        columns: [
          { id: "ro_code",     header: "工單號",     getValue: (r: RepairOrderListRow) => r.ro_code },
          { id: "customer",    header: "車主",        getValue: (r: RepairOrderListRow) => {
            const internal = isVehicleCostRo(r);
            const meta = (r.metadata ?? {}) as { internal_owner_label?: string };
            const name = internal
              ? `[內部] ${meta.internal_owner_label ?? r.customer_name ?? "—"}`
              : (r.customer_name ?? "—");
            return name;
          }},
          { id: "vehicle",     header: "車型 / 車牌", getValue: (r: RepairOrderListRow) => r.vehicle_model_name ?? r.vehicle_license_plate ?? "" },
          { id: "prefix",      header: "業務類型",   getValue: (r: RepairOrderListRow) => `${r.prefix_p1}-${r.prefix_p2}` },
          { id: "issue_date",  header: "進廠日",     getValue: (r: RepairOrderListRow) => r.issue_date },
          { id: "sa",          header: "SA",         getValue: (r: RepairOrderListRow) => r.sa_name ?? "" },
          { id: "amount",      header: "金額",       getValue: (r: RepairOrderListRow) => r.estimated_subtotal != null ? Number(r.estimated_subtotal) : "" },
          { id: "status",      header: "狀態",       getValue: (r: RepairOrderListRow) => r.status },
        ],
        data: data.rows,
      });
    } finally {
      setIsExporting(false);
    }
  }

  // B-21：今日工單監控快篩 — 直接組 URL，避免月份 fallback 蓋掉日期區間
  const isQuickActive = (kind: "mine" | "inprogress" | "today"): boolean => {
    const today = filters.date_from && filters.date_from === filters.date_to;
    if (kind === "mine") return Boolean(today && filters.sa_id && filters.sa_id !== "all");
    if (kind === "today") return Boolean(today && (!filters.sa_id || filters.sa_id === "all"));
    if (kind === "inprogress") return filters.status === "進行中" && !today;
    return false;
  };
  function applyQuick(kind: "mine" | "inprogress" | "today") {
    const params = new URLSearchParams();
    const today = taipeiToday();
    if (kind === "mine" && myEmployeeId) {
      params.set("date_from", today);
      params.set("date_to", today);
      params.set("sa_id", myEmployeeId);
    } else if (kind === "today") {
      params.set("date_from", today);
      params.set("date_to", today);
    } else if (kind === "inprogress") {
      params.set("status", "進行中");
    }
    startTransition(() => {
      router.push(`/parts/aftersales/ro-search?${params.toString()}`);
    });
  }

  const columns: DataGridColumn<RepairOrderListRow>[] = useMemo(
    () => [
      {
        id: "ro_code",
        header: "工單號",
        width: 170,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/repair-orders/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline text-[11.5px]"
          >
            {r.ro_code}
          </Link>
        ),
        exportValue: (r) => r.ro_code,
        sortValue: (r) => r.ro_code,
      },
      {
        id: "customer",
        header: "車主 / 車型",
        width: 180,
        cell: (r) => {
          const internal = isVehicleCostRo(r);
          // PD 整備為內部作業（無外部車主）；以 metadata.internal_owner_label 顯示經銷商名，
          // 退回既有 customer_name，再退回「—」。前綴固定打 [內部] 標示為內部結算。
          const meta = (r.metadata ?? {}) as { internal_owner_label?: string };
          const ownerName = internal
            ? meta.internal_owner_label ?? r.customer_name ?? "—"
            : r.customer_name;
          return (
            <div className="flex flex-col leading-tight">
              <span className="text-[12.5px] text-[#2C2C2A] font-medium">
                {internal ? (
                  <span>
                    <span className="text-[#534AB7] font-semibold">[內部]</span> {ownerName}
                  </span>
                ) : (
                  ownerName ?? <span className="text-[#9A9890]">—</span>
                )}
              </span>
              <span className="text-[11px] text-[#9A9890] inline-flex items-center gap-1">
                {r.vehicle_model_name ?? r.vehicle_license_plate ?? "—"}
                {isWalkInRo(r) && (
                  <span
                    data-testid="walkin-badge"
                    className="inline-flex px-1 py-0.5 rounded text-[10px] font-medium bg-[#FDF3E3] text-[#854F0B] whitespace-nowrap"
                    title="臨時進廠（無預約）"
                  >
                    🚶 臨時
                  </span>
                )}
              </span>
            </div>
          );
        },
        exportValue: (r) => {
          const internal = isVehicleCostRo(r);
          const meta = (r.metadata ?? {}) as { internal_owner_label?: string };
          const ownerName = internal
            ? `[內部] ${meta.internal_owner_label ?? r.customer_name ?? "—"}`
            : r.customer_name;
          return [ownerName, r.vehicle_model_name ?? r.vehicle_license_plate]
            .filter(Boolean)
            .join(" / ");
        },
        sortValue: (r) => r.customer_name ?? "",
      },
      {
        id: "prefix",
        header: "業務類型",
        width: 110,
        cell: (r) => (
          <span className="inline-flex gap-1">
            <span
              className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium ${p1ChipClass(r.prefix_p1)}`}
            >
              {r.prefix_p1}
            </span>
            <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
              {r.prefix_p2}
            </span>
          </span>
        ),
        exportValue: (r) => `${r.prefix_p1}-${r.prefix_p2}`,
        sortValue: (r) => `${r.prefix_p1}-${r.prefix_p2}`,
      },
      {
        id: "items",
        header: "維修項目",
        width: 200,
        cell: (r) => {
          // metadata.items_preview 預期 string[]，沒有就退回 estimated_labor_units 描述
          const meta = (r.metadata ?? {}) as { items_preview?: string[]; preview?: string };
          const text =
            (meta.items_preview && meta.items_preview.join("、")) ||
            meta.preview ||
            (r.estimated_labor_units != null ? `預估 ${r.estimated_labor_units} LU` : "—");
          return (
            <span
              className="block text-[12px] text-[#5A5955] truncate"
              title={text}
            >
              {text}
            </span>
          );
        },
        exportValue: (r) => {
          const meta = (r.metadata ?? {}) as { items_preview?: string[]; preview?: string };
          return (meta.items_preview && meta.items_preview.join("、")) || meta.preview || "";
        },
        sortable: false,
      },
      {
        id: "issue_date",
        header: "進廠日",
        width: 100,
        cell: (r) => <span className="font-mono text-[12px] text-[#5A5955]">{r.issue_date}</span>,
        exportValue: (r) => r.issue_date,
        sortValue: (r) => r.issue_date,
      },
      {
        id: "sa",
        header: "SA",
        width: 80,
        cell: (r) => r.sa_name ?? <span className="text-[#9A9890]">—</span>,
        exportValue: (r) => r.sa_name ?? "",
        sortValue: (r) => r.sa_name ?? "",
      },
      {
        id: "amount",
        header: "金額",
        width: 120,
        align: "right",
        cell: (r) => {
          const amt = Number(r.estimated_subtotal ?? 0);
          // PD 整備工單：費用計入整車成本，不顯示一般客付金額格式，改綠色「整車成本」tag
          if (isVehicleCostRo(r)) {
            return (
              <span className="inline-flex flex-col items-end gap-0.5">
                <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#E5F5EE] text-[#0F6E56] whitespace-nowrap">
                  整車成本
                </span>
                <span className="font-mono text-[11px] text-[#0F6E56]">
                  {formatCurrency(amt)}
                </span>
              </span>
            );
          }
          if (r.prefix_p2 === "WR") {
            return (
              <span className="font-mono text-[12px] text-[#854F0B]">
                {formatCurrency(amt)}<span className="ml-1 text-[10.5px]">（保固）</span>
              </span>
            );
          }
          if (r.prefix_p2 === "FR") {
            return (
              <span className="font-mono text-[12px] text-[#9A9890]">
                NT$0<span className="ml-1 text-[10.5px]">（免費）</span>
              </span>
            );
          }
          return (
            <span className="font-mono font-semibold text-[#1A3A5C]">
              {formatCurrency(amt)}
            </span>
          );
        },
        exportValue: (r) =>
          r.estimated_subtotal != null ? String(r.estimated_subtotal) : "",
        sortValue: (r) => Number(r.estimated_subtotal ?? 0),
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusChipClass(r.status)}`}
          >
            {r.status}
          </span>
        ),
        exportValue: (r) => r.status,
        sortValue: (r) => r.status,
      },
    ],
    [],
  );

  // 修補三：篩選結果統計摘要（依目前篩選後的結果集計算）
  // 主管做 MN/RP 分開統計時，選某業務類型後即時看到「幾張、合計多少、平均工時」。
  const summary = useMemo(() => {
    const rows = data.rows;
    const total = rows.reduce((s, r) => s + Number(r.estimated_subtotal ?? 0), 0);
    const luRows = rows.filter((r) => r.estimated_labor_units != null);
    const avgLu =
      luRows.length > 0
        ? luRows.reduce((s, r) => s + Number(r.estimated_labor_units ?? 0), 0) / luRows.length
        : 0;
    return { count: data.totalCount, total, avgLu };
  }, [data.rows, data.totalCount]);

  // 目前業務類型篩選的人話標籤（摘要用）
  const p1Label =
    p1Val === "all"
      ? "全部業務類型"
      : (PREFIX_P1_DEFS.find((d) => d.code === p1Val)?.name
          ? `${p1Val} ${PREFIX_P1_DEFS.find((d) => d.code === p1Val)!.name}`
          : p1Val);

  const kpi = data.kpi;
  const deltaSign = kpi.monthRoCountDeltaVsLast >= 0 ? "▲" : "▼";
  const deltaAbs = Math.abs(kpi.monthRoCountDeltaVsLast);
  const monthLabel = filters.business_month ?? "—";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">工單查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 · 10
        </span>
        <span className="text-[12px] text-[#9A9890]">
          全店工單回查 · KPI 摘要 / 業務類型 / 期間 / SA 多軸過濾
        </span>
      </header>

      {/* KPI 4 卡 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">本月工單數</div>
          <div className="mt-1 text-[20px] font-semibold text-[#1A3A5C]">
            {kpi.monthRoCount} <span className="text-[12px] font-normal text-[#5A5955]">張</span>
          </div>
          <div className="mt-0.5 text-[11px] text-[#9A9890]">
            {deltaSign} {kpi.monthRoCountDeltaVsLast > 0 ? "+" : kpi.monthRoCountDeltaVsLast < 0 ? "-" : ""}
            {deltaAbs} vs 上月
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">進行中</div>
          <div className="mt-1 text-[20px] font-semibold text-[#185FA5]">
            {kpi.inProgressCount} <span className="text-[12px] font-normal text-[#5A5955]">張</span>
          </div>
          <div className="mt-0.5 text-[11px] text-[#9A9890]">
            今日 {kpi.inProgressTodayCount} 張
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">本月產值（客付）</div>
          <div className="mt-1 text-[20px] font-semibold text-[#0F6E56] font-mono">
            {formatCurrency(kpi.monthRevenueCustomerPay)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#9A9890]">保固另計</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">平均工單金額</div>
          <div className="mt-1 text-[20px] font-semibold text-[#854F0B] font-mono">
            {formatCurrency(kpi.avgRoAmount)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#9A9890]">{monthLabel}</div>
        </div>
      </section>

      {/* B-21：今日工單快速篩選 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          data-testid="my-today-btn"
          onClick={() => applyQuick("mine")}
          disabled={isPending || !myEmployeeId}
          title={myEmployeeId ? "今日由我負責的工單" : "你的帳號尚未對應到員工，無法用「我的」篩選"}
          className={`h-[30px] px-3.5 rounded-full text-[12.5px] font-medium border transition-colors disabled:opacity-50 ${
            isQuickActive("mine")
              ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
              : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          }`}
        >
          📋 今日我的工單
        </button>
        <button
          type="button"
          onClick={() => applyQuick("inprogress")}
          disabled={isPending}
          className={`h-[30px] px-3.5 rounded-full text-[12.5px] font-medium border transition-colors disabled:opacity-50 ${
            isQuickActive("inprogress")
              ? "bg-[#185FA5] text-white border-[#185FA5]"
              : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          }`}
        >
          🔴 進行中
        </button>
        <button
          type="button"
          onClick={() => applyQuick("today")}
          disabled={isPending}
          className={`h-[30px] px-3.5 rounded-full text-[12.5px] font-medium border transition-colors disabled:opacity-50 ${
            isQuickActive("today")
              ? "bg-[#854F0B] text-white border-[#854F0B]"
              : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          }`}
        >
          🕐 今日全部
        </button>
        <span className="text-[11px] text-[#9A9890] ml-1">含臨時進廠 Walk-in 工單</span>
      </div>

      {/* Filter bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>工單號 / 車主</label>
            <input
              className={`${inputClass} w-[200px]`}
              value={qVal}
              onChange={(e) => setQVal(e.target.value)}
              placeholder="工單號 / 車主 / 車牌"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>業務類型</label>
            <select
              className={inputClass}
              value={p1Val}
              onChange={(e) => setP1Val(e.target.value)}
            >
              <option value="all">全部</option>
              {PREFIX_P1_DEFS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value)}
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
            <label className={labelClass}>SA</label>
            <select
              className={inputClass}
              value={saVal}
              onChange={(e) => setSaVal(e.target.value)}
            >
              <option value="all">全部</option>
              {data.saOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>期間</label>
            <input
              type="month"
              className={inputClass}
              value={monthVal}
              onChange={(e) => setMonthVal(e.target.value)}
            />
          </div>
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
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {/* filter bar 顯式匯出按鈕：呼叫與 DataGrid 內部相同的 exportToXlsx 邏輯 */}
            <button
              type="button"
              onClick={() => void handleFilterBarExport()}
              disabled={isExporting || data.rows.length === 0}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 inline-flex items-center gap-1"
              title="把目前篩選後的工單清單匯出成 Excel"
            >
              <span aria-hidden>⬇</span>
              {isExporting ? "匯出中⋯" : "匯出 Excel"}
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          工單列表 · 共 <b className="text-[#2C2C2A]">{data.totalCount}</b> 筆
        </span>
      </div>

      {/* 修補三：篩選結果統計摘要（MN/RP 分開統計的核心讀數）*/}
      <div
        data-testid="ro-filter-summary"
        className="flex items-center flex-wrap gap-x-5 gap-y-1 bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-2.5 text-[12.5px]"
      >
        <span className="text-[#5A5955]">
          篩選結果（
          <b className="text-[#185FA5]">{p1Label}</b>
          ）：
        </span>
        <span className="text-[#2C2C2A]">
          共 <b className="text-[#1A3A5C]">{summary.count}</b> 張工單
        </span>
        <span className="text-[#2C2C2A]">
          合計{" "}
          <b className="text-[#0F6E56] font-mono">{formatCurrency(summary.total)}</b>
        </span>
        <span className="text-[#2C2C2A]">
          平均工時{" "}
          <b className="text-[#854F0B] font-mono">{summary.avgLu.toFixed(1)}</b> LU
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={data.rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/ro-search"
        exportFileName="ro-search"
        emptyMessage="目前沒有符合條件的工單"
        disabled={isPending}
        rowActionsWidth={110}
        rowActions={(r) => (
          <Link
            href={`/parts/aftersales/repair-orders/${r.id}`}
            className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            詳情
          </Link>
        )}
      />
    </main>
  );
}
