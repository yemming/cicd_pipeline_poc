# Architecture Reference — Domain Helper + Typed Core + JSONB Metadata

DealerOS POC 階段資料存取架構規格。階段 1-2 分析時必讀。

## 三個演員

```
UI 頁面（src/app/**/*.tsx）
       │ import & 呼叫
       ▼
Domain Helper（src/domain/*.ts）   ← 業務動作的單一入口、實作可隨時換
       │ 內部寫法自由：直連 / RPC / server action
       ▼
Supabase / Postgres                ← Typed core columns + metadata jsonb
```

**Domain Helper 不過網路、不是 endpoint**。它是 TypeScript 模組、跟 UI 同 process、build 完直接 inline 進 bundle。零 round-trip 成本。

## 三件套

### 1. Domain Helper（facade pattern）

每個業務領域一個檔：

```
src/domain/
  org.ts          —— addRegion / addStore / addWarehouse / list*  / get*
  procurement.ts  —— listPurchaseReturns / createPurchaseReturn / approvePurchaseReturn
  inventory.ts    —— ...
  rules.ts        —— listRulesByKind / getApplicableRule / upsertRules
```

UI 永遠只 `import { addStore } from '@/domain/org'`。Helper 內部最簡單形式：

```ts
// src/domain/org.ts —— Day 1
import { createClient } from '@/lib/supabase/client'

export async function addStore(input: AddStoreInput) {
  const supabase = createClient()
  const { name, code, region_id, store_type, ...rest } = input
  return supabase.from('organizations').insert({
    type: 'store',
    name, code, region_id, store_type,
    metadata: rest,   // 還沒想好的欄位先丟這
  }).select().single()
}
```

升級路徑（UI 完全不動）：

| 階段 | 內部實作 | 何時升級 |
|---|---|---|
| Day 1 | `supabase.from(...).insert(...)` 直連 | POC 早期、單表簡單寫入 |
| Day 30 | `supabase.rpc('xxx', ...)` 跨表事務 | 發現要原子化寫多表 |
| Day 60 | `await createStoreAction(...)` 走 server action | 要推 LINE / 寫 audit / 套業務規則 |

### 2. Typed Core + JSONB Metadata

每張表都長這樣：

```sql
CREATE TABLE <entity> (
  id uuid PRIMARY KEY,
  brand_id text,
  -- ↓ Typed core columns（穩定、會被 RLS / FK / 報表用）
  type text,
  code text,
  name text,
  is_active boolean,
  -- ↓ JSONB metadata（變動中、單頁專用、純顯示）
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

升降級規則：

1. 形狀穩 / 報表會用 / 要 index / 要 FK → typed column
2. 形狀還在變 / 單頁專用 / 純顯示 → metadata jsonb
3. metadata 某 key 被三頁以上用 → 一條 ALTER TABLE promote 成 typed column（domain helper 內部把它從 rest 拆出來，UI 不動）

### 3. 規則類用 `business_rules` 一張打天下

> ⚠️ **先區分 RBAC 還是業務規則**：看到「為 role 設定能 / 不能 boolean 授權」的設定頁不要直接走 `business_rules`。先檢查 `permissions` 表 + `PERMISSIONS` 常數，能對映 RBAC 就走 RBAC SSOT 或同步雙寫；`business_rules` 只接「量化規則 / workflow / 業務參數」這類非 boolean 設定。

| 設定類型 | 走的 SSOT |
|---|---|
| boolean 授權（角色能 / 不能做某事） | RBAC `role_permissions`（`/admin/navigation?tab=permissions` 顯示的那個） |
| 量化規則（金額、數量、閾值） | `business_rules` |
| workflow / 流程描述 | `business_rules` |
| 同時是授權又是業務規則 | 兩處同步雙寫、`src/domain/rbac.ts` facade 統合（範例：`/parts/setup/item-permissions`） |

**判斷三步**（看到 HTML / 截圖 / 文字描述時）：
1. boolean「能 / 不能」？ → RBAC 候選，去 `permissions` 找對應 code、缺就 INSERT 補
2. 量化值（金額、數量、閾值）？ → `business_rules`
3. workflow / 流程描述？ → `business_rules`

採購權限規則 / 盤點回傳規則 / 告警階層 / ABC 分類… 全用同一張表 + 不同 `rule_kind` + `config jsonb`：

```sql
CREATE TABLE business_rules (
  id uuid PRIMARY KEY,
  brand_id text,
  rule_kind text,             -- 'purchase_authority' / 'approval_workflow' / 'inventory_threshold'
  scope_subsidiary_id uuid,   -- 規則綁哪個法人（null = 全集團）
  scope_role_code text,       -- 規則綁哪個角色（null = 全角色）
  config jsonb,               -- ⭐ 規則內容隨業務長
  is_active boolean,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON business_rules (brand_id, rule_kind, is_active);
```

採購權限規則一筆 row：

```json
{
  "rule_kind": "purchase_authority",
  "scope_role_code": "store_manager",
  "config": {
    "max_single_amount": 100000,
    "max_monthly_amount": 500000,
    "require_supervisor_approval": false
  }
}
```

統一走 `src/domain/rules.ts`：

```ts
listRulesByKind(rule_kind: string, filter?)
getApplicableRule(rule_kind: string, scope: { role?: string; subsidiary?: string })
upsertRules(rules: BusinessRuleInput[])
```

## RLS（brand-aware，必做）

每張業務表都要 4 條 RLS policy（沿用 memory「多品牌 Schema Pattern」）：

```sql
-- 假設 user_has_brand(brand_id text) function 已存在
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_select" ON <table>
  FOR SELECT USING (user_has_brand(brand_id));

CREATE POLICY "<table>_insert" ON <table>
  FOR INSERT WITH CHECK (user_has_brand(brand_id));

CREATE POLICY "<table>_update" ON <table>
  FOR UPDATE USING (user_has_brand(brand_id))
  WITH CHECK (user_has_brand(brand_id));

CREATE POLICY "<table>_delete" ON <table>
  FOR DELETE USING (user_has_brand(brand_id));
```

`business_rules` 也適用。

## 唯一紀律

> **UI / page / component / hook 禁止 `import { createClient } from '@/lib/supabase/...'`。**
> **所有讀寫只透過 `@/domain/*` helper。**

POC 階段純靠紀律、不加 lint guard。階段 4 落地時：`grep -r "from '@/lib/supabase" src/app` client component 應為 0。

## 既有 server actions 處置

`src/lib/master-data/org-actions.ts` 等既有 server actions **不刪、不強用**：

- 這次新建頁面 → 走 domain helper、直連 supabase
- 未來 helper 升級到「需要副作用」階段 → helper 內部 `await createStoreAction(...)` reuse

## 紀律邊界（什麼時候違反 OK）

- Domain helper 內部要 import supabase server / client → ✅ OK，這是它的工作
- Server action（`*-actions.ts`）內部要 import supabase server → ✅ OK
- Server component（page.tsx）讀資料時透過 domain helper 的 list* function → ✅ 推薦
- Server component page.tsx 偷偷直連 supabase 讀資料 → ❌ 應走 `@/domain/*`
- Client component button onClick 直接 `supabase.from(...).insert(...)` → ❌ 必須走 `@/domain/*`

## 第四件套：會計事件 engine（業務 → 自動分錄）

從 2026-05-12 起新增。任何業務動作只要會產生資金 / 庫存 / 收入 / 費用 / AR / AP 變動，**都是會計事件**，要透過 engine 接到 journal_entries。

### 接點

```
業務模組 server action（POS 結帳 / 採購收料 / 銷售交車⋯）
       │ 結尾用 next/server 的 after() 非阻塞呼叫
       ▼
@/domain/transactions.ts  ← facade（UI 用、不是 endpoint）
       │
       ▼
@/lib/accounting/instantiate-engine.ts  ← 解 gl_template、resolve coa、產分錄
       │
       ▼
journal_entries + journal_entry_lines (status='draft' 或 'posted')
```

### 設計原則

- **業務模組不認 COA**：只認 `instantiateTransaction(typeCode, ctx)` 一個 function
- **改科目對映只動主檔欄位** — items.gl_revenue_coa_id / vehicle_models.gl_cogs_coa_id 等；業務 code 不動
- **新增業務動作 = 新增 transaction_type seed**：跟業務 schema 一起 review、一起 落地

### Phase 2 提案必填 section

每份 `feature-{slug}.md` 提案的「5. 會計事件分析」必須列：

1. 本功能會產生哪些會計事件（N 個）
2. 對應的 `transaction_type` code（已 seed 或待新增）
3. ctx 需要哪些欄位
4. 觸發位置（哪個 server action 結尾接 `after()`）
5. cash_flow_section（operating / investing / financing）

若沒有任何會計事件，明寫「無 — 純資料維護 / 純查詢」。

### Reference docs

- `docs/proposals/accounting-relations-architecture.md` — 4 層架構、22 個 type 的設計藍圖
- `src/domain/transactions.ts` — facade + 已 seed 的 TX_TYPES const
- `src/lib/accounting/instantiate-engine.ts` — engine 實作
- DB tables：`transaction_types` / `tax_codes` / `system_accounting_settings` / `accounting_periods`
