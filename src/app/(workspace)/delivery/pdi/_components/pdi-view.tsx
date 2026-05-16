"use client";

import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { PDI_ITEMS } from "@/components/delivery/delivery-constants";
import { useDelivery } from "@/lib/delivery-store";

export function PdiView() {
  const { state, togglePdi, togglePdiAll, triggerPdiWorkOrder } = useDelivery();
  const total = PDI_ITEMS.length;
  const done = state.pdiChecked.length;
  const pct = Math.round((done / total) * 100);
  const allIdx = PDI_ITEMS.map((_, i) => i);
  const stepDone = done === total;

  return (
    <DeliveryFrame
      stepId={2}
      stepDone={stepDone}
      nextDisabled={!state.pdiWorkOrderNo}
      nextLabel={
        stepDone ? "PDI 完成 → 配件安裝 →" : "PDI 整備中 → 配件安裝 →"
      }
    >
      <section
        className="bg-[#FDECEA] border-2 border-[#C8001A] rounded-lg p-4"
        data-testid="pdi-trigger-card"
      >
        <div className="text-[14px] font-bold text-[#7A1010] mb-1">
          🔧 觸發 PDI 整備工單（必做）
        </div>
        <p className="text-[12px] text-[#5A1010] leading-relaxed mb-3">
          交車前須由售後技師完成 PDI（Pre-Delivery Inspection）29 項整備檢查。
          本觸發建立內部工單（前綴碼 PD-IN），費用由銷售部門結算，車主不須付費。
          PDI 完成後方可進行交車。
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <Chip label="工單前綴碼" value="PD-IN" />
          <Chip label="付款性質" value="內部結算（銷售→售後）" />
          <Chip label="PDI 項目" value="29 項" />
          <Chip label="預計工時" value="2–3 小時" />
        </div>
        {state.pdiWorkOrderNo ? (
          <div
            className="bg-[#E1F5EE] border border-[#5DCAA5] rounded px-3 py-2 text-[12.5px] text-[#085041]"
            data-testid="pdi-wo-confirmed"
          >
            <b>✅ PDI 工單已建立</b>　工單號：
            <span className="font-mono">{state.pdiWorkOrderNo}</span>
            　·　已通知技師張建國　·　預計完成：3 小時
          </div>
        ) : (
          <button
            type="button"
            onClick={triggerPdiWorkOrder}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
            data-testid="pdi-trigger-btn"
          >
            🔧 建立 PDI 工單並通知 SA
          </button>
        )}
      </section>

      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="pdi-checklist-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#FDECEA] inline-flex items-center justify-center text-[13px]">
            🔧
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              PDI 檢查清單（29 項）
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              技師執行 · RS 確認結果
            </div>
          </div>
          <span
            className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold bg-[#F1EFE8] text-[#5A5955]"
            data-testid="pdi-progress-count"
          >
            {done} / {total}
          </span>
        </header>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-[11.5px] font-semibold whitespace-nowrap">
              PDI 進度
            </span>
            <div className="flex-1 h-[7px] bg-[#EEECE6] rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#0F6E56] to-[#5DCAA5] rounded transition-all"
                style={{ width: `${pct}%` }}
                data-testid="pdi-progress-bar"
              />
            </div>
            <span
              className="text-[12px] font-bold font-mono text-[#0F6E56] whitespace-nowrap"
              data-testid="pdi-progress-pct"
            >
              {pct}%
            </span>
          </div>
          <div className="flex flex-col gap-1" data-testid="pdi-checklist">
            {PDI_ITEMS.map((t, i) => {
              const checked = state.pdiChecked.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => togglePdi(i)}
                  data-testid={`pdi-item-${i}`}
                  className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded border text-left transition-colors ${
                    checked
                      ? "bg-[#E1F5EE] border-[#5DCAA5]"
                      : "bg-white border-[#EEECE6] hover:bg-[#F0F7FF] hover:border-[#85B7EB]"
                  }`}
                >
                  <span
                    className={`w-[17px] h-[17px] rounded border-2 flex items-center justify-center text-[10px] mt-0.5 shrink-0 ${
                      checked
                        ? "bg-[#0F6E56] border-[#0F6E56] text-white"
                        : "border-[#D5D3CB] text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="font-mono text-[10.5px] text-[#9A9890] min-w-[22px] mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[12.5px] flex-1 leading-relaxed">
                    {t}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={() => togglePdiAll(allIdx)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              data-testid="pdi-toggle-all-btn"
            >
              ✅ 全部完成（測試）
            </button>
          </div>
        </div>
      </section>
    </DeliveryFrame>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-white border border-[#F5AEAD] rounded px-2.5 py-1 text-[12px]">
      {label}：<b className="text-[#C8001A] font-mono">{value}</b>
    </span>
  );
}
