"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { DataTable, type Column } from "@/components/pos/data-table";
import { Button } from "@/components/pos/button";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { getCustomer } from "@/lib/pos/pos-mock-customers";
import { formatNTD, formatTaiwanDate, formatInvoiceNo, formatVatId } from "@/lib/pos/format";

export default function InvoicesPage() {
  const withInvoice = transactions.filter((t) => t.invoiceNo);
  const total = withInvoice.reduce((a, b) => a + b.total, 0);
  const voided = withInvoice.filter((t) => t.status === "refunded").length;
  const b2b = withInvoice.filter((t) => {
    const c = t.customerId ? getCustomer(t.customerId) : undefined;
    return c?.vatId;
  }).length;

  type Row = (typeof withInvoice)[number];
  const columns: Column<Row>[] = [
    {
      key: "invoiceNo",
      header: "發票號碼",
      render: (r) => <span className="font-mono tabular-nums text-xs">{formatInvoiceNo(r.invoiceNo!)}</span>,
    },
    {
      key: "date",
      header: "開立日期",
      sortValue: (r) => r.date,
      render: (r) => <span className="text-xs text-slate-600">{formatTaiwanDate(r.date, true)}</span>,
    },
    {
      key: "buyer",
      header: "買方",
      render: (r) => {
        const c = r.customerId ? getCustomer(r.customerId) : undefined;
        return (
          <div>
            <p className="text-sm">{c?.name ?? "非買方"}</p>
            {c?.vatId && (
              <p className="text-[10px] text-slate-400 tabular-nums">統編 {formatVatId(c.vatId)}</p>
            )}
          </div>
        );
      },
    },
    {
      key: "type",
      header: "類型",
      render: (r) => {
        const c = r.customerId ? getCustomer(r.customerId) : undefined;
        return <Badge tone={c?.vatId ? "info" : "neutral"}>{c?.vatId ? "三聯式" : "二聯式"}</Badge>;
      },
    },
    {
      key: "total",
      header: "金額",
      align: "right",
      sortValue: (r) => r.total,
      render: (r) => <span className="font-bold tabular-nums">{formatNTD(r.total)}</span>,
    },
    {
      key: "status",
      header: "狀態",
      render: (r) =>
        r.status === "refunded" ? (
          <Badge tone="danger" icon="close">已作廢</Badge>
        ) : (
          <Badge tone="success" icon="send">已上傳</Badge>
        ),
    },
    {
      key: "action",
      header: "",
      render: () => (
        <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
          查看
        </button>
      ),
    },
  ];

  return (
    <PosPageShell
      title="發票管理"
      subtitle="電子發票即時上傳 · 作廢/折讓一鍵處理"
      actions={
        <>
          <Button variant="secondary" icon="file_download">匯出 XML</Button>
          <Button icon="cloud_upload">上傳財政部</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本月開立張數" value={withInvoice.length} icon="receipt" tone="indigo" />
        <KpiCard label="本月發票金額" value={formatNTD(total)} icon="monetization_on" tone="emerald" />
        <KpiCard label="三聯式 (B2B)" value={b2b} icon="corporate_fare" tone="sky" />
        <KpiCard label="作廢張數" value={voided} icon="cancel" tone="rose" />
      </div>

      <Card title="發票列表" icon="list" padded={false}>
        <DataTable
          columns={columns}
          data={withInvoice.slice(0, 30)}
          rowKey={(r) => r.id}
          searchable
          searchFields={(r) => {
            const c = r.customerId ? getCustomer(r.customerId) : undefined;
            return `${r.invoiceNo} ${c?.name ?? ""} ${c?.vatId ?? ""}`;
          }}
        />
      </Card>
    </PosPageShell>
  );
}
