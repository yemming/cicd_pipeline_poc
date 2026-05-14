# 提案：中古車庫存看板（RS03B）

> 來源：Stitch HTML（`nav-html/indian/29a15d1b-a348-4508-8c39-c5446d968389.body.html`）
> nav_node：`29a15d1b-a348-4508-8c39-c5446d968389`（indian only，parent=「展廳」`743bdde8…`，sort_order=1）
> 日期：2026-05-14
> 階段：架構提案（spec-to-feature 批次 8/14，auto-approve）

## 1. 結構摘要

中古車庫存看板。展廳銷售在賞車流程中需要一張板把所有中古車一目了然 — 等級（CPO / 優良 / 良好 / 普通）、狀態（在庫可售 / 整備中 / 已保留）、收購成本、售價、毛利率、在庫天數。卡片與列表雙視圖，操作 CTA：評估（→ RS06 鑑價）、報價（→ RS04 賞車報價）。

跟兄弟頁 `/sales/showroom/new-cars`（RS03A）對稱：同樣 KPI row + filter bar + 雙視圖、共用 design token。差異在維度（中古多了 `等級 / 里程 / 成本 / 毛利`、少了 `車系`），以及 demo 資料層。

## 2. Schema 草案

**Day 1 不動 DB**。沿用 newcar 範式：純靜態 demo 常數，未來轉 DB（`used_car_inventory_units`）替換 helper 內部即可，UI 不動。

未來 schema 草稿（先備、本次不落地）：

```sql
CREATE TABLE used_car_inventory_units (
  id             text PRIMARY KEY,        -- 'U001'…
  brand_id       text NOT NULL,
  vin            text,
  model          text NOT NULL,
  year           int  NOT NULL,
  color          text,
  km             int  NOT NULL,
  grade          text CHECK (grade IN ('S','A','B','C','D')),
  cost           numeric(12,0) NOT NULL,
  price          numeric(12,0) NOT NULL,
  status         text CHECK (status IN ('在庫可售','整備中','已保留','已售出')),
  days_in_stock  int,
  note           text,
  metadata       jsonb DEFAULT '{}'::jsonb,  -- 收購來源、保固、配件清單等變動欄位
  created_at     timestamptz DEFAULT now()
);
```

## 3. Domain Helper 規劃

檔案：`src/domain/sales-usedcar-inventory.ts` + `.constants.ts`（拆檔避雷 — server-only helper 不准 export 非 async 常數）。

```ts
// sales-usedcar-inventory.ts
import "server-only";
export async function getUsedCarInventory() {
  return { units, kpis, gradeOptions, statusOptions, kmRangeOptions };
}
export type UsedCarInventoryData = Awaited<ReturnType<typeof getUsedCarInventory>>;
```

內部實作：直接回常數（Day 1）；未來 swap 成 supabase 查詢時 UI 一行不動。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 評估按鈕 | toast「待 RS06 上線」 | ✅ 純前端 |
| 報價按鈕 | toast「待 RS04 上線」 | ✅ 純前端 |
| 切換視圖 | local state | ✅ 純前端 |

無 DB 副作用。

## 5. 會計事件分析

無 — 本功能屬於純資料展示（看板）+ 路由跳轉（→ RS04 / RS06）。中古車庫存的成本入帳、毛利結算在後續 RS06 鑑價、RS04 成交、交車流程才產生會計事件。本頁不產生資金流。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 中古車庫存看板 | `/sales/showroom/used-cars` | Board（KPI + filter + dual view） | `sales/showroom/new-cars/_components/newcar-inventory-board.tsx` |

## 7. nav_nodes 變更

本任務是「nav_node static_html → react_route」升級，不是 INSERT 新節點。indian only（展廳 parent 只在 indian brand）：

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/showroom/used-cars'
 WHERE id = '29a15d1b-a348-4508-8c39-c5446d968389';
-- html_storage_path 保留當歷史檔，不刪
```

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/sales-usedcar-inventory.ts` |
| 新增 | `src/domain/sales-usedcar-inventory.constants.ts` |
| 新增 | `src/app/(workspace)/sales/showroom/used-cars/page.tsx` |
| 新增 | `src/app/(workspace)/sales/showroom/used-cars/_components/usedcar-inventory-board.tsx` |
| UPDATE | nav_nodes (29a15d1b…) → react_route |

## 9. Verification

1. tsc / eslint 0 errors
2. Helper audit：`grep -rn "@/lib/supabase" src/app/(workspace)/sales/showroom/used-cars` = 0 hit
3. Playwright headless 開 `/sales/showroom/used-cars` → 截圖確認 KPI row / filter bar / 卡片或列表
4. nav_node UPDATE 後 sidebar 該節點點擊進入 React route，不再 hit `/n/[nodeId]`

## 10. 拍板（auto-approve）

- 路由 `/sales/showroom/used-cars`（兄弟頁 `/new-cars` 對稱）✅
- helper 命名 `sales-usedcar-inventory`（兄弟頁 `sales-newcar-inventory`）✅
- 雙視圖預設「卡片」（HTML 預設）✅
- Day 1 純常數、不動 DB ✅
- brand_id：indian only（parent 群組「展廳」只存在於 indian）✅
- sort_order：1（緊接 new-cars=0）✅
