"use client";

/**
 * D3RadarChart — 可重用六維雷達圖（hybrid：D3 算角度/半徑 scale，React 渲染 SVG）
 *
 * 第十八輪 集團策略評估層 · 門店健康分數雷達共用。沿用 d3-scatter / d3-line-trend 的
 * hybrid 風格：用 d3-scale 的 scaleLinear 把分數映射成半徑，三角函數算各軸角度，
 * SVG（<polygon>/<line>/<circle>/<text>）用 JSX 渲染。
 *
 * 視覺：N 條軸線從中心放射、若干刻度同心多邊形環、各維資料點連成填色多邊形。
 * 空安全：dims 全空或無有效維度時顯示佔位框。
 *
 * 紀律：純前端 presentational component，不 import supabase、不過網路。
 */

import { useId, useMemo } from "react";
import { scaleLinear } from "d3-scale";

export interface D3RadarChartProps {
  /** 各維分數（key→value，0..max）；缺值維度仍畫軸、資料點落在中心 */
  dims: Record<string, number>;
  /** 各維中文標籤（key→label）；不給時用 key 當標籤 */
  labels?: Record<string, string>;
  /** 分數上限（半徑滿格），預設 100 */
  max?: number;
  /** 多邊形主色（填色 + 描邊），預設品牌藍 */
  color?: string;
  /** 整體尺寸 px（正方形），預設 130（給 KPI 卡內嵌） */
  size?: number;
  /** 沒有任何有效維度時的訊息 */
  emptyMessage?: string;
}

const DEFAULT_COLOR = "#1A3A5C";
const RING_LEVELS = 4; // 刻度同心環數

/** hex 主色 → rgba（填色用淡化）。 */
function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function D3RadarChart({
  dims,
  labels,
  max = 100,
  color = DEFAULT_COLOR,
  size = 130,
  emptyMessage = "尚無維度資料",
}: D3RadarChartProps) {
  const uid = useId().replace(/[:]/g, "");

  const axes = useMemo(() => Object.keys(dims), [dims]);
  const hasData = useMemo(
    () => axes.some((k) => dims[k] != null && !Number.isNaN(dims[k])),
    [axes, dims],
  );

  // 預留外圈給標籤文字
  const pad = 26;
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.max(10, size / 2 - pad);

  const rScale = useMemo(
    () => scaleLinear().domain([0, max]).range([0, radius]),
    [max, radius],
  );

  // 各軸角度（從正上方開始，順時針）
  const geom = useMemo(() => {
    const n = axes.length;
    return axes.map((key, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const raw = dims[key];
      const value = raw == null || Number.isNaN(raw) ? 0 : Math.max(0, Math.min(max, raw));
      const r = rScale(value);
      return {
        key,
        label: labels?.[key] ?? key,
        angle,
        // 軸端點（滿格）
        axisX: cx + Math.cos(angle) * radius,
        axisY: cy + Math.sin(angle) * radius,
        // 資料點
        ptX: cx + Math.cos(angle) * r,
        ptY: cy + Math.sin(angle) * r,
        // 標籤位置（軸端再往外推一點）
        labelX: cx + Math.cos(angle) * (radius + 13),
        labelY: cy + Math.sin(angle) * (radius + 13),
        value: raw == null || Number.isNaN(raw) ? null : raw,
      };
    });
  }, [axes, dims, labels, max, rScale, cx, cy, radius]);

  if (axes.length < 3 || !hasData) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-[#9A9890] bg-[#F8F7F4] border border-dashed border-[#D5D3CB] rounded-lg"
        style={{ width: size, height: size }}
      >
        {emptyMessage}
      </div>
    );
  }

  // 刻度同心環（多邊形，逐環縮放）
  const rings = Array.from({ length: RING_LEVELS }, (_, idx) => {
    const ratio = (idx + 1) / RING_LEVELS;
    const points = geom
      .map((g) => {
        const rx = cx + Math.cos(g.angle) * radius * ratio;
        const ry = cy + Math.sin(g.angle) * radius * ratio;
        return `${rx},${ry}`;
      })
      .join(" ");
    return { ratio, points };
  });

  const dataPolygon = geom.map((g) => `${g.ptX},${g.ptY}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", overflow: "visible" }}
      role="img"
      aria-label="六維健康分數雷達圖"
    >
      {/* 刻度同心環 */}
      {rings.map((ring, i) => (
        <polygon
          key={`ring-${uid}-${i}`}
          points={ring.points}
          fill="none"
          stroke="#EEECE6"
          strokeWidth={1}
        />
      ))}

      {/* 各軸放射線 */}
      {geom.map((g) => (
        <line
          key={`axis-${uid}-${g.key}`}
          x1={cx}
          y1={cy}
          x2={g.axisX}
          y2={g.axisY}
          stroke="#D5D3CB"
          strokeWidth={1}
        />
      ))}

      {/* 資料多邊形 */}
      <polygon
        points={dataPolygon}
        fill={rgba(color, 0.18)}
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />

      {/* 資料點 */}
      {geom.map((g) => (
        <circle key={`pt-${uid}-${g.key}`} cx={g.ptX} cy={g.ptY} r={2.4} fill={color} />
      ))}

      {/* 維度標籤 */}
      {geom.map((g) => {
        const anchor =
          Math.abs(Math.cos(g.angle)) < 0.3 ? "middle" : Math.cos(g.angle) > 0 ? "start" : "end";
        return (
          <text
            key={`lbl-${uid}-${g.key}`}
            x={g.labelX}
            y={g.labelY + 3}
            textAnchor={anchor}
            fontSize={9.5}
            fill="#5A5955"
          >
            {g.label}
          </text>
        );
      })}
    </svg>
  );
}
