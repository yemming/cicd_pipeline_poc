"use client";

/**
 * D3DonutChart — 可重用環圈圖（hybrid：D3 算 pie/arc，React 渲染 SVG）
 *
 * 第十八輪 集團策略評估層 · GRP18 新客來源分析共用（中心放總數、外圈分佈、右側 legend）。
 *
 * 設計取捨（沿用本目錄 d3-gauge / d3-scatter / d3-line-trend 的 hybrid 風格）：
 *   - 用 d3-shape 的 pie() 算各段角度、arc() 產扇形 path d 字串；SVG（<path>/<text>）用
 *     JSX 渲染、hover 用 React state。→ 最 React-friendly、不跟 React 搶 DOM、天然支援
 *     StrictMode 雙跑、client-only render 不出 hydration mismatch。
 *   - 設計稿的「mouseover→transition 到 arcH（外擴 +6）」用 React state + CSS transition 達成；
 *     「進場 attrTween 從 0 展開」用掛載後 setMounted(true) 觸發一次 stroke/scale 過場達成
 *     （確定性、只在 useEffect/client 跑，server 端不出帶動畫狀態的 SVG）。
 *   - 中心大數字格式化用確定性 thousands separator（不用會 locale 漂移的 toLocaleString）。
 *
 * 紀律：純前端 presentational component，不 import supabase、不過網路。
 */

import { useEffect, useId, useMemo, useState } from "react";
import { pie as d3pie, arc as d3arc } from "d3-shape";

export type DonutSegment = { label: string; value: number; color?: string };

export type D3DonutChartProps = {
  segments: DonutSegment[];
  /** 中心大字（如新客戶總數 342）；不給時用各段 value 加總 */
  centerValue?: string | number;
  /** 中心小字（如 "新客戶"） */
  centerLabel?: string;
  /** 顯示右側 legend 列，預設 true */
  showLegend?: boolean;
  /** 高度（px），預設 180 */
  height?: number;
  className?: string;
};

// 色票（navy / 中藍 / teal / amber / 灰 / 紫）循環；對齊專案 token
const DEFAULT_PALETTE = ["#1A3A5C", "#3A7AB2", "#0F6E56", "#854F0B", "#9A9890", "#534AB7"];

const NAVY = "#1A3A5C";
const TEXT_SUB = "#5A5A5A";

/** 確定性 thousands separator（避開 toLocaleString 的 locale 漂移）。 */
function formatNumber(v: string | number): string {
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "—";
  const neg = v < 0;
  const intStr = String(Math.abs(Math.round(v)));
  const withSep = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-${withSep}` : withSep;
}

export function D3DonutChart({
  segments,
  centerValue,
  centerLabel,
  showLegend = true,
  height = 180,
  className,
}: D3DonutChartProps) {
  const uid = useId().replace(/[:]/g, "");
  // 掛載後觸發進場動畫（client-only；server 端 mounted=false 不帶動畫狀態 → 無 hydration mismatch）
  const [mounted, setMounted] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    // 下一個 frame 再翻 true，讓初始 transform/opacity 有起點可過場
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // donut 幾何（對齊設計稿：r=64、innerRadius=r*.55、hover outerRadius=r+6）
  const r = 64;
  const svgSize = r * 2 + 16; // 兩側留 8px 給 hover 外擴 + stroke
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  const { arcs, sum } = useMemo(() => {
    const valid = segments.map((s) => ({
      ...s,
      value: Number.isFinite(s.value) && s.value > 0 ? s.value : 0,
    }));
    const total = valid.reduce((acc, s) => acc + s.value, 0);

    // sort=null 保持輸入順序；value 依 segment.value 比例
    const pieGen = d3pie<{ value: number }>().value((d) => d.value).sort(null);
    const arcGen = d3arc().innerRadius(r * 0.55).outerRadius(r);
    const arcHoverGen = d3arc().innerRadius(r * 0.55).outerRadius(r + 6);

    const pieData = pieGen(valid.map((s) => ({ value: s.value })));

    const arcs = pieData.map((p, i) => {
      const seg = valid[i];
      const color = seg.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
      const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
      // arc 需要 startAngle/endAngle，dummy 套用上面設好的固定 inner/outer radius
      const dummy = {
        startAngle: p.startAngle,
        endAngle: p.endAngle,
        innerRadius: r * 0.55,
        outerRadius: r,
      };
      return {
        label: seg.label,
        value: seg.value,
        color,
        pct,
        path: arcGen(dummy) ?? "",
        pathHover: arcHoverGen(dummy) ?? "",
      };
    });

    return { arcs, sum: total };
  }, [segments]);

  const hasData = sum > 0;

  // hover 索引對當前 arcs 防越界（segments 變短時舊 hoverIdx 可能指向已消失的段）
  const activeHover = hoverIdx != null && hoverIdx < arcs.length ? hoverIdx : null;

  // 中心大字：caller 給就用，否則用加總
  const resolvedCenter = centerValue != null ? formatNumber(centerValue) : formatNumber(sum);

  if (!hasData) {
    return (
      <div
        className={`flex items-center justify-center text-[12px] text-[#9A9890] bg-[#F8F7F4] border border-dashed border-[#D5D3CB] rounded-lg ${className ?? ""}`}
        style={{ height }}
      >
        尚無資料
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-4 ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      {/* 環圈本體 */}
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        style={{ display: "block", overflow: "visible", flexShrink: 0 }}
        role="img"
        aria-label={centerLabel ? `${centerLabel}環圈圖` : "環圈圖"}
      >
        {/* 進場：整圖從 scale .85 + 透明 → 1 + 不透明（一次性過場，對齊設計稿 attrTween 展開意圖） */}
        <g
          transform={`translate(${cx},${cy}) scale(${mounted ? 1 : 0.85})`}
          style={{
            opacity: mounted ? 1 : 0,
            transition: "transform 800ms cubic-bezier(.22,1,.36,1), opacity 600ms ease",
            transformOrigin: "center",
          }}
        >
          {arcs.map((a, i) => {
            const isHover = activeHover === i;
            return (
              <path
                key={`arc-${uid}-${i}`}
                d={isHover ? a.pathHover : a.path}
                fill={a.color}
                stroke="#FFFFFF"
                strokeWidth={2}
                style={{ cursor: "pointer", transition: "d 160ms ease" }}
                onMouseOver={() => setHoverIdx(i)}
                onMouseOut={() => setHoverIdx(null)}
              >
                <title>{`${a.label}：${a.pct}%`}</title>
              </path>
            );
          })}

          {/* 中心大字（700 navy）+ 下方小字（灰） */}
          <text
            x={0}
            y={centerLabel ? -1 : 5}
            textAnchor="middle"
            fontSize={18}
            fontWeight={700}
            fill={NAVY}
          >
            {resolvedCenter}
          </text>
          {centerLabel ? (
            <text x={0} y={14} textAnchor="middle" fontSize={10} fill="#9A9890">
              {centerLabel}
            </text>
          ) : null}
        </g>
      </svg>

      {/* legend：色點 + label + 比例小 bar + 百分比 */}
      {showLegend ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {arcs.map((a, i) => {
            const isHover = activeHover === i;
            return (
              <div
                key={`lg-${uid}-${i}`}
                className="flex items-center gap-2 text-[11px]"
                style={{ opacity: activeHover == null || isHover ? 1 : 0.45, transition: "opacity 120ms ease" }}
                onMouseOver={() => setHoverIdx(i)}
                onMouseOut={() => setHoverIdx(null)}
              >
                {/* 色點 */}
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: a.color }}
                />
                {/* label */}
                <span className="w-16 shrink-0 truncate" style={{ color: TEXT_SUB }} title={a.label}>
                  {a.label}
                </span>
                {/* 比例小 bar（寬度 = pct%） */}
                <span className="relative h-1.5 min-w-0 flex-1 rounded-full bg-[#EEECE6]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${a.pct}%`, background: a.color, transition: "width 600ms ease" }}
                  />
                </span>
                {/* 百分比 */}
                <span className="w-8 shrink-0 text-right tabular-nums" style={{ color: NAVY, fontWeight: 600 }}>
                  {a.pct}%
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
