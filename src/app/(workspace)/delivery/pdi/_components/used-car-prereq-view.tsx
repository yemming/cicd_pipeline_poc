"use client";

/**
 * [輪6-2] 中古車交車 STEP 2 — 車況報告確認
 *
 * 取代新車的「PDI 完成確認」。中古車沒有原廠 PDI 工單，
 * 前置條件改為確認 used_car_inventory.metadata.condition_report.customer_acknowledged_at 有值，
 * 代表客戶已在售前確認車況報告（電子簽名 / 書面確認）。
 */

import { useEffect, useState } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import {
  loadUsedCarDeliveryPrereqAction,
  updateDeliveryStepAction,
} from "@/lib/delivery/delivery-actions";
import type { DeliveryRow } from "@/lib/deliveries";
import type { UsedCarDeliveryPrereq } from "@/domain/deliveries.constants";

/** Asia/Taipei 可見時間（ISO → YYYY-MM-DD HH:mm 台北） */
function fmtTaipei(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return `${t.toISOString().slice(0, 16).replace("T", " ")}（台北）`;
}

export function UsedCarPrereqView({ delivery }: { delivery: DeliveryRow }) {
  const deliveryId = delivery.id;

  const [prereq, setPrereq] = useState<UsedCarDeliveryPrereq | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setLoadError(null);
    const res = await loadUsedCarDeliveryPrereqAction(deliveryId);
    setLoading(false);
    if (res.ok) setPrereq(res.data);
    else setLoadError(res.error);
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId]);

  const canProceed = prereq?.canProceed ?? false;
  const nextDisabled = loading || !canProceed;

  async function handleNext(): Promise<boolean> {
    if (!canProceed) return false;
    const res = await updateDeliveryStepAction(
      deliveryId,
      "pdi",
      {
        // 中古車：PDI step 以「車況報告確認」完成，pdi_work_order_no 留空
        pdi_checklist: [],
        pdi_work_order_no: undefined,
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
          ? "確認車況報告 → 配件安裝 →"
          : "⛔ 客戶尚未確認車況，無法繼續交車"
      }
      onNext={handleNext}
    >
      {/* 載入 / 錯誤狀態 */}
      {loading && (
        <section
          className="bg-white border border-[#EEECE6] rounded-lg p-6 text-[12px] text-[#9A9890]"
          data-testid="used-prereq-loading"
        >
          確認中古車車況確認狀態⋯
        </section>
      )}
      {loadError && !loading && (
        <section
          className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3 text-[12.5px] text-[#CC0000] flex items-center justify-between gap-3"
          data-testid="used-prereq-error"
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

      {/* 確認卡 */}
      {!loading && !loadError && prereq && (
        <UsedCarPrereqCard prereq={prereq} onRefresh={() => void loadStatus()} />
      )}

      {/* 說明面板 */}
      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="used-prereq-explainer"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#EAF4FB] inline-flex items-center justify-center text-[13px]">
            ℹ️
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              中古車交車前置條件
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              取代新車 PDI 工單確認
            </div>
          </div>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="bg-[#EAF4FB] rounded-md px-3 py-2.5">
            <div className="text-[11.5px] font-bold text-[#185FA5] mb-1">
              ✅ 中古車流程要求
            </div>
            <div className="text-[12px] text-[#0C3E70] leading-[1.7]">
              客戶<b>在簽約前</b>已確認「車況報告（Condition Report）」
              <br />→ 確認記錄存在 used_car_inventory.metadata
              <br />→ <code className="font-mono text-[11px]">condition_report.customer_acknowledged_at</code> 有值
              <br />→ 才可進入交車流程
            </div>
          </div>
          <div className="bg-[#FDF3E3] rounded-md px-3 py-2.5">
            <div className="text-[11.5px] font-bold text-[#854F0B] mb-1">
              ⚠️ 尚未確認時的處理
            </div>
            <div className="text-[12px] text-[#5A3200] leading-[1.7]">
              請至「中古車庫存」找到對應車輛，
              <br />
              完成「車況報告確認」流程（取得客戶電子 / 書面簽名後，
              <br />
              由倉管將確認時間戳寫入 condition_report），
              <br />
              再回此頁重新整理。
            </div>
          </div>
        </div>
      </section>
    </DeliveryFrame>
  );
}

function UsedCarPrereqCard({
  prereq,
  onRefresh,
}: {
  prereq: UsedCarDeliveryPrereq;
  onRefresh: () => void;
}) {
  if (prereq.state === "ok") {
    return (
      <section
        className="rounded-lg p-4 bg-[#E1F5EE] border-2 border-[#5DCAA5]"
        data-testid="used-prereq-card"
        data-prereq-state="ok"
      >
        <div className="text-[14px] font-bold text-[#085041] mb-1.5">
          ✅ 客戶已確認車況報告 — 本車可進行交車
        </div>
        <p className="text-[12px] text-[#0F4A35] leading-[1.7] mb-3">
          客戶已於售前確認中古車車況報告，簽名記錄已存檔。可繼續進行交車流程。
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <OkChip label="車況確認時間" value={fmtTaipei(prereq.customerAcknowledgedAt)} />
          <OkChip label="車輛庫存狀態" value={prereq.carStatus ?? "—"} />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#5DCAA5] text-[#085041] hover:bg-[#d3f0e6]"
            data-testid="used-prereq-refresh-btn"
          >
            🔄 重新整理狀態
          </button>
        </div>
      </section>
    );
  }

  // blocked（含 no linked car）
  return (
    <section
      className="rounded-lg p-4 bg-[#FDECEA] border-2 border-[#F5AEAD]"
      data-testid="used-prereq-card"
      data-prereq-state="blocked"
    >
      <div className="text-[14px] font-bold text-[#7A1010] mb-1.5">
        ⛔ 客戶尚未確認車況報告 — 無法進行交車
      </div>
      <p className="text-[12px] text-[#5A1010] leading-[1.7] mb-3">
        {!prereq.hasLinkedCar
          ? "找不到本交車單關聯的中古車庫存（VIN 未對到 used_car_inventory）。請確認車身號碼已正確填入交車單，並已完成入庫登錄。"
          : "客戶尚未確認車況報告，或確認記錄尚未寫入系統。請完成「車況報告確認」程序後再來此頁。"}
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <BlockedChip label="關聯庫存" value={prereq.hasLinkedCar ? "找到" : "未找到"} />
        <BlockedChip label="客戶確認" value={prereq.customerAcknowledgedAt ? "已確認" : "尚未確認"} />
        {prereq.carStatus && (
          <BlockedChip label="車輛狀態" value={prereq.carStatus} />
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#F5AEAD] text-[#7A1010] hover:bg-[#fbdcd9]"
          data-testid="used-prereq-refresh-btn"
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

function BlockedChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-white border border-[#F5AEAD] rounded-md px-2.5 py-1 text-[12px] text-[#7A1010]">
      {label}：<b className="font-mono">{value}</b>
    </span>
  );
}
