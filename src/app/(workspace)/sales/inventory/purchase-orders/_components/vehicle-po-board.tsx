"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  setVehiclePOStatusAction,
  deleteVehiclePOAction,
} from "@/lib/vehicle-inventory/vehicle-po-actions";
import type { VehiclePORow, VehiclePOStatus } from "@/domain/vehicle-purchase-orders";

const STATUS_LABELS: Record<VehiclePOStatus, string> = {
  draft: "草稿",
  submitted: "已送出（在途）",
  in_transit: "在途中",
  arrived: "到港完成",
  closed: "已結案",
  cancelled: "已取消",
};

function statusChip(status: VehiclePOStatus): string {
  switch (status) {
    case "draft":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    case "submitted":
    case "in_transit":
      return "bg-[#FDF3E3] text-[#854F0B]"; // amber：在途中
    case "arrived":
      return "bg-[#E8F5F0] text-[#0F6E56]"; // teal：到港完成
    case "closed":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "cancelled":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

type Banner = { ok: boolean; msg: string } | null;

export default function VehiclePOBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canEdit,
  filters,
}: {
  rows: VehiclePORow[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  filters: { status: string; q: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

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

  const submitFilters = () => {
    startTransition(() => router.push(buildQs({ page: 1 })));
  };
  const resetFilters = () => {
    setFStatus("all");
    setFQ("");
    startTransition(() => router.push(BASE));
  };
  const goToPage = (next: number) => {
    startTransition(() => router.push(buildQs({ page: next })));
  };

  const toggleCancel = (r: VehiclePORow) => {
    const next: VehiclePOStatus = r.status === "cancelled" ? "draft" : "cancelled";
    if (
      next === "cancelled" &&
      !confirm(`確定取消採購單「${r.po_no}」？取消後不再參與在途追蹤。`)
    )
      return;
    startTransition(async () => {
      const res = await setVehiclePOStatusAction(r.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: next === "cancelled" ? "✓ 已取消採購單" : "✓ 已恢復為草稿" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const removePO = (r: VehiclePORow) => {
    if (
      !confirm(
        `確定刪除採購單「${r.po_no}」？此動作永久移除單頭與車款明細。\n（已連帶建立在途車輛庫存的單無法刪除，請改用「取消」。）`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVehiclePOAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除採購單" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<VehiclePORow>[] = [
    {
      id: "po_no",
      header: "採購單號",
      width: 150,
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
      width: 200,
      cell: (r) => <span className="text-[12.5px]">{r.supplier_name ?? "—"}</span>,
      exportValue: (r) => r.supplier_name ?? "",
      sortValue: (r) => r.supplier_name ?? "",
    },
    {
      id: "model_count",
      header: "車款數",
      width: 80,
      align: "right",
      cell: (r) => <span className="text-[12.5px]">{r.model_count} 款</span>,
      exportValue: (r) => r.model_count,
      sortValue: (r) => r.model_count,
    },
    {
      id: "total_qty",
      header: "台數",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
          {r.total_qty} 台
        </span>
      ),
      exportValue: (r) => r.total_qty,
      sortValue: (r) => r.total_qty,
    },
    {
      id: "order_date",
      header: "採購日期",
      width: 110,
      cell: (r) => <span className="font-mono text-[12px]">{r.order_date ?? "—"}</span>,
      exportValue: (r) => r.order_date ?? "",
      sortValue: (r) => r.order_date ?? "",
    },
    {
      id: "expected_arrival",
      header: "預計到港",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[12px]">{r.expected_arrival ?? "—"}</span>
      ),
      exportValue: (r) => r.expected_arrival ?? "",
      sortValue: (r) => r.expected_arrival ?? "",
    },
    {
      id: "total_amount_twd",
      header: "金額（未稅）",
      width: 140,
      align: "right",
      cell: (r) => (
        <span className="font-mono font-semibold text-[12px]">
          {fmtNT(r.total_amount_twd)}
        </span>
      ),
      exportValue: (r) => r.total_amount_twd,
      sortValue: (r) => r.total_amount_twd,
    },
    {
      id: "status",
      header: "狀態",
      width: 120,
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
      id: "warehouse_name",
      header: "入庫倉",
      width: 120,
      defaultHidden: true,
      cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
      exportValue: (r) => r.warehouse_name ?? "",
      sortValue: (r) => r.warehouse_name ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">整車採購訂單</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV01
        </span>
        <span className="text-[12px] text-[#9A9890]">
          對原廠 / 總代理下整車採購單・送出後車輛進入在途狀態
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
              className={`${inputClass} w-[140px]`}
            >
              <option value="all">全部</option>
              <option value="draft">草稿</option>
              <option value="submitted">已送出（在途）</option>
              <option value="in_transit">在途中</option>
              <option value="arrived">到港完成</option>
              <option value="closed">已結案</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>單號 / 供應商</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入採購單號或供應商..."
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
              ＋ 新增採購單
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 張採購單
          （本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 張）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/inventory/purchase-orders"
        exportFileName={`vehicle-purchase-orders-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.status !== "all"
            ? "無符合條件的採購單，請調整篩選條件"
            : "尚無整車採購單，點右上「＋ 新增採購單」開始"
        }
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActionsWidth={180}
        rowActions={(r) => (
          <>
            <Link
              href={`${BASE}/${r.id}`}
              className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              詳情
            </Link>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => toggleCancel(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.status === "cancelled" ? "恢復" : "取消"}
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => removePO(r)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}

const BASE = "/sales/inventory/purchase-orders";
