"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { DataTable, type Column } from "@/components/pos/data-table";
import { Button } from "@/components/pos/button";

type Receipt = {
  id: string;
  code: string;
  date: string;
  supplier: string;
  itemCount: number;
  value: number;
  status: "pending" | "received" | "partial";
};

const recs: Receipt[] = [
  { id: "r1", code: "GR-20260416-001", date: "2026-04-16 09:20", supplier: "Ducati 台灣總代理", itemCount: 8, value: 1280000, status: "pending" },
  { id: "r2", code: "GR-20260415-002", date: "2026-04-15 14:50", supplier: "AGV 台灣", itemCount: 3, value: 128000, status: "received" },
  { id: "r3", code: "GR-20260415-001", date: "2026-04-15 10:15", supplier: "Termignoni Italy", itemCount: 2, value: 256000, status: "partial" },
  { id: "r4", code: "GR-20260414-001", date: "2026-04-14 11:30", supplier: "Pirelli 台灣", itemCount: 12, value: 168000, status: "received" },
  { id: "r5", code: "GR-20260413-001", date: "2026-04-13 16:00", supplier: "Rizoma Italy", itemCount: 6, value: 92000, status: "received" },
];

export default function ReceivingPage() {
  const columns: Column<Receipt>[] = [
    { key: "code", header: "收貨單號", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "date", header: "收貨時間", render: (r) => <span className="text-xs text-slate-600">{r.date}</span> },
    { key: "supplier", header: "供應商", render: (r) => <span className="text-sm">{r.supplier}</span> },
    { key: "items", header: "品項數", align: "right", render: (r) => <span className="tabular-nums">{r.itemCount}</span> },
    { key: "value", header: "貨值", align: "right", render: (r) => <span className="font-bold tabular-nums">NT${r.value.toLocaleString()}</span> },
    { key: "status", header: "狀態", render: (r) =>
      r.status === "pending" ? <Badge tone="warning" icon="schedule">待驗收</Badge>
      : r.status === "partial" ? <Badge tone="info" icon="pie_chart">部分入庫</Badge>
      : <Badge tone="success" icon="check">已入庫</Badge>
    },
    { key: "action", header: "", render: () => <button className="text-xs text-indigo-600 font-medium">驗收</button> },
  ];

  return (
    <PosPageShell title="收貨入庫" subtitle="供應商送貨驗收與入庫作業" actions={<Button icon="add">新增收貨單</Button>}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本月收貨單" value={28} icon="move_to_inbox" tone="indigo" />
        <KpiCard label="待驗收" value={1} icon="hourglass" tone="amber" />
        <KpiCard label="本月入庫貨值" value="NT$4,850,000" icon="monetization_on" tone="emerald" />
        <KpiCard label="驗收準確率" value="99.7%" icon="verified" tone="sky" />
      </div>
      <Card title="近期收貨單" icon="history" padded={false}>
        <DataTable columns={columns} data={recs} rowKey={(r) => r.id} />
      </Card>
    </PosPageShell>
  );
}
