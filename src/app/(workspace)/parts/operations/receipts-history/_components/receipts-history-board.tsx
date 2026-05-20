"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { BarChart } from "@/components/charts/BarChart";
import type {
  ReceiptHistoryStats,
  ReceiptTrendPoint,
  StockReceiptListRow,
} from "@/domain/receipts";

const TYPE_LABEL: Record<string, { label: string; chip: string }> = {
  purchase: { label: "採購入庫", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  transfer: { label: "調撥入庫", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  internal_sale_return: { label: "內售退入", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  ro_return: { label: "領料退入", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  warranty_return: { label: "保固入庫", chip: "bg-[#FDECEA] text-[#CC0000]" },
  exception: { label: "例外入庫", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  consignment_in: { label: "寄存入庫", chip: "bg-[#EDE9FE] text-[#6D28D9]" },
};

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  pending: { label: "待處理", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  partial: { label: "部分", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  completed: { label: "已完成", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled: { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

function detailHrefFor(type: string | null, id: string): string | null {
  switch (type) {
    case "purchase":
      return `/parts/receipt/po-grn/${id}`;
    case "transfer":
      return `/parts/receipt/transfer-in/${id}`;
    case "internal_sale_return":
      return `/parts/receipt/internal-sale/${id}`;
    case "ro_return":
    case "warranty_return":
      return `/parts/receipt/return-in/${id}`;
    default:
      return null;
  }
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtCurrency(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
  stats,
  trend,
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
  stats: ReceiptHistoryStats;
  trend: ReceiptTrendPoint[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(initialType);
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);

  function buildHref(
    extra: Record<string, string | number | undefined>,
    overrides?: {
      type?: string;
      status?: string;
      q?: string;
      date_from?: string;
      date_to?: string;
    },
  ) {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      type: overrides?.type ?? type ?? undefined,
      status: overrides?.status ?? status ?? undefined,
      q: overrides?.q ?? q ?? undefined,
      date_from: overrides?.date_from ?? dateFrom ?? undefined,
      date_to: overrides?.date_to ?? dateTo ?? undefined,
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

  /** 點 BarChart 某天 → filter 鎖到當天 + reset page */
  function drillDownDate(date: string) {
    setDateFrom(date);
    setDateTo(date);
    startTransition(() =>
      router.push(
        buildHref(
          { page: undefined },
          { date_from: date, date_to: date },
        ),
      ),
    );
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

  // KpiCard 4 顆：當月筆數 / 當月金額 / TOP 供應商 / 熱門品類
  const topSupplier = stats.topSuppliers[0];
  const topCategory = stats.topCategories[0];

  // 趨勢圖過濾掉「全部 0」的最舊那段 → 但保留至少 14 天讓 X 軸不會擠在一起
  const trendData = trend.length > 14 ? trend.slice(-30) : trend;

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">入庫查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04L-1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          所有類型入庫單統一查詢（含 KPI 與近 30 天趨勢）
        </span>
      </header>

      {/* KPI 列 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="近 30 天入庫筆數"
          value={stats.monthCount.toLocaleString()}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="近 30 天入庫金額"
          value={`$${fmtCurrency(stats.monthAmount)}`}
          tone="teal"
          layout="vertical"
        />
        <KpiCard
          label={`TOP 供應商${topSupplier ? `（${topSupplier.count} 筆）` : ""}`}
          value={
            topSupplier
              ? `${topSupplier.name.length > 10 ? topSupplier.name.slice(0, 10) + "…" : topSupplier.name}`
              : "—"
          }
          tone="purple"
          layout="vertical"
        />
        <KpiCard
          label={`熱門品類${topCategory ? `（${topCategory.count} 行）` : ""}`}
          value={topCategory?.category ?? "—"}
          tone="amber"
          layout="vertical"
        />
      </section>

      {/* 趨勢圖 + 供應商 TOP3 並排 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              近 30 天入庫趨勢（依來源類型堆疊）
            </h2>
            <span className="text-[11px] text-[#9A9890]">點 bar 篩當日明細</span>
          </div>
          {trendData.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-[#9A9890]">
              近 30 天無入庫資料
            </p>
          ) : (
            <BarChart
              data={trendData}
              categoryKey="label"
              valueKey={[
                { key: "purchase", label: "採購", color: "#1D4ED8" },
                { key: "transfer", label: "調撥", color: "#0F766E" },
                { key: "ro_return", label: "領料退", color: "#B45309" },
                { key: "warranty_return", label: "保固", color: "#B91C1C" },
                { key: "other", label: "其他", color: "#6B7280" },
              ]}
              stacked
              showLegend
              size="md"
              tone="blue"
            />
          )}
          {/* 點 bar 觸發 drill-down — Recharts onClick 由透明覆蓋層代勞，避免動 BarChart props */}
          {trendData.length > 0 ? (
            <div className="mt-1 flex gap-1 overflow-x-auto text-[10px] text-[#9A9890]">
              {trendData.slice(-15).map((p) => (
                <button
                  key={p.date}
                  type="button"
                  onClick={() => drillDownDate(p.date)}
                  disabled={isPending || p.count === 0}
                  className="px-1.5 py-0.5 rounded border border-[#EEECE6] hover:border-[#185FA5] hover:text-[#185FA5] disabled:opacity-40 disabled:hover:border-[#EEECE6] disabled:hover:text-[#9A9890] whitespace-nowrap"
                  title={`${p.date}：${p.count} 筆 / $${fmtCurrency(p.total)}`}
                >
                  {p.label} ({p.count})
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A] mb-2">
            供應商 TOP 3（近 30 天）
          </h2>
          {stats.topSuppliers.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[#9A9890]">
              近 30 天無供應商入庫紀錄
            </p>
          ) : (
            <ol className="space-y-2">
              {stats.topSuppliers.map((s, idx) => (
                <li
                  key={s.vendor_id ?? `internal-${idx}`}
                  className="flex items-center gap-2 text-[12px]"
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold ${
                      idx === 0
                        ? "bg-[#FFE08A] text-[#854F0B]"
                        : idx === 1
                          ? "bg-[#D1D5DB] text-[#374151]"
                          : "bg-[#FEE2E2] text-[#B91C1C]"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="flex-1 truncate text-[#2C2C2A]" title={s.name}>
                    {s.name}
                  </span>
                  <span className="font-mono text-[12px] text-[#5A5955]">
                    ${fmtCurrency(s.amount)}
                  </span>
                  <span className="text-[11px] text-[#9A9890] whitespace-nowrap">
                    {s.count} 筆
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Filter Bar */}
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
              <option value="internal_sale_return">內售退入</option>
              <option value="ro_return">領料退入</option>
              <option value="warranty_return">保固入庫</option>
              <option value="exception">例外入庫</option>
              <option value="consignment_in">寄存入庫</option>
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
              <option value="pending">待處理</option>
              <option value="partial">部分</option>
              <option value="completed">已完成</option>
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
          {dateFrom && dateTo && dateFrom === dateTo ? (
            <span className="ml-2 px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
              已 drill-down 到 {dateFrom.replace(/-/g, "/")}
            </span>
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
