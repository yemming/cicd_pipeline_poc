---
feature: 採購權限規則
slug: purchase-permissions
date: 2026-05-10
stage: 架構提案（待用戶拍板）
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/01_基礎設定_採購權限規則.html
target_route: /parts/setup/purchase-permissions
---

# 提案：採購權限規則（基礎設定 / 組織與權限 1.2）

> 來源 HTML：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/01_基礎設定_採購權限規則.html`
> 目標路由：`http://localhost:3000/parts/setup/purchase-permissions`

## 1. 結構摘要

設定頁，單頁兩張並排 card：

- **左卡（角色採購權限）**：每個 role 一筆規則，欄位 = 角色 / 單筆上限 / 月累計上限 / 需主管審核（checkbox）。可編輯、按右上「儲存」一次寫回。
- **右卡（採購類型審核流程）**：3 段流程說明卡片（🟢 計畫 / 🟡 緊急 / 🔴 超額），描述 workflow 流向與通知方式。Phase 1 readonly。

這是 CLAUDE.md §資料存取架構提到的「規則類用 `business_rules` 一張打天下」第一張落地頁，也是 HANDOFF §Next Steps D 的第 1 項。

## 2. Schema 草案

### 新表（`business_rules`）

⚠️ CLAUDE.md 規格表，但 DB 還沒建。本次落地一併建。

```sql
CREATE TABLE business_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             text NOT NULL,
  rule_kind            text NOT NULL,                 -- 'purchase_authority' | 'purchase_workflow' | ...
  scope_role_code      text REFERENCES roles(id),     -- 規則綁哪個 role；NULL = 全角色
  scope_store_id       uuid REFERENCES organizations(id),  -- 規則綁哪個門店；NULL = 全 brand
  scope_subsidiary_id  uuid REFERENCES subsidiaries(id),    -- 預留
  config               jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id),
  updated_by           uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_business_rules_lookup
  ON business_rules (brand_id, rule_kind, is_active);

CREATE INDEX idx_business_rules_scope_role
  ON business_rules (rule_kind, scope_role_code) WHERE is_active = true;

-- updated_at trigger
CREATE TRIGGER set_business_rules_updated_at
  BEFORE UPDATE ON business_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS（4 條 user_has_brand）
ALTER TABLE business_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_rules_select" ON business_rules FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY "business_rules_insert" ON business_rules FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "business_rules_update" ON business_rules FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "business_rules_delete" ON business_rules FOR DELETE USING (user_has_brand(brand_id));
```

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `id` / `brand_id` | typed | PK + RLS tenant key |
| `rule_kind` | typed text | list filter / index 主軸 |
| `scope_role_code` | typed FK to roles | 報表 group by + RLS 友好 + 跨頁查詢 |
| `scope_store_id` | typed FK to organizations | 同上；NULL = 全 brand global |
| `scope_subsidiary_id` | typed FK to subsidiaries | 預留 multi-subsidiary，現階段 NULL |
| `is_active` / `sort_order` | typed | 列表 filter / 排序 |
| `config` | jsonb | 規則內容形狀隨 `rule_kind` 變，不可 typed |
| `metadata` | jsonb | 預留（描述、UI hint） |
| `max_single_amount` | jsonb 內 | 規則 config 子欄位、不單拉 typed（不同 rule_kind 不適用） |
| `max_monthly_amount` | jsonb 內 | 同上 |
| `require_supervisor_approval` | jsonb 內 | 同上 |

`config` 範例（`rule_kind = 'purchase_authority'`）：

```json
{
  "max_single_amount": 100000,        // null = 無上限
  "max_monthly_amount": 500000,       // null = 無上限
  "require_supervisor_approval": false
}
```

`config` 範例（`rule_kind = 'purchase_workflow'`，Phase 1 純顯示）：

```json
{
  "category": "planned",              // 'planned' | 'urgent' | 'overspend'
  "label": "🟢 計畫採購",
  "description": "倉管建立 → 門店主管審核 → 自動送出採購單",
  "steps": [
    { "label": "倉管提交", "kind": "done" },
    { "label": "主管審核", "kind": "navy" },
    { "label": "自動採購", "kind": "teal" }
  ],
  "tone": "neutral"                    // 'neutral' | 'amber' | 'red'
}
```

### Seed 資料（預設 7 個 role × Phase 1 全 brand global）

```sql
-- purchase_authority：每個 role 一筆，預設值依 HTML 推算
INSERT INTO business_rules (brand_id, rule_kind, scope_role_code, scope_store_id, config, sort_order)
VALUES
  -- ducati
  ('ducati', 'purchase_authority', 'warehouse',       NULL, '{"max_single_amount":10000,"max_monthly_amount":50000,"require_supervisor_approval":true}'::jsonb, 1),
  ('ducati', 'purchase_authority', 'manager',         NULL, '{"max_single_amount":100000,"max_monthly_amount":500000,"require_supervisor_approval":false}'::jsonb, 2),
  ('ducati', 'purchase_authority', 'purchaser',       NULL, '{"max_single_amount":null,"max_monthly_amount":null,"require_supervisor_approval":false}'::jsonb, 3),
  ('ducati', 'purchase_authority', 'owner',           NULL, '{"max_single_amount":null,"max_monthly_amount":null,"require_supervisor_approval":false}'::jsonb, 4),
  -- indian (同 4 筆 role)
  ('indian', 'purchase_authority', 'warehouse',       NULL, '{"max_single_amount":10000,"max_monthly_amount":50000,"require_supervisor_approval":true}'::jsonb, 1),
  ('indian', 'purchase_authority', 'manager',         NULL, '{"max_single_amount":100000,"max_monthly_amount":500000,"require_supervisor_approval":false}'::jsonb, 2),
  ('indian', 'purchase_authority', 'purchaser',       NULL, '{"max_single_amount":null,"max_monthly_amount":null,"require_supervisor_approval":false}'::jsonb, 3),
  ('indian', 'purchase_authority', 'owner',           NULL, '{"max_single_amount":null,"max_monthly_amount":null,"require_supervisor_approval":false}'::jsonb, 4);

-- purchase_workflow：3 段流程 seed（雙 brand）
INSERT INTO business_rules (brand_id, rule_kind, scope_role_code, config, sort_order)
VALUES
  ('ducati','purchase_workflow',NULL,'{"category":"planned","label":"🟢 計畫採購","description":"倉管建立 → 門店主管審核 → 自動送出採購單","tone":"neutral","steps":[{"label":"倉管提交","kind":"done"},{"label":"主管審核","kind":"navy"},{"label":"自動採購","kind":"teal"}]}'::jsonb, 1),
  ('ducati','purchase_workflow',NULL,'{"category":"urgent","label":"🟡 緊急採購","description":"倉管建立 → 主管即時審核（LINE 通知）→ 採購","tone":"amber","steps":[{"label":"緊急申請","kind":"pend"},{"label":"即時審核","kind":"pend"},{"label":"採購","kind":"teal"}]}'::jsonb, 2),
  ('ducati','purchase_workflow',NULL,'{"category":"overspend","label":"🔴 超額採購","description":"超過角色上限 → 上層主管審核 → 區域主管核准","tone":"red","steps":[{"label":"超額申請","kind":"red"},{"label":"區域主管","kind":"navy"},{"label":"核准採購","kind":"teal"}]}'::jsonb, 3),
  ('indian','purchase_workflow',NULL,'{"category":"planned","label":"🟢 計畫採購","description":"倉管建立 → 門店主管審核 → 自動送出採購單","tone":"neutral","steps":[{"label":"倉管提交","kind":"done"},{"label":"主管審核","kind":"navy"},{"label":"自動採購","kind":"teal"}]}'::jsonb, 1),
  ('indian','purchase_workflow',NULL,'{"category":"urgent","label":"🟡 緊急採購","description":"倉管建立 → 主管即時審核（LINE 通知）→ 採購","tone":"amber","steps":[{"label":"緊急申請","kind":"pend"},{"label":"即時審核","kind":"pend"},{"label":"採購","kind":"teal"}]}'::jsonb, 2),
  ('indian','purchase_workflow',NULL,'{"category":"overspend","label":"🔴 超額採購","description":"超過角色上限 → 上層主管審核 → 區域主管核准","tone":"red","steps":[{"label":"超額申請","kind":"red"},{"label":"區域主管","kind":"navy"},{"label":"核准採購","kind":"teal"}]}'::jsonb, 3);
```

> 範圍：seed `purchase_authority` 只塞 4 個業務常用 role（warehouse / manager / purchaser / owner）。剩 `service_advisor` / `technician` / `viewer` 不採購、不 seed；user 在 UI 可手動加。

## 3. Domain Helper 規劃

新檔 `src/domain/rules.ts`（CLAUDE.md 規格）：

```ts
export type BusinessRule = {
  id: string;
  brand_id: string;
  rule_kind: string;
  scope_role_code: string | null;
  scope_store_id: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PurchaseAuthorityConfig = {
  max_single_amount: number | null;
  max_monthly_amount: number | null;
  require_supervisor_approval: boolean;
};

export type PurchaseWorkflowConfig = {
  category: 'planned' | 'urgent' | 'overspend';
  label: string;
  description: string;
  tone: 'neutral' | 'amber' | 'red';
  steps: Array<{ label: string; kind: 'done' | 'navy' | 'teal' | 'pend' | 'red' | 'gry' }>;
};

// 通用 helper
export async function listRulesByKind(
  brandId: string,
  ruleKind: string,
  options?: { onlyActive?: boolean }
): Promise<BusinessRule[]>;

export async function upsertRule(input: {
  id?: string;
  brand_id: string;
  rule_kind: string;
  scope_role_code?: string | null;
  scope_store_id?: string | null;
  config: Record<string, unknown>;
  is_active?: boolean;
  sort_order?: number;
}): Promise<{ ok: true; data: BusinessRule } | { ok: false; error: string }>;

export async function deleteRule(id: string): Promise<{ ok: true } | { ok: false; error: string }>;

// 業務動詞 helper（採購授權專用）
export async function listPurchaseAuthorityRules(brandId: string): Promise<BusinessRule[]>;
export async function listPurchaseWorkflowRules(brandId: string): Promise<BusinessRule[]>;

// 批次儲存（左卡「儲存」按鈕）— 一次 upsert 多筆
export async function savePurchaseAuthorityRules(
  brandId: string,
  rules: Array<{ id?: string; scope_role_code: string; config: PurchaseAuthorityConfig }>
): Promise<{ ok: true; saved: number } | { ok: false; error: string }>;
```

實作策略（Day 1）：

- `listRulesByKind` / `listPurchaseAuthorityRules` / `listPurchaseWorkflowRules` → 直連 supabase server client `.from('business_rules').select(...).eq(...)`
- `upsertRule` / `deleteRule` / `savePurchaseAuthorityRules` → server action（要寫 audit `updated_by` + 跨筆 upsert，server side 才有 user 身份）

新檔 `src/lib/rules-actions.ts`（server actions，遵照 procurement Phase 1 的 `Result<T>` 慣例）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `savePurchaseAuthorityRules` | 純寫 `business_rules`；`updated_by = auth user` | 確定（Day 1 純 CRUD）|
| `savePurchaseAuthorityRules` | 推 LINE 通知「規則被誰改了」 | [Phase 2 後再做] |
| `savePurchaseAuthorityRules` | 寫 audit log | [需確認] 用戶要不要 |
| `deleteRule` | 純 DELETE（或 soft delete）| [需確認] hard / soft |
| 規則被「採購單建立」hooks 引用 | 跨模組消費（PO 建立時讀 `getApplicableRule('purchase_authority', { role })`）| [Phase 2 後再做]，本次只做設定頁 |

⭐ **Phase 1 範圍**：純設定頁的 CRUD。**不接**「採購單建立 → 走規則驗證 → reject 或加簽」業務邏輯（那是 Phase 2 procurement 模組的工作）。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 採購權限規則 | `/parts/setup/purchase-permissions` | **Setting Page**（不適用 List+Detail SOP）| 自製，套 design tokens |

頁面結構：

```
src/app/(workspace)/parts/setup/purchase-permissions/
├── page.tsx                            (server component, 撈兩個 rule_kind seed)
└── _components/
    └── purchase-permissions-board.tsx  (client component, 兩張 card 並排)
```

`<purchase-permissions-board>` 結構：

```
<main className="px-6 py-5 space-y-3">
  <header className="ph">
    <h1>採購權限規則</h1>
    <chip>1.2</chip>
    <span>依角色與門店設定採購金額上限與審核流程</span>
  </header>

  <Banner />  {/* 儲存成功 / 失敗 toast */}

  <div className="grid md:grid-cols-2 gap-4">
    {/* 左卡：角色採購權限 */}
    <Card title="🦁 角色採購權限" headerAction={<button onClick={save}>{pending ? '儲存中⋯' : '儲存'}</button>}>
      <Table>
        thead: 角色 / 單筆上限 / 月累計上限 / 需主管審核 / 操作
        tbody:
          - 每筆 rule 一 row
          - inline edit：上限欄 input（接受 NT$ 格式 + 「無上限」keyword）、checkbox toggle
          - 操作欄：刪除（紅小 button）
      </Table>
      <Toolbar>
        <QuickAddSelect placeholder="+ 新增角色（從 roles 表選）" options={remainingRoles} onPick={addRow} />
      </Toolbar>
    </Card>

    {/* 右卡：採購類型審核流程 */}
    <Card title="採購類型審核流程">
      {workflowRules.map(rule => (
        <FlowCard
          tone={rule.config.tone}
          label={rule.config.label}
          description={rule.config.description}
          steps={rule.config.steps}
        />
      ))}
    </Card>
  </div>
</main>
```

互動規範（CLAUDE.md §UX 互動規範）：

- 「儲存」按鈕：`pending` 時 disabled + 「儲存中⋯」、整張左卡 `pointer-events-none opacity-60`
- 樂觀更新：寫入成功後 banner 2.2s 自動消失、router.refresh
- 失敗：banner 紅底留著、欄位保留 user 輸入

不寫的：
- ❌ 不用 `<DataGrid>`（只有 4-7 row、不需 column visibility / sort / Excel I/O）
- ❌ 不做 Modal create / edit（單頁 inline 編輯就夠）
- ❌ 不做 detail page（這是 setting，不是 entity）

## 6. nav_nodes（兩 brand）

⚠️ **既存狀態**：Indian brand 已有 row（id `6206dbd9-5229-4a31-8e03-ecc2f78d178a`），page_kind=`react_route`、href=`/parts/setup/purchase-permissions`、level 3、sort 4、parent=`414f9635-...`（Indian「組織與權限」）。Ducati 還沒。

落地時：

```sql
-- Indian 已存在、不動
-- Ducati 補一筆（雙 brand 對齊）
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES ('ducati', '01b43c59-cbfd-4fac-b3f4-d0a8f5f3891b', 3, 4, '採購權限規則', '🦁', '/parts/setup/purchase-permissions', 'react_route', true, false);
```

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `supabase/migration` (apply_migration `business_rules` 表 + RLS + indexes + seed) |
| 重生 | `src/lib/database.types.ts` |
| 新增 | `src/domain/rules.ts` |
| 新增 | `src/lib/rules-actions.ts` (server actions) |
| 新增 | `src/app/(workspace)/parts/setup/purchase-permissions/page.tsx` |
| 新增 | `src/app/(workspace)/parts/setup/purchase-permissions/_components/purchase-permissions-board.tsx` |
| INSERT | `nav_nodes` Ducati row |

## 8. Verification（落地完手測）

1. **DB**: `SELECT * FROM business_rules WHERE brand_id IN ('ducati','indian') AND rule_kind='purchase_authority'` 預期看到 8 筆；`rule_kind='purchase_workflow'` 預期 6 筆
2. **頁面載入**: `/parts/setup/purchase-permissions` 雙 brand 都能進、左卡看到 4 row、右卡看到 3 流程
3. **Inline edit**: 改某 row 的單筆上限、按儲存 → banner ✓ 已儲存 → DB 對應 row config 更新
4. **新增 role**: 從 dropdown 選 `service_advisor` → 出現新 row → 改值 → 儲存 → DB 多 1 筆
5. **刪除 row**: 刪除 → 該 role row 消失 → DB 該筆消失
6. **空白上限**: 留空輸入解析成「無上限」（config.max_single_amount = null）→ 顯示時顯示「無上限」
7. **紀律檢查**: `grep -r "from '@/lib/supabase" src/app/\(workspace\)/parts/setup/purchase-permissions` = 0
8. **`tsc --noEmit`** 0 errors
9. **`eslint <touched paths>`** 0 errors

## 9. 開放問題（階段 3 拍板）

- [ ] **Q1 角色清單**：左卡 row 的「角色」欄要綁 `roles` 表（dropdown 從 owner/manager/purchaser/warehouse/service_advisor/technician/viewer 選）、還是讓 user 自由打 `scope_role_code` 字串？
- [ ] **Q2 scope_store_id**：HTML 副標寫「依角色與門店」但表內只有「角色」欄。Phase 1 要不要做 per-store override（每個 role × 每家店一筆規則）？還是先全 brand global（store_id=NULL）、Phase 2 再加？
- [ ] **Q3 採購類型審核流程（右卡）**：Phase 1 是純 readonly seed？還是做成 inline editable（增 / 改 / 刪 3 段流程）？
- [ ] **Q4 副作用 audit log**：規則變更要不要寫 audit log（誰改了哪筆、改前改後）？

提案存在 `docs/proposals/feature-purchase-permissions-2026-05-10.md`，請 review。
