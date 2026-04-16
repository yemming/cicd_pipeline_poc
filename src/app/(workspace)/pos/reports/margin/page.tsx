"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { DataTable, type Column } from "@/components/pos/data-table";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { skus } from "@/lib/pos/pos-mock-skus";
import { formatNTD } from "@/lib/pos/format";

export default function MarginReportPage() {
  const totalRev = transactions.reduce((a, b) => a + b.total, 0);
  const totalMargin = transactions.reduce((a, b) => a + (b.margin ?? 0), 0);
  const marginRate = totalMargin / totalRev;

  type SkuMargin = {
    id: string;
    code: string;
    name: string;
    price: number;
    cost: number;
    rate: number;
    qty: number;
  };

  const skuMargins: SkuMargin[] = skus.map((s, i) => {
    const qty = Math.max(1, (i * 7 + 3) % 20);
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      price: s.price,
      cost: s.cost,
      rate: (s.price - s.cost) / s.price,
      qty,
    };
  });

  const lowMargin = skuMargins.filter((s) => s.rate < 0.35);

  const columns: Column<SkuMargin>[] = [
    { key: "code", header: "料號", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "品名", render: (r) => <span className="text-sm">{r.name}</span> },
    { key: "price", header: "售價", align: "right", render: (r) => <span className="tabular-nums">{formatNTD(r.price)}</span> },
    { key: "cost", header: "成本", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{formatNTD(r.cost)}</span> },
    { key: "unitMargin", header: "單件毛利", align: "right", render: (r) => <span className="tabular-nums font-bold text-emerald-600">{formatNTD(r.price - r.cost)}</span> },
    { key: "rate", header: "毛利率", align: "right", render: (r) => {
      const warn = r.rate < 0.35;
      return <Badge tone={warn ? "warning" : r.rate >= 0.5 ? "success" : "brand"}>{(r.rate * 100).toFixed(1)}%</Badge>;
    }, sortValue: (r) => r.rate },
    { key: "qty", header: "近月售出", align: "right", render: (r) => <span className="tabular-nums">{r.qty}</span> },
  ];

  return (
    <PosPageShell title="毛利報表" subtitle="AI 毛利警示 · 自動抓低於門檻的品項">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="期間毛利" value={formatNTD(totalMargin)} icon="monetization_on" tone="emerald" />
        <KpiCard label="平均毛利率" value={`${(marginRate * 100).toFixed(1)}%`} icon="percent" tone="indigo" />
        <KpiCard label="高毛利品項" value={skuMargins.filter(s => s.rate >= 0.5).length} icon="star" tone="amber" subtitle="≥50%" />
        <KpiCard label="低毛利警示" value={lowMargin.length} icon="warning" tone="rose" subtitle="<35% 需檢討" />
      </div>

      {lowMargin.length > 0 && (
        <Card title="⚠️ 低毛利警示" icon="warning" className="mb-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800 mb-3">
              AI 偵測到 <span className="font-bold tabular-nums">{lowMargin.length}</span> 項商品毛利率低於 35% 門檻，建議檢討定價或成本。
            </p>
            <div className="flex flex-wrap gap-2">
              {lowMargin.slice(0, 5).map((s) => (
                <Badge key={s.id} tone="warning">
                  {s.name} ({(s.rate * 100).toFixed(0)}%)
                </Badge>
              ))}
              {lowMargin.length > 5 && (
                <Badge tone="neutral">+{lowMargin.length - 5} 項</Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card title="品項毛利明細" icon="list" padded={false}>
        <DataTable
          columns={columns}
          data={skuMargins}
          rowKey={(r) => r.id}
          searchable
          searchFields={(r) => `${r.code} ${r.name}`}
        />
      </Card>
    </PosPageShell>
  );
}
