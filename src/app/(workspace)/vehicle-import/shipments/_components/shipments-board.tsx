"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { createShipmentAction, deleteShipmentAction } from "@/lib/vehicle-import/shipment-actions";
import type { ShipmentRow, ShipmentFilters } from "@/domain/import-shipments";
import {
  SHIPMENT_STAGES,
  SHIPMENT_STAGE_LABEL,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_CHIP,
} from "@/domain/import-shipments.constants";

type Banner = { ok: boolean; msg: string } | null;
const nt = (n: number | null) => (n == null ? "—" : `NT$ ${Math.round(n).toLocaleString("en-US")}`);

export function ShipmentsBoard({
  rows,
  filters,
  mode,
}: {
  rows: ShipmentRow[];
  filters: ShipmentFilters;
  mode: "shipments" | "landed-cost";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const basePath = mode === "landed-cost" ? "/vehicle-import/landed-cost" : "/vehicle-import/shipments";
  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fStage, setFStage] = useState(filters.stage ?? "all");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = (o: Partial<ShipmentFilters> = {}) => {
    const p = new URLSearchParams();
    const q = o.q ?? fQ.trim();
    const stage = o.stage ?? fStage;
    const status = o.status ?? fStatus;
    if (q) p.set("q", q);
    if (stage !== "all") p.set("stage", stage);
    if (status !== "all") p.set("status", status);
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const submitFilters = () => startTransition(() => router.push(buildHref()));
  const resetFilters = () => {
    setFQ("");
    setFStage("all");
    setFStatus("all");
    startTransition(() => router.push(basePath));
  };

  const createNew = () => {
    startTransition(async () => {
      const res = await createShipmentAction({});
      if (res.ok) router.push(`/vehicle-import/shipments/${res.data.id}`);
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const removeRow = (r: ShipmentRow) => {
    if (!confirm(`刪除批次「${r.shipment_no}」？（車輛會解綁、不刪車）`)) return;
    startTransition(async () => {
      const res = await deleteShipmentAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<ShipmentRow>[] = [
    {
      id: "shipment_no",
      header: "批次號",
      width: 150,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/vehicle-import/shipments/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.shipment_no}
        </Link>
      ),
      exportValue: (r) => r.shipment_no,
      sortValue: (r) => r.shipment_no,
    },
    {
      id: "stage",
      header: "階段",
      width: 90,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
          {SHIPMENT_STAGE_LABEL[r.stage] ?? r.stage}
        </span>
      ),
      exportValue: (r) => SHIPMENT_STAGE_LABEL[r.stage] ?? r.stage,
      sortValue: (r) => r.stage,
    },
    {
      id: "bl_no",
      header: "B/L · 報單",
      width: 160,
      sortable: false,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">
          {r.bl_no ?? "—"}
          {r.customs_decl_no ? ` · ${r.customs_decl_no}` : ""}
        </span>
      ),
      exportValue: (r) => `${r.bl_no ?? ""} ${r.customs_decl_no ?? ""}`,
    },
    {
      id: "vehicle_count",
      header: "車輛",
      width: 60,
      align: "right",
      cell: (r) => <span className="font-mono">{r.vehicle_count}</span>,
      exportValue: (r) => String(r.vehicle_count),
      sortValue: (r) => r.vehicle_count,
    },
    {
      id: "total_cif",
      header: "CIF 總額",
      width: 120,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{nt(r.total_cif)}</span>,
      exportValue: (r) => String(r.total_cif ?? ""),
      sortValue: (r) => r.total_cif ?? 0,
    },
    {
      id: "pool_total",
      header: "費用池合計",
      width: 120,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{nt(r.pool_total)}</span>,
      exportValue: (r) => String(r.pool_total),
      sortValue: (r) => r.pool_total,
    },
    {
      id: "eta",
      header: "ETA",
      width: 100,
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.eta ?? "—"}</span>,
      exportValue: (r) => r.eta ?? "",
      sortValue: (r) => r.eta ?? "",
    },
    {
      id: "status",
      header: "結算",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
            SHIPMENT_STATUS_CHIP[r.status] ?? ""
          }`}
        >
          {SHIPMENT_STATUS_LABEL[r.status] ?? r.status}
        </span>
      ),
      exportValue: (r) => SHIPMENT_STATUS_LABEL[r.status] ?? r.status,
      sortValue: (r) => r.status,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          {mode === "landed-cost" ? "Landed Cost 結算" : "進口批次"}
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P2P
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {mode === "landed-cost"
            ? "選批次進工作台：登錄關運保稅費 → 多基礎分攤 → 回寫每台車成本"
            : "一批 = 一張 B/L / 報單 = 多 VIN；7-stage 進度與報關資訊"}
        </span>
      </header>

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

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="批次號 / B/L / 報單"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>階段</label>
            <select className={inputClass} value={fStage} onChange={(e) => setFStage(e.target.value)}>
              <option value="all">全部</option>
              {SHIPMENT_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.short}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>結算狀態</label>
            <select className={inputClass} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">全部</option>
              <option value="open">結算中</option>
              <option value="settled">已結算</option>
              <option value="closed">已關閉</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              onClick={createNew}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增批次
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 個批次
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey={`vehicle-import/${mode}`}
        exportFileName="import-shipments"
        emptyMessage="沒有符合條件的批次（點右上「新增批次」建立）"
        disabled={isPending}
        rowActions={(r) => (
          <>
            <button
              onClick={() => router.push(`/vehicle-import/shipments/${r.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.settled ? "檢視" : "結算"}
            </button>
            <button
              onClick={() => removeRow(r)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
