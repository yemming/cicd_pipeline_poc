"use client";

import { useState } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { PDI_ACCESSORIES } from "@/components/delivery/delivery-constants";
import { updateDeliveryStepAction } from "@/lib/delivery/delivery-actions";
import type { DeliveryRow } from "@/lib/deliveries";

export function PdiAccessoriesView({ delivery }: { delivery: DeliveryRow }) {
  const total = PDI_ACCESSORIES.length;
  const [checkedKeys, setCheckedKeys] = useState<string[]>(
    delivery.accessories_list ?? [],
  );
  const [note, setNote] = useState(delivery.accessories_note ?? "");
  const [err, setErr] = useState<string | null>(null);

  const done = checkedKeys.length;
  const stepDone = done > 0;

  function toggle(key: string) {
    setCheckedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleNext(): Promise<boolean> {
    setErr(null);
    const res = await updateDeliveryStepAction(
      delivery.id,
      "accessories",
      { accessories_list: checkedKeys, accessories_note: note },
      "accessories_complete",
    );
    if (!res.ok) {
      setErr(res.error);
      return false;
    }
    return true;
  }

  return (
    <DeliveryFrame
      stepId={3}
      delivery={delivery}
      stepDone={stepDone}
      nextLabel={
        stepDone
          ? "配件安裝完成 → 交車確認表 →"
          : "標記配件安裝完成 → 交車確認表 →"
      }
      nextDisabled={done === 0}
      onNext={handleNext}
    >
      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="acc-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#FDF3E3] inline-flex items-center justify-center text-[13px]">
            🛠
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              原廠 Performance 配件安裝清單
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              依客戶訂單安裝 · 安裝完成後請逐項勾選確認操作正常
            </div>
          </div>
          <span
            className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold bg-[#F1EFE8] text-[#5A5955]"
            data-testid="acc-progress-count"
          >
            {done} / {total}
          </span>
        </header>
        <div className="px-4 py-3 space-y-1.5">
          {PDI_ACCESSORIES.map((a) => {
            const checked = checkedKeys.includes(a.key);
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => toggle(a.key)}
                data-testid={`acc-item-${a.key}`}
                className={`w-full flex items-start gap-3 px-3 py-2 rounded border text-left transition-colors ${
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
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[#2C2C2A]">
                    {a.name}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-px">
                    SKU{" "}
                    <span className="font-mono text-[#5A5955]">{a.sku}</span>
                    　·　數量 {a.qty}
                    　·　備註 {a.note}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="acc-note-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 安裝備註
          </span>
        </header>
        <div className="px-4 py-3">
          <textarea
            data-testid="acc-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="例：Termignoni 排氣管已重新刷 ECU map、轉速於 6500rpm 起紅燈⋯"
            className="w-full px-2.5 py-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none resize-y"
          />
        </div>
      </section>

      {err && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          data-testid="acc-error"
        >
          {err}
        </div>
      )}
    </DeliveryFrame>
  );
}
