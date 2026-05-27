"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  confirmArrivalAction,
  loadInTransitCarsAction,
  type ConfirmArrivalInput,
  type ArrivalVehicleInput,
} from "@/lib/vehicle-inventory/vehicle-arrival-actions";
import type {
  IncomingPurchaseOrder,
  InTransitCar,
} from "@/domain/vehicle-arrivals";
import type { WarehouseOption } from "@/domain/vehicle-purchase-orders";

const BASE = "/sales/inventory/arrival-confirmation";

type DamageLevel = "ok" | "minor" | "major";

type WizardCar = {
  new_car_id: string;
  series: string | null;
  model: string | null;
  color: string | null;
  vin: string;
  scanned: boolean;
  damage: DamageLevel;
  damage_notes: string;
};

type Banner = { ok: boolean; msg: string } | null;

const STEPS = [
  { n: 1, label: "選擇採購單" },
  { n: 2, label: "逐台掃描 VIN" },
  { n: 3, label: "確認損傷記錄" },
  { n: 4, label: "完成到港 · 觸發 PDI" },
];

function todayLocal(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function ArrivalWizard({
  pos,
  warehouses,
}: {
  pos: IncomingPurchaseOrder[];
  warehouses: WarehouseOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [loadingCars, setLoadingCars] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const [step, setStep] = useState(1);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);

  const [selectedPO, setSelectedPO] = useState<IncomingPurchaseOrder | null>(null);
  const [cars, setCars] = useState<WizardCar[]>([]);
  const [vinInput, setVinInput] = useState("");
  const vinRef = useRef<HTMLInputElement>(null);

  const [arrivalDate, setArrivalDate] = useState(todayLocal());
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");

  const [poFilter, setPoFilter] = useState("");

  const [result, setResult] = useState<{
    arrival_no: string;
    pdi_workorders: string[];
    pending_pdi_count: number;
    damaged_count: number;
  } | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2600);
  };

  const filteredPos = useMemo(() => {
    const t = poFilter.trim().toLowerCase();
    if (!t) return pos;
    return pos.filter(
      (p) =>
        p.po_no.toLowerCase().includes(t) ||
        (p.supplier_name ?? "").toLowerCase().includes(t),
    );
  }, [pos, poFilter]);

  const confirmedCount = cars.filter((c) => c.scanned).length;
  const total = cars.length;
  const allScanned = total > 0 && confirmedCount === total;
  const damagedCars = cars.filter((c) => c.scanned && c.damage !== "ok");
  const pdiCount = cars.filter((c) => c.scanned && c.damage === "ok").length;

  // ── STEP 1：選採購單 → 撈在途車 ──
  const selectPO = (po: IncomingPurchaseOrder) => {
    setLoadingCars(true);
    setSelectedPO(po);
    setWarehouseId(po.warehouse_id ?? "");
    startTransition(async () => {
      const res = await loadInTransitCarsAction(po.id);
      setLoadingCars(false);
      if (!res.ok) {
        showBanner({ ok: false, msg: res.error });
        setSelectedPO(null);
        return;
      }
      const list: WizardCar[] = res.data.map((c: InTransitCar) => ({
        new_car_id: c.id,
        series: c.model_series,
        model: c.model_display_name,
        color: c.color,
        vin: c.vin ?? "",
        scanned: false,
        damage: "ok",
        damage_notes: "",
      }));
      setCars(list);
      setDoneSteps((d) => Array.from(new Set([...d, 1])));
      setStep(2);
      setTimeout(() => vinRef.current?.focus(), 100);
    });
  };

  // ── STEP 2：掃 VIN ──
  const scanVIN = () => {
    const vin = vinInput.trim().toUpperCase();
    if (!vin) {
      showBanner({ ok: false, msg: "請輸入 VIN 碼" });
      return;
    }
    if (vin.length !== 17) {
      showBanner({ ok: false, msg: `VIN 必須為 17 碼（目前 ${vin.length} 碼）` });
      return;
    }
    if (cars.some((c) => c.scanned && c.vin === vin)) {
      showBanner({ ok: false, msg: `VIN 重複：${vin}` });
      return;
    }
    const targetIdx = cars.findIndex((c) => !c.scanned);
    if (targetIdx < 0) {
      showBanner({ ok: false, msg: "所有車輛已確認完畢" });
      setVinInput("");
      return;
    }
    setCars((prev) =>
      prev.map((c, i) => (i === targetIdx ? { ...c, vin, scanned: true } : c)),
    );
    setVinInput("");
    vinRef.current?.focus();
    showBanner({ ok: true, msg: `✓ 第 ${targetIdx + 1} 台確認：${vin}` });
  };

  const manualConfirm = (idx: number) => {
    // 手動確認 → 生成 demo VIN（17 碼）
    const fake = ("5VPHB36N" + String(1000000 + idx) + "P" + idx).padEnd(17, "0").slice(0, 17);
    setCars((prev) => prev.map((c, i) => (i === idx ? { ...c, vin: fake, scanned: true } : c)));
  };

  const setVinManual = (idx: number, value: string) => {
    setCars((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, vin: value.toUpperCase() } : c)),
    );
  };

  const setDamage = (idx: number, level: DamageLevel) => {
    setCars((prev) => prev.map((c, i) => (i === idx ? { ...c, damage: level } : c)));
  };

  const setDamageNotes = (idx: number, value: string) => {
    setCars((prev) => prev.map((c, i) => (i === idx ? { ...c, damage_notes: value } : c)));
  };

  const autoConfirmAll = () => {
    setCars((prev) =>
      prev.map((c, i) =>
        c.scanned
          ? c
          : {
              ...c,
              vin: ("5VPHB36N" + String(8000000 + i) + "P" + i).padEnd(17, "0").slice(0, 17),
              scanned: true,
            },
      ),
    );
    showBanner({ ok: true, msg: `✓ 全部 ${total} 台已確認（測試模式）` });
  };

  const goStep = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── STEP 4：送出 ──
  const submit = () => {
    if (!selectedPO) return;
    if (!allScanned) {
      showBanner({ ok: false, msg: "尚有車輛未掃描 VIN" });
      return;
    }
    const vehicles: ArrivalVehicleInput[] = cars.map((c) => ({
      new_car_id: c.new_car_id,
      vin: c.vin,
      damaged: c.damage !== "ok",
      damage_notes:
        c.damage !== "ok"
          ? c.damage_notes.trim() ||
            (c.damage === "minor" ? "輕微損傷" : "重大損傷")
          : null,
    }));
    const input: ConfirmArrivalInput = {
      po_id: selectedPO.id,
      arrival_date: arrivalDate || null,
      warehouse_id: warehouseId || null,
      notes: notes || null,
      vehicles,
    };
    startTransition(async () => {
      const res = await confirmArrivalAction(input);
      if (res.ok) {
        setResult({
          arrival_no: res.data.arrival_no,
          pdi_workorders: res.data.pdi_workorders,
          pending_pdi_count: res.data.pending_pdi_count,
          damaged_count: res.data.damaged_count,
        });
        setDoneSteps([1, 2, 3, 4]);
        showBanner({
          ok: true,
          msg: `✓ 到港確認完成（${res.data.arrival_no}）· ${res.data.pdi_workorders.length} 筆 PDI 工單已建立`,
        });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const cardClass = "bg-white border border-[#EEECE6] rounded-lg overflow-hidden";
  const sectHdr = "px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + 模式 badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            到港確認
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增到港確認</span>
          <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
            建立模式
          </span>
        </div>
        <div className="ml-auto">
          <Link
            href={BASE}
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Step bar */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden flex">
        {STEPS.map((s, i) => {
          const active = step === s.n;
          const done = doneSteps.includes(s.n) && !active;
          return (
            <div
              key={s.n}
              className={`flex-1 px-2 py-2.5 text-center text-[11.5px] font-medium border-r last:border-r-0 border-[#EEECE6] ${
                active
                  ? "bg-[#1A3A5C] text-white font-bold"
                  : done
                    ? "bg-[#E1F5EE] text-[#0F6E56] font-semibold cursor-pointer"
                    : "text-[#9A9890]"
              }`}
              onClick={() => {
                // 只能回到已完成的步驟（避免跳關）
                if (done || (active === false && s.n < step)) goStep(s.n);
              }}
            >
              <span className="block font-mono text-[10px] opacity-70">STEP {s.n}</span>
              {s.label}
              {i === STEPS.length - 1 ? null : null}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 ? (
        <section className={cardClass}>
          <header className={sectHdr}>
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 選擇待確認採購單</span>
            <span className="text-[11px] text-[#9A9890]">
              僅顯示尚有在途車輛（IN_TRANSIT）的採購單
            </span>
          </header>
          <div className={`px-4 py-4 ${lockedClass}`}>
            <div className="flex gap-2 mb-3 flex-wrap">
              <input
                type="text"
                value={poFilter}
                onChange={(e) => setPoFilter(e.target.value)}
                placeholder="輸入採購單號 / 供應商搜尋..."
                className="h-[30px] w-[260px] border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5]"
              />
            </div>
            {filteredPos.length === 0 ? (
              <div className="text-[12.5px] text-[#9A9890] py-8 text-center">
                目前沒有可到港確認的採購單。請先到 RS_INV01 送出採購單（會產生在途車輛）。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                      <th className="text-left font-medium px-3 py-2">採購單號</th>
                      <th className="text-left font-medium px-3 py-2">供應商</th>
                      <th className="text-left font-medium px-3 py-2">預計到港</th>
                      <th className="text-left font-medium px-3 py-2">收貨倉</th>
                      <th className="text-right font-medium px-3 py-2">在途車輛</th>
                      <th className="text-right font-medium px-3 py-2 w-[110px]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPos.map((p) => (
                      <tr key={p.id} className="border-b border-[#F4F3F0] hover:bg-[#F8F7F4]">
                        <td className="px-3 py-2 font-mono font-semibold text-[12px]">{p.po_no}</td>
                        <td className="px-3 py-2">{p.supplier_name ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{p.expected_arrival ?? "—"}</td>
                        <td className="px-3 py-2">{p.warehouse_name ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
                            {p.in_transit_count} 台
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => selectPO(p)}
                            className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                          >
                            {loadingCars && selectedPO?.id === p.id ? "載入中…" : "選擇此單"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* ── STEP 2 ── */}
      {step === 2 && selectedPO ? (
        <>
          {/* 採購單資訊 */}
          <section className={cardClass}>
            <header className={sectHdr}>
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ 採購單 {selectedPO.po_no}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                {confirmedCount} / {total} 已確認
              </span>
            </header>
            <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <KvBox label="採購單號" value={selectedPO.po_no} mono />
              <KvBox label="供應商" value={selectedPO.supplier_name ?? "—"} />
              <KvBox label="預計到港日" value={selectedPO.expected_arrival ?? "—"} />
              <KvBox label="車輛總數" value={`${total} 台`} mono />
            </div>
          </section>

          {/* VIN 掃描器 */}
          <div
            className={`rounded-xl px-6 py-5 text-white ${lockedClass}`}
            style={{ background: "linear-gradient(135deg,#1A3A5C,#0F2A45)" }}
          >
            <div className="text-[14px] font-bold mb-1">🔍 VIN 掃描確認</div>
            <div className="text-[12px] opacity-70 mb-3">
              使用掃描槍掃描車架號，或手動輸入 17 碼 VIN 後按 Enter 確認
            </div>
            <div className="flex gap-2.5 items-center">
              <input
                ref={vinRef}
                type="text"
                value={vinInput}
                maxLength={17}
                onChange={(e) => setVinInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    scanVIN();
                  }
                }}
                placeholder="掃描或輸入 VIN 碼（17碼）..."
                className="flex-1 px-3.5 py-2.5 rounded-lg font-mono text-[15px] outline-none bg-white/10 border-2 border-white/30 text-white placeholder:text-white/40 focus:border-[#5DCAA5]"
              />
              <button
                type="button"
                onClick={scanVIN}
                disabled={isPending}
                className="px-5 py-2.5 rounded-lg bg-[#5DCAA5] text-white text-[13px] font-bold hover:bg-[#3FB890] whitespace-nowrap disabled:opacity-60"
              >
                ✓ 確認
              </button>
            </div>
            <div className="flex items-center gap-2.5 mt-3">
              <span className="text-[11px] opacity-70 whitespace-nowrap">到港進度</span>
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#5DCAA5] rounded-full transition-all"
                  style={{ width: `${total ? Math.round((confirmedCount / total) * 100) : 0}%` }}
                />
              </div>
              <span className="text-[12px] font-mono text-[#5DCAA5] whitespace-nowrap">
                {confirmedCount} / {total}
              </span>
            </div>
          </div>

          {/* 車輛清單 */}
          <section className={cardClass}>
            <header className={sectHdr}>
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 本批次車輛清單</span>
              <button
                type="button"
                onClick={autoConfirmAll}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                ✅ 全部確認無損傷（測試）
              </button>
            </header>
            <div className={`overflow-x-auto ${lockedClass}`}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                    <th className="text-left font-medium px-3 py-2 w-[40px]">#</th>
                    <th className="text-left font-medium px-3 py-2">車系</th>
                    <th className="text-left font-medium px-3 py-2">車型</th>
                    <th className="text-left font-medium px-3 py-2">顏色</th>
                    <th className="text-left font-medium px-3 py-2">VIN（掃描 / 輸入）</th>
                    <th className="text-left font-medium px-3 py-2 w-[120px]">外觀狀態</th>
                    <th className="text-left font-medium px-3 py-2 w-[100px]">確認狀態</th>
                    <th className="text-left font-medium px-3 py-2 w-[100px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {cars.map((c, i) => {
                    const rowBg = c.scanned
                      ? c.damage !== "ok"
                        ? "bg-[#FDF3E3]"
                        : "bg-[#E1F5EE]"
                      : "";
                    return (
                      <tr key={c.new_car_id} className={`border-b border-[#F4F3F0] ${rowBg}`}>
                        <td className="px-3 py-2 font-mono font-semibold">{i + 1}</td>
                        <td className="px-3 py-2">{c.series ?? "—"}</td>
                        <td className="px-3 py-2">{c.model ?? "—"}</td>
                        <td className="px-3 py-2 text-[11.5px]">{c.color ?? "—"}</td>
                        <td className="px-3 py-2">
                          {c.scanned ? (
                            <span className="font-mono text-[12px]">{c.vin}</span>
                          ) : (
                            <input
                              type="text"
                              value={c.vin}
                              maxLength={17}
                              onChange={(e) => setVinManual(i, e.target.value)}
                              placeholder="未掃描"
                              className="h-[26px] w-[170px] border border-[#D5D3CB] rounded px-2 text-[11.5px] font-mono outline-none focus:border-[#185FA5]"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={c.damage}
                            onChange={(e) => setDamage(i, e.target.value as DamageLevel)}
                            className="h-[26px] border border-[#D5D3CB] rounded px-1.5 text-[11px] outline-none focus:border-[#185FA5]"
                          >
                            <option value="ok">完好</option>
                            <option value="minor">輕微損傷</option>
                            <option value="major">重大損傷</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {c.scanned ? (
                            c.damage !== "ok" ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-[#FDF3E3] text-[#854F0B]">
                                ⚠️ 損傷
                              </span>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-[#E1F5EE] text-[#0F6E56]">
                                ✅ 已確認
                              </span>
                            )
                          ) : (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-[#F1EFE8] text-[#9A9890]">
                              ⏳ 待確認
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {!c.scanned ? (
                            <button
                              type="button"
                              onClick={() => {
                                const v = c.vin.trim();
                                if (v.length === 17) {
                                  setCars((prev) =>
                                    prev.map((x, j) =>
                                      j === i ? { ...x, scanned: true, vin: v.toUpperCase() } : x,
                                    ),
                                  );
                                } else {
                                  manualConfirm(i);
                                }
                              }}
                              className="h-[26px] px-2.5 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                            >
                              手動確認
                            </button>
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

          <div className="flex justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => goStep(1)}
              className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              ← 重新選擇採購單
            </button>
            <button
              type="button"
              disabled={!allScanned || isPending}
              onClick={() => {
                setDoneSteps((d) => Array.from(new Set([...d, 2])));
                goStep(3);
              }}
              className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-40"
            >
              確認無誤 → 損傷記錄 →
            </button>
          </div>
        </>
      ) : null}

      {/* ── STEP 3 ── */}
      {step === 3 && selectedPO ? (
        <>
          <section className={cardClass}>
            <header className={sectHdr}>
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 損傷記錄確認</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                {damagedCars.length} 台損傷
              </span>
            </header>
            <div className={`px-4 py-4 space-y-3 ${lockedClass}`}>
              {damagedCars.length === 0 ? (
                <div className="bg-[#E1F5EE] border border-[#5DCAA5] rounded-lg px-4 py-3">
                  <div className="text-[13px] font-bold text-[#085041]">✅ 本批次無損傷車輛</div>
                  <div className="text-[12px] text-[#0F4A35] mt-1">
                    所有車輛外觀確認完好，可直接進行到港完成確認（每台將觸發 PDI 工單）。
                  </div>
                </div>
              ) : (
                damagedCars.map((c) => {
                  const idx = cars.indexOf(c);
                  return (
                    <div
                      key={c.new_car_id}
                      className="bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-4 py-3"
                    >
                      <div className="text-[12.5px] font-bold text-[#6B3A00] mb-2">
                        ⚠️ #{idx + 1} {c.model ?? ""} — {c.damage === "minor" ? "輕微損傷" : "重大損傷"}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <div className="md:col-span-2">
                          <div className="text-[11px] text-[#9A9890] mb-1">損傷說明</div>
                          <input
                            type="text"
                            value={c.damage_notes}
                            onChange={(e) => setDamageNotes(idx, e.target.value)}
                            placeholder="描述損傷部位與程度..."
                            className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5] bg-white"
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-[#9A9890] mb-1">VIN</div>
                          <span className="font-mono text-[12px]">{c.vin}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="text-[12px] text-[#9A9890]">
                損傷車輛不會自動建立 PDI 工單，將標記為 <b className="text-[#854F0B]">damaged</b>{" "}
                狀態，待採購人員處理。
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => goStep(2)}
              className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              ← 返回掃描
            </button>
            <button
              type="button"
              onClick={() => {
                setDoneSteps((d) => Array.from(new Set([...d, 3])));
                goStep(4);
              }}
              className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
            >
              損傷記錄完成 → 確認到港 →
            </button>
          </div>
        </>
      ) : null}

      {/* ── STEP 4 ── */}
      {step === 4 && selectedPO ? (
        <>
          {!result ? (
            <>
              {/* 到港摘要 */}
              <div className="bg-[#E1F5EE] border-2 border-[#5DCAA5] rounded-lg px-4 py-4">
                <div className="text-[14px] font-bold text-[#085041] mb-2">
                  ✅ 到港確認摘要 — 等待最終確認
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-white border border-[#5DCAA5] rounded px-3 py-1 text-[12px] text-[#085041]">
                    採購單：<b className="font-mono">{selectedPO.po_no}</b>
                  </span>
                  <span className="bg-white border border-[#5DCAA5] rounded px-3 py-1 text-[12px] text-[#085041]">
                    到港日期：<b className="font-mono">{arrivalDate}</b>
                  </span>
                  <span className="bg-white border border-[#5DCAA5] rounded px-3 py-1 text-[12px] text-[#085041]">
                    無損傷（將觸發 PDI）：<b className="font-mono">{pdiCount} 台</b>
                  </span>
                  <span className="bg-white border border-[#5DCAA5] rounded px-3 py-1 text-[12px] text-[#085041]">
                    損傷車輛：<b className="font-mono">{damagedCars.length} 台</b>
                  </span>
                </div>
              </div>

              {/* 系統觸發說明 */}
              <div className="bg-[#0F6E56]/[0.08] border border-[#5DCAA5] rounded-lg px-4 py-3">
                <div className="text-[12.5px] font-bold text-[#085041] mb-1.5">
                  🔄 確認後系統將自動執行：
                </div>
                <div className="text-[12px] text-[#0F4A35] leading-relaxed">
                  1 · {pdiCount} 台無損傷車輛狀態 <b>IN_TRANSIT</b> → <b>PENDING_PDI（待PDI）</b>
                  ，寫入 VIN / 到港日 / 批次 id
                  <br />
                  2 · 自動建立 <b>PDI 工單（PD-IN）× {pdiCount} 筆</b>，費用歸屬：整車成本（內部結算）
                  <br />
                  3 · {damagedCars.length} 台損傷車輛標記 <b>DAMAGED</b>（不建 PDI 工單）
                  <br />
                  4 · 推送通知售後主管：「{pdiCount} 台新車到港，PDI 工單已建立，請分派技師」
                  <br />
                  5 · <b>RS03A 新車庫存看板</b>出現本批次車輛（待PDI）
                </div>
              </div>

              {/* 收貨倉確認 */}
              <section className={cardClass}>
                <header className={sectHdr}>
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 收貨倉庫確認</span>
                </header>
                <div className={`px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3 ${lockedClass}`}>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890] font-medium">
                      實際收貨倉庫 <span className="text-[#CC0000]">*</span>
                    </label>
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5] bg-white"
                    >
                      <option value="">—（未指定）</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code ? `${w.code} ${w.name}` : w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890] font-medium">
                      實際到港日期 <span className="text-[#CC0000]">*</span>
                    </label>
                    <input
                      type="date"
                      value={arrivalDate}
                      onChange={(e) => setArrivalDate(e.target.value)}
                      className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5] bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[11px] text-[#9A9890] font-medium">備註</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="例：部分車輛外包裝受潮，已拍照存檔"
                      className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5] bg-white"
                    />
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => goStep(3)}
                  className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  ← 返回損傷記錄
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="h-[34px] px-6 rounded text-[13px] font-bold bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                >
                  {isPending ? "確認中…" : "✅ 確認到港 · 建立 PDI 工單"}
                </button>
              </div>
            </>
          ) : (
            /* 完成卡 */
            <div
              className="rounded-xl px-6 py-5 text-white"
              style={{ background: "linear-gradient(135deg,#085041,#0F6E56)" }}
            >
              <div className="text-[18px] font-bold mb-1.5">🎉 到港確認完成！PDI 工單已建立</div>
              <div className="text-[12px] opacity-85 mb-3 leading-relaxed">
                到港批次 <b className="font-mono">{result.arrival_no}</b> ·{" "}
                {result.pending_pdi_count} 台車輛已更新為 待PDI ·{" "}
                {result.pdi_workorders.length} 筆 PD-IN 工單已建立
                {result.damaged_count > 0 ? ` · ${result.damaged_count} 台損傷待處理` : ""} ·
                售後主管已收到通知
              </div>
              {result.pdi_workorders.length > 0 ? (
                <div className="bg-white/[0.12] rounded-lg px-4 py-3 text-[12px] leading-relaxed mb-3 font-mono">
                  {result.pdi_workorders.map((code) => (
                    <div key={code}>
                      <b>{code}</b>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2 flex-wrap">
                <Link
                  href={BASE}
                  className="px-4 py-2 rounded-lg bg-white text-[#085041] text-[12.5px] font-semibold"
                >
                  📋 返回到港確認列表
                </Link>
                <Link
                  href="/sales/showroom/new-cars"
                  className="px-4 py-2 rounded-lg bg-white/15 text-white border border-white/30 text-[12.5px] font-semibold"
                >
                  RS03A 新車庫存 →
                </Link>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Banner toast */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 whitespace-pre-line max-w-[360px] ${
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

function KvBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-[#F4F3F0] rounded-lg px-3 py-2">
      <div className="text-[10.5px] text-[#9A9890] mb-0.5">{label}</div>
      <div className={`text-[13px] font-semibold text-[#2C2C2A] ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </div>
    </div>
  );
}
