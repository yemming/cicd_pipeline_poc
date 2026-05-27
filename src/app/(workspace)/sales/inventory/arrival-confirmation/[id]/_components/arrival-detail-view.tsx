"use client";

import Link from "next/link";

import type { ArrivalDetail, ArrivalStatus } from "@/domain/vehicle-arrivals";

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

function carStatusChip(status: string): { cls: string; label: string } {
  switch (status) {
    case "pending_pdi":
      return { cls: "bg-[#EEEDFE] text-[#534AB7]", label: "待PDI" };
    case "damaged":
      return { cls: "bg-[#FDF3E3] text-[#854F0B]", label: "損傷" };
    case "available":
      return { cls: "bg-[#E8F5F0] text-[#0F6E56]", label: "可售" };
    case "in_transit":
      return { cls: "bg-[#FDF3E3] text-[#854F0B]", label: "在途" };
    default:
      return { cls: "bg-[#F2F2F2] text-[#6B6A68]", label: status };
  }
}

function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function ArrivalDetailView({ arrival }: { arrival: ArrivalDetail }) {
  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            到港確認
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{arrival.arrival_no}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={BASE}
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          <Link
            href={`${BASE}/new`}
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
          >
            新增到港確認
          </Link>
          <Link
            href="/sales/showroom/new-cars"
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
          >
            RS03A 新車庫存
          </Link>
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">到港確認 / RS_INV02</div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
          {arrival.arrival_no}
        </h1>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
          <span className="text-[#5A5955] font-mono">採購單 {arrival.po_no ?? "—"}</span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusChip(arrival.status)}`}
          >
            {STATUS_LABELS[arrival.status]}
          </span>
          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
            {arrival.total_vehicles} 台
          </span>
          {arrival.confirmed_vehicles > 0 ? (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEEDFE] text-[#534AB7]">
              {arrival.confirmed_vehicles} 台待PDI
            </span>
          ) : null}
          {arrival.damaged_vehicles > 0 ? (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              {arrival.damaged_vehicles} 台損傷
            </span>
          ) : null}
        </div>
      </header>

      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 到港資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="到港批次號" value={arrival.arrival_no} mono />
          <Kv label="採購單號" value={arrival.po_no} mono />
          <Kv label="供應商" value={arrival.supplier_name} />
          <Kv label="到港日期" value={arrival.arrival_date} mono />
          <Kv label="收貨倉" value={arrival.warehouse_name} />
          <Kv label="狀態" value={STATUS_LABELS[arrival.status]} />
          <Kv label="車輛總數" value={`${arrival.total_vehicles} 台`} mono />
          <Kv label="待PDI（無損傷）" value={`${arrival.confirmed_vehicles} 台`} mono />
          <Kv label="損傷車輛" value={`${arrival.damaged_vehicles} 台`} mono />
        </div>
        {typeof arrival.metadata?.notes === "string" && arrival.metadata.notes ? (
          <div className="px-4 pb-4">
            <Kv label="備註" value={String(arrival.metadata.notes)} />
          </div>
        ) : null}
      </section>

      {/* 本批車輛 + PDI 工單 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 本批車輛與 PDI 工單</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="text-left font-medium px-4 py-2 w-[50px]">#</th>
                <th className="text-left font-medium px-4 py-2">車系 / 車型</th>
                <th className="text-left font-medium px-4 py-2 w-[120px]">顏色</th>
                <th className="text-left font-medium px-4 py-2">VIN</th>
                <th className="text-left font-medium px-4 py-2 w-[90px]">狀態</th>
                <th className="text-left font-medium px-4 py-2">PDI 工單 / 損傷說明</th>
              </tr>
            </thead>
            <tbody>
              {arrival.vehicles.map((v, i) => {
                const chip = carStatusChip(v.status);
                return (
                  <tr key={v.new_car_id} className="border-b border-[#F4F3F0]">
                    <td className="px-4 py-2 text-[#9A9890]">{i + 1}</td>
                    <td className="px-4 py-2">
                      {v.model_series ? (
                        <span className="text-[#9A9890]">{v.model_series} · </span>
                      ) : null}
                      {v.model_display_name ?? "—"}
                    </td>
                    <td className="px-4 py-2">{v.color ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-[12px]">{v.vin ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {v.damage_flag ? (
                        <span className="text-[#854F0B]">{v.damage_notes ?? "損傷（未填說明）"}</span>
                      ) : v.pdi_ro_code ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="font-mono text-[12px] text-[#185FA5]">
                            {v.pdi_ro_code}
                          </span>
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-[#E8F5F0] text-[#0F6E56]">
                            整車成本
                          </span>
                        </span>
                      ) : (
                        <span className="text-[#9A9890]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-[12px] text-[#9A9890] px-1">
        無損傷車輛已轉「待PDI（PENDING_PDI）」並各建立一張 PD-IN 工單（費用歸屬整車成本）。技師可前往
        02_PDI 工單執行作業；完成後車輛轉可售。
      </div>
    </main>
  );
}
