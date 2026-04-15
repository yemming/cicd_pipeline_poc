"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { ducatiModels, formatNTD, type DucatiModel } from "@/lib/ducati-models";
import { DEFAULT_MODEL, getResidual, getElectronicsScore, getSoundScore } from "@/lib/tools/scoring";
import { RadialGauge } from "@/components/charts/radial-gauge";
import { RadarChart } from "@/components/charts/radar-chart";

/**
 * WPM — Wife Persuasion Module（對外代號：資產配置分析）
 *
 * 計算因子：
 *   1. 資產保值率：殘值表 × 持有年數
 *   2. 心理健康溢價：多巴胺 / 月 × 12 × 年（取代心理諮商費）
 *   3. 主動安全防護：電控分數 → 事故成本避免
 *   4. 聲浪情緒資產：聲浪分數 × 會員價值
 *   5. 家庭安撫基金：車價 × 建議補償比
 *
 * 綜合 ROI = (總效益 − 淨折舊) ÷ 車價
 */

const MONTHLY_DOPAMINE_TWD = 4200;     // 取代心理諮商費用的月度情緒收益
const SAFETY_AVOID_BASE = 280000;      // 電控系統減少潛在事故成本（demo 值）
const SOUND_PRICE_PER_POINT = 1800;    // 聲浪情緒每分對應的「會員體驗」等值
const PEACE_FUND_RATIO = 0.12;          // 家庭安撫基金比例（建議提撥給配偶）

function calcWPM(model: DucatiModel, years: 1 | 2 | 3 | 4 | 5) {
  const residual = getResidual(model)[years - 1];
  const residualValue = Math.round(model.priceNTD * residual);
  const depreciation = model.priceNTD - residualValue;

  const mentalHealth = MONTHLY_DOPAMINE_TWD * 12 * years;
  const safetyCredit = Math.round((getElectronicsScore(model) / 100) * SAFETY_AVOID_BASE);
  const soundAsset = Math.round(getSoundScore(model) * SOUND_PRICE_PER_POINT * (years / 5));
  const peaceFund = Math.round(model.priceNTD * PEACE_FUND_RATIO);

  const totalBenefit = residualValue + mentalHealth + safetyCredit + soundAsset;
  const netInvestment = model.priceNTD + peaceFund;

  const roi = ((totalBenefit - depreciation) / model.priceNTD) * 100;
  const roiNormalized = Math.max(0, Math.min(100, roi));

  return {
    residual,
    residualValue,
    depreciation,
    mentalHealth,
    safetyCredit,
    soundAsset,
    peaceFund,
    totalBenefit,
    netInvestment,
    roi,
    roiNormalized,
    factors: {
      保值率: Math.round(residual * 100),
      心理健康: Math.min(100, Math.round((mentalHealth / 300000) * 100)),
      主動安全: getElectronicsScore(model),
      聲浪資產: getSoundScore(model),
      家庭平衡: Math.round(100 - PEACE_FUND_RATIO * 100 * 3),
    },
  };
}

export default function WPMPage() {
  useSetPageHeader({
    title: "資產配置分析",
    hideSearch: true,
    breadcrumb: [{ label: "工具" }, { label: "決策輔助" }, { label: "資產配置分析" }],
  });

  const [modelId, setModelId] = useState(DEFAULT_MODEL.id);
  const [years, setYears] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [ghostUnlock, setGhostUnlock] = useState(0); // 三連點解鎖
  const [ghostOn, setGhostOn] = useState(false);

  const model = ducatiModels.find((m) => m.id === modelId) ?? DEFAULT_MODEL;
  const r = useMemo(() => calcWPM(model, years), [model, years]);

  const triggerGhost = () => {
    const next = ghostUnlock + 1;
    if (next >= 3) {
      setGhostOn(true);
      setGhostUnlock(0);
    } else {
      setGhostUnlock(next);
      setTimeout(() => setGhostUnlock(0), 1200);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto py-6 px-2 space-y-6">
      {/* 標題列 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-wrap gap-6 items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-2">
            Capital Allocation Report · 資產配置分析
          </div>
          <h2 className="text-2xl font-extrabold font-display text-on-surface tracking-tight">
            {model.name} 長期投資效益評估
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {ghostOn ? "WPM v1.0 · 配偶說服模組已啟動" : "ERP 資本支出評估報告（CAPEX Framework）"}
          </p>
        </div>

        {/* 車款選擇 + 年限 */}
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
            {([1, 3, 5] as const).map((y) => (
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
      </section>

      {/* 主要數據 + Gauge */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            五維度資產效能雷達
          </div>
          <div className="flex justify-center">
            <RadarChart
              size={360}
              axes={Object.keys(r.factors)}
              series={[
                {
                  key: "model",
                  label: model.name,
                  color: "#CC0000",
                  values: Object.values(r.factors),
                },
              ]}
            />
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center">
          <RadialGauge
            value={r.roiNormalized}
            label={`綜合 ROI 指數`}
            sublabel={`實際 ROI: ${r.roi.toFixed(1)}%`}
            color={r.roi > 30 ? "#059669" : r.roi > 0 ? "#F59E0B" : "#DC2626"}
            size={240}
          />
          <div className="mt-4 text-center">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
              Net Present Benefit
            </div>
            <div className="text-2xl font-extrabold font-display text-on-surface tracking-tight">
              {formatNTD(r.totalBenefit - r.depreciation)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              相較於 {years} 年後淨折舊 {formatNTD(r.depreciation)}
            </div>
          </div>
        </div>
      </section>

      {/* 因子明細 */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60">
          <h3 className="text-sm font-bold text-on-surface">因子明細 · {years} 年持有期</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <FactorCell
            tint="emerald"
            label="資產保值"
            value={formatNTD(r.residualValue)}
            sub={`殘值率 ${(r.residual * 100).toFixed(0)}%`}
            hint="殘值表 × 車價"
          />
          <FactorCell
            tint="sky"
            label="心理健康溢價"
            value={formatNTD(r.mentalHealth)}
            sub={`${MONTHLY_DOPAMINE_TWD.toLocaleString()}/月 × 12 × ${years}`}
            hint="取代心理諮商費"
          />
          <FactorCell
            tint="amber"
            label="主動安全防護"
            value={formatNTD(r.safetyCredit)}
            sub={`電控指數 ${getElectronicsScore(model)}`}
            hint="ABS / TC / WC 避險"
          />
          <FactorCell
            tint="violet"
            label="聲浪情緒資產"
            value={formatNTD(r.soundAsset)}
            sub={`聲浪指數 ${getSoundScore(model)}`}
            hint="情緒價值等值"
          />
          <FactorCell
            tint="rose"
            label="家庭安撫基金"
            value={formatNTD(r.peaceFund)}
            sub={`車價 × ${(PEACE_FUND_RATIO * 100).toFixed(0)}%`}
            hint="配偶補償建議值"
          />
        </div>
      </section>

      {/* Ghost mode：安太座話術 */}
      {ghostOn && (
        <section className="relative bg-gradient-to-br from-rose-50 to-amber-50 border-2 border-dashed border-[#CC0000]/40 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#CC0000]">favorite</span>
              <h3 className="text-base font-bold text-[#CC0000] tracking-tight">
                WPM · 安太座話術組
              </h3>
              <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full tracking-wider">
                HIDDEN MODE
              </span>
            </div>
            <button
              onClick={() => setGhostOn(false)}
              className="text-xs text-slate-500 hover:text-[#CC0000]"
            >
              收起
            </button>
          </div>

          <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
            <li className="bg-white/70 rounded-lg px-4 py-3">
              <span className="font-bold text-[#CC0000]">理性牌：</span>
              「這不是買車，是{years} 年的資產配置。殘值{" "}
              {(r.residual * 100).toFixed(0)}%，
              比放定存划算，至少還能騎。」
            </li>
            <li className="bg-white/70 rounded-lg px-4 py-3">
              <span className="font-bold text-[#CC0000]">心理牌：</span>
              「每個月{" "}
              {MONTHLY_DOPAMINE_TWD.toLocaleString()} 的多巴胺，比去身心科便宜。老婆妳也不希望我抑鬱吧。」
            </li>
            <li className="bg-white/70 rounded-lg px-4 py-3">
              <span className="font-bold text-[#CC0000]">安全牌：</span>
              「{model.family} 家族全套電控，避免 {formatNTD(r.safetyCredit)} 的潛在醫療費。這叫『買保險』。」
            </li>
            <li className="bg-white/70 rounded-lg px-4 py-3">
              <span className="font-bold text-[#CC0000]">補償牌：</span>
              「我已經幫妳預留了 <strong>{formatNTD(r.peaceFund)}</strong> 的『家庭安撫基金』——愛馬仕 or 香奈兒？妳決定。」
            </li>
            <li className="bg-white/70 rounded-lg px-4 py-3">
              <span className="font-bold text-[#CC0000]">終極牌：</span>
              「我買的不是車，是中年焦慮的解藥。妳希望我每天回家看股票哀聲嘆氣，還是帶著微笑下廚？」
            </li>
          </ul>

          <div className="text-[10px] text-slate-500 font-mono mt-3 tracking-wider">
            ⚠ USE WITH CAUTION · 成功率 68%（基於 2024 年台灣 Ducati 車主抽樣）
          </div>
        </section>
      )}

      {/* Ghost trigger 角落小點 */}
      <div className="flex justify-end">
        <button
          onClick={triggerGhost}
          aria-label="hidden"
          className={`w-3 h-3 rounded-full transition-all ${
            ghostOn
              ? "bg-[#CC0000] shadow-[0_0_12px_#CC0000]"
              : ghostUnlock > 0
              ? "bg-[#C9A84C]"
              : "bg-slate-200 hover:bg-slate-300"
          }`}
          title={ghostOn ? "Ghost 模式已啟動" : `${3 - ghostUnlock} 次點擊解鎖`}
        />
      </div>
    </div>
  );
}

function FactorCell({
  tint,
  label,
  value,
  sub,
  hint,
}: {
  tint: "emerald" | "sky" | "amber" | "violet" | "rose";
  label: string;
  value: string;
  sub: string;
  hint: string;
}) {
  const bg: Record<typeof tint, string> = {
    emerald: "text-emerald-700",
    sky: "text-sky-700",
    amber: "text-amber-700",
    violet: "text-violet-700",
    rose: "text-rose-700",
  };
  return (
    <div className="p-5">
      <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${bg[tint]}`}>
        {label}
      </div>
      <div className="text-xl font-extrabold font-display text-on-surface tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
      <div className="text-[10px] text-slate-400 mt-2 italic">{hint}</div>
    </div>
  );
}
