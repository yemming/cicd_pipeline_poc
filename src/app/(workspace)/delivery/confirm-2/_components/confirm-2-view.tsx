"use client";

import { useState } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import {
  DELIVERY_ITEM_CAT_NAME,
  type DeliveryItemCat,
} from "@/components/delivery/delivery-constants";
import { updateDeliveryStepAction } from "@/lib/delivery/delivery-actions";
import type { DeliveryRow } from "@/lib/deliveries";

const CAT_PILL: Record<DeliveryItemCat, string> = {
  a: "bg-[#185FA5]",
  b: "bg-[#0F6E56]",
  c: "bg-[#854F0B]",
  d: "bg-[#534AB7]",
};

export function Confirm2View({
  delivery,
  rows,
}: {
  delivery: DeliveryRow;
  /** 依品牌中性化後的交車確認表 rows（ducati 保留原廠術語、其他品牌中性版） */
  rows: {
    item: { t: string; c: DeliveryItemCat };
    i: number;
    showDivider: boolean;
  }[];
}) {
  const total = rows.length;
  const allIdx = rows.map((_, i) => i);

  const [checked, setChecked] = useState<number[]>(
    delivery.delivery_checklist ?? [],
  );
  const [err, setErr] = useState<string | null>(null);

  const done = checked.length;
  const pct = Math.round((done / total) * 100);
  const stepDone = done === total;

  function toggle(i: number) {
    setChecked((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
    );
  }
  function toggleAll() {
    setChecked((prev) => (prev.length === total ? [] : [...allIdx]));
  }

  async function handleNext(): Promise<boolean> {
    setErr(null);
    const res = await updateDeliveryStepAction(
      delivery.id,
      "confirm2",
      { delivery_checklist: checked },
      done === total ? "delivery_confirmed" : undefined,
    );
    if (!res.ok) {
      setErr(res.error);
      return false;
    }
    return true;
  }

  return (
    <DeliveryFrame
      stepId={4}
      delivery={delivery}
      stepDone={stepDone}
      nextLabel={
        stepDone ? "交車確認完成 → 保固條款 →" : "確認表進行中 → 保固條款 →"
      }
      onNext={handleNext}
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
              Bike Delivery Check List — 交車點交確認 · 逐項點交完成後請客戶簽名
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
              const isChecked = checked.includes(i);
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
                    onClick={() => toggle(i)}
                    data-testid={`confirm2-item-${i}`}
                    className={`w-full flex items-start gap-2.5 px-2.5 py-1.5 rounded border text-left transition-colors ${
                      isChecked
                        ? "bg-[#E1F5EE] border-[#5DCAA5]"
                        : "bg-white border-[#EEECE6] hover:bg-[#F0F7FF] hover:border-[#85B7EB]"
                    }`}
                  >
                    <span
                      className={`w-[17px] h-[17px] rounded border-2 flex items-center justify-center text-[10px] mt-0.5 shrink-0 ${
                        isChecked
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
              onClick={toggleAll}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              data-testid="confirm2-toggle-all-btn"
            >
              ✅ 全部完成
            </button>
          </div>
        </div>
      </section>

      {err && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          data-testid="confirm2-error"
        >
          {err}
        </div>
      )}
    </DeliveryFrame>
  );
}
