"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { SettlementPORow } from "@/domain/cost-settlement.constants";

const BASE = "/sales/inventory/cost-settlement";

const NT = (v: number) => `NT$${Math.round(v).toLocaleString("en-US")}`;

export default function CostSettlementBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canEdit,
  filters,
}: {
  rows: SettlementPORow[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  filters: { status: string; q: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

  const buildQs = (overrides: { status?: string; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const status = overrides.status ?? fStatus;
    const q = overrides.q ?? fQ;
    if (status && status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    if (overrides.page && overrides.page > 1) params.set("page", String(overrides.page));
    const qs = params.toString();
    return qs ? `${BASE}?${qs}` : BASE;
  };

  const submitFilters = () => startTransition(() => router.push(buildQs({ page: 1 })));
  const resetFilters = () => {
    setFStatus("all");
    setFQ("");
    startTransition(() => router.push(BASE));
  };
  const goToPage = (next: number) => startTransition(() => router.push(buildQs({ page: next })));

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<SettlementPORow>[] = [
    {
      id: "po_no",
      header: "採購單號",
      width: 170,
      hideable: false,
      cell: (r) => (
        <Link
          href={`${BASE}/${r.id}`}
          className="font-mono font-semibold text-[12px] text-[#185FA5] hover:underline"
        >
          {r.po_no}
        </Link>
      ),
      exportValue: (r) => r.po_no,
      sortValue: (r) => r.po_no,
    },
    {
      id: "supplier_name",
      header: "供應商",
      width: 160,
      cell: (r) => <span className="text-[12.5px]">{r.supplier_name ?? "—"}</span>,
      exportValue: (r) => r.supplier_name ?? "",
      sortValue: (r) => r.supplier_name ?? "",
    },
    {
      id: "expected_arrival",
      header: "到港日期",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[12px]">{r.expected_arrival ?? "—"}</span>
      ),
      exportValue: (r) => r.expected_arrival ?? "",
      sortValue: (r) => r.expected_arrival ?? "",
    },
    {
      id: "vehicle_count",
      header: "台數",
      width: 70,
      align: "right",
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
          {r.vehicle_count} 台
        </span>
      ),
      exportValue: (r) => r.vehicle_count,
      sortValue: (r) => r.vehicle_count,
    },
    {
      id: "total_purchase_cost",
      header: "採購成本合計",
      width: 140,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{NT(r.total_purchase_cost)}</span>,
      exportValue: (r) => r.total_purchase_cost,
      sortValue: (r) => r.total_purchase_cost,
    },
    {
      id: "total_import_cost",
      header: "進口費用合計",
      width: 130,
      align: "right",
      cell: (r) =>
        r.settled ? (
          <span className="font-mono text-[12px] text-[#0F6E56]">{NT(r.total_import_cost)}</span>
        ) : (
          <span className="text-[12px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.settled ? r.total_import_cost : ""),
      sortValue: (r) => r.total_import_cost,
    },
    {
      id: "settled",
      header: "結算狀態",
      width: 110,
      cell: (r) =>
        r.settled ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            已結算
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
            待結算
          </span>
        ),
      exportValue: (r) => (r.settled ? "已結算" : "待結算"),
      sortValue: (r) => (r.settled ? 1 : 0),
    },
    {
      id: "settled_at",
      header: "結算時間",
      width: 140,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#9A9890]">
          {r.settled_at ? r.settled_at.slice(0, 16).replace("T", " ") : "—"}
        </span>
      ),
      exportValue: (r) => r.settled_at ?? "",
      sortValue: (r) => r.settled_at ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">整車採購財務結算</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV03
        </span>
        <span className="text-[12px] text-[#9A9890]">
          關稅・運費・保險 按採購成本比例分攤至各台・寫回整車成本
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>結算狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className={`${inputClass} w-[160px]`}
            >
              <option value="all">全部</option>
              <option value="pending">待結算</option>
              <option value="settled">已結算</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>採購單號 / 供應商</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入採購單號或供應商..."
              className={`${inputClass} w-[240px]`}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中…" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 張已到港採購單
          （本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 張）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/inventory/cost-settlement"
        exportFileName={`cost-settlement-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.status !== "all"
            ? "無符合條件的採購單，請調整篩選條件"
            : "尚無已到港待結算的採購單。完成到港確認後才會出現於此。"
        }
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActionsWidth={110}
        rowActions={(r) => (
          <Link
            href={`${BASE}/${r.id}`}
            aria-disabled={!canEdit && !r.settled}
            className={`h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] ${
              r.settled
                ? "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                : "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
            } ${!canEdit && !r.settled ? "pointer-events-none opacity-50" : ""}`}
          >
            {r.settled ? "檢視 / 重算" : "結算"}
          </Link>
        )}
      />
    </main>
  );
}
