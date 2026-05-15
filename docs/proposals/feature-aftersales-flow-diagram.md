# 提案：售後工單模組 — 流程關係圖 landing page

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/00_售後工單模組_流程關係圖.html`（nav_node `9c4db4e6-…` indian + `19bcc529-…` ducati）
> 日期：2026-05-15
> 階段：架構提案（**自動拍板採最佳預設選項**，跳過 AskUserQuestion）
> Phase 1 來源：`feature-aftersales-flow-diagram-phase1.md`

---

## 1. 結構摘要

售後修護模組的**進度 dashboard / 流程關係圖** landing page — 用 6 個橫向 Phase + 3 個側功能群把 14 支業務頁面排成 pipeline，附 4 張頂部 KPI scorecard。不是業務 CRUD 頁，沒有寫入動作、不引入新 entity。

從 phase1.md 的 A/B/C 三方案中**自動拍板採方案 B 的精簡版**：

- 6-Phase + 3 側功能 **結構** hardcode 在 page.tsx（節點清單 / Phase 分群 / 排序圖示／顏色 token）
- KPI **動態化**：「已完成 / 待開發」從 `nav_nodes` 算；「剩餘 Sessions」「庫存串接點」hardcode（PM 估算值）
- 節點**點擊跳轉**：有 href 就 `<Link>`、沒 href 就 disabled（沿用 phase1 推薦）

## 2. Schema 草案

**不新增表、不改 schema**。完全 reuse 既有 `nav_nodes`。

phase1.md §3 已論證：

- 「核心關鍵 🔴 / 跨頁共用 🟣 / 支線流程 🟡」 → 視覺 tag hardcode 在 page.tsx（污染 schema 不划算）
- 「Phase 分群」 → hardcode（nav_nodes 的 parent_id 分群跟 flow diagram 的 Phase 分群不一致，這頁是業務流程視角、不是 sidebar 視角）

## 3. Domain Helper 規劃

檔案：`src/domain/navigation.ts`（**append**，不新建模組）

```ts
export type AftersalesModuleProgress = {
  completed_count: number;       // nav_nodes 中 page_kind='react_route' 的售後子節點數
  pending_count: number;          // page_kind='static_html' 的子節點數
  inventory_link_count: number;  // hardcode = 4（採購收料 / 領料 / 退料 / 結帳關單）
  planned_sessions: string;      // hardcode = "2~3"（PM 估算）
  node_status: Record<string, "react_route" | "static_html" | "placeholder" | "iframe" | "missing">;
    // key 是 href（如 "/parts/aftersales/repair-orders/new"）；page.tsx 用這個 map 給每個節點上正確狀態 chip
};

export async function getAftersalesModuleProgress(): Promise<AftersalesModuleProgress>
```

**內部實作**：service client 撈當前 brand 底下所有 level=3 + level=2 parent 在售後修護群組（grandparent name = '售後修護'）的節點，按 page_kind 計數，順便回傳 `href → page_kind` 的 map。

## 4. 副作用清單

無。本頁是 read-only landing page、沒有寫入動作。

## 5. 會計事件分析

**無 — 本功能屬於純資料展示 / 純查詢、不產生資金流**。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 售後修護 模組導覽 | `/parts/aftersales` | Landing / Dashboard | **不用 List/Page View 範本**（dashboard 性質、phase1.md §0 明確說明） |

頁面實作：server component、5 區結構：

```
1. Page Header        — 「DUCATI 售後工單模組 · 功能流程關係圖」title + 版本 + 「← 模組總覽」回 /parts
2. Legend             — 5 種狀態圖例（✅ 已完成 / 🔵 待開發 / 🔴 核心關鍵 / 🟣 跨頁共用 / 🟡 支線流程）
3. Stats              — 4 張 KPI scorecard（3 動態 + 1 hardcode）
4. Phases             — 6 個橫向 Phase（卡片裡橫向排節點 + 箭頭）
5. Side groups        — 3 個側功能群（增項閉環 / 人車檔案 / 系統設定）3-col grid
```

沿用 design pattern 的 token（深藍主色 #1A3A5C、邊框灰 #EEECE6、字級 H1=16、副標 12）。

## 7. nav_nodes（雙 brand UPDATE，不 INSERT）

phase1 來源是兩支既有 `static_html` nav_node，落地是**改造**不是新增：

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/parts/aftersales'
 WHERE id IN (
   '9c4db4e6-8512-4e7c-87a2-4354e3382c19',  -- indian
   '19bcc529-219a-401e-a3bb-b37890698be7'   -- ducati
 );
-- html_storage_path 保留當歷史檔，不刪
```

退路：失敗回滾 `SET page_kind='static_html', href=NULL`。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 修改 | `src/domain/navigation.ts`（append `getAftersalesModuleProgress`） |
| 新增 | `src/app/(workspace)/parts/aftersales/page.tsx` |
| 新增 | `docs/proposals/feature-aftersales-flow-diagram.md`（本檔） |
| UPDATE DB | `nav_nodes`（雙 brand 兩列） |

## 9. Verification

1. `npx tsc --noEmit` 0 errors
2. `npx eslint src/app/\(workspace\)/parts/aftersales src/domain/navigation.ts` 0 errors
3. `grep -rn "@/lib/supabase" "src/app/(workspace)/parts/aftersales"` = 0 hit
4. dev server `http://localhost:3000/parts/aftersales` HTTP 200、title 對、看到 6 Phase + 3 側功能、KPI 數字渲染
5. Playwright CLI 跑 happy-path：navigate → 看到「DUCATI 售後工單模組」標題 → 6 個 Phase block 存在 → 截圖

## 10. 開放問題（自動拍板）

題目要求「不問問題、採最佳預設」。所有決策已在 §1-9 拍板，過程的關鍵決策列在這裡備忘：

- ✅ 方案 B 半動態 server component（phase1 推薦）
- ✅ 路由 `/parts/aftersales`（模組 root、phase1 推薦）
- ✅ 雙 brand 都做（題目強調 indian 是 Ming 主測 brand、ducati 已有原 HTML 來源、雙都升級對稱）
- ✅ 結構 hardcode + KPI 動態（混 A+B、phase1 §3.A 與 §3.B 折中）
- ✅ 不合併 `00_售後工單模組_導覽總覽.html`（屬另一個 sibling phase1，未來單獨升級）
- ✅ 「剩餘 Sessions」「庫存串接點」hardcode（phase1 §1.kpis 結論）
- ✅ 不污染 nav_nodes schema（不加 `metadata.flow_diagram_tag`）
