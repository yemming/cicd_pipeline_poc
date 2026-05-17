# RS_EX1 業績達成率 Progress Bar + 預測線（BDN #21 — Phase 1）

## 背景

RS_EX1 保險招攬工作台「業績總覽」tab 內目前以純文字呈現業績數字（總件數 / 已完成 / 達成率 / 佣金收入 ...）。
缺一個 **視覺化的達成率 bar** + **預測月底達成值（依本月已過天數推估）**，使主管能在 1 秒內判斷本月狀態。

## 範圍

只動 `src/app/(workspace)/sales/insurance/_components/insurance-board.tsx` 一個檔案的「本月業績摘要」`PerfBox`（perf tab）。
不抽公用、不接 chart 套件、不動 BDN #14 lost_reason 邏輯。

## 設計決策

| 主題 | 決策 |
|------|------|
| 目標值來源 | demo 寫死：件數目標 5 件、佣金目標 $20,000（沿用既有 PerfBox 文案中的數字） |
| 預測公式 | `predicted = actual * (daysInMonth / daysPassed)` |
| 預測顯示門檻 | `daysPassed >= 3` 才顯示預測線（避免月初基數太小造成大幅外推） |
| Bar 顏色閾值 | 達成率 ≥80% 綠 `#0F6E56` / 50–80% 黃 `#F0C97E` / <50% 紅 `#C8001A` |
| 結構 | 純 div + width %；外殼 `w-full h-[12px] rounded-full bg-[#EEECE6]` |
| 預測線標記 | 1px 寬垂直線，`bg-[#9A9890]` + dashed border-top（用 `border-dashed` 替代），位置 `left: predictedPercent%`，預估超過 100% 截斷在 100% 並標 `🎯+` |
| 文字標記 | bar 上方：「實際 X / 目標 Y（達成率 Z%）」；bar 下方：「預估月底 W（已過 D / 共 M 天）」 |
| 適用列 | 只在「件數」「佣金收入」這兩列下方加 bar，其餘維持文字 |
| 依賴 | `new Date()` 即時取得（demo 不需注入時鐘） |

## 元件結構

新增 inline 元件 `ProgressBarWithForecast`：

```tsx
function ProgressBarWithForecast({
  actual, target, unit, daysPassed, daysInMonth,
}: { actual: number; target: number; unit: string; daysPassed: number; daysInMonth: number }) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const rawPct = target > 0 ? (actual / target) * 100 : 0;
  const showForecast = daysPassed >= 3;
  const predicted = showForecast ? actual * (daysInMonth / daysPassed) : 0;
  const predictedPct = target > 0 ? Math.min(100, (predicted / target) * 100) : 0;
  const color = rawPct >= 80 ? "#0F6E56" : rawPct >= 50 ? "#F0C97E" : "#C8001A";
  // ... bar + dashed marker + labels
}
```

放在「本月業績摘要」`PerfBox` 內、`PerfRow` 列表之後。

## 不做的事

- 不抽到 `@/components/*`（單頁專用、簡單 div、暫不重用）
- 不接 chart 套件（規格明指純 div 即可）
- 不做 SVG 折線圖
- 不改 BDN #14 lost_reason、不動其他 PerfBox

## 驗證

- tsc / eslint 0 errors
- audit `grep -rn "@/lib/supabase" "src/app/(workspace)" src/components` 不變化
- Playwright headless 截圖 `tmp/bdn21-perf-bar.png`，看到 bar + 顏色 + 預測 marker + 文字

— 自動拍板，落地中。
