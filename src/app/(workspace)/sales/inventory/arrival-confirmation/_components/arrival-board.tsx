"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { ArrivalRow, ArrivalStatus } from "@/domain/vehicle-arrivals";

const BASE = "/sales/inventory/arrival-confirmation";

const STATUS_LABELS: Record<ArrivalStatus, string> = {
  pending: "待確認",
  partial: "部分完成（含損傷）",
  completed: "已完成",
};

function statusChip(status: ArrivalStatus): string {
  switch (status) {
    case "completed":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "partial":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "pending":
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

type Banner = { ok: boolean; msg: string } | null;

export default function ArrivalBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canEdit,
  filters,
}: {
  rows: ArrivalRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  filters: { status: string; q: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner] = useState<Banner>(null);

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

  const columns: DataGridColumn<ArrivalRow>[] = [
    {
      id: "arrival_no",
      header: "到港批次號",
      width: 170,
      hideable: false,
      cell: (r) => (
        <Link
          href={`${BASE}/${r.id}`}
          className="font-mono font-semibold text-[12px] text-[#185FA5] hover:underline"
        >
          {r.arrival_no}
        </Link>
      ),
      exportValue: (r) => r.arrival_no,
      sortValue: (r) => r.arrival_no,
    },
    {
      id: "po_no",
      header: "採購單號",
      width: 150,
      cell: (r) => <span className="font-mono text-[12px]">{r.po_no ?? "—"}</span>,
      exportValue: (r) => r.po_no ?? "",
      sortValue: (r) => r.po_no ?? "",
    },
    {
      id: "arrival_date",
      header: "到港日期",
      width: 110,
      cell: (r) => <span className="font-mono text-[12px]">{r.arrival_date ?? "—"}</span>,
      exportValue: (r) => r.arrival_date ?? "",
      sortValue: (r) => r.arrival_date ?? "",
    },
    {
      id: "warehouse_name",
      header: "收貨倉",
      width: 140,
      cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
      exportValue: (r) => r.warehouse_name ?? "",
      sortValue: (r) => r.warehouse_name ?? "",
    },
    {
      id: "total_vehicles",
      header: "車輛數",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
          {r.total_vehicles} 台
        </span>
      ),
      exportValue: (r) => r.total_vehicles,
      sortValue: (r) => r.total_vehicles,
    },
    {
      id: "confirmed_vehicles",
      header: "待PDI",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEEDFE] text-[#534AB7]">
          {r.confirmed_vehicles} 台
        </span>
      ),
      exportValue: (r) => r.confirmed_vehicles,
      sortValue: (r) => r.confirmed_vehicles,
    },
    {
      id: "damaged_vehicles",
      header: "損傷",
      width: 70,
      align: "right",
      cell: (r) =>
        r.damaged_vehicles > 0 ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
            {r.damaged_vehicles} 台
          </span>
        ) : (
          <span className="text-[12px] text-[#9A9890]">0</span>
        ),
      exportValue: (r) => r.damaged_vehicles,
      sortValue: (r) => r.damaged_vehicles,
    },
    {
      id: "status",
      header: "狀態",
      width: 150,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${statusChip(
            r.status,
          )}`}
        >
          {STATUS_LABELS[r.status]}
        </span>
      ),
      exportValue: (r) => STATUS_LABELS[r.status],
      sortValue: (r) => r.status,
    },
    {
      id: "created_at",
      header: "建立時間",
      width: 130,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#9A9890]">
          {r.created_at ? r.created_at.slice(0, 16).replace("T", " ") : "—"}
        </span>
      ),
      exportValue: (r) => r.created_at ?? "",
      sortValue: (r) => r.created_at ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">到港確認</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV02
        </span>
        <span className="text-[12px] text-[#9A9890]">
          新車到港逐台掃 VIN・確認後自動觸發 PDI 工單（PD-IN）
        </span>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className={`${inputClass} w-[160px]`}
            >
              <option value="all">全部</option>
              <option value="completed">已完成</option>
              <option value="partial">部分完成（含損傷）</option>
              <option value="pending">待確認</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>到港批次號</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入到港批次號..."
              className={`${inputClass} w-[220px]`}
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
            <Link
              href={`${BASE}/new`}
              aria-disabled={!canEdit}
              className={`h-[30px] px-3 inline-flex items-center rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                canEdit ? "" : "pointer-events-none opacity-50"
              }`}
            >
              ＋ 新增到港確認
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 個到港批次
          （本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 個）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/inventory/arrival-confirmation"
        exportFileName={`vehicle-arrivals-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.status !== "all"
            ? "無符合條件的到港批次，請調整篩選條件"
            : "尚無到港批次，點右上「＋ 新增到港確認」開始逐台掃 VIN"
        }
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActionsWidth={90}
        rowActions={(r) => (
          <Link
            href={`${BASE}/${r.id}`}
            className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            詳情
          </Link>
        )}
      />
    </main>
  );
}
