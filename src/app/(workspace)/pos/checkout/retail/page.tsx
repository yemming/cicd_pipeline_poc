"use client";

import { useState } from "react";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { Badge } from "@/components/pos/badge";
import { useCart } from "@/components/pos/cart-context";
import { skus, skuCategoryMeta, searchSkus } from "@/lib/pos/pos-mock-skus";
import { formatNTD, newId } from "@/lib/pos/format";
import type { SkuCategory } from "@/lib/pos/pos-types";

export default function RetailCheckoutPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<SkuCategory | "all">("all");
  const { addLine, setMode } = useCart();

  const filtered = (q ? searchSkus(q) : skus).filter(
    (s) => cat === "all" || s.category === cat,
  );

  function add(id: string) {
    setMode("retail");
    const s = skus.find((x) => x.id === id)!;
    addLine({
      id: newId("line"),
      type: "accessory",
      refId: s.id,
      name: s.name,
      quantity: 1,
      unitPrice: s.price,
      subtotal: s.price,
      taxable: true,
    });
  }

  const categories: (SkuCategory | "all")[] = ["all", "apparel", "helmet", "accessory", "parts", "lifestyle"];

  return (
    <CheckoutShell
      title="精品零售"
      subtitle="掃碼 · 搜尋 · 快速加入"
      step="items"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "結帳中心", href: "/pos/checkout" },
        { label: "精品零售" },
      ]}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            qr_code_scanner
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="掃 barcode 或輸入品名 / 料號 / 品牌"
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>
        <Badge tone="brand" icon="search">{filtered.length} 項</Badge>
      </div>

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              cat === c
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
            }`}
          >
            {c === "all" ? "全部" : skuCategoryMeta[c].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((s) => {
          const meta = skuCategoryMeta[s.category];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => add(s.id)}
              className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-300 transition-all"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
                >
                  <span className="material-symbols-outlined text-[22px]">{meta.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <Badge tone="neutral">{meta.label}</Badge>
                  <p className="font-medium text-sm text-slate-900 leading-tight mt-1 line-clamp-2">
                    {s.name}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 tabular-nums">{s.code}</span>
                    <span className="font-bold text-indigo-600 tabular-nums">
                      {formatNTD(s.price)}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </CheckoutShell>
  );
}
