# 提案：置換評估（RS06 中古車評估鑑價 v2）— Stitch 3a113f99 落地

> 來源：Stitch URL `http://43.153.159.135:3000/n/3a113f99-657c-404d-bfdf-36c9baea7a6e`
> nav_node：Indian `3a113f99-657c-404d-bfdf-36c9baea7a6e`（static_html，html_storage_path=`indian/3a113f99-...body.html`）
> 日期：2026-05-14
> 階段：架構提案（自決拍板）
> 批次：銷售模組導覽 11/14

## 1. 結構摘要

這是一份**重型工作流頁面**：5 個 tab 切換的中古車置換評估鑑價單，包含：
1. 基本資料 & 證件掃描（12 個欄位 + 8 張證件相機掃描 + 6 個過戶查詢項）
2. 外觀漆面評估（SVG 損傷標記 + 漆膜測厚 12 區 + 燈具玻璃 checklist）
3. 車身骨架結構（4 大類 18 項 checklist + 進度條）
4. 機械底盤系統（5 大類 28 項 checklist + 前後輪胎花紋深度 + 進度條）
5. 收購定價核算（A 市場 / B 整備 / C 利潤 / D 置換溢價計算表 + 評估結論）

**特性**：典型 ducati Stitch SPA — 整頁 `inline <script>` 自我封裝、`onclick` handler 一堆、`document.getElementById` 直接操作 DOM。**非** List View / Page View design pattern 範疇，是「複雜 form workflow」類型。

## 2. 路由與架構決策

### 現況盤點

| brand | nav_node id | page_kind | href | 渲染來源 |
|---|---|---|---|---|
| ducati | `f69eaced-9a8e-40e6-97a0-abb73dc765c7` | react_route | `/usedcar/evaluation` | StitchInline + `e8c1015b...` |
| indian | `84703d95-cae2-2b3a-f66a-c952de820614` | react_route | `/usedcar/evaluation` | StitchInline + `e8c1015b...` |
| indian | `3a113f99-657c-404d-bfdf-36c9baea7a6e` | **static_html** | NULL | iframe 載 `indian/3a113f99-...body.html` |

Indian 有兩個節點指向同個業務概念，現況下使用者會看到兩個入口、一個 v1 一個 v2，混亂。

### 決策（自決拍板）

採方案 **B：v2 取代 v1，雙 brand 收斂到單一 React route**。

1. 把 v2 HTML（這次下載到的 3a113f99）複製進 `public/stitch/3a113f99-657c-404d-bfdf-36c9baea7a6e.body.html`
2. 修 `src/app/(workspace)/usedcar/evaluation/page.tsx` 改載 `3a113f99-657c-404d-bfdf-36c9baea7a6e`
3. UPDATE Indian static_html 節點 `3a113f99...` → `page_kind='react_route'`、`href='/usedcar/evaluation'`、`html_storage_path` 留歷史檔
4. 結果：sidebar 兩個 Indian 節點都導到同一個 React 頁、Ducati 也一起升級到 v2

**為什麼不全 React 化**：5 tab 重型工作流 SPA、含 SVG 標記座標 / 漆面測厚 12 區 / checklist 18+28 項 / 計價表 10+ 欄、所有狀態 client-side、`estimation_orders` schema 還沒設計。完整 React 化規模 = 一週 design pattern + 至少 3-4 張 supabase table。本批次目標是「14 張導覽性置入」、不適合在這張單把規模放大。先讓設計稿可預覽、入口正確，下次衝刺再做正式 design pattern 化。

### 為什麼不刪 Ducati 既有 v1

Ducati 的 `e8c1015b...` 是另一份歷史 Stitch HTML 還可能有人在 review，**保留 `public/stitch/e8c1015b...body.html` 不刪**。只是 `page.tsx` 改載 v2、Ducati 也升級到 v2。如果之後要併軌、回頭刪舊 v1 檔再做。

## 3. Domain Helper 規劃

**無**。本次落地是純 Stitch HTML 渲染、無 DB 讀寫、不接 supabase。完全跳過 helper 層。

未來做完整 React 化時才會建：
- `src/domain/usedcar-evaluation.ts` — `listEvaluations`/`getEvaluationById`/`createEvaluation`/`updateEvaluationLines` 等

## 4. 副作用清單

無（本次無 DB / 無業務 action）。

## 5. 會計事件分析（MANDATORY）

**本功能無會計事件** — Stitch 預覽頁、不寫入任何業務資料。

未來完整 React 化、`estimation_orders` 成立 + 業務動作「成交收購車輛」時才會產生：
- 新 transaction_type `USEDCAR_PURCHASE`（收購中古車）— 借「中古車存貨」/ 貸「應付帳款—個人賣方」

本批次不在 scope。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 置換評估 | `/usedcar/evaluation` | StitchInline 渲染 | 沿用 `<StitchInline>` |

## 7. nav_nodes 動作

```sql
-- 7a) Indian static_html → react_route，併到單一頁
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/usedcar/evaluation'
 WHERE id = '3a113f99-657c-404d-bfdf-36c9baea7a6e';
-- html_storage_path 保留當歷史檔
```

雙 brand 既有 react_route 節點（ducati `f69eaced...` / indian `84703d95...`）不動 — 他們已經指向 `/usedcar/evaluation`、頁面本身升級 v2 後自動跟著升級。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `public/stitch/3a113f99-657c-404d-bfdf-36c9baea7a6e.body.html`（v2 HTML） |
| 修改 | `src/app/(workspace)/usedcar/evaluation/page.tsx`（screenId 改 3a113f99） |
| DB UPDATE | `nav_nodes` 1 row（Indian static_html → react_route） |

## 9. Verification

1. tsc / eslint 0 errors
2. Indian sidebar 看到「置換評估」chip 從 HTML 變 REACT
3. Ducati / Indian 點「置換評估」都進到 `/usedcar/evaluation`、看到 v2 頁面（5 tabs / 損傷標記 / 漆面測厚 / 收購定價）
4. 切 5 個 tab 都能正常顯示、`window.onload` 跑起來把 paintZones / glassItems / frameCats / mechCats 建出來
5. 計價表 oninput 即時計算

## 10. 開放問題

無 — 全部用最預設最佳建議自決：
- 路徑：沿用 `/usedcar/evaluation`
- v2 取代 v1：是
- 雙 brand 收斂：是
- 全 React 化：否（規模太大、不在 14 張批次 scope）
- 留 Ducati 既有 v1 HTML 檔：是（保留歷史檔不刪）
