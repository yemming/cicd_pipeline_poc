# Refactor B2 — admin/master-data 主檔群（8 個檔）

**日期**：2026-05-12
**前情**：[B1 客戶端 createClient 收尾](./refactor-b1-client-side-2026-05-12.md)（41 → 38）
**整體計畫**：[helper-debt-cleanup-plan](./helper-debt-cleanup-plan-2026-05-12.md)
**進度**：B2 完成後 38 → 30

## 目標

把 `src/app/(workspace)/admin/master-data/*` 8 個檔的 `@/lib/supabase` 直連包進 `@/domain/*` helper、UI 只透過 helper 取得資料。**不改業務邏輯、不改視覺、不改 server actions**。

走 spec-to-feature 入口 C（Refactor mode、4 步）：Audit ✅ → 提案（本文）→ 拍板 → 落地驗證。

## Step 1 · Audit 表

| # | UI 檔案 | 用了哪些表 / fetch | 既有 server actions？ |
|---|---------|---------------------|----------------------|
| 1 | `customers/page.tsx` | `customers` + count | 無（list） |
| 2 | `customers/new/page.tsx` | `chart_of_accounts`（postable） | `lib/master-data/customer-actions.ts`（保留） |
| 3 | `customers/[id]/page.tsx` | `customers` + `customer_contacts` + `customer_vehicles` + `work_orders` + `vehicle_models` + `chart_of_accounts` | 同上 |
| 4 | `supplier-pricing/page.tsx` | `supplier_item_pricing` + `suppliers` + `items` + count | `lib/master-data/supplier-pricing-actions.ts`（保留） |
| 5 | `supplier-pricing/new/page.tsx` | `suppliers` + `items` lookup | 同上 |
| 6 | `supplier-pricing/[id]/page.tsx` | `suppliers` + `items` lookup（getById 已走 `lib/master-data/queries.ts`） | 同上 |
| 7 | `item-lead-times/page.tsx` | `items` + `suppliers`（拼 LeadTimeRow） | `lib/master-data/item-lead-time-actions.ts`（保留） |
| 8 | `work-orders/[id]/page.tsx` | `warehouses` + `stock_issues` + `work_order_items`（getWorkOrderById 已走 queries.ts） | `lib/master-data/workorder-actions.ts`（保留） |

**累計違規對齊**：`grep -rln "@/lib/supabase" "src/app/(workspace)" src/components | wc -l` = **38**（與 handoff 對齊）

## Step 2 · 既有 `@/domain/*` 落點調查

| 既有 helper | 涵蓋範圍 | 對 B2 是否可用 |
|-------------|----------|----------------|
| `domain/pricing.ts` | **零售價** `item_store_prices`（DealerOS retail）| ❌ 不是 supplier-pricing |
| `domain/suppliers.ts` | `suppliers` + `supplier_contracts` + lookups + CRUD | ✅ thin lookup 可 append |
| `domain/items.ts` | `items` + `item_skus` + CoA for items + `listPostableAccountsForItem` | ✅ `listItemsWithLeadTime` 可 append |
| `domain/warehouse.ts` | warehouse arch / bins / zones | ✅ `listActiveWarehouses` 可 append |
| `domain/procurement.ts` | 採購 PO 流程 | ✋ 不放 supplier-pricing（master data ≠ 交易單據） |
| **無** `domain/customers.ts` | — | 新建 |
| **無** `domain/work-orders.ts` | — | 新建（或併進 service） |
| **無** `domain/accounting.ts` | — | 新建（postable accounts 共用點） |

`lib/master-data/queries.ts` 是另一份 server-only facade（已用 createClient + getActiveScope），跟 `@/domain/*` 同形狀但在不同目錄。**B2 不全搬**（避免 blast radius 爆炸）；需要的函式就在 `@/domain/*` 包薄 wrapper、之後 B4/B5 再整併。

## Step 3 · 改寫計畫 — Helper 落點

### ✨ 新建 3 個檔

#### `src/domain/customers.ts`

```ts
// 純 server-side、用 createClient + getActiveScope 強制 brand 過濾
export async function listCustomersForAdmin(filters: {
  type: "all" | "individual" | "corporate";
  status: "all" | "active" | "inactive";
  q: string;
}): Promise<{ rows: CustomerAdminRow[]; totalCount: number }>;

export async function getCustomerDetail(id: string): Promise<{
  customer: DetailCustomer;
  contacts: ContactRow[];
  vehicles: VehicleRow[];
  workOrders: WorkOrderRow[];
  models: ModelRef[];
} | null>;
```

#### `src/domain/supplier-pricing.ts`

```ts
export async function listSupplierPricingForAdmin(filters: {
  supplier: string; item: string; primary: string; status: string; q: string;
}): Promise<{
  rows: SupplierPricingRow[];
  suppliers: SupplierOption[];
  items: ItemOption[];
  totalCount: number;
}>;

export async function listSupplierPricingLookups(opts: {
  activeOnly?: boolean;       // list 頁要 active、detail 頁要全部
  itemLimit?: number;         // 500 / 1000
}): Promise<{ suppliers: SupplierRef[]; items: ItemRef[] }>;

// getSupplierPricingById 暫不搬 — 仍 import 自 lib/master-data/queries.ts
//（避免 B2 blast radius；B4/B5 收尾時再整併）
```

#### `src/domain/accounting.ts`

```ts
// 所有「應收 / 應付 / 各類過帳」CoA 下拉的共用點
export async function listPostableAccounts(): Promise<AccountOption[]>;
```

⚠️ `domain/items.ts:106 listPostableAccountsForItem` 跟此函式邏輯一致（同樣 `is_active=true AND is_postable=true`、按 account_code 排）。本次**不動 items.ts**，只在 customers 引入新檔；B5 收尾時 items.ts 內部改 call accounting.ts、外部簽名不動。

### ✨ `src/domain/work-orders.ts`（admin 後台向）

```ts
// 注意：name 用 work-orders.ts 而非 service.ts —— admin/master-data/work-orders/[id]
// 是「主檔維護」入口、跟未來 /service/workorders（業務）可能分流。先建獨立檔、
// 真有衝突再合併。

export async function listActiveWarehouses(): Promise<Warehouse[]>;
export async function listWorkOrderItems(workOrderId: string): Promise<WorkOrderItem[]>;
export async function listIssuesForWorkOrder(roId: string): Promise<StockIssueSummary[]>;
```

### ➕ Append 既有 helper

| 檔 | 新增函式 | 用途 |
|----|----------|------|
| `src/domain/items.ts` | `listItemsWithLeadTime()` | item-lead-times 頁面，拼好 LeadTimeRow（含 supplier name lookup） |

> 註：原本想 append `listActiveWarehouses` 到 `domain/warehouse.ts`，但 warehouse.ts 偏向 arch / bins / zones（管理面）；workorder 列表撈 active warehouse 的需求跟 receipts.ts / transfers.ts / orders.ts 已重複多次。**改主張**：放到 `work-orders.ts` 自包，B5 真要 dedupe 時再抽到 `warehouse.ts`。請拍板時確認此選擇。

## Step 4 · UI 改 import 對照

| UI 檔案 | 移除 import | 改 import |
|---------|-------------|-----------|
| `customers/page.tsx` | `@/lib/supabase/server` `@/lib/scope/active-scope` | `@/domain/customers` `listCustomersForAdmin` |
| `customers/new/page.tsx` | `@/lib/supabase/server` | `@/domain/accounting` `listPostableAccounts` |
| `customers/[id]/page.tsx` | `@/lib/supabase/server` `@/lib/scope/active-scope` | `@/domain/customers` `getCustomerDetail` ・ `@/domain/accounting` `listPostableAccounts` |
| `supplier-pricing/page.tsx` | `@/lib/supabase/server` `@/lib/scope/active-scope` | `@/domain/supplier-pricing` `listSupplierPricingForAdmin` |
| `supplier-pricing/new/page.tsx` | `@/lib/supabase/server` `@/lib/scope/active-scope` | `@/domain/supplier-pricing` `listSupplierPricingLookups` |
| `supplier-pricing/[id]/page.tsx` | `@/lib/supabase/server` `@/lib/scope/active-scope` | `@/domain/supplier-pricing` `listSupplierPricingLookups` |
| `item-lead-times/page.tsx` | `@/lib/supabase/server` `@/lib/scope/active-scope` | `@/domain/items` `listItemsWithLeadTime` |
| `work-orders/[id]/page.tsx` | `@/lib/supabase/server` `@/lib/scope/active-scope` | `@/domain/work-orders` `listActiveWarehouses` `listWorkOrderItems` `listIssuesForWorkOrder` |

權限檢查、`getActiveScope` 都搬進 helper 內，UI 變純 layout / 權限闸 + 呼叫 helper。

## 驗證 checklist

```bash
npx tsc --noEmit                                                  # 0 errors
npx eslint "src/app/(workspace)/admin/master-data" src/domain     # 0 errors

# B2 局部 audit — 必須 0 hit
grep -rln "@/lib/supabase" "src/app/(workspace)/admin/master-data"

# 累計 audit — 必須 30（38 - 8）
grep -rln "@/lib/supabase" "src/app/(workspace)" src/components | wc -l
```

煙測（dev server port 3000、Indian brand login）：
- `/admin/master-data/customers`（list + filter + 新增 + 編輯 + 停用）
- `/admin/master-data/customers/{id}`（detail + tabs 切換 + KV 修改）
- `/admin/master-data/customers/new`（建立模式、儲存後跳新 id）
- `/admin/master-data/supplier-pricing`（list + filter + create + edit + delete）
- `/admin/master-data/supplier-pricing/{id}` / `/new`
- `/admin/master-data/item-lead-times`（inline 編輯 lead time）
- `/admin/master-data/work-orders/{id}`（檢視工單 + 庫存發料連結）

## ⚠️ 待 Ming 拍板的選項

1. **`listActiveWarehouses` 落點**：先放 `domain/work-orders.ts`（自包、B5 dedupe）vs 直接搬 `domain/warehouse.ts`（早 dedupe）— 建議前者（B2 blast radius 最小）
2. **`getSupplierPricingById` 是否一起搬**：建議**暫不搬**（仍 import 自 `lib/master-data/queries.ts`、B5 整批整併），避免 B2 範圍擴散；UI 對它無 supabase 直連，所以不影響 audit 計數
3. **`listPostableAccountsForItem` 是否合併到 accounting.ts**：建議**暫不動**（items.ts 簽名不變、B5 內部 call accounting.ts 即可）
4. **type 來源**：新 helper 的 row type 直接從現有 board / detail-view 的 `type X = ...` re-export（不重寫、不對齊）

## 不做的事

- ❌ 不動 server actions（CRUD 邏輯保持原樣）
- ❌ 不動視覺 / 互動 / 業務邏輯
- ❌ 不搬 `lib/master-data/queries.ts` 全部內容（B5 收尾再決定）
- ❌ 不寫 zod schema、不加 cache、不改權限模型
