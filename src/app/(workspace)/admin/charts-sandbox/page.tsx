/**
 * Charts Sandbox — P0-2 共用 chart 元件預覽 / 配色測試頁。
 *
 * 全部 7 個元件在這裡 render mock data，搭配 tone 切換 chip
 * 即時驗證配色（design-tokens.css 的 7 tone palette）。
 *
 * 元件原始檔：src/components/charts/*.tsx
 * Barrel import：@/components/charts
 */

"use client";

import { useState } from "react";
import {
  BarChart,
  type ChartTone,
  DonutChart,
  FunnelChart,
  GaugeChart,
  HeatMap,
  LineChart,
  SparkLine,
  TONE_CYCLE,
} from "@/components/charts";

// ───────────── Mock data ─────────────

const SALES_7D = [
  { day: "週一", sales: 4, target: 6 },
  { day: "週二", sales: 7, target: 6 },
  { day: "週三", sales: 5, target: 6 },
  { day: "週四", sales: 9, target: 6 },
  { day: "週五", sales: 12, target: 6 },
  { day: "週六", sales: 14, target: 6 },
  { day: "週日", sales: 8, target: 6 },
];

const DEPT_RANK = [
  { dept: "業務一部", revenue: 1240 },
  { dept: "業務二部", revenue: 980 },
  { dept: "業務三部", revenue: 760 },
  { dept: "業務四部", revenue: 540 },
  { dept: "業務五部", revenue: 320 },
];

const CHANNEL_SHARE = [
  { name: "門市", value: 42 },
  { name: "線上", value: 28 },
  { name: "活動", value: 16 },
  { name: "轉介", value: 9 },
  { name: "其他", value: 5 },
];

const FUNNEL = [
  { name: "來店", value: 1200 },
  { name: "試駕", value: 480 },
  { name: "報價", value: 220 },
  { name: "訂單", value: 95 },
  { name: "交車", value: 78 },
];

const HEAT_HOURS = ["08-10", "10-12", "12-14", "14-16", "16-18", "18-20"];
const HEAT_DAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
const HEAT: Array<{ x: string; y: string; value: number }> = HEAT_DAYS.flatMap((d, di) =>
  HEAT_HOURS.map((h, hi) => ({
    x: h,
    y: d,
    // 編些「下午到傍晚 + 週末」較熱的合理資料
    value: Math.round(
      (Math.sin((hi / HEAT_HOURS.length) * Math.PI) * 8 + (di >= 5 ? 6 : di * 0.8)) * 10,
    ),
  })),
);

const SPARK_A = [3, 5, 4, 7, 9, 8, 12, 11, 13, 16];
const SPARK_B = [50, 48, 52, 49, 47, 45, 44, 46, 43, 42];

// ───────────── Page ─────────────

export default function ChartsSandboxPage() {
  const [tone, setTone] = useState<ChartTone>("blue");

  return (
    <main className="px-6 py-6 max-w-[1280px] space-y-6">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[18px] font-semibold text-[#2C2C2A]">Charts Sandbox</h1>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
            P0-2 · A 級基建
          </span>
        </div>
        <p className="text-[12.5px] text-[#5A5955]">
          7 個共用 chart 元件預覽（recharts 為底、HeatMap 自寫 SVG）。Tone 切換會即時改全部圖表配色，
          來源 <code className="font-mono text-[11.5px] bg-[#F8F7F4] px-1 rounded">src/components/charts</code>。
        </p>
      </header>

      {/* Tone 切換 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-[#5A5955] mr-2">Tone：</span>
          {TONE_CYCLE.map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`h-[26px] px-3 rounded-full text-[11.5px] font-medium border transition-tone ${
                tone === t
                  ? "text-white border-transparent"
                  : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
              }`}
              style={tone === t ? { background: `var(--tone-${t}-500)` } : undefined}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Grid 2 欄 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. LineChart */}
        <ChartCard title="① LineChart" subtitle="雙線 · sales vs target · smooth · legend">
          <LineChart
            data={SALES_7D}
            xKey="day"
            yKey={[
              { key: "sales", label: "銷售" },
              { key: "target", label: "目標" },
            ]}
            tone={tone}
            size="md"
            showLegend
          />
        </ChartCard>

        {/* 2. BarChart */}
        <ChartCard title="② BarChart" subtitle="horizontal · rainbow（每條走 SERIES_COLORS）">
          <BarChart
            data={DEPT_RANK}
            categoryKey="dept"
            valueKey="revenue"
            tone={tone}
            size="md"
            orientation="horizontal"
            rainbow
          />
        </ChartCard>

        {/* 3. DonutChart */}
        <ChartCard title="③ DonutChart" subtitle="5 segment · 中央 label">
          <DonutChart
            data={CHANNEL_SHARE}
            tone={tone}
            size="md"
            showLegend
            centerLabel="100%"
            centerCaption="通路占比"
          />
        </ChartCard>

        {/* 4. GaugeChart */}
        <ChartCard title="④ GaugeChart" subtitle="半圓 · KPI 達成率">
          <GaugeChart value={74} tone={tone} size="md" caption="本月達成率" isPercent />
        </ChartCard>

        {/* 5. FunnelChart */}
        <ChartCard title="⑤ FunnelChart" subtitle="銷售漏斗 5 階 · 同 tone 漸層">
          <FunnelChart data={FUNNEL} tone={tone} size="md" />
        </ChartCard>

        {/* 6. HeatMap */}
        <ChartCard title="⑥ HeatMap" subtitle="週 × 時段預約熱度 · 強度低→高 = tone-100 → tone-700">
          <HeatMap data={HEAT} tone={tone} size="md" showValues />
        </ChartCard>
      </div>

      {/* 7. SparkLine — 寬版單獨展示（KPI card 內嵌情境） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">⑦ SparkLine（KPI card 內嵌情境）</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="今日訂單" value="16" delta="+23%" tone={tone} data={SPARK_A} />
          <KpiCard label="未交車輛" value="42" delta="-8%" tone={tone} data={SPARK_B} />
          <KpiCard label="維修工單" value="28" delta="+5%" tone={tone} data={SPARK_A} />
          <KpiCard label="本月來店" value="187" delta="+12%" tone={tone} data={SPARK_A.slice().reverse()} />
        </div>
      </section>

      <footer className="text-[11.5px] text-[#9A9890] pt-2">
        Barrel import：<code className="font-mono">@/components/charts</code>。
        新增 chart 元件時，記得在 <code className="font-mono">index.ts</code> 加 re-export、
        並在本頁加一張 demo card 驗證 tone 切換。
      </footer>
    </main>
  );
}

// ───────────── 小元件 ─────────────

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        {subtitle ? <p className="text-[11.5px] text-[#9A9890] mt-0.5">{subtitle}</p> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  delta,
  tone,
  data,
}: {
  label: string;
  value: string;
  delta: string;
  tone: ChartTone;
  data: number[];
}) {
  const positive = delta.startsWith("+");
  return (
    <div className="rounded-lg border border-[#EEECE6] bg-white p-3 hover-lift">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-[22px] font-semibold text-[#2C2C2A]">{value}</div>
        <div
          className={`text-[11px] font-medium ${
            positive ? "text-tone-green-700" : "text-tone-red-700"
          }`}
        >
          {delta}
        </div>
      </div>
      <div className="mt-2">
        <SparkLine data={data} tone={tone} height={36} />
      </div>
    </div>
  );
}
