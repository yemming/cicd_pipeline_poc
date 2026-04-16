"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { DataTable, type Column } from "@/components/pos/data-table";
import { skus } from "@/lib/pos/pos-mock-skus";
import { inventory } from "@/lib/pos/pos-mock-inventory";
import { formatNTD } from "@/lib/pos/format";

type Need = {
  id: string;
  code: string;
  name: string;
  stock: number;
  avg: number;
  daysLeft: number;
  suggest: number;
  cost: number;
};

const needs: Need[] = skus
  .map((s) => {
    const local = inventory.find((r) => r.sku === s.id && r.store === "tpe-flagship");
    if (!local) return null;
    const daysLeft = local.avgDailySales > 0 ? Math.round(local.stock / local.avgDailySales) : 999;
    if (daysLeft > 14) return null;
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      stock: local.stock,
      avg: local.avgDailySales,
      daysLeft,
      suggest: Math.max(3, Math.ceil(local.avgDailySales * 30)),
      cost: s.cost,
    };
  })
  .filter((x): x is Need => x !== null)
  .slice(0, 15);

export default function ReplenishPage() {
  const columns: Column<Need>[] = [
    { key: "code", header: "料號", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "品名", render: (r) => <span className="text-sm font-medium">{r.name}</span> },
    { key: "stock", header: "現有庫存", align: "right", render: (r) => <span className="tabular-nums font-bold">{r.stock}</span> },
    { key: "avg", header: "日均銷", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{r.avg.toFixed(1)}</span> },
    { key: "daysLeft", header: "預估售罄", align: "right", render: (r) => (
      <span className={`tabular-nums ${r.daysLeft <= 3 ? "text-rose-600 font-bold" : r.daysLeft <= 7 ? "text-amber-600" : "text-slate-600"}`}>
        {r.daysLeft > 99 ? "—" : `${r.daysLeft} 天`}
      </span>
    )},
    { key: "suggest", header: "建議補貨", align: "right", render: (r) => <span className="tabular-nums font-bold text-indigo-600">{r.suggest}</span> },
    { key: "subtotal", header: "成本", align: "right", render: (r) => <span className="tabular-nums text-xs text-slate-500">{formatNTD(r.cost * r.suggest)}</span> },
    { key: "action", header: "", render: () => <button className="text-xs text-indigo-600 font-medium">加入採購</button> },
  ];

  const totalCost = needs.reduce((a, b) => a + b.cost * b.suggest, 0);

  return (
    <PosPageShell title="補貨申請" subtitle="AI 依銷售速度自動建議補貨數量" actions={<Button icon="send">一鍵提交採購</Button>}>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="待補品項" value={needs.length} icon="inventory" tone="amber" />
        <KpiCard label="建議總採購額" value={formatNTD(totalCost)} icon="shopping_bag" tone="indigo" />
        <KpiCard label="緊急 (≤3 天)" value={needs.filter(n => n.daysLeft <= 3).length} icon="warning" tone="rose" />
      </div>
      <Card title="補貨建議" icon="auto_awesome" padded={false}>
        <DataTable columns={columns} data={needs} rowKey={(r) => r.id} />
      </Card>
      <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3 text-sm text-indigo-800">
        <span className="material-symbols-outlined">smart_toy</span>
        <div>
          <p className="font-bold mb-1">AI 建議邏輯</p>
          <p className="text-xs text-indigo-700 leading-relaxed">
            建議採購量 = 日均銷售量 × 30 天；保底 3 件避免缺貨。可一鍵覆核所有、微調單項後批次送出採購單。
          </p>
        </div>
      </div>
    </PosPageShell>
  );
}
