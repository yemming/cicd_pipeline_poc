"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { TransferListRow } from "@/domain/transfers";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  in_transit: { label: "在途", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  partial: { label: "部分到貨", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  received: { label: "已收貨", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  closed: { label: "已結案", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  cancelled: { label: "已取消", chip: "bg-[#FDECEA] text-[#CC0000]" },
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function TransfersInTransitBoard({
  rows,
  totalCount,
  page,
  pageSize,
  initialStatus,
  initialQ,
  initialDateFrom,
  initialDateTo,
}: {
  rows: TransferListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  initialStatus: string;
  initialQ: string;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);

  function buildHref(extra: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      status: status || undefined,
      q: q || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return `/parts/operations/transfers-in-transit${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref({ page: undefined })));
  }

  function resetFilter() {
    setStatus("");
    setQ("");
    setDateFrom("");
    setDateTo("");
    startTransition(() =>
      router.push("/parts/operations/transfers-in-transit"),
    );
  }

  function goToPage(nextPage: number) {
    startTransition(() => router.push(buildHref({ page: nextPage })));
  }

  const columns = useMemo<DataGridColumn<TransferListRow>[]>(
    () => [
      {
        id: "tr_no",
        header: "調撥單號",
        width: 160,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/receipt/transfer-in/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r.tr_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.tr_no ?? "",
        sortValue: (r) => r.tr_no ?? "",
      },
      {
        id: "source_warehouse_name",
        header: "來源倉",
        width: 140,
        cell: (r) => (
          <span className="text-[12.5px]">{r.source_warehouse_name ?? "—"}</span>
        ),
        exportValue: (r) => r.source_warehouse_name ?? "",
        sortValue: (r) => r.source_warehouse_name ?? "",
      },
      {
        id: "target_warehouse_name",
        header: "目標倉",
        width: 140,
        cell: (r) => (
          <span className="text-[12.5px]">{r.target_warehouse_name ?? "—"}</span>
        ),
        exportValue: (r) => r.target_warehouse_name ?? "",
        sortValue: (r) => r.target_warehouse_name ?? "",
      },
      {
        id: "ship_date",
        header: "出貨日",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtDate(r.ship_date)}</span>
        ),
        exportValue: (r) => r.ship_date ?? "",
        sortValue: (r) => r.ship_date ?? "",
      },
      {
        id: "expected_arrival_date",
        header: "預計到貨",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {fmtDate(r.expected_arrival_date)}
          </span>
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
            {Number(r.qty_shipped_total ?? 0).toLocaleString()} /{" "}
            {Number(r.qty_received_total ?? 0).toLocaleString()}
          </span>
        ),
        exportValue: (r) =>
          `${r.qty_shipped_total ?? 0} / ${r.qty_received_total ?? 0}`,
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        hideable: false,
        cell: (r) => {
          const def =
            STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.in_transit;
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
        id: "logistics_tracking_no",
        header: "物流追蹤",
        width: 140,
        defaultHidden: true,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.logistics_tracking_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.logistics_tracking_no ?? "",
        sortValue: (r) => r.logistics_tracking_no ?? "",
      },
      {
        id: "reason",
        header: "原因",
        width: 180,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.reason ?? "—"}</span>
        ),
        exportValue: (r) => r.reason ?? "",
        sortValue: (r) => r.reason ?? "",
      },
    ],
    [],
  );

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          調撥在途查詢
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          7.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          盯著出貨後尚未完全到貨的調撥單，列尾「檢視」進詳細頁確認收貨
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              <option value="">全部在途（in_transit + partial）</option>
              <option value="in_transit">在途</option>
              <option value="partial">部分到貨</option>
              <option value="received">已收貨</option>
              <option value="closed">已結案</option>
              <option value="cancelled">已取消</option>
              <option value="__all__">全部（含已結案）</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>調撥單號</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋 TR..."
              className={`${inputClass} w-[180px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>出貨日起</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${inputClass} w-[150px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>出貨日迄</label>
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

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆調撥
          {totalCount > pageSize ? (
            <>
              （第 <b className="text-[#2C2C2A]">{page}</b> 頁，每頁 {pageSize}{" "}
              筆）
            </>
          ) : null}
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/operations/transfers-in-transit"
        exportFileName="transfers-in-transit"
        emptyMessage="沒有符合條件的調撥單"
        disabled={isPending}
        rowActionsWidth={90}
        rowActions={(r) => (
          <Link
            href={`/parts/receipt/transfer-in/${r.id}`}
            className="inline-flex items-center justify-center h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            檢視
          </Link>
        )}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
      />
    </main>
  );
}
