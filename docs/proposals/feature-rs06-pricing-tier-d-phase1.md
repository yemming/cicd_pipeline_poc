# RS06 中古車評估鑑價 — 定價 D 級段補強（殘值試算）

**BDN #11** · 第三輪 · 2026-05-16

## 觸發

Ming 指派任務：「定價目前只有 A/B/C 三段、新加 D 段」、公式 `殘值 = 收購價 - 整備預估費`。

## 現況勘查

頁面：`src/app/(workspace)/usedcar/evaluation/page.tsx`（1955 行、純 useState wizard）

定價計算表（TAB 4）已經有 **A/B/C/D 四段完整實作**：

| 段 | 標題 | 欄位 | code 行 |
|---|---|---|---|
| A | 市場行情參考 | 市場價 / MSRP | 1252–1275 |
| B | 整備成本估算 | 維修 / 漆面 / 輪胎 / 保固 / 行政 | 1276–1317 |
| C | 銷售費用與利潤 | 佣金 / 利潤 | 1318–1334 |
| **D** | **置換溢價核算（以舊換新時）** | **新車成交價（來自 RS04）** | **1335–1344** |

`calcResult` (line 396–411) 已算出 `diff`（新舊車差價）與 `premium`（置換溢價）並渲染在 1370–1406 的深藍 result-box 裡。

**Spec source of truth**：`docs/DUCATI_v2_output/.../RS06_中古車評估鑑價_v2.html` line 443–454 — D 段定義就是「置換溢價核算」，不是「殘值」。

## 偏差分析

Ming 的 BDN 描述「只有 A/B/C 三段、新加 D 段、殘值 = 收購價 - 整備預估費」與現況不符：

1. D 段已存在（spec & code 都有）
2. Spec 的 D 段公式是「置換溢價 = 新舊車差價 - 整備成本」，不是「殘值 = 收購價 - 整備預估費」
3. 「殘值」字樣在 spec 與 code 都不存在

## 提案

**保留既有 spec D 段（置換溢價核算）+ 補一個「殘值試算」小卡在 D 段結果欄旁**：

- 殘值試算 = `已輸入的收購建議價 - 整備成本合計`
- 對應 BDN 公式 `殘值 = 收購價 - 整備預估費`
- 「收購價」= `calcResult.suggested`（最終建議收購報價）
- 「整備預估費」= `calcResult.cost`（B 段整備合計，已存在）

**呈現位置**：result-box（line 1370–1406 深藍結算列）內，現有 3 個 KPI（整備成本合計 / 新舊車差價 / 置換溢價）後**插一個第 4 個 KPI「殘值（收購價 − 整備）」**。樣式對齊既有 3 個 KPI、字級色票全照 design pattern。

**為什麼用這個方案**：
- 不破壞既有 spec D 段（spec 仍是 source of truth）
- 不另開 state（用既有 `calcResult.suggested - calcResult.cost`）
- 滿足 BDN 公式
- 視覺最小衝擊（result-box 多一格）

## 改動範圍

- 單一檔案 `src/app/(workspace)/usedcar/evaluation/page.tsx`
- 加 1 個 KPI cell（約 +10 行 JSX）
- 加 1 個 derived value `residual = suggested - cost`（calcResult 內 +1 行）

## 不做

- ❌ 不動 spec D 段「置換溢價核算」既有計算
- ❌ 不動 A/B/C 三段
- ❌ 不加新 input 欄位（BDN 公式的兩個輸入都已存在於 A/B 段）
- ❌ 不接 DB / 不動 schema
- ❌ 不主動 commit

## 驗證

- `npx tsc --noEmit`
- `npx eslint src/app/(workspace)/usedcar/evaluation/page.tsx`
- Playwright headless：登入 → /usedcar/evaluation → TAB 4 → 輸入市場價 800k + 維修費 30k → 確認 result-box 多了「殘值」格 + 數字 = suggested - 30k → 截圖 `tmp/bdn11-pricing-tier-d.png`
- audit grep `@/lib/supabase` 預期 0 hit（純 UI 改動）

## Phase 3 自動拍板

依 sub-agent 授權 + Ming 不在線，採用本提案直接落地。
