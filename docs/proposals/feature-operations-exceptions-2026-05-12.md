# 提案：例外出入庫（/parts/operations/exceptions）

> 來源：http://43.153.159.135:3000/parts/operations/exceptions（既有頁面、data model 不一致需釐清）
> 日期：2026-05-12
> 階段：架構提案（待 Ming 拍板）

## 1. 結構摘要

非標準流程的庫存調整紀錄表 — 涵蓋 5 種類型：盤點調整（count）、損耗報廢（damage）、例外進貨（exception_in）、例外出貨（exception_out）、其他（other）。每張單就是一次跨表 audit 紀錄 + 影響 `stock_items.qty`。

⚠️ **既有頁面有 data model 衝突**：

| 既存路徑 | 行為 |
|---|---|
| list (`getExceptionsPageData`) | 讀 `inventory_adjustments` 表 |
| ＋新增調整 button（壞）| 連 `exception-form.tsx`、但既不能用、且 `exceptionMoveAction` 是寫 `stock_receipts/stock_issues type='exception'` 而**不是** `inventory_adjustments` |
| `stock_receipts/stock_issues.type='exception'` | exceptionMoveAction 用、但跟 inventory_adjustments 無關聯 |

**DB 現況**：三個來源 row count 都是 0（`inventory_adjustments` 0、`stock_receipts.type='exception'` 0、`stock_issues.type='exception'` 0）→ 可以乾淨重定 data model，無 migration 包袱。

## 2. Schema 草案

### 主表（既有、僅補 lines）

`inventory_adjustments` 已存在、欄位完備。**現有 schema 留用**：

```
id uuid, brand_id, adj_no, type, status, warehouse_id, reason text NOT NULL,
total_amount numeric, ct_id (count source FK), gl_posted bool, gl_posted_at,
approved_at/by, posted_at, notes, metadata jsonb, created_at/by, updated_at
```

### 新表（建議）

```sql
CREATE TABLE inventory_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  adj_id uuid NOT NULL REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id),
  qty_delta numeric NOT NULL,           -- 正數=入庫、負數=出庫；同一張單可混用
  unit_cost numeric NOT NULL DEFAULT 0,
  line_amount numeric NOT NULL DEFAULT 0,
  serial_no text,                        -- 出庫用 — 指定要扣的 stock_item
  batch_no text,                         -- 出庫用 — 指定要扣的 stock_item
  bin_id uuid REFERENCES warehouse_bins(id),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inv_adj_lines_adj ON inventory_adjustment_lines(adj_id, line_no);
CREATE INDEX idx_inv_adj_lines_brand ON inventory_adjustment_lines(brand_id);

-- brand-aware RLS（4 條 user_has_brand pattern）
ALTER TABLE inventory_adjustment_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_adj_lines_brand_select ON inventory_adjustment_lines
  FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY inv_adj_lines_brand_insert ON inventory_adjustment_lines
  FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY inv_adj_lines_brand_update ON inventory_adjustment_lines
  FOR UPDATE USING (user_has_brand(brand_id));
CREATE POLICY inv_adj_lines_brand_delete ON inventory_adjustment_lines
  FOR DELETE USING (user_has_brand(brand_id));
```

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| qty_delta | typed | 庫存帳的核心數值、要 SUM 報表 |
| unit_cost / line_amount | typed | 跟 GL 對帳 |
| serial_no / batch_no | typed | 對外鍵 stock_items 找實體 |
| bin_id | typed | FK |
| 細部描述、原因 sub-fields | metadata jsonb | 形狀變動中 |

## 3. Domain Helper 規劃

檔案：`src/domain/adjustments.ts`（**既有檔大幅 append**）

```ts
// 既有、擴 signature
export async function listAdjustments(filter: {
  type?: string;
  status?: string;
  warehouse_id?: string;     // ← 新增
  q?: string;
}, options?: { page?: number; pageSize?: number }): Promise<{ rows: AdjustmentListRow[]; totalCount: number }>;

// 既有、擴 returns
export async function getExceptionsPageData(...): Promise<{
  rows: AdjustmentListRow[];
  totalCount: number;
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
}>;

// 新增
export type AdjustmentLine = {
  item_id: string;
  qty_delta: number;
  unit_cost: number;
  serial_no?: string | null;
  batch_no?: string | null;
  bin_id?: string | null;
  notes?: string | null;
};

export type CreateAdjustmentInput = {
  type: "exception_in" | "exception_out" | "damage" | "manual" | "other";
  warehouse_id: string;
  reason: string;
  notes?: string | null;
  lines: AdjustmentLine[];
};

export async function getAdjustmentById(id: string): Promise<{
  adj: AdjustmentListRow;
  lines: Array<AdjustmentLine & { id: string; line_no: number; line_amount: number; item_code: string; item_name: string }>;
} | null>;

export async function getNewAdjustmentFormData(): Promise<{
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  items: Array<{ id: string; code: string; name: string; base_uom: string | null }>;
}>;

export async function createAdjustment(input: CreateAdjustmentInput): Promise<Result<{ id: string; adj_no: string }>>;
export async function voidAdjustment(id: string, reason: string): Promise<Result<{ id: string }>>;
```

每個函式 Day 1 直連 supabase。create/void 跨表事務（adjustments + lines + stock_items）用單一 helper、序列寫入 + map-error。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| createAdjustment（exception_in / damage_in / manual+） | INSERT inventory_adjustments + lines；新增 stock_items row（qty=qty_delta, status='available'）；revalidatePath balance + exceptions | ✓ |
| createAdjustment（exception_out / damage_out / manual-） | INSERT inventory_adjustments + lines；扣 stock_items FIFO（指定 serial/batch 優先）；revalidatePath | ✓ |
| voidAdjustment | UPDATE status='cancelled'；回沖 stock_items 異動 | [需確認] — Q3 拍板 |
| createAdjustment | 不寫 stock_receipts / stock_issues type='exception'（廢棄舊路線） | ✓ |
| createAdjustment | 不推 LINE 通知（單據量大不需推送） | ✓ |
| createAdjustment | gl_posted=false（不接 GL；Stage 3 Q4 拍板是否進） | [需確認] |

⚠️ **既有 `exceptionMoveAction` 不刪、但走 obsolete**：留作 audit。新版 UI 不再 call。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 例外出入庫 list | `/parts/operations/exceptions` | List View + DataGrid | `parts/issue/repair-pick/_components/repair-pick-board.tsx` |
| 詳情 | `/parts/operations/exceptions/[id]` | Page View（唯讀）| `parts/issue/repair-pick/[id]/_components/repair-pick-detail-view.tsx` |
| 新增（同頁兩步驟）| `/parts/operations/exceptions/new` | New Form | `parts/issue/internal-sale/new/_components/new-internal-sale-form.tsx` |

## 6. nav_nodes

**不動**：`/parts/operations/exceptions` 路徑保留、nav_node 已 `react_route`。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新建 DB 表 | `inventory_adjustment_lines`（apply_migration）|
| 改 | `src/domain/adjustments.ts`（大量 append）|
| 改 | `src/lib/database.types.ts`（generate_typescript_types 重生）|
| 改 | `src/app/(workspace)/parts/operations/exceptions/page.tsx`（接 pagination + filter）|
| 改 | `src/app/(workspace)/parts/operations/exceptions/_components/exceptions-board.tsx`（重寫 DataGrid）|
| 新 | `src/app/(workspace)/parts/operations/exceptions/[id]/page.tsx`|
| 新 | `src/app/(workspace)/parts/operations/exceptions/[id]/_components/exception-detail-view.tsx`|
| 新 | `src/app/(workspace)/parts/operations/exceptions/new/page.tsx`|
| 新 | `src/app/(workspace)/parts/operations/exceptions/new/_components/new-exception-form.tsx`|
| 新 | `scripts/pw-smoke-exceptions.mjs`|
| 刪 | `src/app/(workspace)/parts/operations/exceptions/_components/exception-form.tsx`（孤兒）|

## 8. Verification

1. list 顯示 inventory_adjustments rows、DataGrid + 4 filter + pagination
2. ＋ 新增調整 → 兩步驟 form → submit 後 list 跳 detail + balance 數字反映
3. 詳情 KV grid 完整、lines table 顯示明細 + 對應 stock_items 連結
4. exception_out 走 FIFO 扣庫存（指定 serial_no 時優先扣指定）
5. tsc / eslint / 天條 audit 0 hit
6. Playwright smoke 3 url（list / new / detail [若有資料]）

## 9. 開放問題（Stage 3 拍板）

- **Q1 過帳流程**：(a) 建單即過帳（exceptionMoveAction 模式、簡單，**推薦**）/ (b) 加 draft → pending → approved → posted workflow（適合金額大的調整、要審批）
- **Q2 取消（void）行為**：(a) 過帳後可作廢、自動回沖 stock_items（**推薦**）/ (b) 過帳後不可作廢（要改就重開反向調整單）/ (c) 過帳後不可作廢且 lock metadata
- **Q3 GL 記帳**：(a) gl_posted=false 暫不接 GL（**推薦** — POC 階段，accounting 模組另案）/ (b) createAdjustment 同時寫 gl_journal_entry
- **Q4 出庫指定 serial/batch**：(a) lines.serial_no 必填（強制 serial-tracked 商品要指定）/ (b) lines.serial_no 選填、空時走 FIFO（**推薦**、跟 internal-sale/repair-pick 一致）

## 10. 不動 / 邊界

- `exceptionMoveAction` 不刪（留 obsolete、UI 不再 call）
- `inventory_adjustments` 既有 typed schema 不動（已涵蓋）
- 不動 nav_nodes
- 不接 GL（除非 Q3 改）
- 不推 LINE
