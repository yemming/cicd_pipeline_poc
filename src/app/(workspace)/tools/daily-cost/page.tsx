"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { ducatiModels, formatNTD } from "@/lib/ducati-models";
import { DEFAULT_MODEL, getResidual } from "@/lib/tools/scoring";
import { LineArea } from "@/components/charts/line-area";

/**
 * T2 理性護航計算機（每日夢想成本）
 *
 * 邏輯：NetSuite 直線折舊（Straight-line depreciation）
 *   年折舊 = (取得成本 − 殘值) / 年限
 *   日成本 = 年折舊 / 365
 *
 * 對標：星巴克（130）／雞腿便當（120）／手搖飲（60）／健身房（1200/月）
 */

const BENCHMARKS = [
  { key: "starbucks",  label: "大杯拿鐵",    unitTWD: 130,  icon: "local_cafe"    },
  { key: "bento",      label: "雞腿便當",    unitTWD: 120,  icon: "restaurant"    },
  { key: "bubbletea",  label: "手搖飲",      unitTWD: 60,   icon: "emoji_food_beverage" },
  { key: "gym",        label: "健身房",      unitTWD: 40,   icon: "fitness_center" }, // 1200/月 ÷ 30
];

export default function DailyCostPage() {
  useSetPageHeader({
    title: "理性護航計算機",
    hideSearch: true,
    breadcrumb: [{ label: "工具" }, { label: "決策輔助" }, { label: "理性護航" }],
  });

  const [modelId, setModelId] = useState(DEFAULT_MODEL.id);
  const [years, setYears] = useState<3 | 5 | 7 | 10>(5);

  const model = ducatiModels.find((m) => m.id === modelId) ?? DEFAULT_MODEL;
  const residualTable = getResidual(model); // 5 年表
  const residualAtYears = residualTable[Math.min(years, 5) - 1];
  // 若 years > 5，用線性外推
  const finalResidual = years <= 5
    ? residualAtYears
    : Math.max(0.15, residualAtYears - (years - 5) * 0.04);

  const salvage = Math.round(model.priceNTD * finalResidual);
  const totalDep = model.priceNTD - salvage;
  const perYear = totalDep / years;
  const perDay = perYear / 365;
  const perMonth = perYear / 12;

  const depreciationCurve = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let y = 0; y <= years; y++) {
      // 直線折舊
      const residual = 1 - ((1 - finalResidual) * y) / years;
      pts.push({ x: y, y: Math.round(model.priceNTD * residual) });
    }
    return pts;
  }, [model.priceNTD, years, finalResidual]);

  return (
    <div className="max-w-[1200px] mx-auto py-6 px-2 space-y-6">
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-2">
              Daily Dream Cost · 理性護航計算
            </div>
            <h2 className="text-2xl font-extrabold font-display text-on-surface tracking-tight">
              {model.name}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              直線折舊法（Straight-line Depreciation）· 每日成本折算
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-on-surface focus:outline-none focus:border-[#CC0000]"
            >
              {ducatiModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold">
              {([3, 5, 7, 10] as const).map((y) => (
                <button
                  key={y}
                  onClick={() => setYears(y)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    years === y ? "bg-white text-[#CC0000] shadow-sm" : "text-slate-500"
                  }`}
                >
                  {y} 年
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 關鍵數字 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KeyStat
          label="每日夢想成本"
          value={`NT$ ${Math.round(perDay).toLocaleString()}`}
          sub="Daily amortization"
          accent="#CC0000"
          icon="today"
        />
        <KeyStat
          label="每月攤提"
          value={`NT$ ${Math.round(perMonth).toLocaleString()}`}
          sub="Monthly depreciation"
          accent="#F59E0B"
          icon="date_range"
        />
        <KeyStat
          label={`${years} 年殘值`}
          value={formatNTD(salvage)}
          sub={`殘值率 ${(finalResidual * 100).toFixed(0)}%`}
          accent="#059669"
          icon="trending_down"
        />
      </section>

      {/* 折舊曲線 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              折舊曲線
            </div>
            <h3 className="text-sm font-bold text-on-surface">
              {years} 年持有 · 帳面價值衰減
            </h3>
          </div>
          <div className="text-xs text-slate-500">
            取得成本 <strong className="text-on-surface">{formatNTD(model.priceNTD)}</strong>
          </div>
        </div>
        <LineArea
          data={depreciationCurve}
          color="#CC0000"
          height={260}
          width={900}
          xLabel={(p) => `第 ${p.x} 年`}
          yFormat={(v) => `${(v / 10000).toFixed(0)} 萬`}
        />
      </section>

      {/* 對標生活成本 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">
          每日成本對照 · 其實比你想的便宜
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BENCHMARKS.map((b) => {
            const units = perDay / b.unitTWD;
            return (
              <div
                key={b.key}
                className="rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 p-5"
              >
                <span
                  className="material-symbols-outlined text-2xl mb-2 block"
                  style={{ color: "#CC0000" }}
                >
                  {b.icon}
                </span>
                <div className="text-[11px] text-slate-500 font-medium">
                  每日等同於
                </div>
                <div className="text-3xl font-extrabold font-display text-on-surface tracking-tight tabular-nums">
                  {units.toFixed(1)}
                </div>
                <div className="text-xs text-slate-600 font-semibold">
                  {b.label}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  NT${b.unitTWD}/單位
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-4">
          <strong className="text-slate-700">敘事結構：</strong>
          把大額支出拆到每日顆粒度，心理門檻降 90%。
          這不是省錢——是把「夢想」跟「日常小確幸」放在同一把尺上比較。
        </div>
      </section>
    </div>
  );
}

function KeyStat({
  label, value, sub, accent, icon,
}: { label: string; value: string; sub: string; accent: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}15`, color: accent }}
        >
          <span className="material-symbols-outlined text-lg">{icon}</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
      </div>
      <div
        className="text-3xl font-extrabold font-display tracking-tight tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}
