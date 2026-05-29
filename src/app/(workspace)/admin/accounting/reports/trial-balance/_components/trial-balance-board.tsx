"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  TrialBalanceResult,
  TrialBalanceRow,
  PeriodOption,
  SubsidiaryOption,
} from "@/domain/financial-reports";

const BASE_PATH = "/admin/accounting/reports/trial-balance";

/** 千分位；0 顯示「–」。明確帶 locale，避免 SSR hydration mismatch */
function fmtMoney(n: number): string {
  if (!n) return "–";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function TrialBalanceBoard({
  report,
  periods,
  subsidiaries,
  asOf,
  subsidiaryId,
}: {
  report: TrialBalanceResult;
  periods: PeriodOption[];
  subsidiaries: SubsidiaryOption[];
  asOf: string;
  subsidiaryId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fAsOf, setFAsOf] = useState(asOf);
  const [fSub, setFSub] = useState(subsidiaryId);

  const buildHref = (override: { asOf?: string; sub?: string } = {}) => {
    const p = new URLSearchParams();
    const a = override.asOf ?? fAsOf;
    const s = override.sub ?? fSub;
    if (a) p.set("as_of", a);
    if (s && s !== "all") p.set("subsidiary", s);
    const qs = p.toString();
    return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
  };

  const submitFilters = () => {
    startTransition(() => router.push(buildHref()));
  };
  const resetFilters = () => {
    setFSub("all");
    // as_of 預設由 server 依「今日」重算，清空 query 即可（今日穩定，重算值＝目前值）
    startTransition(() => router.push(BASE_PATH));
  };

  const subName =
    fSub === "all"
      ? "全法人"
      : (subsidiaries.find((s) => s.id === fSub)?.name ?? fSub);

  const activeCount = report.rows.filter((r) => r.has_activity).length;

  const columns: DataGridColumn<TrialBalanceRow>[] = [
    {
      id: "account_code",
      header: "科目代碼",
      width: 130,
      sortable: false,
      hideable: false,
      cell: (r) => (
        <span
          className="font-mono text-[#1A3A5C]"
          style={{ fontWeight: r.depth <= 1 ? 600 : 400 }}
        >
          {r.account_code}
        </span>
      ),
      exportValue: (r) => r.account_code,
    },
    {
      id: "name",
      header: "科目名稱",
      sortable: false,
      cell: (r) => (
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
      exportValue: (r) => "  ".repeat(r.depth) + r.name_zh_tw,
    },
    {
      id: "debit",
      header: "借方餘額",
      width: 150,
      align: "right",
      sortable: false,
      cell: (r) => (
        <span className="font-mono tabular-nums text-[#2C2C2A]">
          {fmtMoney(r.debit_balance)}
        </span>
      ),
      exportValue: (r) => (r.debit_balance === 0 ? null : r.debit_balance),
    },
    {
      id: "credit",
      header: "貸方餘額",
      width: 150,
      align: "right",
      sortable: false,
      cell: (r) => (
        <span className="font-mono tabular-nums text-[#2C2C2A]">
          {fmtMoney(r.credit_balance)}
        </span>
      ),
      exportValue: (r) => (r.credit_balance === 0 ? null : r.credit_balance),
    },
  ];

  const selectClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main
      className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">試算表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P4 報表
        </span>
        <span className="text-[12px] text-[#9A9890]">
          期末科目餘額試算表 · {subName} · 截至 {report.as_of}
        </span>
      </header>

      {/* Balance Banner */}
      {report.balanced ? (
        <div className="px-4 py-2 rounded-lg text-[12.5px] bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]">
          ✓ 借貸平衡 — 借方合計 = 貸方合計 ={" "}
          {fmtMoney(report.grand_total_debit)}
        </div>
      ) : (
        <div className="px-4 py-2 rounded-lg text-[12.5px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]">
          ✗ 借貸不平衡 — 借方 {fmtMoney(report.grand_total_debit)} / 貸方{" "}
          {fmtMoney(report.grand_total_credit)}，差額 {fmtMoney(report.diff)}
          （借−貸）
        </div>
      )}

      {/* Filter Bar */}
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
              value={fAsOf}
              onChange={(e) => setFAsOf(e.target.value)}
            >
              {!periods.some((p) => p.end_date === fAsOf) && (
                <option value={fAsOf}>{fAsOf}</option>
              )}
              {periods.map((p) => (
                <option key={p.id} value={p.end_date}>
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

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共{" "}
          <b className="text-[#2C2C2A]">
            {report.rows.length.toLocaleString("en-US")}
          </b>{" "}
          個科目（樹狀；<b className="text-[#2C2C2A]">{activeCount}</b> 個有餘額）
        </span>
      </div>

      {/* Table — 樹狀，不分頁、不可排序（保持 pre-order） */}
      <DataGrid
        columns={columns}
        data={report.rows}
        rowKey={(r) => r.id}
        persistKey="admin/accounting/reports/trial-balance"
        exportFileName={`trial-balance-${report.as_of}`}
        emptyMessage="沒有科目資料"
        disabled={isPending}
      />

      {/* Totals strip（DataGrid 無內建總計列，於外層渲染） */}
      <div className="flex justify-end">
        <div className="inline-flex items-stretch border border-[#EEECE6] rounded-lg overflow-hidden text-[12.5px]">
          <div className="px-4 py-2 bg-[#F8F7F4] font-semibold text-[#2C2C2A]">
            合計
          </div>
          <div className="px-4 py-2 text-right font-mono tabular-nums border-l border-[#EEECE6] min-w-[150px]">
            <span className="text-[11px] text-[#9A9890] mr-2">借</span>
            {fmtMoney(report.grand_total_debit)}
          </div>
          <div className="px-4 py-2 text-right font-mono tabular-nums border-l border-[#EEECE6] min-w-[150px]">
            <span className="text-[11px] text-[#9A9890] mr-2">貸</span>
            {fmtMoney(report.grand_total_credit)}
          </div>
        </div>
      </div>
    </main>
  );
}
