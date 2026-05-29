"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  BalanceSheetResult,
  BalanceSheetRow,
  PeriodOption,
  SubsidiaryOption,
} from "@/domain/financial-reports";

const BASE_PATH = "/admin/accounting/reports/balance-sheet";

/** 帶符號金額（會計慣例）：負數加括號、0 顯示「0」。明確帶 locale 避免 SSR hydration mismatch */
function fmtSigned(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "0";
  const abs = Math.abs(r).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  return r < 0 ? `(${abs})` : abs;
}

export function BalanceSheetBoard({
  report,
  periods,
  subsidiaries,
  dateTo,
  subsidiaryId,
}: {
  report: BalanceSheetResult;
  periods: PeriodOption[];
  subsidiaries: SubsidiaryOption[];
  dateTo: string;
  subsidiaryId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fTo, setFTo] = useState(dateTo);
  const [fSub, setFSub] = useState(subsidiaryId);

  const buildHref = () => {
    const p = new URLSearchParams();
    if (fTo) p.set("date_to", fTo);
    if (fSub && fSub !== "all") p.set("subsidiary", fSub);
    const qs = p.toString();
    return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
  };

  const submitFilters = () => {
    startTransition(() => router.push(buildHref()));
  };
  const resetFilters = () => {
    setFSub("all");
    // 截止日預設由 server 依「今日」重算，清空 query 即可
    startTransition(() => router.push(BASE_PATH));
  };

  const subName =
    fSub === "all"
      ? "全法人"
      : (subsidiaries.find((s) => s.id === fSub)?.name ?? fSub);

  const accountCount = report.rows.filter(
    (r) => r.kind === "account" && r.has_activity && r.account_code !== "",
  ).length;

  const { balanced, balance_diff } = report;

  /** subtotal 列：負 margin 撐滿 td（對應 td 的 py-2 px-3）→ 三欄連成整列上色 */
  const subtotalWrap = (r: BalanceSheetRow) =>
    `block -my-2 -mx-3 px-3 py-2 font-semibold ${
      r.is_grand_total
        ? "bg-[#EBF3FF] border-t-2 border-[#1A3A5C] text-[#1A3A5C]"
        : "bg-[#F8F7F4] border-t border-[#D5D3CB] text-[#2C2C2A]"
    }`;

  const amountTone = (r: BalanceSheetRow): string => {
    if (r.kind === "subtotal") {
      if (r.amount < 0) return "text-[#CC0000]";
      return r.is_grand_total ? "text-[#1A3A5C]" : "text-[#2C2C2A]";
    }
    if (!r.has_activity) return "text-[#9A9890]";
    return r.amount < 0 ? "text-[#CC0000]" : "text-[#2C2C2A]";
  };

  const columns: DataGridColumn<BalanceSheetRow>[] = [
    {
      id: "account_code",
      header: "科目代碼",
      width: 130,
      sortable: false,
      hideable: false,
      cell: (r) =>
        r.kind === "subtotal" ? (
          <span className={subtotalWrap(r)}>{" "}</span>
        ) : (
          <span
            className="font-mono text-[#1A3A5C]"
            style={{ fontWeight: r.depth <= 1 ? 600 : 400 }}
          >
            {r.account_code}
          </span>
        ),
      exportValue: (r) => (r.kind === "subtotal" ? "" : r.account_code),
    },
    {
      id: "name",
      header: "科目／項目",
      sortable: false,
      cell: (r) =>
        r.kind === "subtotal" ? (
          <span className={subtotalWrap(r)}>{r.name_zh_tw}</span>
        ) : (
          <span
            style={{
              paddingLeft: r.depth * 16,
              fontWeight: r.depth === 0 ? 700 : r.depth === 1 ? 600 : 400,
            }}
            className={r.has_activity ? "text-[#2C2C2A]" : "text-[#9A9890]"}
          >
            {r.name_zh_tw}
          </span>
        ),
      exportValue: (r) =>
        r.kind === "subtotal"
          ? r.name_zh_tw
          : "  ".repeat(r.depth) + r.name_zh_tw,
    },
    {
      id: "amount",
      header: "金額",
      width: 170,
      align: "right",
      sortable: false,
      cell: (r) => {
        const text =
          r.kind === "account" && r.amount === 0 ? "–" : fmtSigned(r.amount);
        if (r.kind === "subtotal") {
          return (
            <span
              className={`${subtotalWrap(r)} text-right font-mono tabular-nums ${amountTone(r)}`}
            >
              {text}
            </span>
          );
        }
        return (
          <span className={`font-mono tabular-nums ${amountTone(r)}`}>
            {text}
          </span>
        );
      },
      exportValue: (r) =>
        r.kind === "account" && r.amount === 0 ? null : Math.round(r.amount),
    },
  ];

  const selectClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const ladder: Array<{ label: string; value: number; emphasize?: boolean }> = [
    { label: "資產總計", value: report.total_assets },
    { label: "負債總計", value: report.total_liabilities },
    { label: "權益總計（含本期淨利）", value: report.total_equity },
    { label: "本期淨利", value: report.net_income, emphasize: true },
  ];

  return (
    <main
      className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">資產負債表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P4 報表
        </span>
        <span className="text-[12px] text-[#9A9890]">
          資產負債表（時點存量）· {subName} · 截至 {report.as_of}
        </span>
      </header>

      {/* 平衡檢核 Banner */}
      {balanced ? (
        <div className="px-4 py-2 rounded-lg text-[12.5px] bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]">
          借貸平衡 ✓ 資產{" "}
          <b className="font-mono tabular-nums">
            {fmtSigned(report.total_assets)}
          </b>{" "}
          = 負債{" "}
          <b className="font-mono tabular-nums">
            {fmtSigned(report.total_liabilities)}
          </b>{" "}
          + 權益{" "}
          <b className="font-mono tabular-nums">
            {fmtSigned(report.total_equity)}
          </b>
          （含本期淨利{" "}
          <b className="font-mono tabular-nums">
            {fmtSigned(report.net_income)}
          </b>
          ）
        </div>
      ) : (
        <div className="px-4 py-2 rounded-lg text-[12.5px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]">
          不平衡！差額{" "}
          <b className="font-mono tabular-nums">{fmtSigned(balance_diff)}</b>
          （資產 {fmtSigned(report.total_assets)} ≠ 負債{" "}
          {fmtSigned(report.total_liabilities)} + 權益{" "}
          {fmtSigned(report.total_equity)}）
        </div>
      )}

      {/* Filter Bar — BS 時點表：只有 法人 + 截止期間 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>法人</label>
            <select
              className={selectClass}
              value={fSub}
              onChange={(e) => setFSub(e.target.value)}
            >
              <option value="all">全法人</option>
              {subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>截止期間</label>
            <select
              className={selectClass}
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
            >
              {!periods.some((p) => p.end_date === fTo) && (
                <option value={fTo}>{fTo}</option>
              )}
              {periods.map((p) => (
                <option key={`to-${p.id}`} value={p.end_date}>
                  {p.label}
                </option>
              ))}
            </select>
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

      {/* KPI ladder summary */}
      <div className="flex gap-2 flex-wrap">
        {ladder.map((k) => (
          <div
            key={k.label}
            className={`flex-1 min-w-[140px] rounded-lg border px-3 py-2 ${
              k.emphasize
                ? "bg-[#EBF3FF] border-[#1A3A5C]"
                : "bg-white border-[#EEECE6]"
            }`}
          >
            <div className="text-[11px] text-[#9A9890] font-medium">
              {k.label}
            </div>
            <div
              className={`text-[15px] font-mono tabular-nums font-semibold ${
                k.value < 0
                  ? "text-[#CC0000]"
                  : k.emphasize
                    ? "text-[#1A3A5C]"
                    : "text-[#2C2C2A]"
              }`}
            >
              {fmtSigned(k.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          資產負債科目（樹狀）；<b className="text-[#2C2C2A]">{accountCount}</b>{" "}
          個科目於截止日有累計餘額。金額＝時點存量（正常餘額顯示為正）；異常借／貸餘以括號表示。
        </span>
      </div>

      {/* Table — 樹狀 + 小計列，不分頁、不可排序（保持 pre-order 與小計位置） */}
      <DataGrid
        columns={columns}
        data={report.rows}
        rowKey={(r) => r.id}
        persistKey="admin/accounting/reports/balance-sheet"
        exportFileName={`balance-sheet-${report.as_of}`}
        emptyMessage="沒有資產負債科目資料"
        disabled={isPending}
      />
    </main>
  );
}
