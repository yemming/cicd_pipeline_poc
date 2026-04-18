"use client";

import { useMemo, useState } from "react";
import type { Product, ProductCategory } from "@/lib/pos/types";
import { formatTWD } from "@/lib/pos/format";
import { useCart } from "./cart-context";

type Filter = "全部" | ProductCategory;
const FILTERS: Filter[] = ["全部", "新車", "精品", "零件", "耗材", "服務", "代辦費用"];

const CAT_BADGE: Record<ProductCategory, string> = {
  新車: "bg-rose-50 text-rose-700",
  精品: "bg-violet-50 text-violet-700",
  零件: "bg-sky-50 text-sky-700",
  耗材: "bg-amber-50 text-amber-700",
  服務: "bg-teal-50 text-teal-700",
  代辦費用: "bg-emerald-50 text-emerald-700",
};

export function ProductGrid({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState<Filter>("全部");
  const [q, setQ] = useState("");
  const { add, lines } = useCart();

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products.filter((p) => {
      if (filter !== "全部" && p.category !== filter) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode ?? "").includes(query)
      );
    });
  }, [products, filter, q]);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Search + filter bar */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="relative">
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
        <div className="flex gap-2">
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

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <span className="material-symbols-outlined text-5xl mb-2">search_off</span>
            <p className="text-sm">找不到相符商品</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const inCart = lines.find((l) => l.product.id === p.id)?.qty ?? 0;
              const soldOut = p.stockQty === 0;
              const low = p.stockQty > 0 && p.stockQty <= p.lowStockAt;
              const reachedMax = inCart >= p.stockQty;
              return (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  disabled={soldOut || reachedMax}
                  className={`group relative text-left bg-white border rounded-xl p-3 min-h-[120px] transition-all ${
                    soldOut || reachedMax
                      ? "border-slate-100 opacity-50 cursor-not-allowed"
                      : "border-slate-200 hover:border-indigo-400 hover:shadow-md active:scale-[0.98]"
                  }`}
                >
                  {/* top row: category + stock chip */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${CAT_BADGE[p.category]}`}>
                      {p.category}
                    </span>
                    {low && !soldOut && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">
                        僅剩 {p.stockQty}
                      </span>
                    )}
                    {soldOut && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">
                        缺貨
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 mb-1">
                    {p.name}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono mb-2">{p.sku}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-base font-bold text-indigo-700">
                      {formatTWD(p.unitPrice)}
                    </span>
                    {inCart > 0 && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        × {inCart}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
