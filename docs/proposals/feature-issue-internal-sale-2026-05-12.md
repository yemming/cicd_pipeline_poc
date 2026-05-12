# Feature Proposal — 內售出貨 design pattern 落地

**Slug**: `parts/issue/internal-sale`
**Sprint**: 6.3（出庫第三頁、完成出庫三本作品 §6 系列）
**Date**: 2026-05-12
**範本來源**：
- list view → `parts/issue/repair-pick/_components/repair-pick-board.tsx`
- detail page → `parts/issue/repair-pick/[id]/_components/repair-pick-detail-view.tsx`
- new form → `parts/issue/repair-pick/new/_components/new-repair-pick-form.tsx`（ad-hoc 半邊）
- mutation 共用 → `src/domain/issues.ts` 內部的 `persistPick`（已支援多 type）

---

## 1. 現況

`/parts/issue/internal-sale` 是「員工 / 內部試乘 / 維修等內銷用途的備件出庫」入口：

- `page.tsx` 已走 `getIssuesPageData({type:'internal_sale'})` ✅，天條 OK
- list view 用 `_components/issues-board.tsx`（原始共用版、repair-pick 升級時已分離；現在只有這頁在用）
- 手刻 `<table>`、無 DataGrid / 無 filter（除了 status + q）/ 無 rowActions
- 「＋ 新增出庫」按鈕 **disabled**、tooltip 寫「Phase 2 開放」
- **後端完全沒寫**：`src/lib/parts/actions/index.ts` 0 個 internal_sale 相關函式
- 沒 detail page

業務目的：銷售人員幫員工/試乘/同集團單位出庫備件（內部用途、跟外賣 POS 走不同流程）。產 `gi_no=ISS{date}-NNN`、status='posted'、扣源倉 stock_items、寫 stock_issue_lines、`type='internal_sale'`。

跟對面 `/parts/receipt/internal-sale` 的關係：**目前沒有資料層 link** — receipt 端用獨立 `parts_internal_sale_receipts` 表（demo only），所以這輪不處理 pairing 流程。

跟 repair-pick / transfer-out 對齊：CRUD pill `[返回列表][＋ 新增內售出貨][修改][作廢]`、view-only 為主、edit 限定欄位（notes / line.notes）、作廢守門（status='posted' 才能作廢）。

## 2. Schema 草案

**不動 schema**：

- `stock_issues` typed core 完全夠用（已含 voided_at/by/reason 三欄、customer_id nullable、type='internal_sale' 已是 IssueKind union 合法值）
- `stock_issue_lines` 也夠
- `IssueKind` union 已含 `internal_sale`，無需擴

## 3. Domain Helper 規劃

`src/domain/issues.ts` append（與 repair-pick 共用 helper、最大程度復用）：

```ts
// ── New form data ──
export type InternalSaleFormData = {
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  customers: Array<{ id: string; code: string | null; name: string }>;
  items: Array<{ id: string; code: string; name: string; base_uom: string | null }>;
};
export async function getInternalSaleFormData(): Promise<InternalSaleFormData>;

// ── Mutation（薄 wrapper、復用 persistPick）──
export type CreateInternalSaleInput = {
  warehouse_id: string;
  customer_id: string;            // 必填（內售必須指明買方）
  notes: string;                  // 必填（用途說明）
  lines: Array<{
    item_id: string;
    qty_needed: number;
    line_notes?: string | null;
  }>;
};
export async function createInternalSale(
  input: CreateInternalSaleInput,
): Promise<Result<{ id: string; gi_no: string }>>;
//  ─ 內部 1) 跑 previewRepairPick({mode:'adhoc'}) 預檢
//      2) 通過 → persistPick({ type: 'internal_sale', customerId, ... })
//  ─ 與 pickAdHoc 唯一差別：type 不同、customer_id 必填
//  ─ revalidate /parts/issue/internal-sale + /parts/operations/balance
```

**復用既有**：
- `previewRepairPick` 的 `mode:'adhoc'` 分支 → 同樣是 FIFO 配置，**可直接 reuse**（不另開 `previewInternalSale`）
- `updateIssue(id, patch)` → type-agnostic，**可直接 reuse**
- `voidIssue(id, reason)` → type-agnostic，**可直接 reuse**
- `getIssueById(id)` → type-agnostic，**可直接 reuse**
- `listIssues({type:'internal_sale'})` → 既有，**可直接 reuse**
- `getIssuesPageData({type:'internal_sale'})` → 既有，**可直接 reuse**（已含 warehouses）

最終 internal-sale 不需要任何「平行於 repair-pick」的新 query — 只需要 `getInternalSaleFormData()`（拿 customers 下拉）+ `createInternalSale()`（包薄 wrapper 指定 type）兩個新函式。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createInternalSale` | 1. FIFO 配置源倉 stock_items 2. 任一不夠 → 整批 abort 3. INSERT stock_issues (type='internal_sale', status='posted', posted_at/by) 4. INSERT stock_issue_lines 5. UPDATE 源 stock_items qty - 6. revalidate 2 path | 確定（復用 persistPick） |
| `createInternalSale` | 同步建一筆 `parts_internal_sale_receipts`（讓對面入庫端看得到） | **[需確認]** |
| `createInternalSale` | 推 LINE 通知客戶或會計 | **[需確認]** |
| `voidIssue` | 同 repair-pick：建新 available stock_items 還原 + 標 cancelled + voided_* | 確定（共用 helper） |

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| Internal-Sale List | `/parts/issue/internal-sale` | List View（DataGrid + filter + rowActions） | repair-pick-board.tsx |
| Internal-Sale Detail | `/parts/issue/internal-sale/[id]` | Page View（view / edit / 作廢） | repair-pick-detail-view.tsx |
| Internal-Sale New | `/parts/issue/internal-sale/new` | New form（單 mode：客戶+倉+lines） | new-repair-pick-form.tsx 的 ad-hoc 分支 |

### 5.1 List view

- 重寫 `internal-sale/_components/internal-sale-board.tsx` → 用 `<DataGrid>`、`persistKey="parts/issue/internal-sale"`
- columns（8 欄、與 repair-pick 接近，去掉 RO 欄）：
  1. `gi_no` — 領料單號（mono、`hideable: false`、Link）
  2. `customer_name` — 買方（**比 repair-pick 重要**）
  3. `warehouse_name` — 出庫倉
  4. `issue_date` — 出庫日（mono）
  5. `qty_issued_total` — 出庫數（align:right）
  6. `amount_total` — 出庫金額（align:right、千分位）
  7. `status` — 狀態 chip（`hideable: false`）
  8. `notes` — 用途備註
- filter bar：狀態 + gi_no 搜尋 + 出庫倉下拉（與 repair-pick 一致）
- rowActions：詳細 / 作廢（status='posted' 才顯示）
- Toolbar：「共 N 筆、總金額 NT$ XX」
- Banner 由 rowAction 上拋

### 5.2 Detail view

直接套 `repair-pick-detail-view.tsx` 的所有結構，差異：

- Breadcrumb 換成「內售出庫」
- Title card：拿掉 RO chip / ad-hoc chip（內售一定有 customer），改成「{customer_name} · {warehouse}」
- KV grid 拿掉「RO 工單」一格、改加「買方代碼」（如果 customers.code 有值）

或者更省力：**完全 reuse `repair-pick-detail-view.tsx`，只把 caption/breadcrumb 文字改成參數化**。

➡️ 決定方案：拷一份 `internal-sale-detail-view.tsx`、改字串，**結構零差異**。避免共用元件帶 prop 過多、難維護。

### 5.3 New form

- 單一 mode（不像 repair-pick 有 RO/ad-hoc 切換）
- 必填：出庫倉 + 買方 + 用途（notes、textarea、min 5 字）
- 必填：明細表格（每行 [品項] [出庫數] [備註]）
- 按「預覽配置 →」跑 `previewRepairPick({mode:'adhoc'})`
- 預覽 OK 後「建單並出貨（綠）」呼叫 `createInternalSale`
- 成功 → `router.push('/parts/issue/internal-sale/<id>')`

## 6. nav_nodes

**不動**。路徑沒變、`page_kind='react_route'` 已是現狀。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 修改 | `src/domain/issues.ts` — append 2 個函式 + 2 個型別 |
| 修改 | `src/app/(workspace)/parts/issue/internal-sale/page.tsx` — 改吃新 board |
| 新增 | `src/app/(workspace)/parts/issue/internal-sale/_components/internal-sale-board.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/internal-sale/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/internal-sale/[id]/_components/internal-sale-detail-view.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/internal-sale/new/page.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/internal-sale/new/_components/new-internal-sale-form.tsx` |
| 刪除 | `src/app/(workspace)/parts/issue/internal-sale/_components/issues-board.tsx`（原始共用版、改由新 board 取代） |

## 8. Verification

1. `npx tsc --noEmit` / `npx eslint` 0 errors
2. `grep -rn "@/lib/supabase" "src/app/(workspace)/parts/issue/internal-sale"` = 0 hit
3. List filter：狀態 / gi_no / 出庫倉三軸有效
4. 點 gi_no → detail page → KV 顯示客戶
5. New page：選倉 + 選客戶 + 加 lines → 預覽 → 一鍵出貨 → router.push
6. 庫存不夠 → 紅警 + 按鈕 disabled
7. Detail edit notes / line_notes / 作廢守門
8. 對面 transfer-in / receipt/internal-sale 不受影響

## 9. 開放問題（階段 3 拍板）

A. **買方（customer_id）必填還是選填**？
   - 推薦：**必填**（內售必須指明買方；nullable 等於開後門）

B. **「買方」用既有 `customers` 表，還是另開「internal_units」概念**？
   - 推薦：**先用 customers**（POC 階段都同一個 customers；之後內外部要分流再加 `is_internal` 標記或新表）

C. **單價：用 stock_items.unit_cost 還是讓用戶手填「內部結算價」**？
   - 推薦：**用 stock_items.unit_cost**（與 repair-pick 一致；「內部售價」未來變動再加 unit_price override）

D. **是否同步建一筆 `parts_internal_sale_receipts`（讓對面入庫端看得到）**？
   - 推薦：**先不做**（schema 不同、receipt 端目前是 demo readonly；之後要正式接，整個 internal-sale receipt 模組要重做）

E. **推 LINE 通知（給買方或會計）**？
   - 推薦：**不推**（這輪純庫存帳）

## 10. 不動 / 不做

- ❌ 不動 schema
- ❌ 不動 `/parts/receipt/internal-sale`（demo 受限只讀）
- ❌ 不寫推 LINE
- ❌ 不開「內部售價」欄
- ❌ 不動 sidebar / nav_nodes
- ❌ 不開 worktree
