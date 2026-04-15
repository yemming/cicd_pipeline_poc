"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { RIVAL_SCORES, COMPARISON_AXES, type RivalScore } from "@/lib/tools/scoring";
import { RadarChart } from "@/components/charts/radar-chart";

/**
 * T3 競品降維對照
 *
 * 不比數據（馬力/扭力），比「靈魂」與「電控精準度」。
 * 側邊滑動選 1-3 個品牌一起對照。
 */

const DIMENSION_STORIES: Record<string, { ducati: string; rival: string }> = {
  electronics: {
    ducati: "DTC EVO 2 整合六軸 IMU，每秒 50 次運算修正傾角、滑移、拉力，電控像是幫你外掛第二個神經系統。",
    rival: "同級對手也有電控，但模組間的「對話速度」差一拍——你感覺得出來的那一拍。",
  },
  sound: {
    ducati: "90° L-twin 的爆發節奏，進氣門時 Desmodromic 氣門機構讓聲浪乾淨到像一首機械交響樂。",
    rival: "直四的扁平聲浪適合通勤，V4 的聲紋則會刻進你的情緒記憶。",
  },
  heritage: {
    ducati: "從 1926 年 Bologna 起家，Ducati 的紅、白、綠是摩托車界的最強品牌資產。",
    rival: "歷史有，但故事被分散在房車、工具機、越野多個場域，重機只是其中一條支線。",
  },
  soul: {
    ducati: "「騎 Ducati 的人不解釋」——這句不是廣告詞，是車友圈的共識。",
    rival: "規格 OK 但沒人會為它寫詩。",
  },
  precision: {
    ducati: "焊點、烤漆、排氣管飾蓋的工藝品級處理——放在客廳也是一件雕塑。",
    rival: "大量生產擅長，但觀察 1 米內的細節會發現差距。",
  },
};

export default function RivalSmashPage() {
  useSetPageHeader({
    title: "競品降維對照",
    hideSearch: true,
    breadcrumb: [{ label: "工具" }, { label: "決策輔助" }, { label: "競品降維" }],
  });

  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    ducati: true, bmw: true, ktm: true, aprilia: false,
  });
  const [activeAxis, setActiveAxis] = useState<(typeof COMPARISON_AXES)[number]["key"]>("soul");

  const series = RIVAL_SCORES
    .filter((r) => enabled[r.key])
    .map((r) => ({
      key: r.key,
      label: `${r.brand} ${r.model}`,
      color: r.accent,
      values: COMPARISON_AXES.map((ax) => (r as unknown as Record<string, number>)[ax.key]),
    }));

  const axisLabels = COMPARISON_AXES.map((a) => a.label);
  const story = DIMENSION_STORIES[activeAxis];

  return (
    <div className="max-w-[1200px] mx-auto py-6 px-2 space-y-6">
      <section className="bg-gradient-to-br from-[#CC0000]/5 via-white to-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-2">
              Dimensional Comparison · 降維對照
            </div>
            <h2 className="text-2xl font-extrabold font-display text-on-surface tracking-tight">
              只有 Ducati 能帶你進入另一個維度
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              不比馬力扭力——那是工程師的事。比的是騎上去的那一刻，你知道自己選對了。
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* 品牌切換 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 h-fit">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            對照品牌
          </div>
          {RIVAL_SCORES.map((r) => (
            <label
              key={r.key}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                enabled[r.key]
                  ? "border-slate-200 bg-slate-50"
                  : "border-slate-100 hover:border-slate-200"
              }`}
              style={{ borderLeftColor: enabled[r.key] ? r.accent : undefined, borderLeftWidth: 4 }}
            >
              <input
                type="checkbox"
                checked={enabled[r.key]}
                onChange={() =>
                  setEnabled((prev) => ({ ...prev, [r.key]: !prev[r.key] }))
                }
                className="w-4 h-4 accent-[#CC0000]"
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-bold leading-tight"
                  style={{ color: r.accent }}
                >
                  {r.brand}
                </div>
                <div className="text-xs text-slate-500 truncate">{r.model}</div>
              </div>
            </label>
          ))}
        </div>

        {/* 雷達圖 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex justify-center">
            <RadarChart size={420} axes={axisLabels} series={series} />
          </div>
          <div className="flex flex-wrap gap-4 justify-center mt-4 pt-4 border-t border-slate-100">
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-bold text-on-surface">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 維度敘事 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            維度敘事 · 選一個深入比較
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COMPARISON_AXES.map((ax) => (
              <button
                key={ax.key}
                onClick={() => setActiveAxis(ax.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                  activeAxis === ax.key
                    ? "bg-[#CC0000] text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-[#CC0000]"
                }`}
              >
                {ax.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <div className="p-6 bg-gradient-to-br from-[#CC0000]/5 to-transparent">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[#CC0000]">
                trending_up
              </span>
              <span className="text-sm font-bold text-[#CC0000] tracking-wider">
                DUCATI 視角
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {story?.ducati}
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-slate-400">
                balance
              </span>
              <span className="text-sm font-bold text-slate-500 tracking-wider">
                對手視角
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {story?.rival}
            </p>
          </div>
        </div>
      </section>

      <section className="text-xs text-slate-500 text-center italic">
        * 本對照為品牌定位敘事工具，非客觀規格報告。規格比較請至官方網站。
      </section>
    </div>
  );
}
