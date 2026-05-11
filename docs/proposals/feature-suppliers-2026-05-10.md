---
feature: 供應商資訊管理
slug: suppliers
date: 2026-05-10
stage: Phase 2 完成（list view + detail page，view/edit/create 三 mode + 合約 CRUD + 軟刪除）
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/02_基礎設定_供應商資訊.html
target_route: /parts/setup/suppliers
---

# 提案：供應商資訊管理（基礎設定 / 倉庫管理 2.3）

## 1. 結構摘要

List View：filter bar（供應商類型 / 合約狀態 / 名稱搜尋 / 查詢 / + 新增）+ DataGrid（供應商名稱 / 類型 / 主要聯絡人 / 電話 / 供應品類 / 合約效期 / 合約狀態 / 操作）。每 row 點「詳細」進 detail。

## 2. Schema（重用既有真表）

| 表 | 角色 |
|---|---|
| `suppliers` | 主表（28 欄、含 type / payment_terms / tax / metadata） |
| `supplier_contracts` | 1:N supplier；取最近 effective_to 顯示為「合約效期」、根據 effective_to vs today 算「合約狀態」（有效 / 即將到期 < 90d / 已到期）|

`suppliers.metadata.supply_categories` jsonb 存「供應品類」字串（如「煞車系統・傳動系統」）— 業務描述、單頁顯示、不入 typed。

不新建表、不 ALTER。

## 3. Domain Helper

新建 `src/domain/suppliers.ts`：

```ts
"use server";

export type SupplierWithContract = SupplierRow & {
  latest_contract_to: string | null;     // 最近合約 effective_to
  contract_status: 'valid' | 'expiring' | 'expired' | 'none';
};

export async function listSuppliersWithContract(filter: {
  type?: string;
  contract_status?: 'valid' | 'expiring' | 'expired' | 'all';
  q?: string;
}): Promise<SupplierWithContract[]>;

export async function getSuppliersPageData(filter): Promise<{
  rows: SupplierWithContract[];
  canEdit: boolean;
}>;
```

**既有 server actions（`src/lib/parts-setup/supplier-actions.ts`）保留不刪**，未來 helper 升級到「需要副作用」時 reuse。

## 4. 副作用

無 — list view 純讀。create/edit 點按鈕 Phase 2 接 modal（先 disabled 顯示）。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 |
|---|---|---|
| 供應商資訊 | /parts/setup/suppliers | List View（套 design pattern + DataGrid） |

## 6. 預設決策

- 走 DataGrid（design pattern SOP §List View 規格 §5）
- 「+ 新增」「詳細」按鈕 Phase 1 disabled，等 Phase 2 加 modal CRUD + detail page
- 「合約效期」/「合約狀態」用 supplier_contracts join 算（不在 suppliers 表 ALTER 加欄）
- 篩選欄位：type / contract_status / q（名稱模糊搜）

## 7. Verification

1. 頁面 list 出 active brand 的所有 suppliers + 各自最近合約效期
2. type 篩選作用
3. 合約狀態自動算（< 90d 即將到期）
4. tsc / eslint 0 errors / 紀律 grep 0 violations

---

## Phase 2 落地紀錄（2026-05-11）

> Phase 1 跳階段 3 用預設選項 → 留下 disabled「+ 新增」「詳細」按鈕的半成品。Phase 2 走完整 design pattern SOP（list + detail page，view/edit/create 三 mode）補完。

### 階段 3 拍板（補做）

- **Q1 sections / tabs**：2 section + 3 tab
  - ▼ 基本資料：code / name / supplier_type / type / contact / phone / email / address / tax_id / is_active / notes
  - ▼ 付款 / 稅務 / 會計：payment_terms / payment_terms_days / default_currency / is_withholding_required / withholding_tax_code_id / default_tax_code_id / gl_payable_coa_id / default_expense_coa_id
  - Tab：合約清單 / 供應品類 / 系統 / 整合
- **Q2 合約 CRUD**：Inline modal CRUD（+ 新增 / 編輯 / 刪除 走 modal）
- **Q3 刪除策略**：軟刪除 + cascade（跟 org / warehouse-bins 一致）

### P2.1 DB

- `apply_migration supplier_soft_delete_rpc` — 新增 `supplier_soft_delete(p_supplier_id uuid)`
  - SECURITY DEFINER + GRANT authenticated
  - 內含 `user_has_brand()` 權限檢查
  - 行為：`suppliers.is_active = false` + cascade `supplier_contracts.status = 'inactive'`（只動原本是 active 的合約）

### P2.2 Domain helper（`src/domain/suppliers.ts`）

從 113 行擴到 ~430 行。新增：

- 讀 helper：`getSupplierById` / `getContractsBySupplierId` / `getSupplierLookups`（COA + tax_codes options）
- Supplier CRUD：`createSupplier` / `updateSupplier` / `setSupplierActive` / `softDeleteSupplier`（call RPC）
- Contract CRUD：`createContract` / `updateContract` / `deleteContract`
- 全部回 `ActionResult<T>` 型別、不 redirect、UI 自控導航
- `mapSupplierError` / `mapContractError`：23505 → 中文「此代碼已存在」、23503 → 「外鍵約束失敗」

既有 `src/lib/parts-setup/supplier-actions.ts` **保留不刪** —— `items/[id]/_components/item-detail-view.tsx` 還在 import `createSupplierAction` 做「快速建供應商」。

### P2.3 Detail page（新建 ~870 行）

- `[id]/page.tsx`（server，47 行）— 撈 supplier + contracts + lookups + canEdit，傳給 detail view
- `[id]/_components/supplier-detail-view.tsx`（client，~870 行）—
  - Breadcrumb + 5 顆 CRUD pill bar（view mode）/ 2 顆 [儲存變更][取消]（edit）/ 2 顆 [取消][建立並開啟]（create）
  - 模式 badge：編輯模式（amber）/ 建立模式（amber）
  - Title card（標題 + chip + supplier logo placeholder 260×120）
  - 2 section（▼ 基本資料 / ▼ 付款稅務會計）— KV grid 3 欄
  - 3 tab（合約 / 供應品類 / 系統整合）
  - Sub-component：`ContractsPanel`（table + 新增按鈕）/ `CategoriesPanel`（textarea + 儲存）/ `SystemPanel`（系統欄位）
  - 4 modal：supplier delete / contract create+edit（共用 `ContractModal`）/ contract delete
  - Banner fixed 右下：成功 2.2s 自動消失、失敗留著
  - **同頁 create-mode**：點「新增」pill → 切到 `create` mode 但同時 `router.push('/parts/setup/suppliers/new')` 切頁，避免污染當前 supplier；建立成功 → `router.push('/parts/setup/suppliers/{id}')`
- `new/page.tsx`（24 行）— reuse 同一個 detail view，傳 `supplier=null` + `initialMode='create'`

### P2.4 List view 啟用

`_components/suppliers-board.tsx` 從 261 行擴到 ~360 行：

- 「+ 新增供應商」disabled → `<Link href="/parts/setup/suppliers/new">`（綠 pill）
- 列名「供應商名稱」變藍色 link 直接跳 detail
- 操作欄 3 顆 button（design pattern §List View 規格）：
  - **編輯**（白底）→ 跳 detail 頁（user 在 detail 點 修改 進入 edit mode；28 欄不適合塞 list 上的 modal）
  - **停用 / 啟用**（白底）→ 直接 call `setSupplierActive(id, !active)`
  - **刪除**（紅底）→ open confirm modal → call `softDeleteSupplier`
- 加 banner（成功/失敗）+ delete confirm modal
- 加新欄 `is_active`（啟用 / 停用 chip），方便 list 上一眼看出狀態

### P2.5 紀律 check

- ✅ `npx tsc --noEmit` → 0 errors
- ✅ `npx eslint src/app/(workspace)/parts/setup/suppliers src/domain/suppliers.ts` → 0 errors
- ✅ `grep '@/lib/supabase' src/app/(workspace)/parts/setup/suppliers/` → 0 violations（UI 層全走 domain helper）

### P2.6 沒做（明確不在範圍）

- ❌ COA / tax_code 的 `<select>` 沒做模糊搜尋 / multi-tenant scoping（目前 single tenant，全列出可接受）
- ❌ supplier 重 hard delete（目前只支援軟刪 + 切 inactive）
- ❌ contract 軟刪（目前合約走 hard delete；未來 FK 引用增加時再改）
- ❌ supplier logo 上傳（title card 右側佔位）

### 已知 gotcha

- supplier 28 欄裡 `type`（agent/oem/consumable）和 `supplier_type`（VEHICLE_DEALER/PARTS_SUPPLIER/OTHER）兩欄並存 — 舊 action 只寫 `type`、Phase 1 list filter 用 `supplier_type`。Phase 2 detail page 兩個都暴露讓 user 編輯（同一個 section）以避免靜默不一致。
- 「需扣繳所得稅」勾起來才會 enable 「扣繳稅碼」select；勾掉時 `withholding_tax_code_id` 會留著（不自動清空），如要乾淨可以後續加「勾掉時清 id」。
- `softDeleteSupplier` 不會清 supplier 身上的 typed FK（gl_payable_coa_id 等），只切 is_active = false；reactivate 後資料完整。

