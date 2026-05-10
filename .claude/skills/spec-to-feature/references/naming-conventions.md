# Naming Conventions

階段 2 提案時、階段 4 落地時必查。命名一致是未來自己 / 別人接手能看懂的根本。

## 模組命名（src/domain/*）

一個業務領域一個檔。命名照業務領域，不是技術領域。

| ✅ Good | ❌ Bad | 為什麼 |
|---|---|---|
| `src/domain/org.ts` | `src/domain/organizations.ts` | 短名好記、域名而非表名 |
| `src/domain/procurement.ts` | `src/domain/purchase-returns.ts` | 包採購相關全部（單據 / 退貨 / 合約）、不是一張表一檔 |
| `src/domain/inventory.ts` | `src/domain/stock.ts` | 用標準 ERP 術語 |
| `src/domain/rules.ts` | `src/domain/business-rules.ts` | 短即可 |
| `src/domain/feedback.ts` | `src/domain/tickets.ts` | 對應 product 模組名 |

**規則**：

1. 一個 domain 涵蓋同類業務（採購 / 庫存 / 會計），不是一張表一個檔
2. 用業務術語、不用技術術語
3. 全小寫 + kebab 或單字（不 camelCase）

## 函式命名（domain helper exports）

動詞 + 名詞。一致使用以下動詞：

| 動詞 | 用途 | 例 |
|---|---|---|
| `list` | 撈多筆（含 filter） | `listStores(filter)` / `listPurchaseReturns(filter)` |
| `get<X>ById` | 撈單筆 | `getStoreById(id)` |
| `add<X>` | 建一筆 | `addStore(input)` |
| `update<X>` | 改一筆（局部） | `updateStore(id, patch)` |
| `set<X><Property>` | 切布林 / 狀態 | `setStoreActive(id, ok)` / `setReturnStatus(id, status)` |
| `delete<X>` | 刪一筆 | `deleteStore(id)` |
| `upsert<X>` | upsert（規則類） | `upsertAuthorityRules(rules)` |
| `<verb><X>` 業務動詞 | 業務動作 | `approvePurchaseReturn(id)` / `cancelOrder(id)` |

**禁用**：`create*`（跟 React 類似 API 衝突）、`save*`（不夠精確：是 insert 還是 update？）、`fetch*`（暗示 HTTP 動作，跟 facade pattern 衝突）

## 路徑命名（src/app/(workspace)/...）

App Router 路徑要對應業務命名 + sidebar 顯示位置。

| 種類 | 路徑慣例 |
|---|---|
| 主檔 / 維度 | `/parts/setup/<entity>` 或 `/admin/master-data/<entity>` |
| 業務單據 | `/<module>/<entity>` 例 `/procurement/returns` / `/inventory/adjustments` |
| 設定 / 規則 | `/admin/setup/<rule-kind>` 例 `/admin/setup/purchase-authority` |
| 管理員後台 | `/admin/<area>/<entity>` |

詳情頁：`<list-path>/[id]`（dynamic route）
建立頁：**不開新頁**，list 用 inline modal、detail 用同頁 create-mode

`_components/` 慣例：
- `_components/<entity>-board.tsx`（List View 主元件）
- `[id]/_components/<entity>-detail-view.tsx`（Page View 主元件）

## 表命名（DB schema）

| 種類 | 命名 | 例 |
|---|---|---|
| 主檔 / 維度 | 複數名詞 | `organizations` / `subsidiaries` / `brands` / `warehouses` |
| 業務單據（header） | 複數名詞 | `purchase_orders` / `purchase_returns` / `journal_entries` |
| 業務單據（line items） | header 名 + `_items` | `purchase_order_items` / `purchase_return_items` / `journal_entry_lines` |
| 規則 / 設定 | `<kind>_<noun>` 或統一走 `business_rules` | `business_rules`（推薦） |
| Audit / 日誌 | `<entity>_audit_log` 或 `audit_log` | `audit_log` |
| 對映表 | `<a>_<b>_map` 或 `<a>_<b>` | `netsuite_dim_mapping` |

**通用欄位順序**（每張表都這樣排）：

```sql
CREATE TABLE <name> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  -- ↓ 業務 typed columns
  ...
  is_active boolean DEFAULT true,
  -- ↓ jsonb metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  -- ↓ 時間欄位
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## 欄位命名

| 種類 | 慣例 | 例 |
|---|---|---|
| 主鍵 | `id uuid` | - |
| 外鍵 | `<entity>_id uuid` | `store_id` / `original_po_id` |
| 業務代碼 | `<entity>_code` 或 `code` | `return_no` / `code` |
| 名稱 | `name` 或 `<entity>_name` | `name` / `legal_name` |
| 布林 | `is_<adj>` | `is_active` / `is_root` |
| 狀態 | `status text` | - |
| 時間 | `<verb>_at timestamptz` | `created_at` / `applied_at` / `approved_at` |
| 金額 | `<noun>_amount numeric(15,0)` | `total_amount` / `unit_price` |
| 數量 | `<noun>_count int` 或 `quantity numeric` | - |
| Tenant | `brand_id text` / `subsidiary_id uuid` | - |

**禁用**：camelCase 欄位（Postgres 強制 lowercase + underscore）、雙重前綴（`store_store_id`）、保留字（`type` 可以但要小心、`order` 不行）

## TypeScript Type 命名

```ts
// 輸入 type — Add/Update/Patch
export type AddStoreInput = { ... }
export type UpdateStorePatch = Partial<AddStoreInput>

// 回傳 type 用 supabase generate 的（database.types.ts）
import type { Database } from '@/lib/database.types'
type Store = Database['public']['Tables']['organizations']['Row']

// 結果型別（如果有 Result pattern）
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }
```

不要重複定義 supabase generate 已產的 type。

## 通知 event code 命名

走 notification hub 的 event code：

```
<entity>.<action>
```

例：

- `feedback_ticket.created` ✅（既有）
- `purchase_return.approved`
- `purchase_order.over_limit`
- `inventory.low_stock_alert`
- `journal_entry.posted`

**規則**：lowercase + dot + underscore，第一段 entity 跟表名對應。

## nav_nodes 命名

| 欄位 | 慣例 |
|---|---|
| `name` | 中文（顯示用）例「採購退貨」 |
| `icon` | Material icon name 例 `assignment_return` |
| `href` | `/<module>/<entity>` 例 `/procurement/returns` |
| `page_kind` | `react_route`（其他選項：`static_html` / `iframe` / `placeholder`） |

雙 brand 必補（`ducati` + `indian`），sort_order 排在邏輯鄰居附近。

## 提案 slug 命名

`docs/proposals/feature-{slug}.md` 的 slug：

- 從 HTML 檔名抽（`04_採購管理_採購退貨.html` → `procurement-returns`）
- 從 URL 抽（如果有）
- 從用戶描述抽（「採購退貨單」→ `procurement-returns`）

格式：lowercase + kebab-case + 可加日期 `feature-procurement-returns-2026-05-10.md`（避免重名）

## 既有規範 cross-reference

- 多品牌 schema：必加 `brand_id text` + 4 條 user_has_brand() RLS（memory 中已記）
- 會計維度語意：brand ≠ subsidiary（虛 vs 實統編，memory 中已記）
- COA 相關不擅自改：`docs/coa-spec/` 是參考規格、不是 migration（CLAUDE.md 中已寫）
- 通知模組：走 `notifications.dispatch()` + Next 16 `after()`（CLAUDE.md 中已寫）
