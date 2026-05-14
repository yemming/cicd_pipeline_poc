"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { StockReceiptListRow } from "@/domain/receipts";

const TYPE_LABEL: Record<string, { label: string; chip: string }> = {
  purchase: { label: "採購入庫", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  transfer: { label: "調撥入庫", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  internal_sale: { label: "內售入庫", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  ro_return: { label: "領料退入", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  material_return: { label: "領料退入", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  warranty: { label: "保固入庫", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  completed: { label: "已完成", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  posted: { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled: { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

function detailHrefFor(type: string | null, id: string): string | null {
  switch (type) {
    case "purchase":
      return `/parts/receipt/po-grn/${id}`;
    case "transfer":
      return `/parts/receipt/transfer-in/${id}`;
    case "internal_sale":
      return `/parts/receipt/internal-sale/${id}`;
    case "ro_return":
    case "material_return":
    case "warranty":
      return `/parts/receipt/return-in/${id}`;
    default:
      return null;
  }
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function ReceiptsHistoryBoard({
  rows,
  totalCount,
  page,
  pageSize,
  initialType,
  initialStatus,
  initialQ,
  initialDateFrom,
  initialDateTo,
}: {
  rows: StockReceiptListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  initialType: string;
  initialStatus: string;
  initialQ: string;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(initialType);
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);

  function buildHref(extra: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      type: type || undefined,
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
    return `/parts/operations/receipts-history${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    // 篩選變更時 reset 到第 1 頁（總數變了停在第 N 頁可能空）
    startTransition(() => router.push(buildHref({ page: undefined })));
  }

  function resetFilter() {
    setType("");
    setStatus("");
    setQ("");
    setDateFrom("");
    setDateTo("");
    startTransition(() => router.push("/parts/operations/receipts-history"));
  }

  function goToPage(nextPage: number) {
    startTransition(() => router.push(buildHref({ page: nextPage })));
  }

  const columns = useMemo<DataGridColumn<StockReceiptListRow>[]>(() => {
    return [
      {
        id: "gr_no",
        header: "入庫單號",
        width: 160,
        hideable: false,
        cell: (r) => {
          const href = detailHrefFor(r.type, r.id);
          const label = r.gr_no ?? "—";
          return href ? (
            <Link
              href={href}
              className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
            >
              {label}
            </Link>
          ) : (
            <span className="font-mono font-semibold text-[#1A3A5C]">{label}</span>
          );
        },
        exportValue: (r) => r.gr_no ?? "",
        sortValue: (r) => r.gr_no ?? "",
      },
      {
        id: "type",
        header: "類型",
        width: 110,
        cell: (r) => {
          const def = TYPE_LABEL[r.type ?? ""] ?? {
            label: r.type ?? "—",
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
        exportValue: (r) => TYPE_LABEL[r.type ?? ""]?.label ?? r.type ?? "",
        sortValue: (r) => r.type ?? "",
      },
      {
        id: "vendor_name",
        header: "供應商 / 來源",
        width: 200,
        cell: (r) => r.vendor_name ?? "—",
        exportValue: (r) => r.vendor_name ?? "",
        sortValue: (r) => r.vendor_name ?? "",
      },
      {
        id: "warehouse_name",
        header: "入庫倉",
        width: 140,
        cell: (r) => r.warehouse_name ?? "—",
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "receipt_date",
        header: "入庫日期",
        width: 120,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtDate(r.receipt_date)}</span>
        ),
        exportValue: (r) => r.receipt_date ?? "",
        sortValue: (r) => r.receipt_date ?? "",
      },
      {
        id: "qty_received_total",
        header: "入庫總數",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {Number(r.qty_received_total ?? 0).toLocaleString()}
          </span>
        ),
        exportValue: (r) => Number(r.qty_received_total ?? 0),
        sortValue: (r) => Number(r.qty_received_total ?? 0),
      },
      {
        id: "amount_total",
        header: "金額",
        width: 120,
        align: "right",
        defaultHidden: true,
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {Number(r.amount_total ?? 0).toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </span>
        ),
        exportValue: (r) => Number(r.amount_total ?? 0),
        sortValue: (r) => Number(r.amount_total ?? 0),
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        cell: (r) => {
          const def =
            STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          STATUS_LABEL[r.status ?? ""]?.label ?? r.status ?? "",
        sortValue: (r) => r.status ?? "",
      },
    ];
  }, []);

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">入庫查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          7.5
        </span>
        <span className="text-[12px] text-[#9A9890]">所有類型入庫單統一查詢</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
            >
              <option value="">全部</option>
              <option value="purchase">採購入庫</option>
              <option value="transfer">調撥入庫</option>
              <option value="internal_sale">內售入庫</option>
              <option value="ro_return">領料退入</option>
              <option value="warranty">保固入庫</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="completed">已完成</option>
              <option value="posted">已過帳</option>
              <option value="cancelled">已作廢</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>入庫單號</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋 GR..."
              className={`${inputClass} w-[180px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>起始日</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${inputClass} w-[150px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>結束日</label>
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
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆入庫紀錄
          {totalCount > pageSize ? (
            <>
              （第 <b className="text-[#2C2C2A]">{page}</b> 頁，每頁 {pageSize} 筆）
            </>
          ) : null}
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/operations/receipts-history"
        exportFileName="receipts-history"
        emptyMessage="沒有符合條件的入庫紀錄"
        disabled={isPending}
        rowActionsWidth={90}
        rowActions={(r) => {
          const href = detailHrefFor(r.type, r.id);
          if (!href) return null;
          return (
            <Link
              href={href}
              className="inline-flex items-center justify-center h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              檢視
            </Link>
          );
        }}
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
