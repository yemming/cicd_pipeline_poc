# Helper 債清理計畫（5-Batch Sprint）

**日期**：2026-05-12
**緣由**：CLAUDE.md §資料存取架構 + spec-to-feature SKILL.md 升級「Helper 天條 — 無例外」後，audit 出 41 個檔仍 `import { createClient } from '@/lib/supabase/...'` 違規。本文件規劃分 5 批清光。

---

## 進度追蹤

| Batch | 狀態 | 違規數 | 累計剩餘 | 範圍 |
|---|---|---|---|---|
| **B1** | ✅ 完成（2026-05-12） | 3 | 41 → 38 | client-side `createClient` 3 個 |
| **B2** | ✅ 完成（2026-05-12） | 8 | 38 → 30 | `admin/master-data/*` 8 個 |
| **B3** | ✅ 完成（2026-05-12） | 12 | 30 → 18 | `admin/notifications` 5 + `admin/navigation` 4 + `admin/org` 3 |
| **B4** | ✅ 完成（2026-05-12） | 9 | 18 → 9 | `parts/setup` 3 + `parts/purchase` 3 + `parts/{receipt,operations,analytics}` 3 |
| **B5** | ✅ 完成（2026-05-12） | 9 | 9 → 0 | `einvoice/*` 5 + `feedback/tickets` 2 + `me/profile` 1 + `n/[nodeId]` 1 |

**🎯 目標達成**：`grep -rn "@/lib/supabase" "src/app/(workspace)" src/components` = **0 hit**（2026-05-12 收尾）。

---

## B1 — Client-side（已完成 2026-05-12）

- 提案：`docs/proposals/refactor-b1-client-side-2026-05-12.md`
- 改動：
  - **新建** `src/domain/feedback-canvas.ts` — `saveFeedbackCanvasSnapshot()`
  - **新建** `src/domain/users.ts` — `getCurrentUserProfile()`
  - 改 `src/components/feedback/canvas-editor-impl.tsx`
  - 改 `src/components/feedback/canvas-panel-impl.tsx`
  - 改 `src/app/(workspace)/sales/card/counter/page.tsx`
- 驗證：tsc 0 / eslint 0 / B1 範圍 audit 0 hit / SSR 307（未登入正常 redirect）

---

## B2 — admin/master-data 主檔群（已完成 2026-05-12）

- 提案：`docs/proposals/refactor-b2-master-data-2026-05-12.md`
- 改動：
  - **新建** `src/domain/customers.ts` — `listCustomersForAdmin` / `getCustomerDetail`
  - **新建** `src/domain/supplier-pricing.ts` — `listSupplierPricingForAdmin` / `listSupplierPricingLookups`
  - **新建** `src/domain/accounting.ts` — `listPostableAccounts`
  - **新建** `src/domain/work-orders.ts` — `listActiveWarehouses` / `listWorkOrderItems` / `listIssuesForWorkOrder`
  - **append** `src/domain/items.ts` — `listItemsWithLeadTime`
  - 改 8 個 page.tsx：移除 `@/lib/supabase/server` + `@/lib/scope/active-scope` 直連，全改 import helper
- 驗證：tsc 0 / eslint 0（只有 1 個既有 unused-Link warning、非本批檔）/ B2 audit 0 hit / 累計 38 → 30 / SSR 307（5 個 list+new routes 都正常 redirect）
- **未動**：`lib/master-data/queries.ts`（`getSupplierPricingById` / `getWorkOrderById` 仍 import 自此檔，B5 收尾再整併）

---

## B3 — admin 後台 service client 系列（12 個檔，✅ 完成 2026-05-12）

- 提案：`docs/proposals/refactor-b3-admin-service-client-2026-05-12.md`
- 拍板模式（Q1 / Q2 / Q3 三題均 Ming 拍）：
  - **Q1**：throw + page try/catch（sentinel "UNAUTHENTICATED" / "FORBIDDEN_*"）
  - **Q2**：三支 helper（不混在 `src/domain/admin.ts`）
  - **Q3**：保留既有 `lib/notifications/repositories/` 不動
- 新建 3 個 helper：
  - `src/domain/notifications.ts` — `getNotificationDashboardData` / `listNotificationDeliveriesForAdmin(filter)` / `getNotificationSubscriptionsBoardData` / `getNotificationTargetsBoardData` / `getNotificationTemplatesBoardData`
  - `src/domain/navigation-admin.ts` — `getNavTabData(brandKey)` / `getBrandTabData(brandKey)` / `getRolesTabData` / `getPermissionsTabData` / `getUserAssignmentsTabData` / `getRoleDetail(id)` / `getUserAssignmentDetail(userId, roleId)` / `loadScopeOptionsForAdmin`
  - `src/domain/org-admin.ts` — `getBrandsBoardData` / `getGroupsBoardData` / `getStoresBoardData`
- 改 12 個 page + 1 個 thin re-export（`admin/navigation/users/_lib/load-scope-options.ts` 改成 re-export wrapper 保 import path 不動）
- 共通 pattern：helper 內部 `createServiceClient()` + `ensure*Admin()` throw sentinel；page 端統一 try/catch、UNAUTHENTICATED → redirect /login、FORBIDDEN → AdminForbidden / redirect
- AdminForbidden 文案改通用版（不顯示 email、走簡單派）
- 驗證：tsc 0 / eslint 0（一個 pre-existing `_brandKey` warning 與 B3 無關）/ 累計 audit 30 → **18**

---

## B4 — parts 殘餘（9 個檔，✅ 完成 2026-05-12）

- 提案：`docs/proposals/refactor-b4-parts-2026-05-12.md`
- 拍板：po-grn/new 落 `receipts.ts`（A 案 — page-level aggregation 跟 receipt 家族同檔；orders.ts 已肥不該再塞）
- 全部 9 檔 **append 到既有 helper**、不新建檔：
  - `items.ts` 加 3 個 API（`getItemsListPageData` / `getItemDetailPageData` / `getItemLabelData`）→ 改 3 個 items page
  - `replenishment.ts` 加 `getReplenishmentPageData` → 改 replenishment page
  - `requisitions.ts` 加 `getRequisitionsNewPageData` + `getRequisitionDetailPageData` → 改 2 個 requisitions page
  - `receipts.ts` 加 `getPoGrnNewPageData(poId?)`（discriminated union：chooser / detail）→ 改 po-grn/new page
  - `count.ts` 加 `listInventoryCounts` → 改 count-ops page
  - `analytics.ts` 加 `getAbcSettingsPageData` → 改 abc-settings page
- 驗證：tsc 0 / eslint 0 errors（7 個 pre-existing warning 與 B4 無關）/ 累計 18 → **9**

---

## B5 — 跨模組收尾（9 個檔，✅ 完成 2026-05-12）

- 提案：`docs/proposals/refactor-b5-cross-module-2026-05-12.md`
- 實際 9 檔：einvoice 5（list/[id]/allowances/number-pools/voids）+ feedback/tickets 2 + me/profile + n/[nodeId]
- 新建 3 支 helper：
  - `src/domain/einvoice.ts` — 5 個 API（list / detail / allowances / number-pools / voids）
  - `src/domain/feedback-tickets.ts` — 2 個 API（list / detail，含 attachment signed URLs 整段搬進 helper）
  - `src/domain/navigation.ts` — 2 個 API（`resolveNavNode` + `downloadNavHtml`，service client 但無 admin guard、跟 `navigation-admin.ts` 對稱）
- append `src/domain/users.ts` — `getMyProfileRow(userId)`
- 驗證：tsc 0 / eslint 0 / 累計 9 → **0**（達成 🎯）

---

## 跨 batch 紀律

1. **純 layer 替換**：不改視覺、不加欄位、不改業務邏輯
2. **不刪既有 server actions**（spec-to-feature 規定）
3. **不動 DB schema / RLS / nav_nodes**
4. **每 batch 完成跑累計 audit**：`grep -rln "@/lib/supabase" "src/app/(workspace)" src/components | wc -l`
5. **走 spec-to-feature 入口 C 4 步流程**（不走 5 階段）

---

## 完成驗收

```bash
grep -rn "@/lib/supabase" "src/app/(workspace)" src/components
# 預期：0 hit
```

然後 audit 命令可以變成 CLAUDE.md / pre-commit hook 的硬規則。
