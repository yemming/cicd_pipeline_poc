"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { formatTWD, formatDate, formatNumber } from "@/lib/pos/format";
import type { LedgerEntry, LedgerCategory } from "@/lib/pos/types";
import { PAYMENT_LABEL } from "@/lib/pos/types";
import { ExpenseVoucherModal } from "./expense-voucher-modal";

const EXPENSE_CATEGORIES: LedgerCategory[] = [
  "水電",
  "薪資",
  "雜費",
  "整備費用",
  "其他",
];

type EntryFilter = "all" | "income" | "expense";

export function LedgerView({ initialEntries }: { initialEntries: LedgerEntry[] }) {
  useSetPageHeader({
    breadcrumb: [{ label: "POS 收銀", href: "/pos" }, { label: "帳務（日記帳）" }],
  });

  const [entries, setEntries] = useState<LedgerEntry[]>(initialEntries);
  const [monthOffset, setMonthOffset] = useState(0); // 0 = 本月, -1 = 上月
  const [filter, setFilter] = useState<EntryFilter>("all");
  const [voucherOpen, setVoucherOpen] = useState(false);

  const monthKey = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [monthOffset]);

  const monthEntries = useMemo(() => {
    return entries
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === monthKey.year && d.getMonth() === monthKey.month;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries, monthKey]);

  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of monthEntries) {
      if (e.type === "income") income += e.amount;
      else expense += e.amount;
    }
    return { income, expense, net: income - expense, count: monthEntries.length };
  }, [monthEntries]);

  const filtered = useMemo(() => {
    if (filter === "all") return monthEntries;
    return monthEntries.filter((e) => e.type === filter);
  }, [monthEntries, filter]);

  function handleAddVoucher(entry: Omit<LedgerEntry, "id">) {
    const id = `l${Date.now().toString(36)}`;
    setEntries((prev) => [{ ...entry, id }, ...prev]);
    setVoucherOpen(false);
  }

  function handleExport() {
    const header = ["日期", "類型", "分類", "金額", "收款方式", "說明", "關聯單號"];
    const rows = monthEntries.map((e) => [
      new Date(e.date).toLocaleDateString("zh-TW"),
      e.type === "income" ? "收入" : "支出",
      e.category,
      String(e.amount),
      e.paymentMethod ? PAYMENT_LABEL[e.paymentMethod] : "",
      e.description,
      e.refId ?? "",
    ]);
    // UTF-8 BOM so Excel opens Chinese correctly
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileDate = `${monthKey.year}${String(monthKey.month + 1).padStart(2, "0")}`;
    a.href = url;
    a.download = `日記帳_${fileDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const monthLabel = `${monthKey.year} / ${String(monthKey.month + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="收入" value={formatTWD(stats.income)} tone="ok" />
        <StatCard label="支出" value={formatTWD(stats.expense)} tone="danger" />
        <StatCard
          label="淨收"
          value={formatTWD(stats.net)}
          tone={stats.net >= 0 ? "ok" : "danger"}
        />
        <StatCard label="筆數" value={formatNumber(stats.count)} tone="neutral" />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
            aria-label="上一個月"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <div className="px-3 text-sm font-bold text-slate-800 tabular-nums min-w-[90px] text-center">
            {monthLabel}
          </div>
          <button
            onClick={() => setMonthOffset((o) => Math.min(o + 1, 0))}
            disabled={monthOffset >= 0}
            className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            aria-label="下一個月"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
          <div className="ml-2 flex gap-1 bg-slate-100 rounded-lg p-1">
            {(["all", "income", "expense"] as EntryFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-8 px-3 rounded-md text-xs font-semibold ${
                  filter === f ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"
                }`}
              >
                {f === "all" ? "全部" : f === "income" ? "收入" : "支出"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setVoucherOpen(true)}
            className="h-10 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-700 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增費用傳票
          </button>
          <button
            onClick={handleExport}
            disabled={monthEntries.length === 0}
            className="h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-sm font-bold text-white flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            匯出月報（.csv / Excel 相容）
          </button>
        </div>
      </div>

      {/* Ledger table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <Th>日期</Th>
                <Th>類型</Th>
                <Th>分類</Th>
                <Th>說明</Th>
                <Th>收款方式</Th>
                <Th align="right">金額</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-5xl mb-2 block">inbox</span>
                    本月尚無帳務紀錄
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{formatDate(e.date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                          e.type === "income"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {e.type === "income" ? "收入" : "支出"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-semibold">{e.category}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {e.description}
                      {e.refId && (
                        <span className="ml-2 text-[10px] font-mono text-slate-400">
                          {e.refId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">
                      {e.paymentMethod ? PAYMENT_LABEL[e.paymentMethod] : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">
                      <span
                        className={e.type === "income" ? "text-emerald-700" : "text-rose-700"}
                      >
                        {e.type === "expense" ? "-" : ""}
                        {formatTWD(e.amount)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {voucherOpen && (
        <ExpenseVoucherModal
          categories={EXPENSE_CATEGORIES}
          onClose={() => setVoucherOpen(false)}
          onSubmit={handleAddVoucher}
        />
      )}
    </div>
  );
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "danger" | "neutral";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
      : tone === "danger"
        ? "text-rose-700 bg-rose-50 border-rose-100"
        : "text-slate-800 bg-white border-slate-200";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}
