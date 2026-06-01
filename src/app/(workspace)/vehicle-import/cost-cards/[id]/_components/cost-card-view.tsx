"use client";

import Link from "next/link";

import type { CostCardDetail } from "@/domain/import-cost-cards";
import { COST_TYPE_LABEL } from "@/domain/import-landed-cost.constants";

const nt = (n: number) => `NT$ ${Math.round(n).toLocaleString("en-US")}`;

export function CostCardView({ card }: { card: CostCardDetail }) {
  // 分攤明細分類：直接稅費 / 間接費用 / 攤提 / 進項VAT
  // 直接稅費＝歸入 customs_duty / commodity_tax 欄者；推貿費(trade_fee)歸 import_fees bucket → 列在間接，避免重複顯示
  const direct = card.allocations.filter((a) => ["customs_duty", "commodity_tax"].includes(a.bucket));
  const indirect = card.allocations.filter((a) => a.bucket === "import_fees");
  const amort = card.allocations.filter((a) => a.bucket === "model_amortized_cost");
  const vat = card.allocations.filter((a) => a.cost_type === "import_vat");
  const vatTotal = vat.reduce((s, a) => s + a.allocated_amount, 0);

  const sectionHead = "px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* breadcrumb */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/vehicle-import/cost-cards" className="hover:text-[#185FA5]">
            車輛成本歸集卡
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{card.vin ?? card.id.slice(0, 8)}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {card.shipment_id && (
            <Link
              href={`/vehicle-import/shipments/${card.shipment_id}`}
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center shadow-sm bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              回批次工作台
            </Link>
          )}
          <button
            onClick={() => window.open(`/print/vehicle-cost-card/${card.id}`, "_blank")}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center gap-1 shadow-sm bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            title="列印成本卡 / 另存 PDF"
          >
            <span className="material-symbols-outlined text-[14px]">print</span>
            列印
          </button>
          <button
            onClick={() => history.back()}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center shadow-sm bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            返回列表
          </button>
        </div>
      </div>

      {/* title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">車輛成本歸集卡 · 個別認定</div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
          {card.model_display_name ?? "（未指定車型）"}
        </h1>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
          <span className="font-mono text-[#5A5955]">{card.vin ?? "—"}</span>
          {card.color && <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">{card.color}</span>}
          {card.shipment_no && <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] font-mono">{card.shipment_no}</span>}
          {card.cost_frozen_at ? (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">🔒 成本已凍結</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">成本可調整</span>
          )}
        </div>
      </header>

      {/* 成本結構 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className={sectionHead}>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 成本結構</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <Kv label="車輛貨款（直接）" value={nt(card.cost_price)} />
          <Kv label="關稅" value={nt(card.customs_duty)} />
          <Kv label="貨物稅" value={nt(card.commodity_tax)} />
          <Kv label="間接費用分攤" value={nt(card.import_fees)} />
          <Kv label="車型攤提" value={nt(card.model_amortized_cost)} />
          <div className="flex flex-col">
            <span className="text-[11px] text-[#9A9890]">整車成本合計</span>
            <span className="text-[16px] font-bold text-[#1A3A5C] font-mono">{nt(card.total_cost)}</span>
          </div>
          <Kv label="標準售價 (MSRP)" value={card.list_price != null ? nt(card.list_price) : "—"} />
          <div className="flex flex-col">
            <span className="text-[11px] text-[#9A9890]">毛利試算</span>
            {card.gross_margin == null ? (
              <span className="text-[12.5px] text-[#9A9890]">—</span>
            ) : (
              <span className={`text-[14px] font-semibold font-mono ${card.gross_margin >= 0 ? "text-[#3B6D11]" : "text-[#CC0000]"}`}>
                {nt(card.gross_margin)}
                {card.margin_pct != null ? ` (${card.margin_pct}%)` : ""}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 分攤明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className={`${sectionHead} flex items-center gap-3`}>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ Landed Cost 分攤明細</span>
          <span className="text-[11px] text-[#9A9890]">來自批次費用池的個別認定分攤</span>
        </header>
        <div className="px-4 py-4 space-y-4">
          <AllocGroup title="直接稅費（關稅 / 貨物稅 / 推貿）" rows={direct} />
          <AllocGroup title="間接費用分攤（運費 / 保險 / 報關 / 內陸…）" rows={indirect} />
          <AllocGroup title="車型攤提（審驗 / 導入費）" rows={amort} />
          {card.allocations.length === 0 && (
            <p className="text-[12px] text-[#9A9890]">尚無分攤明細 —— 到批次工作台登錄費用並 commit 後顯示。</p>
          )}
          {vatTotal > 0 && (
            <p className="text-[11px] text-[#9A9890] pt-2 border-t border-[#EEECE6]">
              ⚠️ 進口營業稅 <b className="font-mono">{nt(vatTotal)}</b> 為<b>進項稅額</b>，不計入整車成本（走 GL 進項科目，可扣抵銷項）。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function AllocGroup({ title, rows }: { title: string; rows: { cost_type: string; allocated_amount: number }[] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.allocated_amount, 0);
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="font-semibold text-[#5A5955]">{title}</span>
        <span className="font-mono text-[#1A3A5C]">{nt(total)}</span>
      </div>
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-[12px] px-2 py-1 rounded bg-[#FBFAF8]">
            <span className="text-[#5A5955]">{COST_TYPE_LABEL[r.cost_type] ?? r.cost_type}</span>
            <span className="font-mono">{nt(r.allocated_amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className="text-[12.5px] text-[#2C2C2A] font-mono">{value}</span>
    </div>
  );
}
