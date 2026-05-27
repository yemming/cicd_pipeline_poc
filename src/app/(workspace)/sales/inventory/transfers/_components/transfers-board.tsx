"use client";

/**
 * RS_INV04 車輛調撥 — 列表（DataGrid）
 *
 * 設計稿：docs/20260527/RS_INV04_車輛調撥.html（調撥紀錄表）
 * Filter（狀態 / 運費承擔 / 車輛種類 / 關鍵字）→ URLSearchParams 推 router.push。
 * 列尾「詳情 / 推進 / 取消」操作走 setTransferStatusAction（pending UI）。
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { setTransferStatusAction } from "@/lib/vehicle-inventory/vehicle-transfer-actions";
import {
  ALL_FREIGHT_TYPES,
  ALL_TRANSFER_STATUSES,
  FREIGHT_TYPE_CHIP,
  FREIGHT_TYPE_LABELS,
  TRANSFER_STATUS_CHIP,
  TRANSFER_STATUS_LABELS,
  VEHICLE_KIND_LABELS,
  type TransferStatus,
  type VehicleTransferRow,
} from "@/domain/vehicle-transfers.constants";

const BASE = "/sales/inventory/transfers";

function fmtNT(v: number | null): string {
  if (v == null) return "—";
  return `NT$${Number(v).toLocaleString("en-US")}`;
}

export default function TransfersBoard({
  rows,
  totalCount,
  canEdit,
  filters,
}: {
  rows: VehicleTransferRow[];
  totalCount: number;
  canEdit: boolean;
  filters: { status: string; freight_type: string; vehicle_kind: string; q: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fStatus, setFStatus] = useState(filters.status);
  const [fFreight, setFFreight] = useState(filters.freight_type);
  const [fKind, setFKind] = useState(filters.vehicle_kind);
  const [fQ, setFQ] = useState(filters.q);

  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const showBanner = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildQs = (o: Partial<typeof filters>) => {
    const params = new URLSearchParams();
    const status = o.status ?? fStatus;
    const freight = o.freight_type ?? fFreight;
    const kind = o.vehicle_kind ?? fKind;
    const q = o.q ?? fQ;
    if (status) params.set("status", status);
    if (freight) params.set("freight_type", freight);
    if (kind) params.set("vehicle_kind", kind);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return qs ? `${BASE}?${qs}` : BASE;
  };

  const submitFilters = () => startTransition(() => router.push(buildQs({})));
  const resetFilters = () => {
    setFStatus("");
    setFFreight("");
    setFKind("");
    setFQ("");
    startTransition(() => router.push(BASE));
  };

  const advance = (r: VehicleTransferRow, next: TransferStatus) => {
    startTransition(async () => {
      const res = await setTransferStatusAction(r.id, next);
      if (res.ok) {
        showBanner(true, `✓ ${r.transfer_no} 已更新為「${TRANSFER_STATUS_LABELS[next]}」`);
        router.refresh();
      } else {
        showBanner(false, `❌ ${res.error}`);
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<VehicleTransferRow>[] = [
    {
      id: "transfer_no",
      header: "調撥單號",
      width: 160,
      hideable: false,
      cell: (r) => (
        <span className="font-mono font-semibold text-[12px] text-[#1A3A5C]">
          {r.transfer_no}
        </span>
      ),
      exportValue: (r) => r.transfer_no,
      sortValue: (r) => r.transfer_no,
    },
    {
      id: "vehicle_kind",
      header: "種類",
      width: 70,
      cell: (r) =>
        r.vehicle_kind ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
            {VEHICLE_KIND_LABELS[r.vehicle_kind]}
          </span>
        ) : (
          <span className="text-[12px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.vehicle_kind ? VEHICLE_KIND_LABELS[r.vehicle_kind] : ""),
      sortValue: (r) => r.vehicle_kind ?? "",
    },
    {
      id: "vehicle",
      header: "車輛",
      width: 200,
      cell: (r) => <span className="text-[12.5px]">{r.vehicle_label ?? "—"}</span>,
      exportValue: (r) => r.vehicle_label ?? "",
      sortValue: (r) => r.vehicle_label ?? "",
    },
    {
      id: "from",
      header: "從",
      width: 130,
      cell: (r) => <span className="text-[12px]">{r.from_warehouse_name ?? "—"}</span>,
      exportValue: (r) => r.from_warehouse_name ?? "",
      sortValue: (r) => r.from_warehouse_name ?? "",
    },
    {
      id: "to",
      header: "到",
      width: 130,
      cell: (r) => <span className="text-[12px]">{r.to_warehouse_name ?? "—"}</span>,
      exportValue: (r) => r.to_warehouse_name ?? "",
      sortValue: (r) => r.to_warehouse_name ?? "",
    },
    {
      id: "freight_type",
      header: "運費承擔",
      width: 130,
      cell: (r) =>
        r.freight_type ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${FREIGHT_TYPE_CHIP[r.freight_type]}`}
          >
            {FREIGHT_TYPE_LABELS[r.freight_type]}
          </span>
        ) : (
          <span className="text-[12px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.freight_type ? FREIGHT_TYPE_LABELS[r.freight_type] : ""),
      sortValue: (r) => r.freight_type ?? "",
    },
    {
      id: "freight_amount",
      header: "運費",
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px]">
          {r.freight_type === "E_NONE" ? "免運" : fmtNT(r.freight_amount)}
        </span>
      ),
      exportValue: (r) => r.freight_amount ?? 0,
      sortValue: (r) => r.freight_amount ?? 0,
    },
    {
      id: "transfer_date",
      header: "申請日",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.transfer_date ?? "—"}
        </span>
      ),
      exportValue: (r) => r.transfer_date ?? "",
      sortValue: (r) => r.transfer_date ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${TRANSFER_STATUS_CHIP[r.status]}`}
        >
          {TRANSFER_STATUS_LABELS[r.status]}
        </span>
      ),
      exportValue: (r) => TRANSFER_STATUS_LABELS[r.status],
      sortValue: (r) => r.status,
    },
  ];

  const statusOpts = [
    { value: "", label: "全部狀態" },
    ...ALL_TRANSFER_STATUSES.map((s) => ({
      value: s,
      label: TRANSFER_STATUS_LABELS[s],
    })),
  ];
  const freightOpts = [
    { value: "", label: "全部運費承擔" },
    ...ALL_FREIGHT_TYPES.map((t) => ({ value: t, label: FREIGHT_TYPE_LABELS[t] })),
  ];
  const kindOpts: { value: string; label: string }[] = [
    { value: "", label: "全部車種" },
    { value: "new", label: VEHICLE_KIND_LABELS.new },
    { value: "used", label: VEHICLE_KIND_LABELS.used },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">車輛調撥</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV04
        </span>
        <span className="text-[12px] text-[#9A9890]">
          車輛跨倉 / 跨點調撥・5 種運費承擔方式（A 計入整車成本須主管確認）
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className={`${inputClass} w-[120px]`}
            >
              {statusOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>運費承擔</label>
            <select
              value={fFreight}
              onChange={(e) => setFFreight(e.target.value)}
              className={`${inputClass} w-[150px]`}
            >
              {freightOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>車種</label>
            <select
              value={fKind}
              onChange={(e) => setFKind(e.target.value)}
              className={`${inputClass} w-[110px]`}
            >
              {kindOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>單號 / 物流 / 原因</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入關鍵字..."
              className={`${inputClass} w-[200px]`}
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
              ＋ 新增調撥申請
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 筆調撥單
          （本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/inventory/transfers"
        exportFileName={`vehicle-transfers-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.status || filters.freight_type || filters.vehicle_kind
            ? "無符合條件的調撥單，請調整篩選條件"
            : "尚無調撥單，點右上「＋ 新增調撥申請」開始"
        }
        rowActionsWidth={170}
        rowActions={(r) => (
          <div className="flex gap-1.5">
            {r.status === "in_transit" && canEdit && (
              <button
                type="button"
                onClick={() => advance(r, "completed")}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#dfeece] disabled:opacity-60"
              >
                確認到達
              </button>
            )}
            {r.status === "pending" && canEdit && (
              <button
                type="button"
                onClick={() => advance(r, "in_transit")}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                出發
              </button>
            )}
            {(r.status === "pending" || r.status === "in_transit") && canEdit && (
              <button
                type="button"
                onClick={() => advance(r, "cancelled")}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
              >
                取消
              </button>
            )}
            {r.status === "completed" && (
              <span className="h-[26px] inline-flex items-center px-2.5 text-[11.5px] text-[#9A9890]">
                已完成
              </span>
            )}
            {r.status === "cancelled" && (
              <span className="h-[26px] inline-flex items-center px-2.5 text-[11.5px] text-[#9A9890]">
                已取消
              </span>
            )}
          </div>
        )}
      />

      {/* Banner */}
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
    </main>
  );
}
