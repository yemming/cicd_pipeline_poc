"use client";

import { useEffect, useState } from "react";
import { formatNTD } from "@/lib/pos/format";

type Phase = "pending" | "scanned" | "paid";

export function LinePayQr({
  amount,
  orderNo = "LP20260416001",
  onPaid,
}: {
  amount: number;
  orderNo?: string;
  onPaid?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pending");
  const [countdown, setCountdown] = useState(180);

  useEffect(() => {
    if (phase !== "pending") return;
    const t = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("scanned"), 2400);
    const t2 = setTimeout(() => {
      setPhase("paid");
      onPaid?.();
    }, 4200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onPaid]);

  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");

  return (
    <div className="max-w-md mx-auto bg-white rounded-3xl shadow-2xl p-8 border border-slate-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white text-sm">
            LINE
          </div>
          <div>
            <p className="font-bold text-slate-900">LINE Pay</p>
            <p className="text-[10px] text-slate-500">訂單 {orderNo}</p>
          </div>
        </div>
        <span className="text-xs text-slate-500 tabular-nums">
          {mm}:{ss}
        </span>
      </div>

      <div className="bg-emerald-50 rounded-xl p-4 mb-6 text-center">
        <p className="text-[10px] text-emerald-600 uppercase tracking-widest mb-1">應付金額</p>
        <p className="text-3xl font-extrabold font-display text-emerald-700 tabular-nums">
          {formatNTD(amount)}
        </p>
      </div>

      <div className="relative aspect-square max-w-[280px] mx-auto bg-white border-4 border-slate-900 rounded-2xl p-4 mb-4">
        <QrMatrix />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-xl bg-emerald-500 border-4 border-white flex items-center justify-center text-white font-bold">
            LINE
          </div>
        </div>
        {phase === "scanned" && (
          <div className="absolute inset-0 bg-emerald-500/90 rounded-2xl flex flex-col items-center justify-center text-white">
            <span className="material-symbols-outlined text-5xl mb-2">smartphone</span>
            <p className="font-bold">已被掃描</p>
            <p className="text-sm opacity-90">等待客戶確認付款…</p>
          </div>
        )}
        {phase === "paid" && (
          <div className="absolute inset-0 bg-emerald-600 rounded-2xl flex flex-col items-center justify-center text-white">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-5xl">check</span>
            </div>
            <p className="text-xl font-bold">付款成功</p>
            <p className="text-sm opacity-90 mt-1">感謝您的惠顧</p>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-slate-500">
        請客戶開啟 LINE Pay 掃描 QR Code
      </p>
    </div>
  );
}

function QrMatrix() {
  const cells = 21;
  const pseudoPattern = (x: number, y: number) => ((x * 31 + y * 17 + x * y) % 3 === 0);
  return (
    <div
      className="w-full h-full grid"
      style={{ gridTemplateColumns: `repeat(${cells}, 1fr)`, gridTemplateRows: `repeat(${cells}, 1fr)` }}
    >
      {Array.from({ length: cells * cells }).map((_, i) => {
        const x = i % cells;
        const y = Math.floor(i / cells);
        const isCorner =
          (x < 7 && y < 7) || (x >= cells - 7 && y < 7) || (x < 7 && y >= cells - 7);
        const cornerDark =
          isCorner &&
          ((x === 0 || x === 6 || y === 0 || y === 6) ||
            (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
            (x === cells - 1 || x === cells - 7 || y === 0 || y === 6) ||
            (x >= cells - 5 && x <= cells - 3 && y >= 2 && y <= 4) ||
            (x === 0 || x === 6 || y === cells - 1 || y === cells - 7) ||
            (x >= 2 && x <= 4 && y >= cells - 5 && y <= cells - 3));
        const dark = isCorner ? cornerDark : pseudoPattern(x, y);
        return <div key={i} className={dark ? "bg-slate-900" : "bg-white"} />;
      })}
    </div>
  );
}
