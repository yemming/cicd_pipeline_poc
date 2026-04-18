"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { formatTWD, formatNumber } from "@/lib/pos/format";
import type { Product, ProductCategory } from "@/lib/pos/types";

type Filter = "全部" | ProductCategory | "低庫存";
const FILTERS: Filter[] = ["全部", "新車", "精品", "零件", "耗材", "服務", "代辦費用", "低庫存"];

const CAT_BADGE: Record<ProductCategory, string> = {
  新車: "bg-rose-50 text-rose-700",
  精品: "bg-violet-50 text-violet-700",
  零件: "bg-sky-50 text-sky-700",
  耗材: "bg-amber-50 text-amber-700",
  服務: "bg-teal-50 text-teal-700",
  代辦費用: "bg-emerald-50 text-emerald-700",
};

export function ProductsTable({ products }: { products: Product[] }) {
  useSetPageHeader({
    breadcrumb: [{ label: "POS 收銀", href: "/pos" }, { label: "商品與庫存" }],
  });

  const [filter, setFilter] = useState<Filter>("全部");
  const [q, setQ] = useState("");

  const stats = useMemo(() => {
    let total = 0;
    let low = 0;
    let sold = 0;
    let value = 0;
    for (const p of products) {
      total++;
      if (p.stockQty === 0) sold++;
      else if (p.stockQty <= p.lowStockAt) low++;
      value += p.stockQty * p.unitPrice;
    }
    return { total, low, sold, value };
  }, [products]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === "低庫存") {
        if (p.stockQty > p.lowStockAt) return false;
      } else if (filter !== "全部") {
        if (p.category !== filter) return false;
      }
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode ?? "").includes(query)
      );
    });
  }, [products, filter, q]);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="SKU 總數" value={formatNumber(stats.total)} tone="neutral" />
        <StatCard label="低庫存" value={formatNumber(stats.low)} tone="warn" />
        <StatCard label="缺貨" value={formatNumber(stats.sold)} tone="danger" />
        <StatCard label="庫存總值" value={formatTWD(stats.value)} tone="neutral" />
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
              search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋品名 / SKU / 條碼"
              className="w-full h-11 pl-10 pr-4 bg-slate-50 rounded-lg border border-transparent focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-9 px-4 rounded-full text-xs font-semibold transition-all ${
                  filter === f
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <Th>SKU</Th>
                <Th>品名</Th>
                <Th>分類</Th>
                <Th align="right">單價</Th>
                <Th align="right">庫存</Th>
                <Th>狀態</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-5xl mb-2 block">search_off</span>
                    找不到相符商品
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const soldOut = p.stockQty === 0;
                  const low = !soldOut && p.stockQty <= p.lowStockAt;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {p.sku}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        {p.barcode && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            條碼 {p.barcode}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${CAT_BADGE[p.category]}`}
                        >
                          {p.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">
                        {formatTWD(p.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">
                        <span
                          className={
                            soldOut
                              ? "text-rose-600"
                              : low
                                ? "text-orange-600"
                                : "text-slate-800"
                          }
                        >
                          {p.stockQty}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">
                          / 警 {p.lowStockAt}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {soldOut ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700">
                            <span className="material-symbols-outlined text-[14px]">
                              block
                            </span>
                            缺貨
                          </span>
                        ) : low ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-orange-50 text-orange-700">
                            <span className="material-symbols-outlined text-[14px]">
                              warning
                            </span>
                            低庫存
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                            <span className="material-symbols-outlined text-[14px]">
                              check_circle
                            </span>
                            正常
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
  tone: "neutral" | "warn" | "danger";
}) {
  const toneCls =
    tone === "warn"
      ? "text-orange-700 bg-orange-50 border-orange-100"
      : tone === "danger"
        ? "text-rose-700 bg-rose-50 border-rose-100"
        : "text-slate-800 bg-white border-slate-200";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">
        {label}
      </p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}
