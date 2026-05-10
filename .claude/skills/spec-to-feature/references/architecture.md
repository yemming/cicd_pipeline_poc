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
