"use client";

import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { DELIVERY_DOCS } from "@/components/delivery/delivery-constants";
import { useDelivery } from "@/lib/delivery-store";

export function CeremonyView() {
  const { state, confirmDelivery, reset } = useDelivery();

  return (
    <DeliveryFrame stepId={6} stepDone={state.delivered} nextLabel="完成交車">
      <section
        className="rounded-xl p-6 text-white text-center"
        style={{
          background: "linear-gradient(135deg,#085041,#0F6E56)",
        }}
        data-testid="ceremony-complete-card"
      >
        <div className="text-[20px] font-bold mb-1.5">
          🎉 恭喜！交車完成
        </div>
        <div className="text-[12.5px] opacity-85 mb-3.5 leading-relaxed">
          {state.customerName} 的 {state.vehicleModel} 已完成所有交車程序
          <br />
          確認後系統將自動觸發以下動作
        </div>
        <div
          className="bg-white/10 border border-white/25 rounded-lg px-4 py-3 mb-3.5 text-[12px] text-left leading-relaxed"
          data-testid="ceremony-trigger-box"
        >
          <b className="text-[#5DCAA5]">✅ 自動觸發項目：</b>
          <br />
          1 · 於 <b>CRM03A 電訪工作台</b> 建立 D+3 滿意度回訪任務（2026-06-04）
          <br />
          2 · 更新客戶狀態為「已成交 — 已交車」
          <br />
          3 · RS_M1 銷售漏斗「完成交車」層計數 +1
          <br />
          4 · 保固條款書存檔（存留 4 年）
          <br />
          5 · 交車確認表存檔（存留 4 年）
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={confirmDelivery}
            disabled={state.delivered}
            data-testid="ceremony-confirm-btn"
            className="px-5 py-2 rounded text-[12.5px] font-semibold bg-white text-[#085041] hover:bg-[#E1F5EE] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state.delivered ? "✅ 已完成交車" : "✅ 確認完成交車"}
          </button>
          <button
            type="button"
            className="px-5 py-2 rounded text-[12.5px] font-semibold bg-white/15 text-white border-[1.5px] border-white/35 hover:bg-white/25"
          >
            🖨️ 列印交車文件
          </button>
          <button
            type="button"
            onClick={reset}
            data-testid="ceremony-reset-btn"
            className="px-5 py-2 rounded text-[12.5px] font-semibold bg-white/15 text-white border-[1.5px] border-white/35 hover:bg-white/25"
          >
            🔄 重置 demo 資料
          </button>
        </div>
        {state.delivered && state.deliveredAt && (
          <div
            className="mt-3 text-[11px] opacity-80 font-mono"
            data-testid="ceremony-delivered-at"
          >
            完成時間：{new Date(state.deliveredAt).toLocaleString("zh-TW")}
          </div>
        )}
      </section>

      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="ceremony-docs-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#EAF3DE] inline-flex items-center justify-center text-[13px]">
            📦
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              隨車文件點交清單
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              交車時應一併交付車主的文件與物件
            </div>
          </div>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {DELIVERY_DOCS.map((d) => (
            <div
              key={d.key}
              className="flex items-center gap-2.5 px-3 py-2 rounded border border-[#EEECE6] bg-[#FAFAF8] text-[12.5px]"
              data-testid={`ceremony-${d.key}`}
            >
              <span className="text-[18px] shrink-0">{d.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{d.name}</div>
                <div className="text-[11px] text-[#9A9890] mt-px">{d.sub}</div>
              </div>
              <span
                className={`text-[10.5px] px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${
                  d.tone === "req"
                    ? "bg-[#FDECEA] text-[#C8001A]"
                    : "bg-[#F1EFE8] text-[#9A9890]"
                }`}
              >
                {d.tag}
              </span>
            </div>
          ))}
        </div>
      </section>
    </DeliveryFrame>
  );
}
