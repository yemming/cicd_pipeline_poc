"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { AllowanceListRow } from "@/domain/einvoice";

const STATUS_CHIP: Record<string, string> = {
  issued: "bg-[#EAF3DE] text-[#3B6D11]",
  failed: "bg-[#FDECEA] text-[#CC0000]",
  invalid: "bg-[#F2F2F2] text-[#6B6A68]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
};

const STATUS_LABEL: Record<string, string> = {
  issued: "已生效",
  failed: "失敗",
  invalid: "已作廢",
  pending: "待處理",
};

const NOTIFY_LABEL: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  manual: "不通知",
};

export type AllowanceFilters = {
  status: string;
  dateFrom: string;
  dateTo: string;
};

export function AllowancesBoard({
  rows,
  filters,
}: {
  rows: AllowanceListRow[];
  filters: AllowanceFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fStatus, setFStatus] = useState(filters.status ?? "all");
  const [fFrom, setFFrom] = useState(filters.dateFrom ?? "");
  const [fTo, setFTo] = useState(filters.dateTo ?? "");

  const submit = () => {
    const p = new URLSearchParams();
    if (fStatus !== "all") p.set("status", fStatus);
    if (fFrom) p.set("dateFrom", fFrom);
    if (fTo) p.set("dateTo", fTo);
    const qs = p.toString();
    startTransition(() =>
      router.push(qs ? `/einvoice/allowances?${qs}` : "/einvoice/allowances"),
    );
  };

  const reset = () => {
    setFStatus("all");
    setFFrom("");
    setFTo("");
    startTransition(() => router.push("/einvoice/allowances"));
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<AllowanceListRow>[] = [
    {
      id: "ecpay_allowance_no",
      header: "折讓號",
      width: 140,
      hideable: false,
      cell: (r) =>
        r.ecpay_allowance_no ? (
          <span className="font-mono text-[#2C2C2A]">{r.ecpay_allowance_no}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.ecpay_allowance_no ?? "",
      sortValue: (r) => r.ecpay_allowance_no ?? "",
    },
    {
      id: "invoice_no",
      header: "原發票號",
      width: 140,
      cell: (r) => (
        <span className="font-mono text-[#5A5955]">
          {r.einvoice?.ecpay_invoice_no ?? "—"}
        </span>
      ),
      exportValue: (r) => r.einvoice?.ecpay_invoice_no ?? "",
      sortValue: (r) => r.einvoice?.ecpay_invoice_no ?? "",
    },
    {
      id: "total_amount",
      header: "折讓金額",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono">NT$ {r.total_amount.toLocaleString()}</span>
      ),
      exportValue: (r) => String(r.total_amount),
      sortValue: (r) => r.total_amount,
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => (
        <>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              STATUS_CHIP[r.status] ?? "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
          >
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
          {r.status === "failed" && r.ecpay_error_msg && (
            <span className="ml-1 text-[11px] text-[#CC0000]">
              {r.ecpay_error_msg.slice(0, 30)}
            </span>
          )}
        </>
      ),
      exportValue: (r) => STATUS_LABEL[r.status] ?? r.status,
      sortValue: (r) => r.status,
    },
    {
      id: "notify_method",
      header: "通知方式",
      width: 90,
      cell: (r) => (
        <span className="text-[#5A5955]">
          {r.notify_method ? (NOTIFY_LABEL[r.notify_method] ?? r.notify_method) : "—"}
        </span>
      ),
      exportValue: (r) =>
        r.notify_method ? (NOTIFY_LABEL[r.notify_method] ?? r.notify_method) : "",
      sortValue: (r) => r.notify_method ?? "",
    },
    {
      id: "reason",
      header: "原因",
      cell: (r) => (
        <span
          className="text-[#5A5955] max-w-[200px] truncate inline-block align-middle"
          title={r.reason ?? undefined}
        >
          {r.reason ?? "—"}
        </span>
      ),
      exportValue: (r) => r.reason ?? "",
      sortValue: (r) => r.reason ?? "",
    },
    {
      id: "created_at",
      header: "建立時間",
      width: 150,
      cell: (r) => (
        <span className="text-[#9A9890] text-[11.5px]">
          {new Date(r.created_at).toLocaleString("zh-TW", { hour12: false })}
        </span>
      ),
      exportValue: (r) => r.created_at,
      sortValue: (r) => r.created_at,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">折讓單</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 0
        </span>
        <span className="text-[12px] text-[#9A9890]">所有發票折讓紀錄</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>建立日（起）</label>
            <input
              type="date"
              className={inputClass}
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>建立日（迄）</label>
            <input
              type="date"
              className={inputClass}
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="issued">已生效</option>
              <option value="failed">失敗</option>
              <option value="invalid">已作廢</option>
              <option value="pending">待處理</option>
            </select>
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
        共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆折讓單
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="einvoice/allowances"
        exportFileName="einvoice-allowances"
        emptyMessage="尚無折讓紀錄"
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
