"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { VoidListRow } from "@/domain/einvoice";

export type VoidFilters = {
  dateFrom: string;
  dateTo: string;
};

export function VoidsBoard({
  rows,
  filters,
}: {
  rows: VoidListRow[];
  filters: VoidFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fFrom, setFFrom] = useState(filters.dateFrom ?? "");
  const [fTo, setFTo] = useState(filters.dateTo ?? "");

  const submit = () => {
    const p = new URLSearchParams();
    if (fFrom) p.set("dateFrom", fFrom);
    if (fTo) p.set("dateTo", fTo);
    const qs = p.toString();
    startTransition(() => router.push(qs ? `/einvoice/voids?${qs}` : "/einvoice/voids"));
  };

  const reset = () => {
    setFFrom("");
    setFTo("");
    startTransition(() => router.push("/einvoice/voids"));
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<VoidListRow>[] = [
    {
      id: "voided_at",
      header: "作廢時間",
      width: 160,
      hideable: false,
      cell: (r) => (
        <span className="text-[#5A5955]">
          {new Date(r.voided_at).toLocaleString("zh-TW", { hour12: false })}
        </span>
      ),
      exportValue: (r) => r.voided_at,
      sortValue: (r) => r.voided_at,
    },
    {
      id: "invoice_no",
      header: "原發票號",
      width: 140,
      cell: (r) => (
        <span className="font-mono text-[#2C2C2A]">
          {r.einvoice?.ecpay_invoice_no ?? "—"}
        </span>
      ),
      exportValue: (r) => r.einvoice?.ecpay_invoice_no ?? "",
      sortValue: (r) => r.einvoice?.ecpay_invoice_no ?? "",
    },
    {
      id: "total_amount",
      header: "原金額",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[#5A5955]">
          {r.einvoice ? `NT$ ${r.einvoice.total_amount.toLocaleString()}` : "—"}
        </span>
      ),
      exportValue: (r) => (r.einvoice ? String(r.einvoice.total_amount) : ""),
      sortValue: (r) => r.einvoice?.total_amount ?? 0,
    },
    {
      id: "reason",
      header: "作廢原因",
      cell: (r) => <span className="text-[#2C2C2A]">{r.reason}</span>,
      exportValue: (r) => r.reason,
      sortValue: (r) => r.reason,
    },
    {
      id: "voided_by",
      header: "操作人",
      width: 120,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#9A9890]">
          {r.voided_by ? r.voided_by.slice(0, 8) : "—"}
        </span>
      ),
      exportValue: (r) => r.voided_by ?? "",
      sortValue: (r) => r.voided_by ?? "",
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">作廢紀錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 0
        </span>
        <span className="text-[12px] text-[#9A9890]">所有發票作廢歷程</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>作廢日（起）</label>
            <input
              type="date"
              className={inputClass}
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>作廢日（迄）</label>
            <input
              type="date"
              className={inputClass}
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      <div className="text-[12px] text-[#9A9890]">
        共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆作廢紀錄
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="einvoice/voids"
        exportFileName="einvoice-voids"
        emptyMessage="尚無作廢紀錄"
        disabled={isPending}
        rowActionsWidth={110}
        rowActions={(r) => (
          <Link
            href={`/einvoice/${r.einvoice_id}`}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
          >
            查看發票
          </Link>
        )}
      />
    </main>
  );
}
