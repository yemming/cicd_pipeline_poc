"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { CostCardRow, CostCardFilters } from "@/domain/import-cost-cards";

const nt = (n: number | null) => (n == null ? "—" : `NT$ ${Math.round(n).toLocaleString("en-US")}`);

export function CostCardsBoard({
  rows,
  filters,
}: {
  rows: CostCardRow[];
  filters: CostCardFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fSettled, setFSettled] = useState(filters.settled ?? "imported");

  const buildHref = (o: Partial<CostCardFilters> = {}) => {
    const p = new URLSearchParams();
    const q = o.q ?? fQ.trim();
    const settled = o.settled ?? fSettled;
    if (q) p.set("q", q);
    if (settled && settled !== "all") p.set("settled", settled);
    const qs = p.toString();
    return qs ? `/vehicle-import/cost-cards?${qs}` : "/vehicle-import/cost-cards";
  };
  const submit = () => startTransition(() => router.push(buildHref()));

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<CostCardRow>[] = [
    {
      id: "vin",
      header: "VIN",
      width: 150,
      hideable: false,
      cell: (r) => (
        <Link href={`/vehicle-import/cost-cards/${r.id}`} className="font-mono font-semibold text-[#1A3A5C] hover:underline">
          {r.vin ?? r.id.slice(0, 8)}
        </Link>
      ),
      exportValue: (r) => r.vin ?? "",
      sortValue: (r) => r.vin ?? "",
    },
    { id: "model", header: "車型", cell: (r) => r.model_display_name ?? "—", exportValue: (r) => r.model_display_name ?? "", sortValue: (r) => r.model_display_name ?? "" },
    { id: "shipment_no", header: "批次", width: 140, cell: (r) => <span className="font-mono text-[11.5px] text-[#5A5955]">{r.shipment_no ?? "—"}</span>, exportValue: (r) => r.shipment_no ?? "", sortValue: (r) => r.shipment_no ?? "" },
    { id: "cost_price", header: "貨款", width: 110, align: "right", cell: (r) => <span className="font-mono text-[12px]">{nt(r.cost_price)}</span>, exportValue: (r) => String(r.cost_price), sortValue: (r) => r.cost_price },
    { id: "tax", header: "進口稅費", width: 110, align: "right", cell: (r) => <span className="font-mono text-[12px]">{nt(r.customs_duty + r.commodity_tax)}</span>, exportValue: (r) => String(r.customs_duty + r.commodity_tax), sortValue: (r) => r.customs_duty + r.commodity_tax },
    { id: "import_fees", header: "間接費用", width: 110, align: "right", cell: (r) => <span className="font-mono text-[12px]">{nt(r.import_fees)}</span>, exportValue: (r) => String(r.import_fees), sortValue: (r) => r.import_fees },
    { id: "total_cost", header: "整車成本", width: 120, align: "right", cell: (r) => <span className="font-mono text-[12px] font-semibold text-[#1A3A5C]">{nt(r.total_cost)}</span>, exportValue: (r) => String(r.total_cost), sortValue: (r) => r.total_cost },
    {
      id: "margin",
      header: "毛利 / 率",
      width: 130,
      align: "right",
      cell: (r) =>
        r.gross_margin == null ? (
          <span className="text-[#9A9890]">—</span>
        ) : (
          <span className={`font-mono text-[12px] ${r.gross_margin >= 0 ? "text-[#3B6D11]" : "text-[#CC0000]"}`}>
            {nt(r.gross_margin)}
            {r.margin_pct != null ? ` (${r.margin_pct}%)` : ""}
          </span>
        ),
      exportValue: (r) => (r.gross_margin == null ? "" : String(r.gross_margin)),
      sortValue: (r) => r.gross_margin ?? -Infinity,
    },
    {
      id: "frozen",
      header: "成本狀態",
      width: 90,
      cell: (r) =>
        r.cost_frozen_at ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">🔒 已凍結</span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">可調整</span>
        ),
      exportValue: (r) => (r.cost_frozen_at ? "已凍結" : "可調整"),
      sortValue: (r) => (r.cost_frozen_at ? 1 : 0),
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">車輛成本歸集卡</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">個別認定</span>
        <span className="text-[12px] text-[#9A9890]">每台車 = 一個成本單位（VIN）；貨款 + 進口稅費 + 間接分攤 + 攤提 = 真實整車成本</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input className={inputClass} placeholder="VIN / 顏色" value={fQ} onChange={(e) => setFQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>範圍</label>
            <select className={inputClass} value={fSettled} onChange={(e) => setFSettled(e.target.value)}>
              <option value="imported">僅進口批次車</option>
              <option value="all">全部新車</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={submit} disabled={isPending} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60">
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">共 <b className="text-[#2C2C2A]">{rows.length}</b> 台</span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="vehicle-import/cost-cards"
        exportFileName="vehicle-cost-cards"
        emptyMessage="沒有車輛（先在進口批次 commit Landed Cost 分攤）"
        disabled={isPending}
        rowActions={(r) => (
          <button
            onClick={() => router.push(`/vehicle-import/cost-cards/${r.id}`)}
            disabled={isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            成本卡
          </button>
        )}
      />
    </main>
  );
}
