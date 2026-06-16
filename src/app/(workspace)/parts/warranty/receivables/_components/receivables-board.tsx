"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { WarrantyReceivableRow } from "@/domain/warranty-receivables";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部狀態" },
  { value: "pending", label: "待處理" },
  { value: "submitted", label: "已送件" },
  { value: "approved", label: "已核准" },
  { value: "rejected", label: "已駁回" },
  { value: "paid", label: "已付款" },
];

const STATUS_CHIP: Record<string, { label: string; chip: string }> = {
  pending: { label: "待處理", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  submitted: { label: "已送件", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  rejected: { label: "已駁回", chip: "bg-[#FDECEA] text-[#CC0000]" },
  paid: { label: "已付款", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return "NT$ " + Math.round(n).toLocaleString("zh-TW");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return d.slice(0, 10);
}

export function ReceivablesBoard({
  rows,
  totalCount,
  initialStatus,
}: {
  rows: WarrantyReceivableRow[];
  totalCount: number;
  initialStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner] = useState<Banner>(null);

  const [status, setStatus] = useState(initialStatus);

  function buildHref(extra: Record<string, string | undefined> = {}) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      status: status || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/warranty/receivables${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref()));
  }

  function resetFilter() {
    setStatus("");
    startTransition(() => router.push("/parts/warranty/receivables"));
  }

  const columns = useMemo<DataGridColumn<WarrantyReceivableRow>[]>(() => {
    return [
      {
        id: "created_at",
        header: "建立日",
        width: 110,
        hideable: false,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {fmtDate(r.created_at)}
          </span>
        ),
        exportValue: (r) => fmtDate(r.created_at),
        sortValue: (r) => r.created_at,
      },
      {
        id: "claim_no",
        header: "索賠單號",
        width: 160,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#1A3A5C] font-semibold">
            {r.claim_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.claim_no ?? "",
        sortValue: (r) => r.claim_no ?? "",
      },
      {
        id: "ro_no",
        header: "工單",
        width: 160,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {r.ro_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.ro_no ?? "",
        sortValue: (r) => r.ro_no ?? "",
      },
      {
        id: "claim_amount",
        header: "索賠金額",
        width: 140,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] font-semibold text-[#1A3A5C]">
            {fmtMoney(r.claim_amount)}
          </span>
        ),
        exportValue: (r) => String(r.claim_amount),
        sortValue: (r) => r.claim_amount,
      },
      {
        id: "claim_status",
        header: "狀態",
        width: 100,
        cell: (r) => {
          const def = STATUS_CHIP[r.claim_status] ?? {
            label: r.claim_status,
            chip: "bg-[#F2F2F2] text-[#6B6A68]",
          };
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => STATUS_CHIP[r.claim_status]?.label ?? r.claim_status,
        sortValue: (r) => r.claim_status,
      },
      {
        id: "submitted_at",
        header: "送件日",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {fmtDate(r.submitted_at)}
          </span>
        ),
        exportValue: (r) => fmtDate(r.submitted_at),
        sortValue: (r) => r.submitted_at ?? "",
      },
      {
        id: "oem_reference_no",
        header: "原廠單號",
        width: 160,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.oem_reference_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.oem_reference_no ?? "",
        sortValue: (r) => r.oem_reference_no ?? "",
      },
      {
        id: "paid_at",
        header: "付款日",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {fmtDate(r.paid_at)}
          </span>
        ),
        exportValue: (r) => fmtDate(r.paid_at),
        sortValue: (r) => r.paid_at ?? "",
      },
    ];
  }, []);

  return (
    <main className="px-6 py-5 space-y-3">
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">保固索賠應收款</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          零件 · 保固
        </span>
        <span className="text-[12px] text-[#9A9890]">
          原廠保固索賠應收款追蹤（唯讀）
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} w-[140px]`}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆保固索賠應收款
        </span>
      </div>

      {/* DataGrid — 唯讀，無 rowActions */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/warranty/receivables"
        exportFileName="warranty-receivables"
        emptyMessage="沒有符合條件的保固索賠應收款記錄"
        disabled={isPending}
      />
    </main>
  );
}
