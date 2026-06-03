"use client";

/**
 * PdcCountdown — 供應商截單倒計時（W1 + W3 共用）
 *
 * 顯示三供應商截單時間，即時倒計時距「最近一個尚未過」的截單：
 *   - DUCATI 原廠       17:00
 *   - 台灣代理（總代理）  15:00
 *   - 一般供應商         依合約而定（無固定時間 → 顯示「—」、不參與倒計時）
 *
 * 規則：
 *   - 剩 < 1 小時 → 紅字提示
 *   - 已過今日截單 → 顯示「已截單」
 *   - wall-clock 一律 Asia/Taipei（避免使用者裝置時區飄移）
 *
 * Hydration 安全：SSR 不知道使用者當下時間 → 初次 render 顯示靜態 placeholder，
 *   mount 後（useEffect）才開始每秒更新，避免 SSR/CSR 文字不一致報 hydration mismatch。
 */

import { useEffect, useState } from "react";

type Cutoff = {
  key: string;
  label: string;
  /** 截單小時（Asia/Taipei wall-clock）；null = 依合約、不倒計時 */
  hour: number | null;
  minute: number;
};

const CUTOFFS: Cutoff[] = [
  { key: "ducati", label: "DUCATI 原廠", hour: 17, minute: 0 },
  { key: "tw_agent", label: "台灣代理", hour: 15, minute: 0 },
  { key: "general", label: "一般供應商", hour: null, minute: 0 },
];

/** 取 Asia/Taipei 當下的 {hour, minute, second}（不依賴使用者裝置時區） */
function taipeiNow(): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0; // en-US hour12:false 午夜可能回 24
  return { hour, minute: get("minute"), second: get("second") };
}

type Computed = {
  /** 距截單剩餘秒數（>0）；null = 已過或無時間 */
  secondsLeft: number | null;
  passed: boolean; // 已過今日截單
  contractual: boolean; // 依合約（無固定時間）
};

function computeFor(c: Cutoff, now: { hour: number; minute: number; second: number }): Computed {
  if (c.hour == null) return { secondsLeft: null, passed: false, contractual: true };
  const nowSec = now.hour * 3600 + now.minute * 60 + now.second;
  const cutSec = c.hour * 3600 + c.minute * 60;
  if (nowSec >= cutSec) return { secondsLeft: null, passed: true, contractual: false };
  return { secondsLeft: cutSec - nowSec, passed: false, contractual: false };
}

function fmtCountdown(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function PdcCountdown({ className }: { className?: string }) {
  // null = 尚未 mount（SSR / 首次 render）→ 顯示靜態 placeholder 避免 hydration mismatch。
  // 不在 effect body 直接 setState（會觸發 cascading render）；改由 rAF / interval 兩個外部 callback 驅動。
  const [now, setNow] = useState<{ hour: number; minute: number; second: number } | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(taipeiNow()));
    const id = setInterval(() => setNow(taipeiNow()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const mounted = now !== null;

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-lg border border-[#EEECE6] bg-white px-3 py-2 ${className ?? ""}`}
    >
      <span className="material-symbols-outlined text-[16px] text-[#9A9890]">schedule</span>
      <span className="text-[11px] text-[#9A9890] font-medium whitespace-nowrap">供應商截單</span>
      <div className="flex items-center gap-3">
        {CUTOFFS.map((c) => {
          const computed = now ? computeFor(c, now) : null;
          let valueNode: React.ReactNode;
          let valueClass = "text-[#2C2C2A]";

          if (!mounted) {
            // SSR / 首次 render：不顯示動態值，避免 hydration mismatch
            valueNode = "—:—:—";
            valueClass = "text-[#9A9890]";
          } else if (computed!.contractual) {
            valueNode = "—";
            valueClass = "text-[#9A9890]";
          } else if (computed!.passed) {
            valueNode = "已截單";
            valueClass = "text-[#9A9890]";
          } else {
            const left = computed!.secondsLeft!;
            valueNode = fmtCountdown(left);
            valueClass = left < 3600 ? "text-[#CC0000] font-semibold" : "text-[#2C2C2A] font-medium";
          }

          return (
            <div key={c.key} className="flex flex-col leading-tight">
              <span className="text-[10px] text-[#9A9890] whitespace-nowrap">
                {c.label}
                {c.hour != null ? `（${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}）` : ""}
              </span>
              <span className={`text-[12.5px] font-mono tabular-nums ${valueClass}`}>{valueNode}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PdcCountdown;
