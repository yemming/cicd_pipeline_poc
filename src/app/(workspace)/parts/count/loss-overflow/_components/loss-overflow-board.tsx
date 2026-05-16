"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { CountSessionListRow } from "@/domain/count";
import {
  LG_STATUS_CHIP,
  LG_STATUS_OPTIONS,
  buildLgNo,
  dbStatusToLgStatus,
  fmtDate,
  fmtMoney,
} from "@/domain/count.constants";

type WarehouseOption = { id: string; name: string; code: string };

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function LossOverflowBoard({
  rows,
  warehouses,
  initialStatus,
  initialWarehouseId,
  initialQ,
}: {
  rows: CountSessionListRow[];
  warehouses: WarehouseOption[];
  canEdit: boolean;
  initialStatus: string;
  initialWarehouseId: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState(initialStatus);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [q, setQ] = useState(initialQ);

  function buildHref(extra: Record<string, string | undefined> = {}) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      status: status || undefined,
      warehouse_id: warehouseId || undefined,
      q: q || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/count/loss-overflow${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref()));
  }

  function resetFilter() {
    setStatus("");
    setWarehouseId("");
    setQ("");
    startTransition(() => router.push("/parts/count/loss-overflow"));
  }

  const columns = useMemo<DataGridColumn<CountSessionListRow>[]>(() => {
    return [
      {
        id: "lg_no",
        header: "報損報溢單號",
        width: 170,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/count/adjustments/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {buildLgNo(r.ct_no, r.count_date)}
          </Link>
        ),
        exportValue: (r) => buildLgNo(r.ct_no, r.count_date),
        sortValue: (r) => buildLgNo(r.ct_no, r.count_date),
      },
      {
        id: "ct_no",
        header: "來源盤點單",
        width: 150,
        cell: (r) => (
          <Link
            href={`/parts/count/adjustments/${r.id}`}
            className="font-mono text-[12px] text-[#185FA5] hover:underline"
          >
            {r.ct_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.ct_no ?? "",
        sortValue: (r) => r.ct_no ?? "",
      },
      {
        id: "warehouse_name",
        header: "倉庫",
        width: 130,
        cell: (r) => r.warehouse_name ?? "—",
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "count_date",
        header: "盤點日期",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtDate(r.count_date)}</span>
        ),
        exportValue: (r) => r.count_date ?? "",
        sortValue: (r) => r.count_date ?? "",
      },
      {
        id: "variance_lines",
        header: "差異品項",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#854F0B] font-semibold">
            {r.variance_lines ?? 0}
          </span>
        ),
        exportValue: (r) => String(r.variance_lines ?? 0),
        sortValue: (r) => Number(r.variance_lines ?? 0),
      },
      {
        id: "variance_amount",
        header: "差異金額影響",
        width: 140,
        align: "right",
        cell: (r) => (
          <span
            className={`font-mono text-[12px] ${
              Number(r.variance_amount ?? 0) < 0
                ? "text-[#CC0000]"
                : Number(r.variance_amount ?? 0) > 0
                  ? "text-[#3B6D11]"
                  : "text-[#9A9890]"
            }`}
          >
            {fmtMoney(r.variance_amount)}
          </span>
        ),
        exportValue: (r) =>
          r.variance_amount == null ? "" : String(r.variance_amount),
        sortValue: (r) => Number(r.variance_amount ?? 0),
      },
      {
        id: "lg_status",
        header: "審批狀態",
        width: 100,
        cell: (r) => {
          const lg = dbStatusToLgStatus(r.status);
          const def =
            LG_STATUS_CHIP[lg] ?? {
              label: r.status ?? "—",
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
        exportValue: (r) =>
          LG_STATUS_CHIP[dbStatusToLgStatus(r.status)]?.label ??
          r.status ??
          "",
        sortValue: (r) => dbStatusToLgStatus(r.status),
      },
      {
        id: "approved_at",
        header: "覆核時間",
        width: 140,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.approved_at
              ? r.approved_at.slice(0, 16).replace("T", " ")
              : "—"}
          </span>
        ),
        exportValue: (r) => r.approved_at ?? "",
        sortValue: (r) => r.approved_at ?? "",
      },
    ];
  }, []);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          報損報溢審核
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          庫存 · 8.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          財務主管確認損溢單 — 審批通過後庫存帳面正式調整
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>來源盤點單</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="例：CT20260514"
              className={`${inputClass} w-[200px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={`${inputClass} w-[160px]`}
            >
              <option value="">全部倉庫</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} ・ {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>審批狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} w-[240px]`}
            >
              {LG_STATUS_OPTIONS.map((o) => (
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

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 張報損報溢單
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/count/loss-overflow"
        exportFileName="count-loss-overflow"
        emptyMessage="沒有符合條件的報損報溢單"
        disabled={isPending}
      />
    </main>
  );
}
