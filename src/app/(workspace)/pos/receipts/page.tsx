"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { DataTable, type Column } from "@/components/pos/data-table";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { getCustomer } from "@/lib/pos/pos-mock-customers";
import { formatNTD, formatTaiwanDate } from "@/lib/pos/format";

export default function ReceiptsPage() {
  const withReceipt = transactions.filter((t) => t.feeTotal > 0 && t.receiptNo);
  const total = withReceipt.reduce((a, b) => a + b.feeTotal, 0);

  type Row = (typeof withReceipt)[number];
  const columns: Column<Row>[] = [
    { key: "no", header: "收據號碼", render: (r) => <span className="font-mono tabular-nums text-xs">{r.receiptNo}</span> },
    { key: "date", header: "開立日期", render: (r) => <span className="text-xs text-slate-600">{formatTaiwanDate(r.date)}</span>, sortValue: (r) => r.date },
    { key: "customer", header: "交車客戶", render: (r) => {
      const c = r.customerId ? getCustomer(r.customerId) : undefined;
      return <span className="text-sm">{c?.name ?? "-"}</span>;
    }},
    { key: "items", header: "代辦項目", render: (r) => <span className="text-xs text-slate-500">{r.fees.map((f) => f.name).join("・")}</span> },
    { key: "feeTotal", header: "收據金額", align: "right", render: (r) => <span className="font-bold tabular-nums">{formatNTD(r.feeTotal)}</span>, sortValue: (r) => r.feeTotal },
    { key: "status", header: "", render: () => <Badge tone="warning" icon="article">代收代付</Badge> },
  ];

  return (
    <PosPageShell title="收據管理" subtitle="代辦費用 / 非稅收入收據">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="本月收據張數" value={withReceipt.length} icon="article" tone="amber" />
        <KpiCard label="本月代收金額" value={formatNTD(total)} icon="savings" tone="indigo" />
        <KpiCard label="平均單張" value={formatNTD(Math.round(total / Math.max(1, withReceipt.length)))} icon="calculate" tone="emerald" />
      </div>

      <Card title="收據列表" icon="receipt_long" padded={false}>
        <DataTable
          columns={columns}
          data={withReceipt.slice(0, 30)}
          rowKey={(r) => r.id}
          searchable
          searchFields={(r) => {
            const c = r.customerId ? getCustomer(r.customerId) : undefined;
            return `${r.receiptNo} ${c?.name ?? ""}`;
          }}
        />
      </Card>

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
        <span className="material-symbols-outlined">info</span>
        <div>
          <p className="font-bold mb-0.5">收據與發票的差異</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            收據是為代收代付（規費、汽燃費、牌照費）而開，不屬公司營收、不課營業稅；發票則為實際銷售金額，需上傳財政部。
          </p>
        </div>
      </div>
    </PosPageShell>
  );
}
