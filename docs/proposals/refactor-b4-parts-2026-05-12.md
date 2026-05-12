# Refactor B4 — parts 殘餘 9 個檔（page → domain helper）

**Date**：2026-05-12
**Scope**：`src/app/(workspace)/parts/{setup/items,purchase,receipt/po-grn/new,operations/count-ops,analytics/abc-settings}` 9 個 page
**Predecessor**：B1（3）/ B2（8）/ B3（12）完成、累計 41 → 18
**目標**：B4 跑完、18 → **9**

---

## 1. Pattern（跟 B2 一致、不需新拍板）

跟 B3 不同：B4 用 `createClient()`（server.ts、靠 RLS），跟 B2 一模一樣 — page 內 `requirePermission` 守、helper 內部直接 supabase 撈。**不需 throw sentinel、不需 try/catch**。

落點原則（最克制）：
- 既有 helper 有對應領域 → **append** 該 helper（不新建檔）
- 沒對應領域 → 才新建 helper

9 個檔全部都能 append 到既有 helper、**不需新建任何 helper 檔**。

---

## 2. 9 個檔的 audit + 改寫對照表

| # | 檔 | 撈的表 | Helper 落點 | 新增 API |
|---|---|---|---|---|
| 1 | `parts/setup/items/page.tsx` | items / suppliers / item_vehicle_compatibility | `items.ts` | `getItemsListPageData(filter)` |
| 2 | `parts/setup/items/[id]/page.tsx` | items + stock_items + warehouses + compat + suppliers + work_order_items + item_store_prices + organizations + vehicle_models（**9 個 query**） | `items.ts` | `getItemDetailPageData(id)` |
| 3 | `parts/setup/items/[id]/label/page.tsx` | items（single） | `items.ts` | `getItemLabelData(id)` |
| 4 | `parts/purchase/replenishment/page.tsx` | replenishment_runs + lines + items + suppliers | `replenishment.ts` | `getReplenishmentPageData(filter)` |
| 5 | `parts/purchase/requisitions/new/page.tsx` | organizations + items（form lookups） | `requisitions.ts` | `getRequisitionsNewPageData()` |
| 6 | `parts/purchase/requisitions/[id]/page.tsx` | purchase_requisitions + lines + organizations + items | `requisitions.ts` | `getRequisitionDetailPageData(id)` |
| 7 | `parts/receipt/po-grn/new/page.tsx` | purchase_orders + lines + warehouse_bins | **`receipts.ts`**（拍板點） | `getPoGrnNewPageData(poId?)` |
| 8 | `parts/operations/count-ops/page.tsx` | inventory_counts | `count.ts` | `listInventoryCounts(filter)` |
| 9 | `parts/analytics/abc-settings/page.tsx` | abc_classification_config | `analytics.ts` | `getAbcSettingsPageData()` |

---

## 3. 唯一一個拍板點 — po-grn/new 邊界

po-grn/new 撈的東西：`purchase_orders`（屬 orders 領域）+ `warehouse_bins`（屬 warehouse 領域）。

兩條路：
- **A（推薦）**：放 `receipts.ts`，叫 `getPoGrnNewPageData(poId?)`、內部自己撈 PO list 或 PO detail + bins。**理由**：這頁是 receipt 流程的 prep step，使用者語意上「我要做收貨」，跟 `getReceiptsPageData` 同家族；orders.ts 已經很肥（PO CRUD 完整一套），不該再塞 page-level aggregation
- B：把 `loadPoCandidates` / `loadPoDetail` 拆進 `orders.ts`、bins 撈法 reuse `warehouse.ts`、page-level aggregation 寫進 `receipts.ts`

我傾向 A — 少打散、page-level helper 一次到位。Reuse `orders.ts` / `warehouse.ts` 的 row type 即可（`PurchaseOrderRow` / `BinRow`），不重新定義。

---

## 4. 落地順序

1. `src/domain/items.ts` append（3 API）→ 改 3 個 items page → tsc/eslint/audit
2. `src/domain/replenishment.ts` append → 改 replenishment page → tsc/eslint
3. `src/domain/requisitions.ts` append（2 API）→ 改 2 個 requisitions page → tsc/eslint
4. `src/domain/receipts.ts` append → 改 po-grn/new page → tsc/eslint
5. `src/domain/count.ts` append → 改 count-ops page → tsc/eslint
6. `src/domain/analytics.ts` append → 改 abc-settings page → tsc/eslint
7. 累計 audit：

   ```bash
   grep -rln "@/lib/supabase" "src/app/(workspace)" src/components 2>/dev/null | wc -l
   # 預期：9（18 - 9 B4 = 9，剛好剩 B5 scope）
   ```
8. Update plan markdown + HANDOFF
9. 不主動 commit

---

## 5. 風險 / 雷點

- ⚠️ **`items/[id]/page.tsx` 9 個 query**：是 B4 最複雜的檔；helper 內部 `Promise.all` 一次撈、不分批
- ⚠️ **既有 helper 已肥**：append 時注意命名不撞、type 不重複 — 既有 row type 直接 reuse
- ⚠️ **`items.ts` 用 `"use server"` directive**（不像其他 helper 用 `import "server-only"`）— 既有 convention，append 時不改
- ⚠️ **PO grn 用 supabase relation join（`suppliers ( name )`）**：搬進 helper 後 type assert pattern 保留（既有 page 已用 `as unknown as { ... }`）、不順手簡化
- ✅ **不修業務邏輯 / 視覺**：純 layer 替換
