"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { InventoryPurchaseRow } from "@/domain/inventory-purchases";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return "NT$ " + Math.round(n).toLocaleString("zh-TW");
}

export function PurchasesLedgerBoard({
  rows,
  totalCount,
  initialDateFrom,
  initialDateTo,
}: {
  rows: InventoryPurchaseRow[];
  totalCount: number;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner] = useState<Banner>(null);

  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);

  function buildHref(extra: Record<string, string | undefined> = {}) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/operations/purchases-ledger${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref()));
  }

  function resetFilter() {
    setDateFrom("");
    setDateTo("");
    startTransition(() => router.push("/parts/operations/purchases-ledger"));
  }

  const columns = useMemo<DataGridColumn<InventoryPurchaseRow>[]>(() => {
    return [
      {
        id: "received_at",
        header: "入庫日",
        width: 110,
        hideable: false,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.received_at ? r.received_at.slice(0, 10) : "—"}
          </span>
        ),
        exportValue: (r) => r.received_at?.slice(0, 10) ?? "",
        sortValue: (r) => r.received_at ?? "",
      },
      {
        id: "item_code",
        header: "料號",
        width: 140,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#1A3A5C] font-semibold">
            {r.item_code ?? "—"}
          </span>
        ),
        exportValue: (r) => r.item_code ?? "",
        sortValue: (r) => r.item_code ?? "",
      },
      {
        id: "item_name",
        header: "品名",
        width: 240,
        cell: (r) => (
          <span className="text-[12px] text-[#2C2C2A]">{r.item_name ?? "—"}</span>
        ),
        exportValue: (r) => r.item_name ?? "",
        sortValue: (r) => r.item_name ?? "",
      },
      {
        id: "qty",
        header: "數量",
        width: 80,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#2C2C2A]">
            {r.qty.toLocaleString("zh-TW")}
          </span>
        ),
        exportValue: (r) => String(r.qty),
        sortValue: (r) => r.qty,
      },
      {
        id: "unit_cost",
        header: "單位成本",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#2C2C2A]">
            {fmtMoney(r.unit_cost)}
          </span>
        ),
        exportValue: (r) => String(r.unit_cost),
        sortValue: (r) => r.unit_cost,
      },
      {
        id: "total_cost",
        header: "總成本",
        width: 140,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] font-semibold text-[#1A3A5C]">
            {fmtMoney(r.total_cost ?? r.unit_cost * r.qty)}
          </span>
        ),
        exportValue: (r) => String(r.total_cost ?? r.unit_cost * r.qty),
        sortValue: (r) => r.total_cost ?? r.unit_cost * r.qty,
      },
      {
        id: "purchase_order_id",
        header: "PO",
        width: 180,
        defaultHidden: false,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.purchase_order_id ? r.purchase_order_id.slice(0, 8) + "…" : "—"}
          </span>
        ),
        exportValue: (r) => r.purchase_order_id ?? "",
        sortValue: (r) => r.purchase_order_id ?? "",
      },
      {
        id: "receipt_id",
        header: "入庫單",
        width: 180,
        defaultHidden: false,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.receipt_id ? r.receipt_id.slice(0, 8) + "…" : "—"}
          </span>
        ),
        exportValue: (r) => r.receipt_id ?? "",
        sortValue: (r) => r.receipt_id ?? "",
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
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購進貨成本記錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          零件 · 進貨帳
        </span>
        <span className="text-[12px] text-[#9A9890]">
          依品牌篩選所有進貨成本明細（唯讀）
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>入庫日起</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${inputClass} w-[150px]`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>入庫日迄</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${inputClass} w-[150px]`}
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
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆進貨成本記錄
        </span>
      </div>

      {/* DataGrid — 唯讀，無 rowActions */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/operations/purchases-ledger"
        exportFileName="purchases-ledger"
        emptyMessage="沒有符合條件的進貨成本記錄"
        disabled={isPending}
      />
    </main>
  );
}
