"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { skus, skuCategoryMeta } from "@/lib/pos/pos-mock-skus";
import { inventory } from "@/lib/pos/pos-mock-inventory";
import { stores } from "@/lib/pos/pos-mock-customers";
import { formatNTD } from "@/lib/pos/format";

export default function InventoryReportPage() {
  const totalValue = skus.reduce((a, b) => {
    const stock = inventory.filter((i) => i.sku === b.id).reduce((x, y) => x + y.stock, 0);
    return a + stock * b.cost;
  }, 0);

  const deadStock = skus.filter((s) => {
    const avg = inventory.filter((i) => i.sku === s.id).reduce((a, b) => a + b.avgDailySales, 0) / stores.length;
    return avg < 0.3;
  });

  const turnover = 5.2;

  const byCat = Object.entries(skuCategoryMeta).map(([k, meta]) => {
    const catSkus = skus.filter((s) => s.category === k);
    const value = catSkus.reduce((a, b) => {
      const stock = inventory.filter((i) => i.sku === b.id).reduce((x, y) => x + y.stock, 0);
      return a + stock * b.cost;
    }, 0);
    return { cat: k, label: meta.label, color: meta.color, value, count: catSkus.length };
  });
  const maxCatValue = Math.max(...byCat.map((c) => c.value));

  return (
    <PosPageShell title="庫存報表" subtitle="庫存價值 · 周轉率 · 呆滯品分析">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="集團總庫存值" value={formatNTD(totalValue)} icon="inventory_2" tone="indigo" />
        <KpiCard label="品項數" value={skus.length} icon="qr_code" tone="emerald" />
        <KpiCard label="年周轉率" value={`${turnover}x`} icon="autorenew" tone="amber" delta="業界平均 3.8x" deltaTone="positive" />
        <KpiCard label="呆滯品 (>60 天)" value={deadStock.length} icon="trending_down" tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="分類庫存價值" icon="pie_chart">
          <div className="space-y-3">
            {byCat.sort((a, b) => b.value - a.value).map((c) => (
              <div key={c.cat}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.label}
                    <Badge tone="neutral">{c.count} 項</Badge>
                  </span>
                  <span className="font-bold tabular-nums">{formatNTD(c.value)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(c.value / maxCatValue) * 100}%`, backgroundColor: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="呆滯品建議處置" icon="auto_delete">
          <div className="space-y-2">
            {deadStock.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-[10px] text-amber-700">建議：8 折清倉或退回供應商</p>
                </div>
                <Badge tone="warning">{formatNTD(s.cost)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PosPageShell>
  );
}
