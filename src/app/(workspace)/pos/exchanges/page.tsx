"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { DataTable, type Column } from "@/components/pos/data-table";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { getCustomer } from "@/lib/pos/pos-mock-customers";
import { formatNTD, formatTaiwanDate } from "@/lib/pos/format";

type Ex = {
  id: string;
  code: string;
  date: string;
  customer: string;
  from: string;
  to: string;
  diff: number;
  status: "pending" | "done";
};

const mockExchanges: Ex[] = [
  { id: "ex1", code: "EX-20260415-001", date: "2026-04-15T14:20:00+08:00", customer: "黃詩涵", from: "AGV K6 L 尺寸", to: "AGV K6 M 尺寸", diff: 0, status: "done" },
  { id: "ex2", code: "EX-20260413-001", date: "2026-04-13T11:05:00+08:00", customer: "陳子翔", from: "Dainese 皮衣 52", to: "Dainese 皮衣 54", diff: 2000, status: "done" },
  { id: "ex3", code: "EX-20260412-002", date: "2026-04-12T15:30:00+08:00", customer: "林雅婷", from: "機車雨衣 紅", to: "機車雨衣 黑", diff: 0, status: "pending" },
];

export default function ExchangesPage() {
  const columns: Column<Ex>[] = [
    { key: "code", header: "換貨單號", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "date", header: "建立時間", render: (r) => <span className="text-xs text-slate-600">{formatTaiwanDate(r.date, true)}</span> },
    { key: "customer", header: "客戶", render: (r) => <span className="text-sm">{r.customer}</span> },
    { key: "from", header: "原商品", render: (r) => <span className="text-xs text-slate-500">{r.from}</span> },
    { key: "to", header: "換成", render: (r) => <span className="text-xs text-indigo-600">{r.to}</span> },
    { key: "diff", header: "差額", align: "right", render: (r) => <span className="tabular-nums">{r.diff === 0 ? "—" : formatNTD(r.diff)}</span> },
    { key: "status", header: "狀態", render: (r) => r.status === "done" ? <Badge tone="success">已完成</Badge> : <Badge tone="warning">處理中</Badge> },
  ];

  return (
    <PosPageShell title="換貨" subtitle="不同尺寸 / 顏色 / 型號互換" actions={<Button icon="add">新增換貨單</Button>}>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="本月換貨件數" value={mockExchanges.length} icon="swap_horiz" tone="indigo" />
        <KpiCard label="平均處理時間" value="42 min" icon="schedule" tone="sky" />
        <KpiCard label="不補差額率" value="68%" icon="trending_up" tone="emerald" />
      </div>
      <Card title="換貨記錄" icon="history" padded={false}>
        <DataTable columns={columns} data={mockExchanges} rowKey={(r) => r.id} />
      </Card>
    </PosPageShell>
  );
}
