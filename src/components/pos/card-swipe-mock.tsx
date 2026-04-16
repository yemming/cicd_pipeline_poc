"use client";

import { useEffect, useState } from "react";
import { formatNTD } from "@/lib/pos/format";

type Phase = "idle" | "swiping" | "processing" | "approved" | "declined";

export function CardSwipeMock({
  amount,
  onApproved,
  cardBrand = "VISA",
  last4 = "4567",
}: {
  amount: number;
  onApproved?: (info: { last4: string; brand: string }) => void;
  cardBrand?: "VISA" | "MASTER" | "JCB" | "AMEX";
  last4?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (phase !== "idle") return;
    const t1 = setTimeout(() => setPhase("swiping"), 400);
    const t2 = setTimeout(() => setPhase("processing"), 1600);
    const t3 = setTimeout(() => {
      setPhase("approved");
      onApproved?.({ last4, brand: cardBrand });
    }, 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase, onApproved, last4, cardBrand]);

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-slate-900 rounded-3xl shadow-2xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 10%, #4F46E5 0%, transparent 50%)",
        }} />
        <div className="relative">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">EDC Terminal</p>
              <p className="text-sm font-medium mt-0.5">Ducati Taipei POS-01</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-slate-400">CONNECTED</span>
            </div>
          </div>

          <div className="bg-black/40 rounded-xl p-6 mb-6 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Amount</p>
            <p className="text-3xl font-bold font-display tabular-nums">{formatNTD(amount)}</p>
          </div>

          <div className="bg-black/40 rounded-xl p-4 min-h-[140px] flex flex-col items-center justify-center">
            {phase === "idle" && (
              <>
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 animate-pulse">
                  credit_card
                </span>
                <p className="text-sm text-slate-300">請刷卡 / 插卡 / 感應</p>
              </>
            )}
            {phase === "swiping" && (
              <>
                <span className="material-symbols-outlined text-4xl text-indigo-400 mb-2">contactless</span>
                <p className="text-sm text-indigo-300 animate-pulse">讀取卡片中…</p>
              </>
            )}
            {phase === "processing" && (
              <>
                <div className="w-10 h-10 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mb-2" />
                <p className="text-sm text-amber-300">連線授權中…</p>
                <p className="text-[10px] text-slate-500 mt-1">與聯合信用卡中心通訊</p>
              </>
            )}
            {phase === "approved" && (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-emerald-400 text-3xl">check</span>
                </div>
                <p className="text-sm font-bold text-emerald-300">已核准 APPROVED</p>
                <p className="text-[11px] text-slate-300 mt-1">
                  {cardBrand} **** {last4}
                </p>
              </>
            )}
            {phase === "declined" && (
              <>
                <span className="material-symbols-outlined text-4xl text-rose-400 mb-2">close</span>
                <p className="text-sm text-rose-300">交易失敗，請重試</p>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500">
            <span>TID: TK01223344</span>
            <span>MID: 123456789012345</span>
          </div>
        </div>
      </div>

      {phase === "idle" && (
        <button
          type="button"
          onClick={() => setPhase("swiping")}
          className="mt-4 w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
        >
          模擬刷卡
        </button>
      )}
      {phase === "approved" && (
        <p className="mt-4 text-xs text-center text-emerald-600">
          交易完成 · 授權碼 864211 · 請取回客戶收執聯
        </p>
      )}
    </div>
  );
}
