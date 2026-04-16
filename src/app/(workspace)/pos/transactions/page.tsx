"use client";

import Link from "next/link";
import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { DataTable, type Column } from "@/components/pos/data-table";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { getCustomer, getStore } from "@/lib/pos/pos-mock-customers";
import { formatNTD, formatTaiwanDate } from "@/lib/pos/format";
import type { Transaction } from "@/lib/pos/pos-types";

export default function TransactionsPage() {
  const list = transactions.slice(0, 60);
  const total = list.reduce((a, b) => a + b.total, 0);

  const modeIcon = (m: string) =>
    m === "vehicle" ? "two_wheeler" : m === "service" ? "build" : "shopping_bag";
  const modeLabel = (m: string) =>
    m === "vehicle" ? "車輛" : m === "service" ? "維修" : "精品";

  const columns: Column<Transaction>[] = [
    { key: "code", header: "交易編號", render: (r) => <span className="font-mono text-xs tabular-nums">{r.code}</span>, sortValue: (r) => r.date },
    { key: "date", header: "日期", render: (r) => <span className="text-xs text-slate-600">{formatTaiwanDate(r.date, true)}</span>, sortValue: (r) => r.date },
    { key: "mode", header: "類型", render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span className="material-symbols-outlined text-[16px] text-indigo-500">{modeIcon(r.mode)}</span>
        {modeLabel(r.mode)}
      </span>
    )},
    { key: "store", header: "門店", render: (r) => <span className="text-xs text-slate-500">{getStore(r.store).shortName}</span> },
    { key: "customer", header: "客戶", render: (r) => {
      const c = r.customerId ? getCustomer(r.customerId) : undefined;
      return <span className="text-sm">{c?.name ?? "零售"}</span>;
    }},
    { key: "clerk", header: "經手人", render: (r) => <span className="text-xs text-slate-500">{r.clerk}</span> },
    { key: "total", header: "金額", align: "right", render: (r) => <span className="font-bold tabular-nums">{formatNTD(r.total)}</span>, sortValue: (r) => r.total },
    { key: "status", header: "狀態", render: (r) => r.status === "refunded" ? <Badge tone="danger">已退貨</Badge> : <Badge tone="success">完成</Badge> },
  ];

  return (
    <PosPageShell title="交易記錄" subtitle={`近 30 天共 ${transactions.length} 筆`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="顯示筆數" value={list.length} icon="list" tone="indigo" />
        <KpiCard label="總金額" value={formatNTD(total)} icon="monetization_on" tone="emerald" />
        <KpiCard label="平均單筆" value={formatNTD(Math.round(total / list.length))} icon="functions" tone="amber" />
        <KpiCard label="已退貨" value={list.filter(t => t.status === "refunded").length} icon="assignment_return" tone="rose" />
      </div>

      <Card title="最近交易" icon="history" padded={false} action={
        <Link href="/pos/returns" className="text-xs text-indigo-600 hover:underline">申請退貨 →</Link>
      }>
        <DataTable
          columns={columns}
          data={list}
          rowKey={(r) => r.id}
          searchable
          searchFields={(r) => {
            const c = r.customerId ? getCustomer(r.customerId) : undefined;
            return `${r.code} ${c?.name ?? ""} ${r.clerk} ${r.lines.map(l => l.name).join(" ")}`;
          }}
        />
      </Card>
    </PosPageShell>
  );
}
