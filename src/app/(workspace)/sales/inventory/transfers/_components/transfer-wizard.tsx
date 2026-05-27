"use client";

/**
 * RS_INV04 車輛調撥 — 申請 wizard
 *
 * 流程：選車 → 選來去倉 → 選運費承擔（5 種）→ A 類跳主管二次確認 modal（警告毛利影響）→ 送出。
 * 設計稿：docs/20260527/RS_INV04_車輛調撥.html
 *
 * A_VEHICLE_COST（計入整車成本）特別處理：
 *  - 輸入運費 > 0 時即時顯示毛利影響警告（紅卡）
 *  - 送出時先彈「主管二次確認」modal，確認後才帶 manager_confirmed=true 打 server action
 *  - 其餘 4 種（B/C/D/E）直接送出，不寫回車成本
 *
 * 待整備車輛（pending_recon）顯示整備工單暫停黃色警告。
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  createTransferAction,
  type CreateTransferFormInput,
} from "@/lib/vehicle-inventory/vehicle-transfer-actions";
import {
  ALL_FREIGHT_TYPES,
  FREIGHT_CODE,
  FREIGHT_TYPE_DESC,
  FREIGHT_TYPE_LABELS,
  VEHICLE_KIND_LABELS,
  freightHitsVehicleCost,
  type FreightType,
  type TransferableVehicle,
  type WarehouseOption,
} from "@/domain/vehicle-transfers.constants";

const BASE = "/sales/inventory/transfers";

function fmtNT(v: number | null): string {
  if (v == null) return "NT$—";
  return `NT$${Number(v).toLocaleString("en-US")}`;
}

type DoneResult = {
  transfer_no: string;
  freight_type: FreightType;
  hit_vehicle_cost: boolean;
  total_cost_before?: number | null;
  total_cost_after?: number | null;
};

export default function TransferWizard({
  transferNo,
  vehicles,
  warehouses,
  canEdit,
}: {
  transferNo: string;
  vehicles: TransferableVehicle[];
  warehouses: WarehouseOption[];
  canEdit: boolean;
}) {
  useSetPageHeader({
    breadcrumb: [
      { label: "車輛調撥", href: BASE },
      { label: "新增調撥申請" },
    ],
  });

  const [vehicleKey, setVehicleKey] = useState(""); // `${kind}|${id}`
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [freightType, setFreightType] = useState<FreightType>("E_NONE");
  const [freightAmt, setFreightAmt] = useState("");
  const [carrier, setCarrier] = useState("");
  const [reason, setReason] = useState("");

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false); // A 類主管二次確認 modal
  const [done, setDone] = useState<DoneResult | null>(null);

  const selectedVehicle = useMemo(
    () =>
      vehicles.find((v) => `${v.kind}|${v.id}` === vehicleKey) ?? null,
    [vehicles, vehicleKey],
  );

  const amt = Number(freightAmt.replace(/[^\d.]/g, "")) || 0;
  const isA = freightHitsVehicleCost(freightType);

  // 毛利影響：A 類運費寫回整車成本 → 毛利減少 = 運費；中古有售價時顯示新毛利
  const marginPreview = useMemo(() => {
    if (!isA || amt <= 0 || !selectedVehicle) return null;
    const totalCost = selectedVehicle.total_cost ?? 0;
    const newTotalCost = totalCost + amt;
    const price = selectedVehicle.listing_price;
    const marginBefore = price != null ? price - totalCost : null;
    const marginAfter = price != null ? price - newTotalCost : null;
    return {
      totalCost,
      newTotalCost,
      marginBefore,
      marginAfter,
      delta: amt,
    };
  }, [isA, amt, selectedVehicle]);

  const buildForm = (managerConfirmed: boolean): CreateTransferFormInput | null => {
    if (!selectedVehicle) return null;
    return {
      vehicle_kind: selectedVehicle.kind,
      vehicle_id: selectedVehicle.id,
      from_warehouse_id: fromWh || null,
      to_warehouse_id: toWh || null,
      transfer_date: transferDate || null,
      freight_type: freightType,
      freight_amount: freightType === "E_NONE" ? 0 : amt,
      carrier: carrier || null,
      reason: reason || null,
      manager_confirmed: managerConfirmed,
    };
  };

  const guard = (): string | null => {
    if (!selectedVehicle) return "請選擇要調撥的車輛";
    if (!toWh) return "請選擇調撥目的倉庫";
    if (fromWh && fromWh === toWh) return "出發倉庫與目的倉庫不可相同";
    if (isA && amt <= 0) return "「計入整車成本」需輸入運費金額";
    return null;
  };

  // 送出主入口：A 類先彈主管確認 modal，其餘直接送
  const handleSubmit = () => {
    const err = guard();
    if (err) {
      showToast(`❌ ${err}`);
      return;
    }
    if (isA && amt > 0) {
      setConfirmOpen(true);
      return;
    }
    doSubmit(false);
  };

  const doSubmit = (managerConfirmed: boolean) => {
    const form = buildForm(managerConfirmed);
    if (!form) {
      showToast("❌ 請選擇要調撥的車輛");
      return;
    }
    startTransition(async () => {
      const res = await createTransferAction(form);
      if (!res.ok) {
        showToast(`❌ ${res.error}`);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      setDone({
        transfer_no: res.data.transfer_no,
        freight_type: res.data.freight_type,
        hit_vehicle_cost: res.data.hit_vehicle_cost,
        total_cost_before: res.data.total_cost_before,
        total_cost_after: res.data.total_cost_after,
      });
    });
  };

  const lockCls = isPending ? "pointer-events-none opacity-60" : "";

  // ── 成功卡 ──
  if (done) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-8">
        <div className="rounded-xl bg-gradient-to-br from-[#1A3A5C] to-[#185FA5] text-white p-7 shadow-lg">
          <div className="text-[20px] font-bold mb-1">✅ 調撥申請已送出！</div>
          <div className="text-[13px] opacity-90 mb-4">
            車輛狀態：調撥中・目的地已收到通知
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12.5px]">
              調撥單號：<b className="font-mono">{done.transfer_no}</b>
            </span>
            <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12.5px]">
              運費承擔：<b>{FREIGHT_TYPE_LABELS[done.freight_type]}</b>
            </span>
          </div>
          {done.hit_vehicle_cost && (
            <div className="rounded-md bg-white/10 p-3 text-[12px] leading-relaxed mb-5">
              <b>💰 運費已計入整車成本：</b>
              <br />
              整車成本：{fmtNT(done.total_cost_before ?? null)} →{" "}
              <b className="text-[#5DCAA5]">{fmtNT(done.total_cost_after ?? null)}</b>
              （transfer_freight_cost 已更新、total_cost 自動反映）
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href={BASE}
              className="px-4 py-2 rounded-md bg-white text-[#1A3A5C] text-[12.5px] font-semibold"
            >
              ← 回調撥紀錄
            </Link>
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setVehicleKey("");
                setFreightAmt("");
                setCarrier("");
                setReason("");
                setFreightType("E_NONE");
              }}
              className="px-4 py-2 rounded-md bg-white/15 border border-white/30 text-[12.5px] font-semibold"
            >
              ＋ 再建一筆
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-[1000px] mx-auto px-6 py-5 space-y-3 pb-20 ${lockCls}`}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            車輛調撥
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{transferNo}</span>
          <span className="ml-1 px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <Link
          href={BASE}
          className="ml-auto h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          ← 返回列表
        </Link>
      </div>

      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">新增調撥申請</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV04
        </span>
      </header>

      {/* 調撥車輛 */}
      <Panel icon="🔄" title="調撥車輛" sub="跨倉 / 跨點調撥的車輛與來去倉">
        <Grid cols={3}>
          <Field label="選擇車輛" required>
            <select
              className={inputCls}
              value={vehicleKey}
              onChange={(e) => setVehicleKey(e.target.value)}
            >
              <option value="">— 選擇車輛 —</option>
              {vehicles.map((v) => (
                <option key={`${v.kind}|${v.id}`} value={`${v.kind}|${v.id}`}>
                  [{VEHICLE_KIND_LABELS[v.kind]}] {v.label}
                  {v.vin_tail ? ` …${v.vin_tail}` : ""}（{v.status_label}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="調撥出發倉庫">
            <select
              className={inputCls}
              value={fromWh}
              onChange={(e) => setFromWh(e.target.value)}
            >
              <option value="">— 出發倉庫 —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="調撥目的倉庫" required>
            <select
              className={inputCls}
              value={toWh}
              onChange={(e) => setToWh(e.target.value)}
            >
              <option value="">— 目的倉庫 —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </Grid>

        {/* 待整備車輛警告 */}
        {selectedVehicle?.pending_recon && (
          <div className="mt-3 rounded-lg bg-[#FDF3E3] border-[1.5px] border-[#F0C97E] p-3">
            <div className="text-[12.5px] font-bold text-[#6B3A00] mb-1">
              ⚠️ 此車輛狀態為「{selectedVehicle.status_label}」— 整備工單將暫停並移交
            </div>
            <div className="text-[12px] text-[#5A3200] leading-relaxed">
              整備前調撥：整備工單將暫停，移交目的地後由當地技師繼續執行，整備費用仍計入整車成本。
              <br />
              建議：整備完成後再調撥，可避免工單交接的複雜度。
            </div>
          </div>
        )}
      </Panel>

      {/* 運費承擔方式（5 種）*/}
      <Panel icon="🚚" title="運費承擔方式（5 種）" sub="A 計入整車成本會影響毛利、需主管二次確認">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          {ALL_FREIGHT_TYPES.map((t) => {
            const sel = freightType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFreightType(t)}
                className={`rounded-lg border-[1.5px] p-2.5 text-center transition-colors ${
                  sel
                    ? "border-[#1A3A5C] bg-[#EAF4FB]"
                    : "border-[#EEECE6] bg-white hover:border-[#1A3A5C]"
                }`}
              >
                <div className="text-[13px] font-bold font-mono text-[#1A3A5C]">
                  {FREIGHT_CODE[t]}
                </div>
                <div className="text-[11px] font-semibold text-[#2C2C2A]">
                  {FREIGHT_TYPE_LABELS[t]}
                </div>
                <div className="text-[10px] text-[#9A9890]">{FREIGHT_TYPE_DESC[t]}</div>
              </button>
            );
          })}
        </div>

        {/* 運費承擔說明卡 */}
        <FreightImpactNote freightType={freightType} />

        <div className="mt-3">
          <Grid cols={2}>
            <Field label="預估運費（NT$）" required={isA}>
              <input
                className={`${inputCls} font-mono`}
                type="number"
                placeholder="0"
                value={freightType === "E_NONE" ? "" : freightAmt}
                disabled={freightType === "E_NONE"}
                onChange={(e) => setFreightAmt(e.target.value)}
              />
            </Field>
            <Field label="物流商 / 運送方式">
              <input
                className={inputCls}
                placeholder="例：黑貓宅急便 / 自有貨車"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </Field>
            <Field label="調撥原因">
              <input
                className={inputCls}
                placeholder="例：客戶指定展示、區域庫存調節..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Field label="預計調撥完成日">
              <input
                className={`${inputCls} font-mono`}
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </Field>
          </Grid>
        </div>

        {/* A 類毛利影響警告（即時）*/}
        {isA && amt > 0 && marginPreview && (
          <div className="mt-3 rounded-lg bg-[#FDECEA] border-[1.5px] border-[#F5AEAD] p-3 text-[12px] text-[#7A1010] leading-relaxed">
            <b>⚠️ 毛利影響警告：</b>此運費計入整車成本後，整車成本{" "}
            <span className="font-mono">{fmtNT(marginPreview.totalCost)}</span> →{" "}
            <b className="font-mono">{fmtNT(marginPreview.newTotalCost)}</b>
            {marginPreview.marginBefore != null && (
              <>
                ，毛利{" "}
                <span className="font-mono">{fmtNT(marginPreview.marginBefore)}</span> →{" "}
                <b className="font-mono">{fmtNT(marginPreview.marginAfter)}</b>
                （減少 <b>{fmtNT(marginPreview.delta)}</b>）
              </>
            )}
            。送出時需<b>主管二次確認</b>。
          </div>
        )}
      </Panel>

      {/* 動作列 */}
      <div className="flex justify-end gap-2">
        <Link href={BASE} className={btnGhost + " inline-flex items-center"}>
          取消
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !canEdit}
          className={`${btnTeal} disabled:opacity-60`}
        >
          {isPending ? "送出中⋯" : "✅ 送出調撥申請"}
        </button>
      </div>

      {/* A 類主管二次確認 modal */}
      {confirmOpen && marginPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[480px] rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#FDECEA] border-b-[1.5px] border-[#F5AEAD]">
              <div className="text-[15px] font-bold text-[#CC0000]">
                ⚠️ 主管二次確認 — 運費計入整車成本
              </div>
              <div className="text-[12px] text-[#7A1010] mt-0.5">
                此操作將提高該車整車成本、直接影響毛利，確認後才送出。
              </div>
            </div>
            <div className="px-5 py-4 space-y-2.5 text-[12.5px]">
              <ConfirmRow
                label="調撥車輛"
                value={`${selectedVehicle ? VEHICLE_KIND_LABELS[selectedVehicle.kind] : ""}・${selectedVehicle?.label ?? ""}`}
              />
              <ConfirmRow label="運費金額" value={fmtNT(marginPreview.delta)} mono />
              <ConfirmRow
                label="整車成本"
                value={`${fmtNT(marginPreview.totalCost)} → ${fmtNT(marginPreview.newTotalCost)}`}
                mono
              />
              {marginPreview.marginBefore != null && (
                <ConfirmRow
                  label="毛利"
                  value={`${fmtNT(marginPreview.marginBefore)} → ${fmtNT(marginPreview.marginAfter)}`}
                  mono
                  danger
                />
              )}
            </div>
            <div className="px-5 py-3 bg-[#F8F7F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
                className={btnGhost}
              >
                返回修改
              </button>
              <button
                type="button"
                onClick={() => doSubmit(true)}
                disabled={isPending}
                className={`${btnDanger} disabled:opacity-60`}
              >
                {isPending ? "送出中⋯" : "主管確認・計入成本送出"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-[12.5px] z-[60] bg-[#1A3A5C] text-white max-w-[320px] leading-relaxed">
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helper components / styles
// ============================================================

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#85B7EB] bg-white disabled:bg-[#F2F2F2] disabled:text-[#9A9890]";
const btnTeal =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] transition-colors";
const btnGhost =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";
const btnDanger =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#CC0000] text-white hover:bg-[#a80016] transition-colors";

function FreightImpactNote({ freightType }: { freightType: FreightType }) {
  if (freightType === "A_VEHICLE_COST") {
    return (
      <div className="rounded-lg bg-[#EAF4FB] border-[1.5px] border-[#85B7EB] p-2.5 text-[12px] text-[#0C3E70]">
        <b>💡 計入整車成本：</b>運費將加入該車 transfer_freight_cost
        欄位，整車成本合計（total_cost）自動更新、影響毛利計算。送出需主管二次確認。
      </div>
    );
  }
  if (freightType === "E_NONE") {
    return (
      <div className="rounded-lg bg-[#F2F2F2] border-[1.5px] border-[#D5D3CB] p-2.5 text-[12px] text-[#6B6A68]">
        <b>ℹ️ 免運費：</b>transfer_freight_cost = 0，整車成本不受影響。
      </div>
    );
  }
  const names: Record<Exclude<FreightType, "A_VEHICLE_COST" | "E_NONE">, string> = {
    B_FROM: "調出方",
    C_TO: "調入方（寄倉方）",
    D_SPLIT: "雙方各半",
  };
  return (
    <div className="rounded-lg bg-[#EAF4FB] border-[1.5px] border-[#85B7EB] p-2.5 text-[12px] text-[#0C3E70]">
      <b>💡 {names[freightType as keyof typeof names]}負擔：</b>
      費用計入對應部門費用科目，整車成本不受影響。
    </div>
  );
}

function ConfirmRow({
  label,
  value,
  mono,
  danger,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11.5px] text-[#9A9890]">{label}</span>
      <span
        className={`font-semibold ${mono ? "font-mono" : ""} ${danger ? "text-[#CC0000]" : "text-[#2C2C2A]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Panel({
  icon,
  title,
  sub,
  children,
}: {
  icon: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <span className="text-[16px]">{icon}</span>
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
          {sub && <div className="text-[11px] text-[#9A9890]">{sub}</div>}
        </div>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={`grid grid-cols-1 gap-x-4 gap-y-3 ${
        cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
      }`}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">
        {label} {required && <span className="text-[#CC0000]">*</span>}
      </label>
      {children}
    </div>
  );
}
