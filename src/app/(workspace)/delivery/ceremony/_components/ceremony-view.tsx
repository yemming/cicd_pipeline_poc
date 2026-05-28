"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { DELIVERY_DOCS } from "@/components/delivery/delivery-constants";
import { completeDeliveryAction } from "@/lib/delivery/delivery-actions";
import type { DeliveryRow } from "@/lib/deliveries";

/** ISO → 「YYYY-MM-DD HH:mm (台北)」手動 +8，避免 toLocaleString 的 hydration mismatch */
function fmtTaipei(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return `${t.toISOString().slice(0, 16).replace("T", " ")}（台北）`;
}

export function CeremonyView({ delivery }: { delivery: DeliveryRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const delivered = delivery.status === "delivered";

  function handleConfirm() {
    setErr(null);
    startTransition(async () => {
      const res = await completeDeliveryAction(delivery.id, {
        delivered_at: new Date().toISOString(),
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <DeliveryFrame stepId={6} delivery={delivery} stepDone={delivered} nextLabel="完成交車">
      <section
        className="rounded-xl p-6 text-white text-center"
        style={{ background: "linear-gradient(135deg,#085041,#0F6E56)" }}
        data-testid="ceremony-complete-card"
      >
        <div className="text-[20px] font-bold mb-1.5">🎉 恭喜！交車完成</div>
        <div className="text-[12.5px] opacity-85 mb-3.5 leading-relaxed">
          {delivery.customer_name} 的 {delivery.vehicle_model_name} 已完成所有交車程序
          <br />
          確認後系統將自動觸發以下動作
        </div>
        <div
          className="bg-white/10 border border-white/25 rounded-lg px-4 py-3 mb-3.5 text-[12px] text-left leading-relaxed"
          data-testid="ceremony-trigger-box"
        >
          <b className="text-[#5DCAA5]">✅ 自動觸發項目：</b>
          <br />
          1 · 於電訪工作台建立 D+3 滿意度回訪任務
          <br />
          2 · 更新客戶狀態為「已成交 — 已交車」
          <br />
          3 · 銷售漏斗「完成交車」層計數 +1
          <br />
          4 · 保固條款書存檔（存留 4 年）
          <br />
          5 · 交車確認表存檔（存留 4 年）
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={delivered || isPending}
            data-testid="ceremony-confirm-btn"
            onClick={handleConfirm}
            className="px-5 py-2 rounded text-[12.5px] font-semibold bg-white text-[#085041] hover:bg-[#E1F5EE] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "儲存中⋯" : delivered ? "✅ 已完成交車" : "✅ 確認完成交車"}
          </button>
          <Link
            href="/sales/delivery"
            data-testid="ceremony-back-btn"
            className="px-5 py-2 rounded text-[12.5px] font-semibold bg-white/15 text-white border-[1.5px] border-white/35 hover:bg-white/25"
          >
            ← 回交車看板
          </Link>
        </div>
        {delivered && delivery.delivered_at && (
          <div
            className="mt-3 text-[11px] opacity-80 font-mono"
            data-testid="ceremony-delivered-at"
          >
            完成時間：{fmtTaipei(delivery.delivered_at)}
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

      {err && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          data-testid="ceremony-error"
        >
          {err}
        </div>
      )}
    </DeliveryFrame>
  );
}
