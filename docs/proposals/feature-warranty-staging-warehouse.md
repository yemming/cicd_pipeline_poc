# 提案：保固暫存倉設定（11.3）

> 來源：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/11_保固索賠_暫存倉設定.html`
> 日期：2026-05-11
> 階段：架構提案（已預先批准 → 直接進落地）

## 1. 結構摘要

保固暫存倉是專門存放舊件的隔離倉庫，**不計入可售庫存、不參與盤點**。本頁需呈現：
（a）品牌底下所有「暫存倉」（warehouses.type='warranty'）含目前存放件數 / 超期件數 / 庫位格數
（b）品牌全域規則（隔離 / 超期告警 / 成本計算方式）
（c）選定暫存倉的存放明細表（舊件條碼、品名、損壞等級、入庫日、存放天數、索賠狀態）

## 2. Schema 草案

### 新表
**無**。完全 reuse 既有：

| 來源表 | 角色 |
|---|---|
| `warehouses` (type='warranty', brand-aware) | 暫存倉本體（已存在，目前 ducati 1 筆） |
| `parts_warranty_staging_rules` (brand_id PK) | 品牌規則（已存在，雙 brand 各 1 筆） |
| `parts_warranty_used_parts_items` (brand-aware) | 存放於暫存倉的舊件清單（已存在） |

### 現有表變更
**無**。`metadata jsonb` 已存在於三張表，可承載 slot_capacity / store_label 等顯示用欄位。

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| warehouses.code/name/type/is_active/org_id | typed | core，RLS / 關連用 |
| warehouses.metadata.slot_capacity | jsonb | 「庫位 8 格」純顯示，不需 index |
| staging_rules.* (4 booleans + 2 ints + cost_calc_method) | typed | 已 typed，業務邏輯會直接讀 |
| used_parts_items.inbound_date/status/damage_level | typed | 報表會用 |
| used_parts_items.metadata | jsonb | 預留未來索賠號連動欄位 |

## 3. Domain Helper 規劃

檔案：`src/domain/warranty.ts`（新建 — POC 此模組目前沒有 helper）
搭配：`src/domain/warranty.constants.ts`（避免 use server 檔內 export 非 async）

```ts
// warranty.ts
"use server";

export type StagingWarehouseSummary = {
  id: string; code: string; name: string; type: string | null;
  is_active: boolean; org_id: string | null; org_name: string | null;
  slot_capacity: number | null;     // metadata.slot_capacity
  stored_count: number;             // count of items in this warehouse (jsonb metadata.warehouse_id)
  overdue_count: number;            // items where days >= alert_days_first
};

export type StagingRulesRow = Database["public"]["Tables"]["parts_warranty_staging_rules"]["Row"];
export type StagingItemRow  = Database["public"]["Tables"]["parts_warranty_used_parts_items"]["Row"];

export async function getStagingWarehousePageData(activeWarehouseId?: string): Promise<{
  warehouses: StagingWarehouseSummary[];
  rules: StagingRulesRow;
  activeWarehouse: StagingWarehouseSummary | null;
  items: StagingItemRow[];
  canEdit: boolean;
}>;

export async function updateStagingRules(patch: Partial<StagingRulesRow>): Promise<ActionResult<{ brand_id: string }>>;
export async function createStagingWarehouse(input: { code: string; name: string; org_id: string | null; slot_capacity: number | null }): Promise<ActionResult<{ id: string }>>;
export async function updateStagingWarehouse(id: string, patch: { name?: string; org_id?: string | null; slot_capacity?: number | null }): Promise<ActionResult<{ id: string }>>;
export async function toggleStagingWarehouseActive(id: string, active: boolean): Promise<ActionResult<{ id: string }>>;
```

實作策略：Day 1 直連 supabase（reuse 既有 `parts-setup/staging-warehouse-actions.ts` 的 update rules 邏輯，擴成完整 helper）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| updateStagingRules | 無下游推播；revalidatePath | 確定 |
| createStagingWarehouse | warehouses insert；brand-aware | 確定 |
| toggle active | warehouses.is_active；不動 items | 確定 |
| 「超期告警」實際發送 | 由 cron / 告警模組讀 alert_days_first 計算 | **不在此頁** |

無 [需確認] 項目 — 規則表單純儲存，items 表此頁只讀。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 暫存倉設定 | `/parts/warranty/staging-warehouse` | Setting Page（list + rules + detail） | 自有 layout（spec 規定二欄 grid + 底部明細表） |

設計取捨：spec 明示「左卡列表 + 右卡規則 + 下方明細表」三段式 setting 佈局，**不適合**標準 list/detail 雙頁 design pattern；維持單頁但組件統一用 §Design Pattern 的色票、字級、按鈕色。明細表用 `<DataGrid>` 元件以符合「list view 一律 DataGrid」紀律。

## 6. nav_nodes

**無動作** — 既有節點已是 `react_route` 且 href 對齊 `/parts/warranty/staging-warehouse`。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/warranty.ts` |
| 新增 | `src/domain/warranty.constants.ts` |
| 改寫 | `src/app/(workspace)/parts/warranty/staging-warehouse/page.tsx`（移除 supabase 直連，改 import helper） |
| 改寫 | `src/app/(workspace)/parts/warranty/staging-warehouse/_components/staging-warehouse-board.tsx`（補列表 / Modal / items DataGrid / spec 字級色票） |
| 棄用 | `src/lib/parts-setup/staging-warehouse-actions.ts` 內容遷入 helper，檔案保留 re-export（避免破壞其他 caller） |

## 8. Verification

1. `npx tsc --noEmit` 0 errors
2. `npx eslint <touched paths>` 0 errors
3. dev 起來 `/parts/warranty/staging-warehouse` 顯示既有 ducati 倉 + items
4. 規則表單 toggle 觸發 pending UI + 成功 banner
5. items DataGrid column visibility / Excel 匯出可用

## 9. 開放問題

**已預先批准跳階段 3。**
