"use client";

/**
 * DamageMapSvg — 互動式機車側面損傷標記元件
 *
 * 每個 dot 點擊循環四狀態：empty(灰) → ok(綠) → warn(琥珀) → bad(紅) → empty
 * 狀態存入呼叫方的 dotMarks state，由 saveChecks() 一起送出。
 *
 * dot 顏色 token（照 CLAUDE.md design token）：
 *  ok   → #0F6E56（綠）
 *  warn → #854F0B（琥珀）
 *  bad  → #CC0000（紅）
 *  empty→ #9A9890（灰）
 */

import type { DotMark } from "@/domain/pre-inspections.constants";

/** 預設 dot 點位定義（side view，比例座標 0~1）
 * SVG viewBox 為 0 0 480 200
 * x/y 是相對於 viewBox 的比例
 */
const DEFAULT_DOTS: Array<Omit<DotMark, "state">> = [
  { view: "side", x: 0.13, y: 0.38, label: "把手區" },
  { view: "side", x: 0.23, y: 0.52, label: "左整流罩" },
  { view: "side", x: 0.42, y: 0.42, label: "油箱" },
  { view: "side", x: 0.52, y: 0.50, label: "坐墊區" },
  { view: "side", x: 0.68, y: 0.56, label: "車尾" },
  { view: "side", x: 0.79, y: 0.76, label: "排氣管" },
  { view: "side", x: 0.20, y: 0.78, label: "前輪" },
  { view: "side", x: 0.72, y: 0.78, label: "後輪" },
];

/** 循環下一個狀態 */
function nextState(cur: DotMark["state"]): DotMark["state"] {
  const cycle: DotMark["state"][] = ["empty", "ok", "warn", "bad"];
  return cycle[(cycle.indexOf(cur) + 1) % cycle.length];
}

/** dot 填色（填滿圓點） */
function dotFill(state: DotMark["state"]): string {
  switch (state) {
    case "ok":    return "#0F6E56";
    case "warn":  return "#854F0B";
    case "bad":   return "#CC0000";
    default:      return "#9A9890";
  }
}

/** dot 外圈顏色（半透明暈輪） */
function dotRing(state: DotMark["state"]): string {
  switch (state) {
    case "ok":    return "#0F6E5640";
    case "warn":  return "#854F0B40";
    case "bad":   return "#CC000040";
    default:      return "#9A989030";
  }
}

/** 狀態中文 */
function stateLabel(state: DotMark["state"]): string {
  switch (state) {
    case "ok":   return "正常";
    case "warn": return "注意";
    case "bad":  return "損傷";
    default:     return "未標記";
  }
}

type Props = {
  dotMarks: DotMark[];
  setDotMarks: (marks: DotMark[]) => void;
  disabled?: boolean;
};

export function DamageMapSvg({ dotMarks, setDotMarks, disabled }: Props) {
  const SVG_W = 480;
  const SVG_H = 200;

  /**
   * 取得 dot 目前狀態：優先從 dotMarks 取，否則回 "empty"
   */
  function getDotState(label: string): DotMark["state"] {
    return dotMarks.find((d) => d.label === label)?.state ?? "empty";
  }

  /** 點擊 dot：切換狀態並回寫 */
  function handleDotClick(dot: Omit<DotMark, "state">) {
    if (disabled) return;
    const cur = getDotState(dot.label);
    const next = nextState(cur);
    const others = dotMarks.filter((d) => d.label !== dot.label);
    if (next === "empty") {
      // empty 狀態不存入陣列（保持乾淨），移除此 label
      setDotMarks(others);
    } else {
      setDotMarks([...others, { ...dot, state: next }]);
    }
  }

  // 非 empty 的 dot，用於 dot-log 摘要
  const markedDots = dotMarks.filter((d) => d.state !== "empty");

  return (
    <div className="space-y-3">
      {/* SVG 示意圖 */}
      <div className="relative border border-[#EEECE6] rounded-lg bg-[#F8F7F4] overflow-hidden">
        <div className="text-[11px] text-[#9A9890] px-3 pt-2 pb-1">
          側面示意圖 — 點擊圓點循環標記狀態（正常 / 注意 / 損傷）
        </div>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full"
          style={{ maxHeight: "220px" }}
          aria-label="機車側面損傷標記"
        >
          {/* ── 機車側面輪廓（簡化線條） ── */}

          {/* 車身主體 */}
          <path
            d="M80,110 Q100,60 130,55 Q180,45 220,50 Q260,48 290,60 Q320,65 340,75 Q360,80 370,90 L370,120 Q340,125 310,128 Q200,132 100,125 Z"
            fill="#E8E7E4"
            stroke="#9A9890"
            strokeWidth="1.5"
          />

          {/* 車頭整流罩 */}
          <path
            d="M60,85 Q70,60 90,55 Q100,50 110,58 Q100,70 85,95 Q75,105 65,100 Z"
            fill="#D5D3CB"
            stroke="#9A9890"
            strokeWidth="1.2"
          />

          {/* 把手 */}
          <path
            d="M85,58 Q95,42 110,38 Q120,35 125,42"
            fill="none"
            stroke="#6B6A68"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* 前叉 */}
          <path
            d="M75,95 Q80,128 85,148 Q90,158 100,160"
            fill="none"
            stroke="#6B6A68"
            strokeWidth="2.5"
          />

          {/* 後架 */}
          <path
            d="M330,100 Q345,95 365,88 Q375,92 380,105 Q375,115 360,120"
            fill="#C8C6BE"
            stroke="#9A9890"
            strokeWidth="1.2"
          />

          {/* 後搖臂 */}
          <path
            d="M290,125 Q330,128 360,148 Q368,155 365,162"
            fill="none"
            stroke="#6B6A68"
            strokeWidth="2.5"
          />

          {/* 油箱 */}
          <path
            d="M170,48 Q200,38 240,40 Q260,42 265,55 Q240,58 200,56 Q180,54 170,48 Z"
            fill="#BDBAB0"
            stroke="#9A9890"
            strokeWidth="1"
          />

          {/* 坐墊 */}
          <path
            d="M220,50 Q260,42 310,55 Q315,62 305,68 Q265,60 220,58 Z"
            fill="#A8A59C"
            stroke="#8A8880"
            strokeWidth="1"
          />

          {/* 排氣管 */}
          <path
            d="M310,128 Q330,130 355,135 Q370,138 385,145 Q395,150 395,158"
            fill="none"
            stroke="#8A8880"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M385,148 Q400,152 408,162 Q412,170 408,175"
            fill="none"
            stroke="#8A8880"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* 前輪 */}
          <circle cx={96} cy={160} r={28} fill="#3A3A38" stroke="#1A1A18" strokeWidth="1.5" />
          <circle cx={96} cy={160} r={20} fill="#5A5955" />
          <circle cx={96} cy={160} r={6}  fill="#2C2C2A" />

          {/* 後輪 */}
          <circle cx={350} cy={162} r={30} fill="#3A3A38" stroke="#1A1A18" strokeWidth="1.5" />
          <circle cx={350} cy={162} r={21} fill="#5A5955" />
          <circle cx={350} cy={162} r={7}  fill="#2C2C2A" />

          {/* 引擎/機殼 */}
          <path
            d="M170,105 Q175,120 190,128 Q220,132 260,130 Q280,128 290,118 Q295,108 285,100 Q260,95 220,95 Q185,95 170,105 Z"
            fill="#C0BDB4"
            stroke="#9A9890"
            strokeWidth="1"
          />

          {/* ── 可點擊 dot 點位 ── */}
          {DEFAULT_DOTS.map((dot) => {
            const cx = dot.x * SVG_W;
            const cy = dot.y * SVG_H;
            const state = getDotState(dot.label);

            return (
              <g
                key={dot.label}
                onClick={() => handleDotClick(dot)}
                style={{ cursor: disabled ? "default" : "pointer" }}
                role="button"
                aria-label={`${dot.label}：${stateLabel(state)}`}
                tabIndex={disabled ? -1 : 0}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !disabled) {
                    e.preventDefault();
                    handleDotClick(dot);
                  }
                }}
              >
                {/* 外圈暈輪 */}
                <circle cx={cx} cy={cy} r={13} fill={dotRing(state)} />
                {/* 主圓點 */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={8}
                  fill={dotFill(state)}
                  stroke="white"
                  strokeWidth="1.5"
                  className="transition-all duration-150"
                />
                {/* 標籤文字（小字，白底避免跟車體色混） */}
                <text
                  x={cx}
                  y={cy + 21}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#2C2C2A"
                  fontFamily="sans-serif"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {dot.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Dot-Log 摘要 */}
      <div className="px-3 py-2 bg-white border border-[#EEECE6] rounded-lg">
        <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">損傷標記摘要</div>
        {markedDots.length === 0 ? (
          <div className="text-[12px] text-[#9A9890] italic">尚未標記任何部位</div>
        ) : (
          <ul className="space-y-1">
            {markedDots.map((d) => (
              <li key={d.label} className="flex items-center gap-2 text-[12px]">
                {/* 小色點 */}
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: dotFill(d.state) }}
                />
                <span className="font-medium text-[#2C2C2A]">{d.label}</span>
                <span
                  className={`ml-auto px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                    d.state === "ok"
                      ? "bg-[#EAF3DE] text-[#3B6D11]"
                      : d.state === "warn"
                        ? "bg-[#FDF3E3] text-[#854F0B]"
                        : "bg-[#FDECEA] text-[#CC0000]"
                  }`}
                >
                  {stateLabel(d.state)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 操作說明 */}
      {!disabled && (
        <div className="flex items-center gap-4 flex-wrap text-[11px] text-[#9A9890]">
          <span>點擊圓點切換狀態：</span>
          {(["ok", "warn", "bad"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: dotFill(s) }}
              />
              {stateLabel(s)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#9A9890]" />
            再點一次清除
          </span>
        </div>
      )}
    </div>
  );
}
