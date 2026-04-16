"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { DataTable, type Column } from "@/components/pos/data-table";
import { skus, skuCategoryMeta } from "@/lib/pos/pos-mock-skus";
import { formatNTD } from "@/lib/pos/format";
import type { Sku } from "@/lib/pos/pos-types";

export default function SkuMasterPage() {
  const columns: Column<Sku>[] = [
    { key: "code", header: "料號", render: (r) => <span className="font-mono text-xs tabular-nums">{r.code}</span> },
    { key: "name", header: "品名", render: (r) => <span className="text-sm font-medium">{r.name}</span> },
    { key: "category", header: "類別", render: (r) => {
      const m = skuCategoryMeta[r.category];
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]" style={{ color: m.color }}>{m.icon}</span>
          <span className="text-xs">{m.label}</span>
        </span>
      );
    }},
    { key: "brand", header: "品牌", render: (r) => <span className="text-xs text-slate-500">{r.brand ?? "—"}</span> },
    { key: "price", header: "售價", align: "right", render: (r) => <span className="tabular-nums font-bold">{formatNTD(r.price)}</span>, sortValue: (r) => r.price },
    { key: "cost", header: "成本", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{formatNTD(r.cost)}</span> },
    { key: "margin", header: "毛利率", align: "right", render: (r) => {
      const m = (r.price - r.cost) / r.price;
      return <span className={`tabular-nums ${m >= 0.5 ? "text-emerald-600 font-bold" : m >= 0.35 ? "text-indigo-600" : "text-amber-600"}`}>{(m * 100).toFixed(0)}%</span>;
    }},
    { key: "fits", header: "適用車系", render: (r) => r.fitsFamilies ? (
      <div className="flex gap-1">
        {r.fitsFamilies.slice(0, 3).map(f => <Badge key={f} tone="neutral">{f}</Badge>)}
        {r.fitsFamilies.length > 3 && <span className="text-[10px] text-slate-400">+{r.fitsFamilies.length - 3}</span>}
      </div>
    ) : <span className="text-xs text-slate-400">—</span> },
  ];

  const total = skus.length;
  const byCategory = Object.entries(skuCategoryMeta).map(([k, meta]) => ({
    cat: k, label: meta.label, color: meta.color, icon: meta.icon,
    count: skus.filter(s => s.category === k).length,
  }));

  return (
    <PosPageShell title="SKU 品項主檔" subtitle="商品主檔 · 價格 · 分類 · 品牌" actions={<Button icon="add">新增品項</Button>}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label="總品項數" value={total} icon="qr_code" tone="indigo" />
        {byCategory.map(c => (
          <div key={c.cat} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">{c.label}</p>
                <p className="text-2xl font-extrabold font-display tabular-nums">{c.count}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${c.color}1A`, color: c.color }}>
                <span className="material-symbols-outlined text-[20px]">{c.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Card title="品項列表" icon="list" padded={false}>
        <DataTable
          columns={columns}
          data={skus}
          rowKey={(r) => r.id}
          searchable
          searchFields={(r) => `${r.code} ${r.name} ${r.brand ?? ""}`}
        />
      </Card>
    </PosPageShell>
  );
}
