"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { DataTable, type Column } from "@/components/pos/data-table";

type Cycle = {
  id: string;
  code: string;
  period: string;
  scope: string;
  checkedBy: string;
  skuCount: number;
  variance: number;
  accuracy: number;
  status: "done" | "in_progress";
};

const cycles: Cycle[] = [
  { id: "1", code: "ST-2026Q1", period: "2026-03-28 ~ 31", scope: "全品項", checkedBy: "李宛真・張志豪", skuCount: 240, variance: 3, accuracy: 98.8, status: "done" },
  { id: "2", code: "ST-2026W14", period: "2026-04-07", scope: "安全帽", checkedBy: "王雅雯", skuCount: 12, variance: 0, accuracy: 100, status: "done" },
  { id: "3", code: "ST-2026W15", period: "2026-04-14", scope: "排氣/碳纖維", checkedBy: "林俊宏", skuCount: 18, variance: 1, accuracy: 94.4, status: "done" },
  { id: "4", code: "ST-2026W16", period: "2026-04-16 進行中", scope: "所有精品", checkedBy: "陳美珊", skuCount: 85, variance: 0, accuracy: 0, status: "in_progress" },
];

export default function StocktakePage() {
  const columns: Column<Cycle>[] = [
    { key: "code", header: "盤點單號", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "period", header: "期間", render: (r) => <span className="text-xs text-slate-600">{r.period}</span> },
    { key: "scope", header: "範圍", render: (r) => <span className="text-sm">{r.scope}</span> },
    { key: "checked", header: "盤點員", render: (r) => <span className="text-xs text-slate-500">{r.checkedBy}</span> },
    { key: "sku", header: "品項數", align: "right", render: (r) => <span className="tabular-nums">{r.skuCount}</span> },
    { key: "variance", header: "差異", align: "right", render: (r) =>
      <span className={`tabular-nums font-bold ${r.variance === 0 ? "text-emerald-600" : "text-amber-600"}`}>{r.variance}</span>
    },
    { key: "accuracy", header: "準確率", align: "right", render: (r) => r.accuracy > 0 ? (
      <span className={`tabular-nums ${r.accuracy >= 99 ? "text-emerald-600" : r.accuracy >= 95 ? "text-amber-600" : "text-rose-600"}`}>
        {r.accuracy.toFixed(1)}%
      </span>
    ) : <span className="text-xs text-slate-400">—</span> },
    { key: "status", header: "", render: (r) => r.status === "done" ? <Badge tone="success">完成</Badge> : <Badge tone="warning">進行中</Badge> },
  ];

  return (
    <PosPageShell title="庫存盤點" subtitle="週期 / 循環 / 專項盤點" actions={<Button icon="add">新增盤點</Button>}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本季盤點次數" value={cycles.length} icon="fact_check" tone="indigo" />
        <KpiCard label="平均準確率" value="97.8%" icon="verified" tone="emerald" />
        <KpiCard label="累計差異件數" value={cycles.reduce((a, b) => a + b.variance, 0)} icon="trending_down" tone="amber" />
        <KpiCard label="下次循環" value="4/21" icon="schedule" tone="sky" subtitle="精品區 (週一)" />
      </div>
      <Card title="盤點記錄" icon="history" padded={false}>
        <DataTable columns={columns} data={cycles} rowKey={(r) => r.id} />
      </Card>
    </PosPageShell>
  );
}
