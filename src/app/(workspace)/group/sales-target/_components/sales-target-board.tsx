"use client";

/**
 * GRP03 銷售目標監看 — client board（G1，2026-06-01 Stitch→React 升級）
 *
 * 兩塊：①逐店目標總覽（月目標/累計/達成率，讀 kpi_snapshots 真資料）
 *      ②Pace 配速預測計算器（設計稿旗艦新功能）：依輸入即時算月底預測達成率 + 顏色 + 建議。
 *
 * Phase 1：月目標/今日累計可由「選門店」自動帶入真實值，已過/總工作天手動輸入
 *          （store_calendar 尚未建 → 工作天暫手動，符合設計稿「Phase 1 手動」）。
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import type { SalesTargetRow } from "@/domain/group-analytics";

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** 達成率 → 色票（chip 用） */
function rateChip(rate: number | null): string {
  if (rate == null) return "bg-[#F2F2F2] text-[#6B6A68]";
  if (rate >= 1) return "bg-[#EAF3DE] text-[#3B6D11]";
  if (rate >= 0.9) return "bg-[#EAF4FB] text-[#185FA5]";
  if (rate >= 0.8) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#CC0000]";
}

type PaceResult = { pct: number; color: string; advice: string; intervene: boolean };

/** 設計稿公式：月底預測達成率 =（今日累計 ÷ 已過工作天）× 本月總工作天 ÷ 月目標 */
function computePace(target: number, mtd: number, daysPassed: number, daysTotal: number): PaceResult | null {
  if (!target || !daysPassed || !daysTotal) return null;
  const projected = (mtd / daysPassed) * daysTotal; // 預測月底成交台數
  const pct = projected / target;
  let color: string, advice: string;
  if (pct >= 1) { color = "#3B6D11"; advice = "✅ 優秀，維持節奏"; }
  else if (pct >= 0.9) { color = "#185FA5"; advice = "🟡 良好，保持衝勁"; }
  else if (pct >= 0.8) { color = "#854F0B"; advice = "⚠️ 需注意，建議啟動促銷或加強跟進"; }
  else { color = "#CC0000"; advice = "🔴 警示，建議集團立即介入"; }
  return { pct, color, advice, intervene: pct < 0.85 };
}

export function SalesTargetBoard({ rows }: { rows: SalesTargetRow[] }) {
  useSetPageHeader({
    title: "銷售目標監看",
    breadcrumb: [{ label: "集團管理", href: "/group/dashboard" }, { label: "銷售目標監看" }],
    hideSearch: true,
  });

  const [storeIdx, setStoreIdx] = useState(0);
  const sel = rows[storeIdx] ?? null;
  // Pace 輸入：月目標/今日累計帶入真實，工作天手動（Phase 1）
  const [target, setTarget] = useState<number>(sel?.target ?? 40);
  const [mtd, setMtd] = useState<number>(sel?.actual ?? 0);
  const [daysPassed, setDaysPassed] = useState<number>(13);
  const [daysTotal, setDaysTotal] = useState<number>(22);

  function pickStore(i: number) {
    setStoreIdx(i);
    const r = rows[i];
    if (r) { setTarget(r.target ?? 40); setMtd(r.actual ?? 0); }
  }

  const pace = useMemo(() => computePace(target, mtd, daysPassed, daysTotal), [target, mtd, daysPassed, daysTotal]);

  const inputCls =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelCls = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">銷售目標監看</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">GRP03</span>
        <span className="text-[12px] text-[#9A9890]">逐店目標達成 · Pace 配速預測（月中即時評估月底達成機率）</span>
      </header>

      {/* ① 逐店目標總覽 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 逐店銷售目標達成</span>
        </header>
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
              <th className="text-left font-medium px-4 py-2">門店</th>
              <th className="text-right font-medium px-4 py-2">月目標（台）</th>
              <th className="text-right font-medium px-4 py-2">累計成交（台）</th>
              <th className="text-right font-medium px-4 py-2">達成率</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-[12px] text-[#9A9890]">尚無銷售目標資料</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.orgId} className="border-t border-[#EEECE6] text-[12.5px] text-[#2C2C2A]">
                <td className="px-4 py-2">{r.storeName}</td>
                <td className="px-4 py-2 text-right">{r.target ?? "—"}</td>
                <td className="px-4 py-2 text-right">{r.actual ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${rateChip(r.achievementRate)}`}>
                    {fmtPct(r.achievementRate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ② Pace 配速預測計算器 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ Pace 配速預測計算器</span>
          <span className="text-[11px] text-[#9A9890]">月中即時評估月底達成機率，預測 &lt;85% 建議集團介入</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 左：輸入 */}
          <div className="space-y-3">
            {rows.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className={labelCls}>選擇門店（自動帶入月目標 / 累計）</label>
                <select className={inputCls} value={storeIdx} onChange={(e) => pickStore(Number(e.target.value))}>
                  {rows.map((r, i) => (
                    <option key={r.orgId} value={i}>{r.storeName}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>月目標（台）</label>
                <input type="number" className={inputCls} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>今日累計達成（台）</label>
                <input type="number" className={inputCls} value={mtd} onChange={(e) => setMtd(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>已過工作天數</label>
                <input type="number" className={inputCls} value={daysPassed} onChange={(e) => setDaysPassed(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>本月總工作天數</label>
                <input type="number" className={inputCls} value={daysTotal} onChange={(e) => setDaysTotal(Number(e.target.value))} />
              </div>
            </div>
            <p className="text-[11px] text-[#9A9890] leading-relaxed">
              公式：月底預測達成率 =（今日累計 ÷ 已過工作天）× 本月總工作天 ÷ 月目標。
              工作天數 Phase 1 手動輸入；Phase 2 接門市行事曆（store_calendar）自動帶入。
            </p>
          </div>

          {/* 右：輸出 */}
          <div className="flex flex-col items-center justify-center rounded-lg border border-[#EEECE6] bg-[#F8F7F4] p-5">
            {pace ? (
              <>
                <div className="text-[11px] text-[#9A9890] mb-1">月底預測達成率</div>
                <div className="text-[40px] font-bold leading-none" style={{ color: pace.color }}>{Math.round(pace.pct * 100)}%</div>
                <div className="mt-3 text-[13px] font-medium" style={{ color: pace.color }}>{pace.advice}</div>
                {pace.intervene && (
                  <div className="mt-3 px-3 py-1.5 rounded-md bg-[#FDECEA] border border-[#F5AEAD] text-[11.5px] text-[#CC0000]">
                    預測 &lt;85% — 系統標示此門店需集團輔導介入
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12px] text-[#9A9890]">請輸入月目標、累計與工作天數</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
