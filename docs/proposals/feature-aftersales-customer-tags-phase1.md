# 提案：售後工單模組 — 12 客戶標籤主管設定（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/12_客戶標籤主管設定.html`
> 日期：2026-05-11
> 階段：架構提案（待用戶拍板）
>
> 姊妹分析：
> - `feature-aftersales-customers-vehicles-phase1.md`（09 人車檔案 — 消費端，已分析 `customer_tags` / `customer_tag_assignments` 表 + RBAC 落地討論）
> - `feature-aftersales-precheck-sa-phase1.md`（04 預檢 — 標籤顯示端）
> - `feature-aftersales-management-phase1.md`（07 售後管理 — 標籤顯示端）

---

## 1. 結構摘要

> 這是 **「售後主管」專屬的 setting page**，管理整個品牌通用的「客戶標籤字典」（dictionary）。SA 人員在 04 預檢 / 09 人車 / 02 RO 等下游頁面**只能選用此處定義的官方標籤、不可修改字典本身**；下游可以掛 / 卸的權限走 RBAC。

HTML 主要區塊（從 12_客戶標籤主管設定.html 抽出）：

1. **頁面 header banner**：「🔒 此頁面僅限『售後主管』權限操作。主管在此設定的官方標籤，SA 人員只能選用，不可修改或刪除。」 — 已點明這是 RBAC 護欄頁
2. **左欄 — 官方標籤管理**（read + delete UI）
   - 4 個分類 section：🔴 注意事項（高風險）/ 🟡 偏好習慣 / 🟢 服務備忘 / 🔵 費用／溝通偏好
   - 每筆 tag chip 顯示 emoji + 文字 + 鎖頭 `🔒`（locked）；非 locked 時顯示 `×` 可刪
   - top-right 顯示「共 N 個」總數
3. **右欄上 — 新增官方標籤**
   - select：4 色分類 dropdown
   - input：標籤文字（20 字以內）
   - button：「＋ 新增官方標籤」
   - 小註：新增後 SA 預檢單可選用
4. **右欄下 — 使用規則說明**（純文字）
   - 🔒 官方標籤（主管設定）：SA 可選用，不可移除
   - ✏️ 自訂標籤（SA 自行新增）：本人可移除，他人不可移除
   - 🌐 標籤來源：銷售接待、售後回廠均可添加，跨模組共用
   - ⚠️ 🔴 類標籤會在每次預檢顯示提醒

⚠️ **HTML 上的 confirm 對話框文案**「確認刪除官方標籤「X」？已使用此標籤的客戶不受影響，但未來 SA 無法再選用。」 → 暗示 **軟刪除**（is_active=false）而非真 DELETE，否則 `customer_tag_assignments` 會有 dangling FK。

---

## 2. entities / actions / kpis / implied_schema

### entities

```
customer_tags（官方標籤字典）— 由 09 人車檔案姊妹頁先建好 schema、本頁是 CRUD 介面端
  id uuid PK
  brand_id text                       -- 雙 brand 各自管理自己的標籤字典
  code text                            -- machine-readable，建議 'emotional_sensitive' 等；HTML 沒寫但跟既有慣例對齊
  label text                           -- '情緒敏感型'（HTML 顯示的中文）
  color text                           -- 'red' | 'amber' | 'green' | 'blue'
  emoji text                           -- '🔴' / '🟡' / '🟢' / '🔵'（由 color 衍生，但顯式存）
  category text                        -- 同 color 分類；也可用 color 直接代表
  is_active boolean                    -- 軟刪除（HTML 暗示）
  sort_order int                       -- 同色內排序（HTML 上目前是 array 順序）
  metadata jsonb                       -- e.g. { "remind_on_precheck": true, "icon_override": ... }
  created_at / updated_at / created_by
  UNIQUE (brand_id, label)             -- 同一品牌不重複同名

customer_tag_assignments（已由 09 人車檔案姊妹頁分析；本頁不直接操作）
  ...（見 feature-aftersales-customers-vehicles-phase1.md §1）
```

### actions（本頁專屬）

```ts
// src/domain/aftersales-customer-tags.ts（建議 facade；或併到 src/domain/master.ts 的 customers 區塊）

listOfficialTags(brand_id, filter?: { color?, is_active?, q? }) ⟶ CustomerTag[]
  source: customer_tags WHERE brand_id = ? ORDER BY color, sort_order
  HTML 上「載入時 render 4 個 section」觸發
  side_effects: 無

createOfficialTag(input: { color, label, sort_order?, metadata? }) ⟶ { id }
  HTML「＋ 新增官方標籤」按鈕觸發
  side_effects:
    - INSERT customer_tags (locked=true 暗示為「官方」)
    - 不推通知（純 master data）
  permission gate: customer_tag.dictionary.edit （見 §4 RBAC）

updateOfficialTag(id, patch: { label?, color?, sort_order?, metadata? })
  HTML 沒提供 edit UI，但落地階段建議補（避免「打錯字必須刪掉重建」）
  permission gate: customer_tag.dictionary.edit

deactivateOfficialTag(id) / activateOfficialTag(id)  ← 軟刪除/復活
  HTML「×」按鈕觸發；UI 文案「已使用此標籤的客戶不受影響，但未來 SA 無法再選用」→ 對應 is_active=false
  side_effects:
    - UPDATE customer_tags SET is_active=false
    - 不動 customer_tag_assignments（歷史指派保留）
  permission gate: customer_tag.dictionary.edit

reorderTags(brand_id, color, ids: string[])
  HTML 沒呈現拖拉但業務必要（4 色內各自排序、避免新增的永遠擠到最下）
  side_effects: batch UPDATE customer_tags.sort_order
  permission gate: customer_tag.dictionary.edit
```

### 下游 assign 動作（不在本頁，但與本頁協作）

> 本頁不處理 assign / unassign tag 到 customer，那是 09 人車檔案 / 04 預檢 SA 的責任。**本頁的 RBAC 設定會影響下游能不能 assign**。

```ts
// 由姊妹頁實作；本頁 §4 確認 RBAC 邊界後同步落地
assignTag(customer_id, tag_id, notes)        // permission: customer_tag.assign
removeTagAssignment(assignment_id)           // permission: customer_tag.unassign（複雜，見 §4）
```

### kpis

本頁不是看板，無 KPI；唯一展示型 metric：

```
- 官方標籤總數：COUNT(*) FROM customer_tags WHERE brand_id=? AND is_active=true
- 各色分項數：GROUP BY color
```

### implied_schema 變更

**1. 新表（兩張）**：
- `customer_tags` — 本頁是 owner 頁
- `customer_tag_assignments` — 09 人車檔案 owner

> 已在姊妹頁 09 人車檔案先分析。本頁不重複定義 schema，只**確認/補完**字典表欄位（特別是 `color` / `emoji` / `sort_order` / `is_active`）。

**2. 既有表（不動）**：
- `permissions` / `role_permissions` / `user_roles` — 補 4-5 個 permission code（見 §4）

**3. 不另開 `business_rules` row**：本頁的「鎖／不鎖」「能加／不能加」全是 boolean，**走 RBAC 不走 business_rules**（嚴格按 skill §禁區的判斷三步）。

### implied_pages

```
- kind: 'setting'    route: /aftersales/admin/customer-tags
  - 雙欄 layout（左字典 / 右新增 + 規則說明）
  - 4 個 color section（HTML 已分好）
  - admin-only：頁面 server component 第一步 requirePermission(CUSTOMER_TAG_DICTIONARY_EDIT)，無權限直接紅字 main
  - 樣板：parts/setup/control-types/_components/control-types-board.tsx
    （字典管理頁 + 4 色分組，跟既有 control-types 結構同型）

- 不需要 detail page：tag 字典欄位少（label + color + sort_order + is_active + metadata），inline edit + modal create 就夠
  → 例外於 design pattern 「list + detail 必須一起做」的明文豁免
    （CLAUDE.md SOP §邊界提到的「純資訊頁 / 字典頁」豁免；本頁就是字典）
```

---

## 3. 既有表盤點

| 表 | 狀態 | 動作 |
|---|---|---|
| `customer_tags` | ❌ 不存在 | **Phase 4 建表**（本頁 owner） |
| `customer_tag_assignments` | ❌ 不存在 | **Phase 4 建表**（09 人車檔案 owner） |
| `permissions` | ✅ 已存在 | INSERT 4-5 筆新 permission code（見 §4） |
| `role_permissions` | ✅ 已存在 | seed：把新 permission 預設綁給 `service_manager` / `admin` |
| `user_roles` | ✅ 已存在 | 不動（由現有後台管理） |
| `business_rules` | ✅ 已存在 | **不動**（本頁不寫此表） |

⚠️ 跟姊妹頁協作邊界：`customer_tags` schema 建議由「12 客戶標籤主管設定」(本頁) 負責 owner — 因為本頁是字典管理的入口；09 人車檔案只負責 `customer_tag_assignments` 與 join 讀。落地時兩頁同步進。

---

## 4. RBAC SSOT 整合策略（本頁核心）

### 4.1 為什麼走 RBAC、不走 business_rules

按 spec-to-feature skill §禁區的判斷三步：

| 設定點 | 性質 | 落腳 |
|---|---|---|
| 哪個角色能進此 setting page | boolean | RBAC `customer_tag.dictionary.edit` |
| 哪個角色能 assign 標籤到客戶 | boolean | RBAC `customer_tag.assign` |
| 哪個角色能 unassign 自己掛的 | boolean + 條件（owner） | RBAC（基本能力）+ 程式碼裡的 ownership check（不是 business_rule） |
| 哪個角色能 unassign 別人掛的 | boolean | RBAC `customer_tag.unassign.any` |
| 🔴 類標籤要在預檢顯示提醒 | 屬性（不是 role 能不能） | `customer_tags.metadata.remind_on_precheck` 或衍生規則（不需要 business_rules） |

**結論：4 個 boolean 全走 `permissions` 表；沒有任何項目落 `business_rules`。**

### 4.2 新增 permission code（PERMISSIONS 常數）

加在 `src/lib/rbac/permissions.ts`：

```ts
// ─── Service / 客戶標籤 ──────────────────────────
CUSTOMER_TAG_DICTIONARY_VIEW: "service.customer_tag.dictionary.view",
CUSTOMER_TAG_DICTIONARY_EDIT: "service.customer_tag.dictionary.edit",
CUSTOMER_TAG_ASSIGN:          "service.customer_tag.assign",
CUSTOMER_TAG_UNASSIGN_ANY:    "service.customer_tag.unassign.any",
// 注意：UNASSIGN_OWN 不開 permission — 走 ownership check（assignments.assigned_by = auth.uid()）
```

對應 DB seed（雙 brand 共用 `permissions` 表，因為 permission code 本身是全 tenant 一份）：

```sql
INSERT INTO permissions (code, label) VALUES
  ('service.customer_tag.dictionary.view', '查看客戶標籤字典'),
  ('service.customer_tag.dictionary.edit', '管理客戶標籤字典（新增/刪除/排序）'),
  ('service.customer_tag.assign',          '掛載客戶標籤'),
  ('service.customer_tag.unassign.any',    '移除他人掛的客戶標籤');
```

`role_permissions` seed（建議默認）：

| role | dictionary.view | dictionary.edit | assign | unassign.any |
|---|---|---|---|---|
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `service_manager` | ✅ | ✅ | ✅ | ✅ |
| `service_advisor` (SA) | ✅ | ❌ | ✅ | ❌（只能移自己掛的） |
| `sales` | ✅ | ❌ | ✅ | ❌ |
| 其他 | ❌ | ❌ | ❌ | ❌ |

### 4.3 「鎖標籤」(`locked` / `🔒`) 落地策略

HTML 上每個 chip 有 `locked: true` 屬性，但**這個欄位不存進 DB**：

**官方標籤 = 字典表的所有 row**（皆「鎖」對 SA 而言：只能選用、不能改字典本身）；
**自訂標籤 = SA 在 `customer_tag_assignments` 開放輸入的 free-text label**（用 `customer_tag_assignments.metadata.custom_label`，不寫進字典）。

也就是說：

| 機制 | 落地位置 |
|---|---|
| 「主管才能管理字典」 | `permissions.service.customer_tag.dictionary.edit` 守 server action |
| 「SA 自訂標籤可被自己移除、不可被別人移除」 | `customer_tag_assignments.assigned_by = auth.uid()` 自查 + `unassign.any` permission |
| 「官方標籤的 chip 顯示 🔒」 | UI 純展示，判斷規則：assignment.tag_id IS NOT NULL 就是官方；assignment.metadata.custom_label IS NOT NULL 就是自訂 |
| 「🔴 類標籤觸發預檢提醒」 | `customer_tags.metadata.remind_on_precheck = true` 或衍生（color='red' 自動 true）— 由 04 預檢 SA 頁讀取 |

> ⚠️ HTML 隱含「locked_for_role」（09 姊妹頁 §1 entities 有提）— 例如「情緒敏感型 ·售後主管🔒」意思是「只有售後主管能掛這個標籤」。這是更細的 per-tag RBAC，需階段 3 確認是否落地：
> - **方案 A**：開 `customer_tags.locked_for_role text` typed column；assign 時 facade 檢查 `current_user.role = tag.locked_for_role`（不夠 RBAC 但簡單）
> - **方案 B**：所有 tag 共用同一個 `customer_tag.assign` permission（簡化、放棄 per-tag 角色閘）
> - **方案 C**：用 `customer_tags.metadata.required_permission text` 動態指 permission code（最 RBAC、最複雜）
>
> 建議走 **方案 A**（match HTML 字面語意、簡單、若日後需求變細再升 C）。階段 3 拍板。

### 4.4 與既有 `/parts/setup/item-permissions` 的對比

既有 `PARTS_ITEM_*` 系列 permission 是「商品管理權限矩陣」— 一張 9-capability × N-role 的勾選表。本頁不是矩陣式設定頁，是字典 CRUD + RBAC 自動套用，所以**不需要在本頁做 capability matrix UI**（矩陣維護走既有的 `/admin/navigation?tab=permissions` 即可）。

---

## 5. Schema 草案（customer_tags 字典表）

```sql
CREATE TABLE customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  -- ↓ typed core
  code text,                                -- machine-readable，可選（label 已 UNIQUE）
  label text NOT NULL,
  color text NOT NULL CHECK (color IN ('red','amber','green','blue')),
  emoji text,                                -- 顯式存（避免前端 derive）
  category text,                             -- 可選；HTML 上 color 已等同 category，先留空欄位日後擴
  locked_for_role text,                      -- 階段 3 拍板（方案 A 落地時必有）
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  -- ↓ jsonb
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  --   { "remind_on_precheck": true, "tooltip": "...", "external_ref": ... }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (brand_id, label),
  UNIQUE (brand_id, code)
);

CREATE INDEX customer_tags_brand_color_active_idx
  ON customer_tags (brand_id, color, is_active, sort_order);

-- RLS (brand-aware × 4)
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_tags_select" ON customer_tags FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY "customer_tags_insert" ON customer_tags FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "customer_tags_update" ON customer_tags FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "customer_tags_delete" ON customer_tags FOR DELETE USING (user_has_brand(brand_id));
```

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `id` / `brand_id` / `label` / `color` | typed | 主鍵、租戶邊界、必查、CHECK |
| `code` | typed | machine-readable；UNIQUE 用 |
| `emoji` | typed | 顯式存（避免 color↔emoji map 散落 client） |
| `category` | typed (nullable) | 預留；目前 color 等同分類 |
| `locked_for_role` | typed (nullable) | 階段 3 拍板後若走方案 A 必開 |
| `is_active` | typed | 軟刪除查詢必 index |
| `sort_order` | typed | 排序查詢必 index |
| `metadata` | jsonb | `remind_on_precheck` / `tooltip` 等變動屬性 |
| `created_at` / `updated_at` / `created_by` | typed | 慣例 audit |

### 欄位選擇 vs `field-classification.md` 慣例

- 不開 `description` typed — 標籤本身 label 已是描述；需要備註丟 `metadata.tooltip`
- 不開 `external_ref` — 不對接 NetSuite / 第三方
- 不開 `tenant_id` / `subsidiary_id` — 標籤字典是 brand 層、不下分

---

## 6. Domain Helper 規劃

檔案：`src/domain/aftersales-customer-tags.ts`（新建）

```ts
"use server";  // 純 server-side facade
import { createServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';

export type CustomerTag = { id, brand_id, code, label, color, emoji, locked_for_role, is_active, sort_order, metadata, created_at, updated_at };

export async function listOfficialTags(filter?: { color?, q?, include_inactive? }): Promise<CustomerTag[]>;
export async function getOfficialTag(id: string): Promise<CustomerTag | null>;
export async function createOfficialTag(input: {...}): Promise<{ ok: true; data: { id } } | { ok: false; error: string }>;
export async function updateOfficialTag(id, patch): Promise<...>;
export async function deactivateOfficialTag(id): Promise<...>;
export async function activateOfficialTag(id): Promise<...>;
export async function reorderTags(color: string, ids: string[]): Promise<...>;
```

每個寫入 helper 內：
1. `requirePermission(PERMISSIONS.CUSTOMER_TAG_DICTIONARY_EDIT)` 第一行
2. 驗 input（label 1-20 char，color in enum）
3. supabase 直連 INSERT/UPDATE
4. 回 `Result<T>` 形態（不 redirect）

> ⚠️ `"use server"` 檔內**不能 export 非 async value**（skill §禁區第 7 條，已踩雷 3 次）。type alias 留檔內 OK，但若有 const enum / array → 拆 `aftersales-customer-tags.constants.ts`。本頁目前沒有這類常數，但 4 色 enum 若想集中（HTML 上有 `emojiMap` / `clsMap`），建議：

```
src/domain/aftersales-customer-tags.constants.ts
  export const TAG_COLORS = ['red','amber','green','blue'] as const;
  export const TAG_COLOR_EMOJI = { red: '🔴', amber: '🟡', green: '🟢', blue: '🔵' };
```

---

## 7. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createOfficialTag` | INSERT customer_tags | 確定 |
| `updateOfficialTag.label` | UPDATE；**不影響** 既有 `customer_tag_assignments`（assignments 透過 tag_id 關聯，不存 label snapshot） | 確定 |
| `deactivateOfficialTag` | UPDATE is_active=false；**不刪** assignments（HTML 文案明確說「已使用此標籤的客戶不受影響」） | 確定 |
| 改 color | 影響 04 預檢 / 09 人車的視覺呈現（chip 變色）— 純 derived，無資料層副作用 | 確定 |
| 改 `metadata.remind_on_precheck = true` | 04 預檢 SA 頁載入時的提醒 banner 邏輯改變 | 確定（純讀邏輯） |
| `reorderTags` | batch UPDATE sort_order；無外部副作用 | 確定 |

⚠️ 無 [需確認] — 本頁所有副作用都是純資料層 CRUD，不推 LINE、不跨表事務、不影響工單流程。

---

## 8. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 客戶標籤主管設定 | `/aftersales/admin/customer-tags` | Setting page（雙欄字典管理） | `parts/setup/control-types/_components/control-types-board.tsx` |

> ⚠️ **不做 detail page**（明文豁免：純字典頁、欄位少、inline edit + modal create 已足）。豁免依據：CLAUDE.md SOP §邊界「純資訊頁可以只做 list 配 readonly KV detail」+ skill 設計初衷。

頁面結構（照 HTML）：

```
<main className="px-6 py-5 space-y-3">
  <PageHeader title="客戶標籤主管設定" sprint="售後 #12" caption="管理售後 / 銷售共用的客戶標籤字典" />
  <Banner blue>🔒 此頁面僅限「售後主管」權限操作⋯</Banner>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
    {/* 左：字典管理 — 4 個 color section */}
    <SectionCard title="🏷 官方標籤管理">
      <ColorSection color="red"   label="🔴 注意事項（高風險）" tags={red} />
      <ColorSection color="amber" label="🟡 偏好習慣"       tags={amber} />
      <ColorSection color="green" label="🟢 服務備忘"       tags={green} />
      <ColorSection color="blue"  label="🔵 費用／溝通偏好" tags={blue} />
    </SectionCard>

    {/* 右：新增 + 規則說明 */}
    <div className="space-y-3">
      <SectionCard title="➕ 新增官方標籤">
        <form>...</form>
      </SectionCard>
      <SectionCard title="📋 使用規則說明">
        <ul>...</ul>
      </SectionCard>
    </div>
  </div>
</main>
```

互動：
- 點 chip 上的 `×` → confirm dialog → server action `deactivateOfficialTag(id)` → optimistic update
- 「＋ 新增官方標籤」按鈕 → `useTransition()` + 按鈕文案換「建立中⋯」+ disabled → 成功 banner / 失敗紅 banner
- (Phase 2 enhancement) chip 拖拉排序：用 dnd-kit；先不做

---

## 9. nav_nodes（雙 brand）

```sql
-- 「客戶標籤主管設定」應屬於「售後管理 → 設定」群組（或 admin 區）
-- 實際 parent_id 需查 SELECT id FROM nav_nodes WHERE name='售後管理' AND level=2;
-- 或考慮放到「系統設定 / 主檔字典」群組（雙 brand 都有）

-- 建議放：售後管理 (level=2) → 設定 / 字典 (level=3) → 客戶標籤主管設定 (level=4)
--        或 直接 售後管理 → 客戶標籤（與 01 預約 / 07 售後管理 / 10 工單查詢 同層）

INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('ducati', '<service-parent>', 3, <n>, '客戶標籤主管設定', 'sell', '/aftersales/admin/customer-tags', 'react_route', true, false),
  ('indian', '<service-parent>', 3, <n>, '客戶標籤主管設定', 'sell', '/aftersales/admin/customer-tags', 'react_route', true, false);
```

擺位選項（階段 3 拍板）：
- **A**：跟 01-11 售後子頁同層（`售後管理 → 客戶標籤主管設定`）— 業務人員找得到
- **B**：藏在 admin 區（`系統設定 → 主檔字典 → 客戶標籤`）— 強調「主管才操作」
- **建議走 A**（HTML header banner 已用 RBAC 守，nav 上隨便露不會被 SA 誤觸）

icon 建議：`sell` / `local_offer` / `bookmark`

---

## 10. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/aftersales-customer-tags.ts` |
| 新增 | `src/domain/aftersales-customer-tags.constants.ts`（若需 enum 集中） |
| 新增 | `src/app/(workspace)/aftersales/admin/customer-tags/page.tsx` |
| 新增 | `src/app/(workspace)/aftersales/admin/customer-tags/_components/customer-tags-board.tsx` |
| 改 | `src/lib/rbac/permissions.ts`（新增 4 個 permission code） |
| Migration | `customer_tags` 建表 + 4 RLS（雙 brand）|
| Migration | `permissions` INSERT 4 筆 + `role_permissions` seed（admin / service_manager / SA / sales） |
| Migration | `nav_nodes` INSERT 雙 brand |

---

## 11. Verification（落地完手測）

1. **權限閘**：非 service_manager 登入 → 開頁應紅字 main「無權限」；service_manager 登入 → 看到雙欄 layout
2. **字典 CRUD**：新增「測試標籤」→ 顯示在對應 color section；點 × → confirm → 列表消失（is_active=false）；DB SELECT 確認 is_active=false（不是 DELETE）
3. **跨頁共讀**：09 人車檔案 / 04 預檢 SA 的標籤 dropdown 應立刻顯示新建的「測試標籤」（共讀 customer_tags 字典）
4. **assignment 不受影響**：先 assign「測試標籤」到某客戶 → 字典端 deactivate → 09 人車頁該客戶仍顯示此標籤 chip（但 dropdown 不再可選）
5. **雙 brand 隔離**：ducati 建的標籤在 indian brand 下看不到（RLS 驗證）
6. **jsonb metadata**：UPDATE `metadata = '{"remind_on_precheck":true}'` → 04 預檢頁該客戶若掛此標籤，顯示提醒 banner
7. **`"use server"` 紀律**：`grep -r "from '@/lib/supabase" src/app/(workspace)/aftersales/admin/customer-tags` → 0 hits（UI 不直連）
8. `npx tsc --noEmit` / `npx eslint <touched>` 0 errors
9. RBAC seed 驗：`SELECT * FROM role_permissions WHERE permission_code LIKE 'service.customer_tag.%'` 4 列 × N roles

---

## 12. 開放問題（階段 3 拍板）

- [ ] **Q1 — `locked_for_role` 落地策略**：方案 A（typed column）/ B（不開）/ C（metadata 動態 permission code）？
   - 建議：A，最 match HTML 字面語意、簡單，未來需求變細再升 C

- [ ] **Q2 — nav_nodes 擺位**：A（與 01-11 同層）/ B（藏 admin 區）/ C（兩處都掛）？
   - 建議：A

- [ ] **Q3 — 是否補 `updateOfficialTag` UI**：HTML 沒有 edit 介面，但實務上「打錯字必須刪掉重建」很差。要不要加 inline edit（雙擊 chip 變 input）或編輯 modal？
   - 建議：加 inline edit（單機 chip 變 input、Enter 儲存、Esc 取消）

- [ ] **Q4 — 是否補拖拉排序**：HTML 沒有，但新增的永遠擠最下面 UX 很差。Phase 1 還是 Phase 2 做？
   - 建議：Phase 2（先用 sort_order = max+1 落地，UI 不開）

- [ ] **Q5 — 預檢提醒邏輯**：🔴 類標籤是否自動 `remind_on_precheck = true`，還是 per-tag 可以關掉？
   - 建議：color=red 預設 true（DB 不存、04 預檢頁判斷 color），單筆可在 metadata 覆寫關掉

- [ ] **Q6 — RBAC seed 預設**：sales（銷售）也能 `customer_tag.assign` 嗎？HTML §3「標籤來源：銷售接待、售後回廠均可添加」暗示是
   - 建議：是，sales 也給 `assign` permission；只有 `dictionary.edit` 鎖 service_manager + admin

- [ ] **Q7 — 字典刪除 vs 軟刪除**：是否補真 DELETE（FK CASCADE 到 assignments）？
   - 建議：**不補**，永遠軟刪除，與 HTML 文案一致

---

## 13. 總結 — 「字典 vs 授權」落地策略

| 層次 | 落地位置 | 為什麼 |
|---|---|---|
| **字典本身**（label / color / emoji / metadata） | `customer_tags` 新表 | master data，dictionary pattern，brand-aware |
| **誰能管理字典**（boolean） | `permissions.service.customer_tag.dictionary.edit` | RBAC SSOT；本頁 page-level gate |
| **誰能掛標籤**（boolean） | `permissions.service.customer_tag.assign` | RBAC；下游 09 / 04 頁 server action gate |
| **誰能移除別人掛的**（boolean） | `permissions.service.customer_tag.unassign.any` | RBAC |
| **誰能移除自己掛的** | ownership check (`assigned_by = auth.uid()`) | 不是純 boolean，程式碼裡判斷 — 但**不是 business_rule** |
| **某 tag 限定哪個 role 才能掛**（per-tag） | `customer_tags.locked_for_role` typed column（方案 A） | 程式碼判斷 `current.role = tag.locked_for_role`；不是 RBAC permission（因為是 per-row 規則） |
| **🔴 類標籤觸發預檢提醒** | `customer_tags.metadata.remind_on_precheck` + 04 預檢頁衍生邏輯 | 不是規則、不是權限，是顯示屬性 |

**RBAC SSOT 整合方式**：
1. 4 個新 permission code 加進 `src/lib/rbac/permissions.ts`（與既有 PARTS_ITEM_* / RO_* 命名慣例一致）
2. 既有 `requirePermission()` / `hasPermission()` policy helper 直接 reuse，不需新建 `src/domain/rbac.ts` facade
3. `customer_tags.locked_for_role` 是 per-row 規則（不是 role-permission 矩陣的格子），所以 typed column；不另開 `business_rules` row（避免規則散兩處）
4. 既有 `/admin/navigation?tab=permissions` 的 role × permission 矩陣 UI 自動覆蓋這 4 個新 permission（不需新建管理頁）

**不走 business_rules 的理由**（重申 skill §禁區）：
- 本頁所有設定要嘛是 boolean（→ RBAC）、要嘛是字典屬性（→ typed column / jsonb）
- 沒有「金額閾值」「數量上限」「workflow 流程」這類 business_rule 的本職工作
- 強行套 business_rules 會讓「字典屬性」散到兩張表、查詢複雜度爆增、permission 雙寫風險高
