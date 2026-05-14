# 提案：RS_M1 銷售漏斗看板（主管工作台）

> 來源：Stitch nav_node `3b732995-c5a8-46d7-8e2b-730d7c7a8933`（indian brand · 主管工作台 / 銷售漏斗）
> Storage 路徑：`nav-html/indian/3b732995-c5a8-46d7-8e2b-730d7c7a8933.body.html`
> 日期：2026-05-14
> 階段：架構提案（自動拍板版本 — Ming 已預先授權跑完整流程）
> 批次：銷售模組導覽 - 20260514 第 3/14 張

## 1. 結構摘要

主管工作台底下的「銷售漏斗看板（RS_M1）」— 用三層 KPI（Layer 1 結果 / Layer 2 過程 / Layer 3 原始數據）+ PULS 點擊診斷 + RS 個人比較表 + 客群畫像，給主管做日常績效檢視 & 對 RS 做質性追蹤。Phase 1 純 mock 資料 client-side 渲染，未來 Phase 2 接 `sales_funnel_metrics` view + RS 名單 + KPI 目標設定。

**跟既有 `/sales/funnel` 的差別**：既有偏 RS 日常 dashboard（reception/manager/personal 三 tab）；本頁是高階主管 PULS 診斷工作區（強調 KPI 目標達成、視角切換、跨 RS 比較）。**兩頁並存、不互相替代**。

## 2. Schema 草案

### 新表
無 — Phase 1 全 mock 資料寫在 `*.constants.ts` 裡，跟兄弟頁 sales-overview / cs-overview 一致策略。

### 現有表變更
無。

### 欄位分類
N/A — 純前端 mock dashboard，無 DB write。

## 3. Domain Helper 規劃

檔案：`src/domain/sales-manager-funnel.ts` + `src/domain/sales-manager-funnel.constants.ts`

```ts
// constants（非 "use server"，可 export const）
export const RS_DATA: Record<string, RsMetrics> = { ... };
export const KPI_TARGETS = { build: 90, trial: 60, quote: 70, order: 60 };
export const PERIOD_OPTIONS = ["month", "quarter", "year"] as const;
export type RsMetrics = { ... };
export type SalesManagerFunnelData = { ... };

// helper（"use server" / async）
export async function getSalesManagerFunnelData(): Promise<SalesManagerFunnelData>;
```

實作策略：Day 1 直接 return constants 組合好的物件（無 supabase round-trip），維持 server component 撈資料慣例 + 為 Phase 2 接真實 query 留接口。

## 4. 副作用清單

無 — 純展示頁，無 mutation、無通知、無 audit log。

## 5. 會計事件分析

無 — 本功能屬於純資料查詢 / 主管儀表板、不產生資金流，不需要 transaction_type。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 銷售漏斗看板 | `/sales/manager/funnel` | Dashboard | `(workspace)/sales/overview/_components/sales-overview-board.tsx` |

不適用標準 List View / Page View pattern — dashboard 頁。色票 / 字級沿用 design pattern token（已在 sales-overview-board 校準過）。

**主要元件**：
- `_components/sales-manager-funnel-board.tsx` — 主 client component
- `_components/gauge-meter.tsx` — Layer 2 SVG 儀表板（半圓 + 指針）
- `_components/funnel-bars.tsx` — 漏斗 6 階橫條
- `_components/rs-compare-table.tsx` — RS 比較表
- `_components/customer-profile-grid.tsx` — 客群畫像四色卡

簡化策略：HTML 裡 PULS / 趨勢 / 接口品質 / HABC / 客群畫像都很豐富，但為了避免初版過度工程，**Phase 1 先做核心**：
- 視角 / RS / 期間 toolbar
- Layer 1 / 2 / 3 三層 KPI
- 漏斗視覺
- RS 比較表
- 客群畫像

**Phase 2 再補**（用 TODO comment 標）：PULS 多步診斷、趨勢圖、接口品質、個人視角對標、KPI 點擊展開診斷。

## 7. nav_nodes（雙 brand UPDATE，不是 INSERT）

從 nav_nodes 查詢確認：
- `3b732995-c5a8-46d7-8e2b-730d7c7a8933` (indian, static_html, parent=主管工作台)
- ducati brand 沒有對應「銷售漏斗 / 主管工作台」節點 — 只有舊版 `/sales/funnel` 在 sales 群組底下

**處理策略**：
1. UPDATE indian 這筆切到 react_route + href = `/sales/manager/funnel`
2. 用 INSERT 為 ducati 補同名節點（找對應的「主管工作台」parent；若沒有就先掛在 sales 父群組底下，sort_order 排到「銷售漏斗」既有節點之後）

完整 SQL 落地時再決定。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/sales-manager-funnel.ts` |
| 新增 | `src/domain/sales-manager-funnel.constants.ts` |
| 新增 | `src/app/(workspace)/sales/manager/funnel/page.tsx` |
| 新增 | `src/app/(workspace)/sales/manager/funnel/_components/sales-manager-funnel-board.tsx` |
| 新增 | `docs/proposals/feature-sales-manager-funnel.md`（本提案） |
| 變更 | nav_nodes UPDATE id=3b732995 + INSERT ducati 對應節點 |

## 9. Verification

1. tsc 0 errors / eslint 0 errors
2. `grep -rn "@/lib/supabase" src/app/\(workspace\)/sales/manager/` → 0 hit
3. Playwright headless：登入 indian → /sales/manager/funnel → 截圖 → 確認 [主管視角/個人視角 toggle、本月/本季/本年 toggle、Layer 1 KPI、漏斗、RS 比較表] 都在 DOM 裡
4. sidebar 入口確認：indian 主管工作台底下「銷售漏斗」chip 顯示 REACT、點擊 → /sales/manager/funnel
5. 視角切換 / RS 下拉 / 期間切換 → 數字隨之變化

## 10. 自動拍板的決策（替 Ming 拍板）

| # | 問題 | 預設選項 | 理由 |
|---|---|---|---|
| 1 | route 命名 | `/sales/manager/funnel` | 避免跟既有 `/sales/funnel` 衝突；明確標示是主管工作台用 |
| 2 | mock 資料策略 | 全部寫在 `*.constants.ts` | 跟兄弟頁 sales-overview / cs-overview 一致；Phase 2 才接真實 query |
| 3 | Phase 1 範圍 | 視角切換 + 三層 KPI + 漏斗 + RS 比較表 + 客群畫像；PULS / 趨勢 / 接口品質改 placeholder | 控制初版大小、先把骨幹做穩；其他放 TODO 等用戶 review 後再補 |
| 4 | KPI 儀表板（Layer 2） | 用簡化版橫條進度條 + 達標 chip，**不重造 SVG 指針儀表** | SVG 儀表 ~80 行 code 才得到一個 KPI，CP 值低；用 design pattern 既有 token 的進度條視覺一致性更高 |
| 5 | 個人視角 | 顯示「Phase 2 規劃中」placeholder + 切回主管視角 | HTML 個人視角內容跟主管視角 90% overlap，第一版只做主管視角主幹 |
| 6 | ducati brand 處理 | 也補一個 react_route 節點（找對應 parent；若沒主管工作台就先掛 sales 群組） | 雙 brand 必須補（CLAUDE.md 規定）|
| 7 | KPI 點擊展開 PULS | **不做**（純 placeholder：點擊 toast「PULS 診斷 — Phase 2 規劃中」）| PULS 是整段獨立工作流（4 步驟診斷），單獨開規格才適合 |
```

Stage 2 完成 — 提案存在 `docs/proposals/feature-sales-manager-funnel.md`。
