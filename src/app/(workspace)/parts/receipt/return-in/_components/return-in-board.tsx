"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { StockReceiptListRow } from "@/domain/receipts";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:     { label: "草稿",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  completed: { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  posted:    { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled: { label: "已取消", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "completed", label: "已過帳" },
  { value: "cancelled", label: "已取消" },
];

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function ReturnInBoard({
  rows,
  canEdit,
  initialStatus,
  initialQ,
}: {
  rows: StockReceiptListRow[];
  canEdit: boolean;
  initialStatus: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    startTransition(() =>
      router.push(`/parts/receipt/return-in${params.toString() ? "?" + params : ""}`),
    );
  }

  function resetFilter() {
    setStatus("");
    setQ("");
    startTransition(() => router.push("/parts/receipt/return-in"));
  }

  const columns: DataGridColumn<StockReceiptListRow>[] = useMemo(
    () => [
      {
        id: "gr_no",
        header: "入庫單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/receipt/return-in/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:underline"
          >
            {r.gr_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.gr_no ?? "",
        sortValue: (r) => r.gr_no ?? "",
      },
      {
        id: "warehouse_name",
        header: "入庫倉",
        width: 140,
        cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "receipt_date",
        header: "入庫日期",
        width: 110,
        cell: (r) => <span className="font-mono text-[12px]">{fmtDate(r.receipt_date)}</span>,
        exportValue: (r) => r.receipt_date ?? "",
        sortValue: (r) => r.receipt_date ?? "",
      },
      {
        id: "qty_received_total",
        header: "入庫總數",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{r.qty_received_total ?? 0}</span>
        ),
        exportValue: (r) => r.qty_received_total ?? 0,
        sortValue: (r) => r.qty_received_total ?? 0,
      },
      {
        id: "amount_total",
        header: "入庫金額",
        width: 130,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{fmtMoney(r.amount_total)}</span>,
        exportValue: (r) => r.amount_total ?? 0,
        sortValue: (r) => r.amount_total ?? 0,
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => (STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft).label,
        sortValue: (r) => r.status ?? "",
      },
      {
        id: "notes",
        header: "備註",
        cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.notes ?? "—"}</span>,
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">領料退貨入庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          5.4
        </span>
        <span className="text-[12px] text-[#9A9890]">維修工單未用完的料退回庫存</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">入庫單號搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋 GR 編號..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              disabled
              title={canEdit ? "Phase 2 開放" : "沒有權限"}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white opacity-60 cursor-not-allowed"
            >
              ＋ 新增退料入庫
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆領料退貨入庫
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/receipt/return-in"
        exportFileName="return-in-receipts"
        emptyMessage="沒有符合條件的領料退貨入庫"
        disabled={isPending}
      />
    </main>
  );
}
