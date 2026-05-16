"use client";

import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import {
  DELIVERY_ITEMS,
  DELIVERY_ITEM_CAT_NAME,
  DELIVERY_ITEM_ROWS,
  type DeliveryItemCat,
} from "@/components/delivery/delivery-constants";
import { useDelivery } from "@/lib/delivery-store";

const CAT_PILL: Record<DeliveryItemCat, string> = {
  a: "bg-[#185FA5]",
  b: "bg-[#0F6E56]",
  c: "bg-[#854F0B]",
  d: "bg-[#534AB7]",
};

export function Confirm2View() {
  const { state, toggleDelivery, toggleDeliveryAll } = useDelivery();
  const total = DELIVERY_ITEMS.length;
  const done = state.deliveryChecked.length;
  const pct = Math.round((done / total) * 100);
  const allIdx = DELIVERY_ITEMS.map((_, i) => i);
  const stepDone = done === total;
  const rows = DELIVERY_ITEM_ROWS;

  return (
    <DeliveryFrame
      stepId={4}
      stepDone={stepDone}
      nextLabel={
        stepDone
          ? "交車確認完成 → 保固條款 →"
          : "確認表進行中 → 保固條款 →"
      }
    >
      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="confirm2-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#E1F5EE] inline-flex items-center justify-center text-[13px]">
            ✅
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              客戶交車確認表（36 項）
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              DUCATI Check List — BIKE DELIVERY TO CUSTOMER · 逐項點交完成後請客戶簽名
            </div>
          </div>
          <span
            className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold bg-[#E1F5EE] text-[#0F6E56]"
            data-testid="confirm2-progress-count"
          >
            {done} / {total}
          </span>
        </header>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-[11.5px] font-semibold whitespace-nowrap">
              交車進度
            </span>
            <div className="flex-1 h-[7px] bg-[#EEECE6] rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#0F6E56] to-[#5DCAA5] rounded transition-all"
                style={{ width: `${pct}%` }}
                data-testid="confirm2-progress-bar"
              />
            </div>
            <span
              className="text-[12px] font-bold font-mono text-[#0F6E56] whitespace-nowrap"
              data-testid="confirm2-progress-pct"
            >
              {pct}%
            </span>
          </div>
          <div className="flex flex-col gap-1" data-testid="confirm2-checklist">
            {rows.map(({ item, i, showDivider }) => {
              const checked = state.deliveryChecked.includes(i);
              return (
                <div key={i}>
                  {showDivider && (
                    <div
                      className="text-[11px] font-bold text-[#5A5955] px-2.5 py-1.5 bg-[#F4F3F0] rounded mt-2 mb-1"
                      data-testid={`confirm2-cat-${item.c}`}
                    >
                      {DELIVERY_ITEM_CAT_NAME[item.c]}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleDelivery(i)}
                    data-testid={`confirm2-item-${i}`}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-1.5 rounded border text-left transition-colors ${
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
                      {item.t}
                    </span>
                    <span
                      className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${CAT_PILL[item.c]} shrink-0`}
                    >
                      {item.c.toUpperCase()}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={() => toggleDeliveryAll(allIdx)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              data-testid="confirm2-toggle-all-btn"
            >
              ✅ 全部完成（測試）
            </button>
          </div>
        </div>
      </section>
    </DeliveryFrame>
  );
}
