"use client";

import { useEffect, useState } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import {
  loadDeliveryPdiStatusAction,
  updateDeliveryStepAction,
} from "@/lib/delivery/delivery-actions";
import type { DeliveryRow } from "@/lib/deliveries";
import type { DeliveryPdiStatus } from "@/domain/sales-delivery.constants";

const NT = (n: number | null) =>
  n == null ? "—" : `NT$${Math.round(n).toLocaleString("en-US")}`;

/**
 * RS05 STEP 2 — PDI 完成確認
 *
 * 修正前的錯誤：此頁有「建立 PDI 工單並通知 SA」按鈕，等於交車當天才做 PDI。
 * 正確邏輯：PDI 在車輛到港(INV02)時即觸發、技師做完關單；交車時只「確認 PDI 已完成」。
 *
 * 依該交車單關聯車輛（VIN join new_car_inventory → pdi_workorder repair_orders）的
 * PDI 狀態顯示三態卡：ok 綠 / pending 黃 / blocked 紅。非 ok 時鎖住下一步。
 */
export function PdiView({
  delivery,
  pdiItems,
}: {
  delivery: DeliveryRow;
  /** 依品牌中性化後的 PDI 整備項目（ducati 保留原廠術語、其他品牌中性版） */
  pdiItems: string[];
}) {
  const deliveryId = delivery.id;

  const [pdi, setPdi] = useState<DeliveryPdiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setLoadError(null);
    const res = await loadDeliveryPdiStatusAction(deliveryId);
    setLoading(false);
    if (res.ok) setPdi(res.data);
    else setLoadError(res.error);
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId]);

  const effectiveState: DeliveryPdiStatus["state"] = pdi?.state ?? "blocked";
  const canProceed = pdi?.canProceed ?? false;
  // 載入中時暫鎖，避免使用者搶在判定前推進
  const nextDisabled = loading || !canProceed;

  async function handleNext(): Promise<boolean> {
    if (!canProceed) return false;
    const res = await updateDeliveryStepAction(
      deliveryId,
      "pdi",
      {
        // 確認 PDI 已完成；副本 29 項全數視為通過
        pdi_checklist: pdiItems.map((_, i) => i),
        pdi_work_order_no: pdi?.workOrderNo ?? undefined,
      },
      "pdi_complete",
    );
    if (!res.ok) {
      setLoadError(res.error);
      return false;
    }
    return true;
  }

  return (
    <DeliveryFrame
      stepId={2}
      delivery={delivery}
      stepDone={canProceed}
      nextDisabled={nextDisabled}
      nextLabel={
        canProceed
          ? "確認 PDI 已完成 → 配件安裝 →"
          : "⛔ PDI 未完成，無法繼續交車"
      }
      onNext={handleNext}
    >
      {/* 載入 / 錯誤狀態 */}
      {loading && (
        <section
          className="bg-white border border-[#EEECE6] rounded-lg p-6 text-[12px] text-[#9A9890]"
          data-testid="pdi-status-loading"
        >
          確認 PDI 狀態中⋯
        </section>
      )}
      {loadError && !loading && (
        <section
          className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3 text-[12.5px] text-[#CC0000] flex items-center justify-between gap-3"
          data-testid="pdi-status-error"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
          >
            重新整理
          </button>
        </section>
      )}

      {/* 三態確認卡 */}
      {!loading && !loadError && (
        <PdiConfirmCard
          state={effectiveState}
          pdi={pdi}
          demoMode={false}
          onRefresh={() => void loadStatus()}
        />
      )}

      {/* 說明面板：為何 PDI 在此只「確認」而非「觸發」 */}
      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="pdi-explainer-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#EAF4FB] inline-flex items-center justify-center text-[13px]">
            ℹ️
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              關於 PDI 整備工單
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              流程說明 · RS 人員請詳閱
            </div>
          </div>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="bg-[#EAF4FB] rounded-md px-3 py-2.5">
            <div className="text-[11.5px] font-bold text-[#185FA5] mb-1">
              ✅ 正確流程
            </div>
            <div className="text-[12px] text-[#0C3E70] leading-[1.7]">
              車輛<b>到港入庫時</b>，系統自動觸發 PDI 工單（INV02 到港確認）
              <br />→ 售後技師執行 29 項檢查
              <br />→ 主管核准
              <br />→ <b>車輛狀態變為「可銷售」</b>
              <br />→ 業務才能配車並建立訂單
            </div>
          </div>
          <div className="bg-[#FDECEA] rounded-md px-3 py-2.5">
            <div className="text-[11.5px] font-bold text-[#7A1010] mb-1">
              ❌ 舊版錯誤設計
            </div>
            <div className="text-[12px] text-[#5A1010] leading-[1.7]">
              舊版把「PDI 觸發」放在交車流程的第一步，
              <br />
              這代表車輛<b>賣出之後才做 PDI</b>，邏輯錯誤。
              <br />
              PDI 應在<b>入庫時</b>完成，
              <br />
              交車時只需「確認副本」即可。
            </div>
          </div>
        </div>
      </section>

      {/* PDI 檢查清單（29 項）— 唯讀副本，僅供核對 */}
      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="pdi-checklist-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#FDECEA] inline-flex items-center justify-center text-[13px]">
            📋
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              PDI 檢查清單副本（29 項）
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              入庫時已由技師逐項完成 · 此處僅供交車核對
            </div>
          </div>
          <span
            className={`ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold ${
              effectiveState === "ok"
                ? "bg-[#E1F5EE] text-[#0F6E56]"
                : "bg-[#F1EFE8] text-[#5A5955]"
            }`}
            data-testid="pdi-copy-count"
          >
            {effectiveState === "ok"
              ? `${pdiItems.length} / ${pdiItems.length}`
              : `0 / ${pdiItems.length}`}
          </span>
        </header>
        <div className="px-4 py-3">
          <div className="flex flex-col gap-1" data-testid="pdi-checklist">
            {pdiItems.map((t, i) => {
              const done = effectiveState === "ok";
              return (
                <div
                  key={i}
                  data-testid={`pdi-item-${i}`}
                  className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded border ${
                    done
                      ? "bg-[#E1F5EE] border-[#5DCAA5]"
                      : "bg-[#FAFAF8] border-[#EEECE6]"
                  }`}
                >
                  <span
                    className={`w-[17px] h-[17px] rounded border-2 flex items-center justify-center text-[10px] mt-0.5 shrink-0 ${
                      done
                        ? "bg-[#0F6E56] border-[#0F6E56] text-white"
                        : "border-[#D5D3CB] text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="font-mono text-[10.5px] text-[#9A9890] min-w-[22px] mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[12.5px] flex-1 leading-relaxed text-[#2C2C2A]">
                    {t}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </DeliveryFrame>
  );
}

function PdiConfirmCard({
  state,
  pdi,
  demoMode,
  onRefresh,
}: {
  state: DeliveryPdiStatus["state"];
  pdi: DeliveryPdiStatus | null;
  demoMode: boolean;
  onRefresh: () => void;
}) {
  if (state === "ok") {
    const wo = pdi?.workOrderNo ?? (demoMode ? "PD-IN-260515-003（示範）" : "—");
    const completed = pdi?.completedDate ?? (demoMode ? "2026-05-15" : "—");
    const tech = pdi?.technicianName ?? (demoMode ? "林建宏 SA" : "—");
    const cost =
      (pdi?.pdiLaborCost ?? 0) + (pdi?.pdiPartsCost ?? 0) > 0
        ? `工時 ${NT(pdi?.pdiLaborCost ?? 0)} + 零件 ${NT(pdi?.pdiPartsCost ?? 0)}`
        : "整車成本（內部結算）";
    return (
      <section
        className="rounded-lg p-4 bg-[#E1F5EE] border-2 border-[#5DCAA5]"
        data-testid="pdi-confirm-card"
        data-pdi-state="ok"
      >
        <div className="text-[14px] font-bold text-[#085041] mb-1.5">
          ✅ PDI 整備已完成 — 本車可進行交車
        </div>
        <p className="text-[12px] text-[#0F4A35] leading-[1.7] mb-3">
          本車已於入庫時完成 PDI 整備（Pre-Delivery Inspection）29 項檢查，技師簽核存檔。
          PDI 費用已計入整車成本，<b>不向客戶收取</b>。請確認以下資訊後繼續交車流程。
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <OkChip label="PDI 工單號" value={wo} />
          <OkChip label="完成日期" value={completed} />
          <OkChip label="執行技師" value={tech} />
          <OkChip label="PDI 項目" value="29 / 29 項" />
          <OkChip label="費用歸屬" value={cost} />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#5DCAA5] text-[#085041] hover:bg-[#d3f0e6]"
            data-testid="pdi-refresh-btn"
          >
            🔄 重新整理狀態
          </button>
        </div>
      </section>
    );
  }

  if (state === "pending") {
    return (
      <section
        className="rounded-lg p-4 bg-[#FDF3E3] border-2 border-[#F0C97E]"
        data-testid="pdi-confirm-card"
        data-pdi-state="pending"
      >
        <div className="text-[14px] font-bold text-[#6B3A00] mb-1.5">
          ⚠️ PDI 整備進行中 — 請等待完成後再交車
        </div>
        <p className="text-[12px] text-[#5A3200] leading-[1.7] mb-3">
          本車的 PDI 整備工單正在進行中。請至技師工作台完成 29 項檢查並由主管核准後，系統將自動更新狀態，方可繼續交車流程。
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <PendingChip label="PDI 工單號" value={pdi?.workOrderNo ?? "—"} />
          <PendingChip
            label="工單狀態"
            value={pdi?.workOrderStatus ?? "進行中"}
          />
          <PendingChip label="車輛狀態" value={pdi?.carStatus ?? "pending_pdi"} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <a
            href="/parts/aftersales/repair-orders"
            target="_blank"
            rel="noreferrer"
            className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#F0C97E] text-[#6B3A00] hover:bg-[#fbe9c8]"
            data-testid="pdi-goto-workbench-btn"
          >
            前往技師工作台
          </a>
          <button
            type="button"
            onClick={onRefresh}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#F0C97E] text-[#6B3A00] hover:bg-[#fbe9c8]"
            data-testid="pdi-refresh-btn"
          >
            🔄 重新整理狀態
          </button>
        </div>
      </section>
    );
  }

  // blocked
  return (
    <section
      className="rounded-lg p-4 bg-[#FDECEA] border-2 border-[#F5AEAD]"
      data-testid="pdi-confirm-card"
      data-pdi-state="blocked"
    >
      <div className="text-[14px] font-bold text-[#7A1010] mb-1.5">
        ⛔ PDI 整備尚未完成 — 無法進行交車
      </div>
      <p className="text-[12px] text-[#5A1010] leading-[1.7] mb-3">
        {pdi && !pdi.hasLinkedCar
          ? "找不到本交車單關聯的庫存車輛（VIN 未對到 new_car_inventory）。請先於 INV02 到港確認頁完成入庫並觸發 PDI 工單。"
          : "本車的 PDI 整備工單尚未建立或未完成。請售後技師完成 PDI 並由主管核准後，方可繼續交車流程。如有急件需求，請聯絡售後主管處理。"}
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <BlockedChip label="PDI 工單號" value={pdi?.workOrderNo ?? "（無工單）"} />
        <BlockedChip
          label="工單狀態"
          value={pdi?.workOrderStatus ?? "未建立"}
        />
        <BlockedChip label="車輛狀態" value={pdi?.carStatus ?? "—"} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <a
          href="/sales/inventory/arrival-confirmation"
          target="_blank"
          rel="noreferrer"
          className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#F5AEAD] text-[#7A1010] hover:bg-[#fbdcd9]"
          data-testid="pdi-goto-arrival-btn"
        >
          前往 INV02 到港確認
        </a>
        <button
          type="button"
          onClick={onRefresh}
          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#F5AEAD] text-[#7A1010] hover:bg-[#fbdcd9]"
          data-testid="pdi-refresh-btn"
        >
          🔄 重新整理狀態
        </button>
      </div>
    </section>
  );
}

function OkChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-white border border-[#5DCAA5] rounded-md px-2.5 py-1 text-[12px] text-[#085041]">
      {label}：<b className="font-mono">{value}</b>
    </span>
  );
}

function PendingChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-white border border-[#F0C97E] rounded-md px-2.5 py-1 text-[12px] text-[#6B3A00]">
      {label}：<b className="font-mono">{value}</b>
    </span>
  );
}

function BlockedChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-white border border-[#F5AEAD] rounded-md px-2.5 py-1 text-[12px] text-[#7A1010]">
      {label}：<b className="font-mono">{value}</b>
    </span>
  );
}
