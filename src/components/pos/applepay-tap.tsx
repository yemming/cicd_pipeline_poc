"use client";

import { useEffect, useState } from "react";
import { formatNTD } from "@/lib/pos/format";

type Phase = "waiting" | "detected" | "authenticating" | "approved";

export function ApplePayTap({
  amount,
  onApproved,
}: {
  amount: number;
  onApproved?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("waiting");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("detected"), 1400);
    const t2 = setTimeout(() => setPhase("authenticating"), 2400);
    const t3 = setTimeout(() => {
      setPhase("approved");
      onApproved?.();
    }, 3800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onApproved]);

  return (
    <div className="max-w-sm mx-auto">
      <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-black rounded-[3rem] shadow-2xl p-6 border-[10px] border-slate-700">
        <div className="bg-black rounded-[2.5rem] aspect-[9/19] flex flex-col overflow-hidden text-white relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-900 rounded-b-2xl z-10" />

          <div className="px-5 pt-10 pb-4 flex items-center justify-between text-xs">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">network_wifi</span>
              <span className="material-symbols-outlined text-[14px]">battery_full</span>
            </div>
          </div>

          <div className="px-5 py-3 flex items-center gap-2 border-b border-white/10">
            <span className="material-symbols-outlined text-white text-lg">apple</span>
            <span className="font-bold">Pay</span>
          </div>

          <div className="flex-1 px-5 pt-6 flex flex-col items-center">
            {(phase === "waiting" || phase === "detected") && (
              <>
                <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-400 flex items-center justify-center mb-6 transition-transform ${phase === "detected" ? "scale-110" : ""}`}>
                  <span className="material-symbols-outlined text-slate-900 text-5xl">credit_card</span>
                </div>
                <p className="text-xs text-slate-400 mb-1">信用卡</p>
                <p className="font-bold text-sm mb-6">中國信託世界卡 •• 4567</p>
                <p className="text-3xl font-extrabold font-display tabular-nums mb-1">
                  {formatNTD(amount)}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Ducati Taipei</p>
              </>
            )}

            {phase === "authenticating" && (
              <>
                <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-6 animate-pulse">
                  <span className="material-symbols-outlined text-white text-5xl">face</span>
                </div>
                <p className="font-bold text-base mb-2">Face ID</p>
                <p className="text-sm text-slate-400">看著 iPhone 以完成付款</p>
              </>
            )}

            {phase === "approved" && (
              <>
                <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-6 animate-[fadeIn_0.3s_ease]">
                  <span className="material-symbols-outlined text-emerald-400 text-6xl">check</span>
                </div>
                <p className="font-bold text-emerald-400 text-lg">完成</p>
                <p className="text-sm text-slate-400 mt-1">付款成功</p>
                <p className="text-[10px] text-slate-500 mt-4">TXN-9834AA</p>
              </>
            )}
          </div>

          <div className="px-5 py-4 text-center">
            <div className="w-32 h-1 rounded-full bg-white/30 mx-auto" />
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-sm text-slate-500">
        {phase === "waiting" && "請客戶將 iPhone 靠近感應區"}
        {phase === "detected" && "已偵測到裝置，請客戶驗證"}
        {phase === "authenticating" && "客戶正在驗證 Face ID…"}
        {phase === "approved" && "付款完成，請取回客戶收執聯"}
      </p>
    </div>
  );
}
