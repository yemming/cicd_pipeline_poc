"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addPoolLineAction,
  deletePoolLineAction,
  autoAddTaxLinesAction,
  commitAllocationAction,
  type PoolLineInputDto,
} from "@/lib/vehicle-import/landed-cost-actions";
import {
  postLandedCostGlAction,
  reverseLandedCostGlAction,
} from "@/lib/vehicle-import/landed-cost-gl-actions";
import { setShipmentStageAction, deleteShipmentAction } from "@/lib/vehicle-import/shipment-actions";
import type { LandedCostWorkbench } from "@/domain/import-shipments";
import {
  SHIPMENT_STAGES,
  stageIndex,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_CHIP,
} from "@/domain/import-shipments.constants";
import {
  allocateCostPool,
  aggregateByVehicle,
  COST_TYPE_CATALOG,
  COST_TYPE_LABEL,
  ALLOCATION_BASIS_LABEL,
  type AllocationBasis,
  type PoolLineInput,
} from "@/domain/import-landed-cost.constants";

type Banner = { ok: boolean; msg: string } | null;
const nt = (n: number) => `NT$ ${Math.round(n).toLocaleString("en-US")}`;

export function ShipmentWorkbench({ wb }: { wb: LandedCostWorkbench }) {
  const router = useRouter();
  const { shipment, vehicles, poolLines, allocations } = wb;
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // add-line form
  const [cType, setCType] = useState("freight");
  const [cAmount, setCAmount] = useState("");
  const [cBasis, setCBasis] = useState<AllocationBasis>("weight");
  const [cTarget, setCTarget] = useState("");
  const [cPayee, setCPayee] = useState("");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const onPickType = (t: string) => {
    setCType(t);
    const def = COST_TYPE_CATALOG.find((c) => c.value === t);
    if (def) setCBasis(def.defaultBasis);
  };

  const curInventoriable = COST_TYPE_CATALOG.find((c) => c.value === cType)?.inventoriable ?? true;

  const addLine = () => {
    const amount = Number(cAmount);
    if (!(amount > 0)) {
      showBanner({ ok: false, msg: "金額需為正數" });
      return;
    }
    if (cBasis === "direct" && !cTarget) {
      showBanner({ ok: false, msg: "「直接歸屬」需選車輛" });
      return;
    }
    const dto: PoolLineInputDto = {
      cost_type: cType,
      amount,
      allocation_basis: cBasis,
      is_inventoriable: curInventoriable,
      target_vehicle_id: cBasis === "direct" ? cTarget : null,
      payee: cPayee || null,
    };
    startTransition(async () => {
      const res = await addPoolLineAction(shipment.id, dto);
      if (res.ok) {
        setCAmount("");
        setCPayee("");
        showBanner({ ok: true, msg: "✓ 已新增費用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const delLine = (id: string) => {
    startTransition(async () => {
      const res = await deletePoolLineAction(shipment.id, id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除費用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const autoTax = () => {
    startTransition(async () => {
      const res = await autoAddTaxLinesAction(shipment.id);
      if (res.ok) {
        const skip = res.data.skipped.length ? `（略過 ${res.data.skipped.length} 台）` : "";
        showBanner({ ok: true, msg: `✓ 已自動帶稅 ${res.data.created} 筆${skip}` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const commit = () => {
    if (!confirm("確定 commit 分攤？會把費用攤到每台車並回寫成本（可重跑覆蓋）。")) return;
    startTransition(async () => {
      const res = await commitAllocationAction(shipment.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已結算：${res.data.vehicles} 台車、${res.data.allocated} 筆分攤` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const postGl = () => {
    if (!confirm("確定過帳落地成本 GL？借存貨/留抵、貸應付，並逐車寫成本 ledger（餵 COGS）。")) return;
    startTransition(async () => {
      const res = await postLandedCostGlAction(shipment.id);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 已過帳 ${res.data.entries} 筆分錄：落地 ${nt(res.data.func_landed)}、進項 ${nt(res.data.func_import_vat)}`,
        });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const reverseGl = () => {
    if (!confirm("確定沖銷落地成本 GL？會建反向分錄並退回各車成本 ledger。")) return;
    startTransition(async () => {
      const res = await reverseLandedCostGlAction(shipment.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已沖銷 ${res.data.reversed} 筆分錄` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const setStage = (stage: string) => {
    startTransition(async () => {
      const res = await setShipmentStageAction(shipment.id, stage);
      if (res.ok) router.refresh();
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const removeShipment = () => {
    if (!confirm(`刪除批次「${shipment.shipment_no}」？車輛會解綁。`)) return;
    startTransition(async () => {
      const res = await deleteShipmentAction(shipment.id);
      if (res.ok) router.push("/vehicle-import/shipments");
      else showBanner({ ok: false, msg: res.error });
    });
  };

  // 即時分攤預覽（client 純函式）
  const preview = useMemo(() => {
    const av = vehicles.map((v) => ({
      id: v.id,
      cif_value: v.cif_value,
      gross_weight_kg: v.gross_weight_kg,
    }));
    const pl: PoolLineInput[] = poolLines.map((l) => ({
      id: l.id,
      cost_type: l.cost_type,
      amount: l.amount,
      allocation_basis: l.allocation_basis as AllocationBasis,
      is_inventoriable: l.is_inventoriable,
      target_vehicle_id: l.target_vehicle_id,
    }));
    const lines = allocateCostPool(av, pl);
    const buckets = aggregateByVehicle(lines);
    // 進項稅額（不入成本）合計
    const vatByVehicle = new Map<string, number>();
    for (const l of lines) {
      if (l.cost_type === "import_vat") vatByVehicle.set(l.vehicle_id, (vatByVehicle.get(l.vehicle_id) ?? 0) + l.allocated_amount);
    }
    return { buckets, vatByVehicle };
  }, [vehicles, poolLines]);

  const poolTotal = poolLines.reduce((s, l) => s + l.amount, 0);
  const poolInventoriable = poolLines.filter((l) => l.is_inventoriable).reduce((s, l) => s + l.amount, 0);
  const poolVat = poolTotal - poolInventoriable;

  const curStageIdx = stageIndex(shipment.stage);
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const pill = "h-[30px] px-4 rounded-full text-[12px] inline-flex items-center shadow-sm";
  const sectionHead = "px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]";

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/vehicle-import/shipments" className="hover:text-[#185FA5]">
            進口批次
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{shipment.shipment_no}</span>
          <span
            className={`px-2 py-0.5 rounded-md text-[11px] ${SHIPMENT_STATUS_CHIP[shipment.status] ?? ""}`}
          >
            {SHIPMENT_STATUS_LABEL[shipment.status] ?? shipment.status}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => router.push("/vehicle-import/shipments")}
            className={`${pill} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
          >
            返回列表
          </button>
          <button
            onClick={() => window.open(`/print/landed-cost-statement/${shipment.id}`, "_blank")}
            className={`${pill} inline-flex items-center gap-1 bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
            title="列印落地成本結算表 / 另存 PDF"
          >
            <span className="material-symbols-outlined text-[14px]">print</span>
            列印結算表
          </button>
          <button
            onClick={removeShipment}
            disabled={isPending}
            className={`${pill} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50`}
          >
            刪除
          </button>
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">進口批次 · Landed Cost Pool</div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{shipment.shipment_no}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 mt-3 text-[12.5px]">
          <Kv label="B/L" value={shipment.bl_no} mono />
          <Kv label="進口報單" value={shipment.customs_decl_no} mono />
          <Kv label="Incoterms" value={shipment.incoterms} />
          <Kv label="貨代" value={shipment.forwarder} />
          <Kv label="CIF 總額" value={shipment.total_cif != null ? nt(shipment.total_cif) : "—"} mono />
          <Kv label="海關估價" value={shipment.customs_valuation != null ? nt(shipment.customs_valuation) : "—"} mono />
          <Kv label="ETA" value={shipment.eta} />
          <Kv label="報關放行" value={shipment.customs_clear_date} />
        </div>
      </header>

      {/* 7-stage 進度 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className={sectionHead}>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 7-stage 進度</span>
        </header>
        <div className="px-4 py-4 flex items-center gap-1 flex-wrap">
          {SHIPMENT_STAGES.map((s, i) => {
            const done = i <= curStageIdx;
            return (
              <button
                key={s.value}
                onClick={() => setStage(s.value)}
                disabled={isPending}
                title={s.label}
                className={`h-[28px] px-2.5 rounded-full text-[11.5px] whitespace-nowrap border transition-colors ${
                  i === curStageIdx
                    ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                    : done
                      ? "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]"
                      : "bg-white text-[#9A9890] border-[#D5D3CB] hover:border-[#9A9890]"
                }`}
              >
                {i + 1}. {s.short}
              </button>
            );
          })}
        </div>
      </section>

      {/* 車輛 + 即時分攤預覽 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className={`${sectionHead} flex items-center gap-3`}>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 批次車輛與分攤預覽</span>
          <span className="text-[11px] text-[#9A9890]">共 {vehicles.length} 台 · 預覽即時試算（commit 後才寫回）</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="text-left px-3 py-2">VIN / 車型</th>
                <th className="text-right px-3 py-2">CIF</th>
                <th className="text-right px-3 py-2">重量(kg)</th>
                <th className="text-right px-3 py-2">貨款</th>
                <th className="text-right px-3 py-2">關稅</th>
                <th className="text-right px-3 py-2">貨物稅</th>
                <th className="text-right px-3 py-2">間接費用</th>
                <th className="text-right px-3 py-2">車型攤提</th>
                <th className="text-right px-3 py-2 text-[#9A9890]">進項VAT</th>
                <th className="text-right px-3 py-2 font-semibold">預覽整車成本</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const b =
                  preview.buckets.get(v.id) ??
                  { cost_price: 0, customs_duty: 0, commodity_tax: 0, model_amortized_cost: 0, import_fees: 0 };
                const vat = preview.vatByVehicle.get(v.id) ?? 0;
                const newTotal =
                  v.cost_price + b.customs_duty + b.commodity_tax + b.import_fees + b.model_amortized_cost;
                return (
                  <tr key={v.id} className="border-b border-[#F4F2EC]">
                    <td className="px-3 py-2">
                      <Link href={`/vehicle-import/cost-cards/${v.id}`} className="text-[#185FA5] hover:underline font-mono">
                        {v.vin ?? v.id.slice(0, 8)}
                      </Link>
                      <span className="text-[#9A9890] ml-1">{v.model_display_name ?? ""}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{nt(v.cif_value)}</td>
                    <td className="px-3 py-2 text-right">{v.gross_weight_kg || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{nt(v.cost_price)}</td>
                    <td className="px-3 py-2 text-right font-mono">{nt(b.customs_duty)}</td>
                    <td className="px-3 py-2 text-right font-mono">{nt(b.commodity_tax)}</td>
                    <td className="px-3 py-2 text-right font-mono">{nt(b.import_fees)}</td>
                    <td className="px-3 py-2 text-right font-mono">{nt(b.model_amortized_cost)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[#9A9890]">{nt(vat)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-[#1A3A5C]">{nt(newTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Landed Cost Pool */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className={`${sectionHead} flex items-center gap-3 flex-wrap`}>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ Landed Cost Pool 費用池</span>
          <span className="text-[11px] text-[#9A9890]">
            合計 {nt(poolTotal)}（入成本 {nt(poolInventoriable)} · 進項VAT {nt(poolVat)}）
          </span>
          <div className="ml-auto flex gap-1.5">
            <button
              onClick={autoTax}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              套稅則自動帶稅
            </button>
            <button
              onClick={commit}
              disabled={isPending || poolLines.length === 0 || shipment.gl_posted}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-40"
              title={shipment.gl_posted ? "已過帳 GL，需先沖銷才能重結算" : undefined}
            >
              {isPending ? "處理中⋯" : "Commit 分攤 → 回寫成本"}
            </button>
            {shipment.settled && !shipment.gl_posted ? (
              <button
                onClick={postGl}
                disabled={isPending}
                className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-40"
                title="過帳落地成本到 GL（借存貨/留抵、貸應付）+ 寫成本 ledger"
              >
                過帳 GL
              </button>
            ) : null}
            {shipment.gl_posted ? (
              <>
                <span className="inline-flex items-center h-[26px] px-2 rounded text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
                  ✓ 已過帳 GL
                </span>
                <button
                  onClick={reverseGl}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  沖銷 GL
                </button>
              </>
            ) : null}
          </div>
        </header>

        {/* add line form */}
        <div className="px-4 py-3 border-b border-[#EEECE6] bg-[#FBFAF8] flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>費用類型</label>
            <select className={inputClass} value={cType} onChange={(e) => onPickType(e.target.value)}>
              {COST_TYPE_CATALOG.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>金額 (NT$)</label>
            <input className={`${inputClass} w-[120px] font-mono`} type="number" value={cAmount} onChange={(e) => setCAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>分攤基礎</label>
            <select className={inputClass} value={cBasis} onChange={(e) => setCBasis(e.target.value as AllocationBasis)}>
              {(["direct", "cif", "weight", "qty", "model_amort"] as AllocationBasis[]).map((b) => (
                <option key={b} value={b}>
                  {ALLOCATION_BASIS_LABEL[b]}
                </option>
              ))}
            </select>
          </div>
          {cBasis === "direct" && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>歸屬車輛</label>
              <select className={inputClass} value={cTarget} onChange={(e) => setCTarget(e.target.value)}>
                <option value="">— 選擇 —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.vin ?? v.id.slice(0, 8)} {v.model_display_name ?? ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>付款對象（選填）</label>
            <input className={inputClass} value={cPayee} onChange={(e) => setCPayee(e.target.value)} placeholder="船公司 / 報關行…" />
          </div>
          <button
            onClick={addLine}
            disabled={isPending}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            ＋ 加費用
          </button>
        </div>

        {/* pool lines */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="text-left px-3 py-2">費用類型</th>
                <th className="text-right px-3 py-2">金額</th>
                <th className="text-left px-3 py-2">分攤基礎</th>
                <th className="text-left px-3 py-2">入成本</th>
                <th className="text-left px-3 py-2">付款對象</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {poolLines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[#9A9890] text-[12px]">
                    費用池是空的。先「套稅則自動帶稅」帶入關稅/貨物稅/推貿/進口營業稅，再手動加運費/保險/報關費等。
                  </td>
                </tr>
              ) : (
                poolLines.map((l) => (
                  <tr key={l.id} className="border-b border-[#F4F2EC]">
                    <td className="px-3 py-2">{COST_TYPE_LABEL[l.cost_type] ?? l.cost_type}</td>
                    <td className="px-3 py-2 text-right font-mono">{nt(l.amount)}</td>
                    <td className="px-3 py-2">{ALLOCATION_BASIS_LABEL[l.allocation_basis as AllocationBasis] ?? l.allocation_basis}</td>
                    <td className="px-3 py-2">
                      {l.is_inventoriable ? (
                        <span className="text-[#3B6D11]">是</span>
                      ) : (
                        <span className="text-[#9A9890]">進項·否</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#5A5955]">{l.payee ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => delLine(l.id)}
                        disabled={isPending}
                        className="h-[24px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {allocations.length > 0 && (
          <div className="px-4 py-2 text-[11px] text-[#3B6D11] bg-[#F6FAEE] border-t border-[#EEECE6]">
            ✓ 已 commit：{allocations.length} 筆分攤明細已寫入、成本已回寫各車（可再次 commit 覆蓋重算）
          </div>
        )}
      </section>

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

function Kv({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}
