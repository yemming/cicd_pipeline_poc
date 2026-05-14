# 提案：銷售模組 / RS03A 新車庫存看板

> 來源：nav_node `f64c6a24-e3ee-444c-8103-1058e7d77dbf` (`indian/<id>.body.html`)
> 日期：2026-05-14
> 階段：架構提案（已自決拍板，本批次授權）

## 1. 結構摘要

業務員 / 主管端的新車庫存看板：KPI（現車可售 / 已保留 / 訂車中 / 本月已售）+ 篩選列（車系、狀態、顏色、文字搜尋）+ 卡片 / 列表雙視圖。每筆庫存顯示車款、年份、VIN 末 5 碼、到廠日、在庫天數、售價、保留備註。CTA：「規格」「報價」（將連到後續 RS04）。

## 2. Schema 草案

**Day 1 採靜態 demo 資料**（同 sales-overview / sales-manager-funnel 模式）。資料封裝於 `*.constants.ts`，未來換 DB 不動 UI。

未來真要動 DB 時的 schema 草案（不在本次落地範圍）：

```sql
CREATE TABLE new_car_inventory_units (
  id uuid PRIMARY KEY,
  brand_id text,
  unit_code text,           -- PV4S-001 之類
  model_id text,            -- 對應 ducati-models / vehicle_models
  series text,              -- Panigale / Streetfighter ...
  model_year int,
  color_label text,
  color_hex text,
  msrp numeric,
  status text,              -- 現車可售 / 已保留 / 訂車中 / 已售出
  vin text,
  arrived_at date,
  in_stock_days int,
  note text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
```

不在本次提案內 — 不 apply migration、不動 DB。

## 3. Domain Helper 規劃

檔案：
- `src/domain/sales-newcar-inventory.constants.ts` — `NEW_CAR_INVENTORY_UNITS`, `NEW_CAR_KPI_SUMMARY`, `NEW_CAR_SERIES_OPTIONS`, `NEW_CAR_STATUS_OPTIONS`, `NEW_CAR_COLOR_OPTIONS` + 型別
- `src/domain/sales-newcar-inventory.ts` — `getNewCarInventory(): Promise<NewCarInventoryData>`

避雷：constants 拆獨立檔，避免 `"use server"` module 跨檔誤 export non-async value（已踩雷三次的反覆失分點）。

## 4. 副作用清單

無 — 純讀取展示頁，無寫入動作。

## 5. 會計事件分析

無 — 本功能屬於純資料維護 / 純查詢、不產生資金流。未來「報價成立 → 訂單 → 交車收款」會在 RS04 / 交車流程內處理。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 新車庫存看板 | `/sales/showroom/new-cars` | Dashboard View（KPI + filter + card/list toggle） | 仿 sales-overview-board 的 server data + client board 結構 |

## 7. nav_nodes（單 brand — Indian only）

該 nav_node 僅 Indian brand 存在（Ducati 沒有對應節點），階段 4 走 UPDATE 模式：

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/showroom/new-cars'
 WHERE id = 'f64c6a24-e3ee-444c-8103-1058e7d77dbf';
```

`html_storage_path` 保留為歷史檔。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/sales-newcar-inventory.constants.ts` |
| 新增 | `src/domain/sales-newcar-inventory.ts` |
| 新增 | `src/app/(workspace)/sales/showroom/new-cars/page.tsx` |
| 新增 | `src/app/(workspace)/sales/showroom/new-cars/_components/newcar-inventory-board.tsx` |
| UPDATE | `nav_nodes` (id=f64c6a24) → react_route + href |

## 9. Verification

1. `npx tsc --noEmit` 0 errors
2. `npx eslint <touched-paths>` 0 errors
3. `grep -rn "@/lib/supabase" <touched UI>` 0 hit
4. Playwright CLI 截圖 / 驗證 KPI、filter、view toggle、卡片數量

## 10. 自動拍板的決策

- ✅ Day 1 採靜態 demo 資料（與兄弟頁 sales-overview / sales-manager-funnel 一致）
- ✅ 路由 `/sales/showroom/new-cars`（sibling 於既有 `/sales/showroom` 展廳看板）
- ✅ helper + constants 分檔（避雷反覆失分）
- ✅ 預設 viewMode = card，filter 全 client-side 過濾（同一份 dataset）
- ✅ 「規格」「報價」按鈕先用 toast / placeholder，不導頁（後續 RS04 落地時再 wire）
