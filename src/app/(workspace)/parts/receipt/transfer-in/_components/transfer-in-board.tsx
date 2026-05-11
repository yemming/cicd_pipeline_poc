"use client";

import { useMemo, useState } from "react";

import type { TransferListRow } from "@/domain/transfers";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

import { ReceiveTransferButton } from "./receive-transfer-button";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  in_transit: { label: "在途",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  partial:    { label: "部分到貨", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  received:   { label: "已收貨",   chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  closed:     { label: "已結案",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function TransferInBoard({
  rows,
  canEdit,
}: {
  rows: TransferListRow[];
  canEdit: boolean;
}) {
  const [banner, setBanner] = useState<Banner>(null);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  const columns: DataGridColumn<TransferListRow>[] = useMemo(
    () => [
      {
        id: "tr_no",
        header: "調撥單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[12px] text-[#1A3A5C]">
            {r.tr_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.tr_no ?? "",
        sortValue: (r) => r.tr_no ?? "",
      },
      {
        id: "source_warehouse_name",
        header: "來源倉",
        width: 140,
        cell: (r) => <span className="text-[12.5px]">{r.source_warehouse_name ?? "—"}</span>,
        exportValue: (r) => r.source_warehouse_name ?? "",
        sortValue: (r) => r.source_warehouse_name ?? "",
      },
      {
        id: "target_warehouse_name",
        header: "目標倉",
        width: 140,
        cell: (r) => <span className="text-[12.5px]">{r.target_warehouse_name ?? "—"}</span>,
        exportValue: (r) => r.target_warehouse_name ?? "",
        sortValue: (r) => r.target_warehouse_name ?? "",
      },
      {
        id: "ship_date",
        header: "出貨日",
        width: 110,
        cell: (r) => <span className="font-mono text-[12px]">{fmtDate(r.ship_date)}</span>,
        exportValue: (r) => r.ship_date ?? "",
        sortValue: (r) => r.ship_date ?? "",
      },
      {
        id: "expected_arrival_date",
        header: "預計到貨",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtDate(r.expected_arrival_date)}</span>
        ),
        exportValue: (r) => r.expected_arrival_date ?? "",
        sortValue: (r) => r.expected_arrival_date ?? "",
      },
      {
        id: "qty_shipped_received",
        header: "出貨/到貨",
        width: 110,
        align: "right",
        sortable: false,
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {r.qty_shipped_total ?? 0} / {r.qty_received_total ?? 0}
          </span>
        ),
        exportValue: (r) => `${r.qty_shipped_total ?? 0} / ${r.qty_received_total ?? 0}`,
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.in_transit;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          (STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.in_transit).label,
        sortValue: (r) => r.status ?? "",
      },
      {
        id: "reason",
        header: "原因",
        width: 200,
        cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.reason ?? "—"}</span>,
        exportValue: (r) => r.reason ?? "",
        sortValue: (r) => r.reason ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">調撥入庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          5.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          接收來自其他倉庫的調撥單、確認到貨
        </span>
      </header>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆在途/到貨調撥
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/receipt/transfer-in"
        exportFileName="transfer-in"
        emptyMessage="沒有在途/待入庫的調撥單"
        rowActionsWidth={180}
        rowActions={(r) => {
          const canReceive =
            canEdit && (r.status === "in_transit" || r.status === "partial");
          if (!canReceive) return <span className="text-[11px] text-[#9A9890]">—</span>;
          return (
            <ReceiveTransferButton
              transferId={r.id}
              trNo={r.tr_no ?? ""}
              onResult={flash}
            />
          );
        }}
      />

      {!canEdit ? (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有入庫操作權限，僅能檢視
        </div>
      ) : null}

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
