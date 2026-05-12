"use client";

import Link from "next/link";
import { useMemo } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { InternalSaleReceiptRow } from "@/domain/internal-sale-receipts";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-[#F2F2F2] text-[#6B6A68]",
  posted: "bg-[#EAF3DE] text-[#3B6D11]",
  void: "bg-[#FDECEA] text-[#CC0000]",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  posted: "已過帳",
  void: "已作廢",
};

export function InternalSaleBoard({
  rows,
  totalQty,
  totalAmount,
}: {
  rows: InternalSaleReceiptRow[];
  totalQty: number;
  totalAmount: number;
}) {
  const columns: DataGridColumn<InternalSaleReceiptRow>[] = useMemo(
    () => [
      {
        id: "doc_no",
        header: "入庫單號",
        width: 140,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/receipt/internal-sale/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:underline"
          >
            {r.doc_no}
          </Link>
        ),
        exportValue: (r) => r.doc_no,
        sortValue: (r) => r.doc_no,
      },
      {
        id: "source_label",
        header: "來源",
        width: 160,
        cell: (r) => (
          <span className="text-[12.5px] text-[#2C2C2A]">{r.source_label ?? "—"}</span>
        ),
        exportValue: (r) => r.source_label ?? "",
        sortValue: (r) => r.source_label ?? "",
      },
      {
        id: "warehouse_label",
        header: "入庫倉",
        width: 140,
        cell: (r) => (
          <span className="text-[12.5px] text-[#2C2C2A]">{r.warehouse_label ?? "—"}</span>
        ),
        exportValue: (r) => r.warehouse_label ?? "",
        sortValue: (r) => r.warehouse_label ?? "",
      },
      {
        id: "receipt_date",
        header: "入庫日",
        width: 120,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.receipt_date ?? "—"}
          </span>
        ),
        exportValue: (r) => r.receipt_date ?? "",
        sortValue: (r) => r.receipt_date ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
              STATUS_BADGE[r.status] ?? STATUS_BADGE.draft
            }`}
          >
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
        ),
        exportValue: (r) => STATUS_LABEL[r.status] ?? r.status,
        sortValue: (r) => r.status,
      },
      {
        id: "qty_total",
        header: "數量",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {r.qty_total.toLocaleString("en-US")}
          </span>
        ),
        exportValue: (r) => r.qty_total,
        sortValue: (r) => r.qty_total,
      },
      {
        id: "amount_total",
        header: "金額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {`NT$${Math.round(r.amount_total).toLocaleString("en-US")}`}
          </span>
        ),
        exportValue: (r) => Math.round(r.amount_total),
        sortValue: (r) => r.amount_total,
      },
      {
        id: "notes",
        header: "備註",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.notes ?? "—"}</span>
        ),
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">內售入庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          5.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {`內部調撥／集團內售入庫單（共 ${rows.length} 筆）`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">入庫單數</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">{rows.length}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">入庫總量</div>
          <div className="text-[20px] font-bold text-[#3B6D11] mt-1 font-mono">
            {totalQty.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">入庫總金額</div>
          <div className="text-[20px] font-bold text-[#0F6E56] mt-1 font-mono">
            {`NT$${Math.round(totalAmount).toLocaleString("en-US")}`}
          </div>
        </div>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/receipt/internal-sale"
        exportFileName="internal-sale-receipts"
        emptyMessage="尚無內售入庫記錄"
      />
    </main>
  );
}
