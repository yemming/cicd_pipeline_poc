"use client";

/**
 * D3FunnelChart — 可重用水平漏斗圖（hybrid：D3 算寬度 scale，React 渲染版面）
 *
 * 第十八輪 GRP18 集團客戶動態 · 客戶生命週期漏斗共用（潛在→接觸→到店→成交→回購）。
 *
 * 設計取捨（沿用本專案 d3-* 元件的 hybrid 風格）：
 *   - 用 d3-scale 的 scaleLinear 把 count 線性映射成 bar 寬度（30%~100%），版面（label/bar/
 *     stats/箭頭）一律用 React JSX 渲染、不做 d3 imperative DOM 操作 → StrictMode 安全、
 *     不跟 React 搶 DOM。
 *   - 動畫：bar 寬用 CSS transition 從 0 漸入到目標寬（client-only useEffect 觸發），避免在
 *     React 渲染的節點上跑 d3.transition() 互搶。
 *   - SSR 安全：寬度動畫只在 mount 後（useEffect）展開，server markup 出 0 寬、無 hydration
 *     mismatch；數字用手寫千分位 helper 格式化（不用會因 locale 漂移的 toLocaleString）。
 *
 * 視覺（照 GRP18 設計稿）：每階段一列 — 左階段名 label、中彩色 bar（內白字 count + 對上一
 *   階段轉換率 badge）、右 stats（count 大字 + 轉換率小字）；階段之間置中灰向下箭頭 ↓。
 *
 * 紀律：純前端 presentational component，不 import supabase、不過網路。
 */

import { useEffect, useId, useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";

export type FunnelStage = {
  /** 階段名稱（左側 label） */
  label: string;
  /** 該階段人數 / 件數 */
  count: number;
  /** bar 顏色（不給時用內建深藍→綠色盤輪替） */
  color?: string;
};

export type D3FunnelChartProps = {
  /** 漏斗各階段（由上到下） */
  stages: FunnelStage[];
  /** 顯示階段間轉換率 badge（預設 true；第一階段無 badge） */
  showConversion?: boolean;
  /** 外層 className */
  className?: string;
  /** 每列 bar 高度 px，預設 44（照設計稿 .funnel-bar height:44） */
  height?: number;
};

// 預設深藍→綠漸層色盤（照設計稿 GRP18 漏斗配色），不夠時循環
const DEFAULT_PALETTE = ["#1A3A5C", "#2A5A8C", "#3A7AB2", "#0F6E56", "#3DBE6E"];

// 本專案色票
const TEXT_SUB = "#5A5A5A";
const BORDER = "#E0DDD6";
const NAVY = "#1A3A5C";

// bar 寬映射範圍（照設計稿 minW=30、maxW=100，單位 %）
const MIN_WIDTH_PCT = 30;
const MAX_WIDTH_PCT = 100;

/** 手寫千分位格式化（確定性、不依賴 locale，避免 SSR hydration 漂移）。 */
function formatCount(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function D3FunnelChart({
  stages,
  showConversion = true,
  className,
  height = 44,
}: D3FunnelChartProps) {
  const uid = useId().replace(/[:]/g, "");
  // 已展開到目標寬的「那一組 stages」識別碼；server / 首 paint 是 null → bar 出 0 寬
  // （SSR markup 0 寬，無 hydration mismatch），下一個 frame 才指向當前 stages → CSS
  // transition 把寬度從 0 漸入到目標。stages 換新 reference 時識別碼對不上 → 重播漸入。
  const [expandedFor, setExpandedFor] = useState<FunnelStage[] | null>(null);

  useEffect(() => {
    // 先 paint 0 寬，再於下一個 frame 指向當前 stages，確保 transition 生效（不在 effect
    // body 同步 setState，避免 cascading render）
    const id = requestAnimationFrame(() => setExpandedFor(stages));
    return () => cancelAnimationFrame(id);
  }, [stages]);

  const mounted = expandedFor === stages;

  // 以「第一階段 count 為 max」線性映射 30%~100%（照設計稿，不是對 viewport 等比）
  const rows = useMemo(() => {
    if (stages.length === 0) return [];
    const maxCount = stages[0].count;
    // maxCount<=0 時退化成全部滿格，避免除以 0 / 負寬
    const widthScale =
      maxCount > 0
        ? scaleLinear().domain([0, maxCount]).range([MIN_WIDTH_PCT, MAX_WIDTH_PCT]).clamp(true)
        : () => MAX_WIDTH_PCT;

    return stages.map((s, i) => {
      const prev = i > 0 ? stages[i - 1] : null;
      // 轉換率 = 本階段 / 前一階段（第一階段視為 100%、無 badge）
      const convRatio = prev != null && prev.count !== 0 ? s.count / prev.count : null;
      return {
        label: s.label,
        count: s.count,
        color: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
        widthPct: widthScale(s.count),
        // 顯示用轉換率字串（第一階段顯示 100%）
        convText: i === 0 ? "100%" : convRatio != null ? `${Math.round(convRatio * 100)}%` : "—",
        // badge 只在第二階段起出現
        convBadge: i > 0 && convRatio != null ? `${Math.round(convRatio * 100)}%` : null,
      };
    });
  }, [stages]);

  if (rows.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-[12px] text-[#9A9890] bg-[#F8F7F4] border border-dashed rounded-lg ${className ?? ""}`}
        style={{ height: 120, borderColor: BORDER }}
      >
        尚無漏斗資料
      </div>
    );
  }

  return (
    <div className={`w-full ${className ?? ""}`} role="img" aria-label="客戶生命週期漏斗圖">
      {rows.map((r, i) => (
        <div key={`funnel-${uid}-${i}`}>
          {/* 一列：label | bar | stats */}
          <div className="flex items-center gap-3">
            {/* 左：階段名 label（width 80、右對齊，照設計稿 .funnel-label） */}
            <div
              className="shrink-0 text-right text-[12px] font-medium text-[#2C2C2A]"
              style={{ width: 80 }}
            >
              {r.label}
            </div>

            {/* 中：bar 容器（佔滿剩餘寬，內部 bar 依 widthPct 撐開） */}
            <div className="min-w-0 flex-1">
              <div
                className="flex items-center justify-between overflow-hidden rounded-md px-3"
                style={{
                  width: mounted ? `${r.widthPct}%` : "0%",
                  height,
                  background: r.color,
                  transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {/* bar 內 count 白字粗體 */}
                <span className="whitespace-nowrap text-[13px] font-bold text-white">
                  {formatCount(r.count)}
                </span>
                {/* conv badge：navy 小角標（第二階段起） */}
                {showConversion && r.convBadge != null ? (
                  <span
                    className="ml-2 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ background: NAVY }}
                  >
                    {r.convBadge}
                  </span>
                ) : null}
              </div>
            </div>

            {/* 右：stats（count 大字 + 轉換率小字） */}
            <div className="shrink-0 text-right" style={{ width: 88 }}>
              <div className="text-[15px] font-semibold leading-tight text-[#2C2C2A]">
                {formatCount(r.count)}
              </div>
              {showConversion ? (
                <div className="text-[11px]" style={{ color: TEXT_SUB }}>
                  {r.convText}
                </div>
              ) : null}
            </div>
          </div>

          {/* 階段間向下箭頭（最後一列不加） */}
          {i < rows.length - 1 ? (
            <div
              className="flex items-center justify-center py-0.5 text-[14px] leading-none"
              style={{ color: "#9A9890" }}
              aria-hidden
            >
              ↓
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
