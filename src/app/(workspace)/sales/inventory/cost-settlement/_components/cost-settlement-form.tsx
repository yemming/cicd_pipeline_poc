"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  allocateImportCosts,
  type SettlementPODetail,
} from "@/domain/cost-settlement.constants";
import { settleCostAction } from "@/lib/vehicle-inventory/cost-settlement-actions";

const BASE = "/sales/inventory/cost-settlement";

const NT = (v: number) => `NT$${Math.round(v).toLocaleString("en-US")}`;
const NUM = (v: number) => Math.round(v).toLocaleString("en-US");

type Banner = { ok: boolean; msg: string } | null;

export default function CostSettlementForm({
  detail,
  canEdit,
}: {
  detail: SettlementPODetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [customs, setCustoms] = useState<string>(String(detail.existing_customs || 0));
  const [freight, setFreight] = useState<string>(String(detail.existing_freight || 0));
  const [insurance, setInsurance] = useState<string>(String(detail.existing_insurance || 0));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2600);
  };

  const nCustoms = Math.max(0, Math.round(Number(customs) || 0));
  const nFreight = Math.max(0, Math.round(Number(freight) || 0));
  const nInsurance = Math.max(0, Math.round(Number(insurance) || 0));
  const totalImport = nCustoms + nFreight + nInsurance;
  const totalPurchase = detail.total_purchase_cost;
  const totalBatch = totalPurchase + totalImport;

  // 即時預覽：用跟 server action 同一支純函式分攤，所見即所得
  const lines = useMemo(
    () =>
      allocateImportCosts(
        detail.vehicles.map((v) => ({ id: v.id, original_price: v.original_price })),
        { customs: nCustoms, freight: nFreight, insurance: nInsurance },
      ),
    [detail.vehicles, nCustoms, nFreight, nInsurance],
  );
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const sumLanded = lines.reduce((s, l) => s + l.new_cost_price, 0);

  const handleSettle = () => {
    if (!canEdit) {
      showBanner({ ok: false, msg: "無權限執行結算（需 SALES_ORDER_EDIT）" });
      return;
    }
    startTransition(async () => {
      const res = await settleCostAction(detail.id, {
        customs: nCustoms,
        freight: nFreight,
        insurance: nInsurance,
      });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 結算完成 — ${res.data.po_no} 共 ${res.data.vehicle_count} 台整車成本已更新`,
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inpSm =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono text-right bg-white outline-none focus:border-[#185FA5] disabled:bg-[#F4F3F0]";

  const lock = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            整車採購財務結算
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{detail.po_no}</span>
          {detail.settled ? (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF3DE] text-[#3B6D11]">
              已結算（可重算）
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
              待結算
            </span>
          )}
        </div>
        <Link
          href={BASE}
          className="ml-auto h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
      </div>

      {/* 批次資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 採購單資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <Kv label="採購單號" value={detail.po_no} mono />
          <Kv label="供應商" value={detail.supplier_name ?? "—"} />
          <Kv label="到港日期" value={detail.expected_arrival ?? "—"} mono />
          <Kv label="本批次台數" value={`${detail.vehicles.length} 台`} />
          <Kv label="採購金額合計" value={NT(totalPurchase)} mono />
          <Kv
            label="結算狀態"
            value={detail.settled ? "已結算" : "待結算"}
          />
          <Kv label="採購日期" value={detail.order_date ?? "—"} mono />
          <Kv label="採購單狀態" value={detail.status} />
        </div>
      </section>

      {/* 進口費用輸入 */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lock}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 進口費用輸入</span>
          <span className="ml-2 text-[11px] text-[#9A9890]">
            依實際發票金額填入・系統按採購成本比例分攤至各台
          </span>
        </header>
        <div className="px-4 py-4 space-y-2">
          <CostRow label="關稅（進口稅）" value={customs} onChange={setCustoms} inpSm={inpSm} disabled={isPending} />
          <CostRow label="海運運費" value={freight} onChange={setFreight} inpSm={inpSm} disabled={isPending} />
          <CostRow label="進口保險費" value={insurance} onChange={setInsurance} inpSm={inpSm} disabled={isPending} />

          {/* total bar */}
          <div className="bg-[#1A3A5C] rounded-lg px-5 py-3.5 flex items-center justify-between flex-wrap gap-3 mt-3">
            <div className="text-center">
              <div className="text-[10px] text-white/65 mb-1">採購成本合計</div>
              <div className="text-[14px] font-bold font-mono text-white">{NT(totalPurchase)}</div>
            </div>
            <div className="w-px h-9 bg-white/20" />
            <div className="text-center">
              <div className="text-[10px] text-white/65 mb-1">進口費用合計</div>
              <div className="text-[14px] font-bold font-mono text-white">{NT(totalImport)}</div>
            </div>
            <div className="w-px h-9 bg-white/20" />
            <div className="text-center">
              <div className="text-[10px] text-white/65 mb-1">批次整車成本合計</div>
              <div className="text-[18px] font-bold font-mono text-[#5DCAA5]">{NT(totalBatch)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 分攤結果 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 各台車輛成本分攤結果</span>
          <span className="ml-2 text-[11px] text-[#9A9890]">確認後寫回各台車輛主檔（cost_price 升級為到岸成本）</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#1A3A5C] text-white">
                <th className="px-2.5 py-2 text-left text-[11px] font-semibold w-[40px]">#</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-semibold">車型</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-semibold">顏色</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-semibold">VIN末6碼</th>
                <th className="px-2.5 py-2 text-right text-[11px] font-semibold">採購成本</th>
                <th className="px-2.5 py-2 text-right text-[11px] font-semibold">關稅</th>
                <th className="px-2.5 py-2 text-right text-[11px] font-semibold">運費</th>
                <th className="px-2.5 py-2 text-right text-[11px] font-semibold">保險</th>
                <th className="px-2.5 py-2 text-right text-[11px] font-semibold">整車成本合計</th>
              </tr>
            </thead>
            <tbody>
              {detail.vehicles.map((v, idx) => {
                const l = lineById.get(v.id);
                const vin6 = v.vin ? v.vin.slice(-6) : "—";
                return (
                  <tr key={v.id} className="border-b border-[#F4F3F0] hover:bg-[#F8F7F4]">
                    <td className="px-2.5 py-2 text-[#9A9890]">{idx + 1}</td>
                    <td className="px-2.5 py-2 font-medium">{v.model_display_name ?? "—"}</td>
                    <td className="px-2.5 py-2 text-[11.5px] text-[#5A5955]">{v.color ?? "—"}</td>
                    <td className="px-2.5 py-2 font-mono text-[11.5px]">…{vin6}</td>
                    <td className="px-2.5 py-2 text-right font-mono">{NUM(v.original_price)}</td>
                    <td className="px-2.5 py-2 text-right font-mono">{NUM(l?.customs ?? 0)}</td>
                    <td className="px-2.5 py-2 text-right font-mono">{NUM(l?.freight ?? 0)}</td>
                    <td className="px-2.5 py-2 text-right font-mono">{NUM(l?.insurance ?? 0)}</td>
                    <td className="px-2.5 py-2 text-right font-mono font-bold text-[#1A3A5C]">
                      {NUM(l?.new_cost_price ?? v.original_price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#E1F5EE] font-bold text-[#0F6E56]">
                <td colSpan={4} className="px-2.5 py-2 text-right">合計</td>
                <td className="px-2.5 py-2 text-right font-mono">{NUM(totalPurchase)}</td>
                <td className="px-2.5 py-2 text-right font-mono">{NUM(nCustoms)}</td>
                <td className="px-2.5 py-2 text-right font-mono">{NUM(nFreight)}</td>
                <td className="px-2.5 py-2 text-right font-mono">{NUM(nInsurance)}</td>
                <td className="px-2.5 py-2 text-right font-mono text-[13px]">{NUM(sumLanded)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 動作列 */}
      <div className="flex justify-end gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSettle}
          disabled={isPending || !canEdit}
          className="h-[34px] px-6 rounded-lg text-[13px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {isPending
            ? "結算中…"
            : detail.settled
              ? "✅ 重新結算 — 重寫各台整車成本"
              : "✅ 確認結算 — 寫回各台整車成本"}
        </button>
      </div>

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 max-w-[360px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}

function CostRow({
  label,
  value,
  onChange,
  inpSm,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inpSm: string;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_180px_140px] gap-3 items-center px-3 py-2 rounded-md border border-[#EEECE6] bg-white">
      <div className="text-[12.5px]">{label}</div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inpSm}
      />
      <div className="text-[11.5px] text-[#9A9890] text-right">按採購成本比例</div>
    </div>
  );
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
