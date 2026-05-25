# 提案：員工角色主檔 + 員工/技師雙主檔串接

> 來源：用戶口頭描述（派工看板新增技師為 free text、員工主檔 position 亂跑 10 種寫法）+ Ming 口頭拍板（角色清單要動態可 CRUD）
> 日期：2026-05-25
> 階段：架構提案（待 Ming 拍板）

## 1. 結構摘要

把現在「員工主檔（`employees`）」跟「技師主檔（`aftersales_technicians`）」兩張零 FK 的孤島接起來，並在 `employees` 上加結構化的「員工角色」標籤（取代 free text `position` 當系統判斷依據）；角色清單本身是**動態可 CRUD 的主檔表**（後台維護、後人能自行新增/改/刪），不寫死 enum。順手把派工看板「＋ 新增技師」改成「從員工挑」、user_id 帳號綁定 UI 也補上。

**核心解的問題**：
- 派工看板 SA-004 陳建明 vs 員工檔 SA-004 陳建明系統不知道是同一人 → 加 FK
- `employees.position` 13 人跑出 10 種寫法（光「技師」就 2 種變體）系統無法 query「誰是技師」 → 結構化 `role_codes text[]`
- /tech 工作台需要 user_id 綁定但無 UI、只能 SQL → 派工 modal 補綁定欄

---

## 2. Schema 草案

### 2.1 新表：`employee_role_types`（角色主檔，動態可 CRUD）

```sql
CREATE TABLE employee_role_types (
  -- typed core
  code text PRIMARY KEY,           -- 'technician' / 'sa' / 'sales_consultant'（程式用、英文 snake_case）
  name_zh text NOT NULL,           -- '技師' / '服務顧問' / '銷售顧問'（UI 顯示）
  name_en text,                    -- 'Technician'（可選，未來國際化）
  description text,                -- 用途說明（給後台維護者看）
  color text DEFAULT '#185FA5',    -- chip 顯示色（hex）
  icon text,                       -- material symbol 名稱（可選）
  sort_order int NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,  -- 系統核心角色（不可刪、可改顯示名）
  is_active boolean NOT NULL DEFAULT true,   -- soft delete
  suggested_rbac_role_id text,     -- 建議綁的 RBAC role（optional，給將來人事自動配權用）

  -- 變動緩衝
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_employee_role_types_active ON employee_role_types(is_active, sort_order);

-- 不分 brand：角色集團共用（雙 brand 不 dup）。若未來要 brand 限制再加 scope_brand_id。
-- 也不啟 brand-aware RLS，改用 admin-only RLS：
ALTER TABLE employee_role_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_role_types_select" ON employee_role_types
  FOR SELECT USING (auth.role() = 'authenticated');  -- 所有登入者可讀（下拉/UI 顯示用）
CREATE POLICY "employee_role_types_insert" ON employee_role_types
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');  -- 寫入靠 server action 的 requirePermission gate
CREATE POLICY "employee_role_types_update" ON employee_role_types
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "employee_role_types_delete" ON employee_role_types
  FOR DELETE USING (auth.role() = 'authenticated');
```

**初始 seed**（依現有員工 position 文字推導，標 `is_system=true` 防誤刪）：

| code | name_zh | is_system | 對應現有 position 文字 |
|---|---|---|---|
| `technician` | 技師 | ✓ | 技師 / 資深技師 |
| `workshop_manager` | 維修廠長 | ✓ | 維修廠長 |
| `sa` | 服務顧問 | ✓ | 售後接待 |
| `aftersales_lead` | 售後主管 | ✓ |（未來補）|
| `sales_consultant` | 銷售顧問 | ✓ | 銷售顧問 / 資深銷售顧問 |
| `rs_manager` | 業務經理 | ✓ | 業務經理 |
| `crm_agent` | 客服專員 | ✓ |（未來補）|
| `parts_specialist` | 零件專員 | ✓ | 零件專員 |
| `parts_manager` | 零配件主管 | ✓ | 零配件主管 |
| `warehouse` | 倉管 | ✓ |（未來補）|
| `stock_lead` | 庫存主管 | ✓ |（未來補）|
| `accounting` | 會計 |  |（未來）|
| `owner` / `manager` | 集團主管/店長 |  |（未來）|

⚠️ `is_system=true` 的不可硬刪、但可改 name_zh / color / icon / sort_order（後台 UI 把刪除按鈕 disable + tooltip 提示）。`is_system=false` 的自由 CRUD。

### 2.2 現有表變更：`employees` 加角色欄

```sql
ALTER TABLE employees ADD COLUMN role_codes text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX idx_employees_role_codes ON employees USING GIN(role_codes);
-- 軟 FK 不強制（避免角色主檔改 code 時被擋）；應用層用 listEmployeeRoleTypes() 過濾無效 code
```

**保留 `position text`（HR 職稱概念）**：「資深技師」「副理」這種人會看的職稱仍存 position；系統判斷「他是不是技師」只看 `role_codes`。兩層分工清楚。

### 2.3 現有表變更：`aftersales_technicians` 加 FK 員工

```sql
ALTER TABLE aftersales_technicians
  ADD COLUMN employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX idx_aftersales_technicians_employee ON aftersales_technicians(employee_id);
-- 暫時可空（向後相容老資料）、UI 新增技師必填、遷移後可考慮加 NOT NULL（Phase 2 再說）
```

**`name` / `code` 維持 denormalize**（不複寫表）：
- DB 還是各自存（派工看板要極短的 T1 顯示、員工檔要正式姓名）
- view-time join：domain helper `listAftersalesTechnicians()` 自動 join `employees(name as canonical_name, emp_code)` 一起回；UI 顯示哪個由 caller 決定
- 員工檔改名 → 派工 view 顯示自動跟著改、不靠 sync trigger（避免漂移）

### 2.4 欄位分類

#### `employee_role_types`

| 欄位 | 落腳 | 理由 |
|---|---|---|
| code | typed PK text | 程式判斷主鍵、`'technician' = ANY(role_codes)` 查 |
| name_zh | typed text | UI 顯示主欄、會排序 |
| name_en | typed text NULL | 未來國際化、形狀穩 |
| color | typed text | chip 渲染、單值穩 |
| icon | typed text NULL | material symbol、單值穩 |
| sort_order | typed int | order by 主欄 |
| is_system | typed boolean | UI 邏輯 gate（disable 刪除）|
| is_active | typed boolean | soft delete |
| suggested_rbac_role_id | typed text | 未來自動配權用、單值 |
| metadata | jsonb | 未來擴充用（圖示變體、額外屬性）|

#### `employees` 新欄

| 欄位 | 落腳 | 理由 |
|---|---|---|
| role_codes | typed text[] + GIN | 跨頁高頻查詢（派工看板、報表、權限 mapping）、Postgres array 原生 |

#### `aftersales_technicians` 新欄

| 欄位 | 落腳 | 理由 |
|---|---|---|
| employee_id | typed uuid FK | FK 完整性、join 員工檔顯示最新姓名 |

---

## 3. Domain Helper 規劃

### 3.1 新建 `src/domain/employee-roles.ts`

```ts
"use server";

export type EmployeeRoleType = {
  code: string;
  name_zh: string;
  name_en: string | null;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  suggested_rbac_role_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function listEmployeeRoleTypes(options?: {
  include_inactive?: boolean;
}): Promise<EmployeeRoleType[]>;

export async function getEmployeeRoleType(code: string): Promise<EmployeeRoleType | null>;

export async function createEmployeeRoleType(input: {
  code: string; name_zh: string; name_en?: string | null;
  description?: string | null; color?: string; icon?: string | null;
  sort_order?: number; suggested_rbac_role_id?: string | null;
}): Promise<EmployeeRoleType>;

export async function updateEmployeeRoleType(
  code: string,
  patch: Partial<Omit<EmployeeRoleType, "code" | "created_at" | "updated_at">>,
): Promise<EmployeeRoleType>;

/** soft delete — is_system=true 的拒絕、有員工在用的拒絕 */
export async function deactivateEmployeeRoleType(code: string): Promise<{ ok: boolean; error?: string }>;
```

伴生：`src/domain/employee-roles.constants.ts`（純常數 / 型別 alias，避免 `"use server"` 檔 export 非 async 值的雷）。

### 3.2 既有 `src/domain/aftersales-staff.ts` append

```ts
/** 給「派工新增技師」員工 dropdown 用 — 角色含 technician 的在職員工 */
export async function listTechnicianCandidateEmployees(): Promise<
  Array<{ id: string; emp_code: string; name: string; dept_id: string | null; current_tech_id: string | null }>
>;

/** 更新員工角色標籤 */
export async function updateEmployeeRoles(
  employee_id: string,
  role_codes: string[],
): Promise<{ ok: boolean; error?: string }>;
```

### 3.3 既有 `src/domain/aftersales-technicians.ts` append + 改造

```ts
/** listAftersalesTechnicians() 既有 — 內部多 join employees 取最新姓名（denormalize 不複寫表） */
// 既有簽名不變，回傳結構多 employee_canonical_name / emp_code

/** 派工新增技師改走這個（必填 employee_id） */
export async function createTechnicianFromEmployee(input: {
  employee_id: string;            // 必填、UI 從 dropdown 選
  code: string;                   // 派工短代碼（T1/T2，自動建議或人改）
  grade?: string | null;
  avatar_color?: string | null;
  sort_order?: number;
  user_id?: string | null;        // 順手綁帳號（可空）
}): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>;

/** 綁/解綁登入帳號 */
export async function bindTechnicianUser(
  technician_id: string,
  user_id: string | null,
): Promise<{ ok: boolean; error?: string }>;

/** auth.users 搜尋（給 user_id 綁定 UI；by email 模糊查；排除已綁過技師的 user）*/
export async function listAuthUsersForTechBinding(
  q?: string,
): Promise<Array<{ id: string; email: string; bound_technician_id: string | null }>>;
```

server actions（`src/lib/`）：
- `src/lib/admin/employee-role-actions.ts`（create/update/deactivate，requirePermission `MASTER_DATA_EDIT`）
- `src/lib/admin/employee-actions.ts` append `updateEmployeeRolesAction`
- `src/lib/aftersales/aftersales-technician-actions.ts` append `createTechnicianFromEmployeeAction` / `bindTechnicianUserAction`（requirePermission `RO_DISPATCH`）

---

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `deactivateEmployeeRoleType(code)` | 應檢查是否還有員工掛此 role_code，有就拒絕（或詢問是否強制清員工標籤）| ✅ 確定 — 防漂移 |
| `createTechnicianFromEmployee(employee_id)` | 同一員工已有 active aftersales_technicians row 應拒絕（避免一人多技師檔）| ✅ 確定 — 防重 |
| `updateEmployeeRoles(employee_id, [...])` | 若員工原為 technician 但新 role_codes 拿掉 technician，**應提示**他若還是 aftersales_technicians 行員工，繼續派工系統會混淆；不自動刪技師檔（破壞性過大）| [需確認] |
| `bindTechnicianUser` | user_id 必須未被綁過其他技師（唯一性）；綁定後該帳號登入 /tech 立即生效 | ✅ 確定 |

---

## 5. 會計事件分析

**無** — 本功能屬於主檔維護 / 串接層改造，不產生任何資金 / 庫存 / 收入 / 費用 / AR / AP 變動。

---

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 員工角色主檔（列表）| `/admin/master-data/employee-roles` | List View | `parts/setup/items/_components/items-board.tsx` |
| 員工角色主檔（詳情）| `/admin/master-data/employee-roles/[code]` | Page View | `parts/setup/items/[id]/_components/item-detail-view.tsx` |
| 員工角色主檔（新增）| `/admin/master-data/employee-roles/new` | Create Mode | 同 detail view、`initialMode="create"` |
| 員工主檔（既有改造）| `/admin/master-data/employees/[id]` | 加 role_codes 多選 chip 區段 | 原 detail-view 加新 section |
| 派工看板新增/編輯技師 modal | `/parts/aftersales/management/dispatch` | Modal 改造 | 既有 dispatch-dashboard 內 modal 加員工 dropdown + user_id 綁定欄 |

**非單據型** — 不需 Print Route。

---

## 7. nav_nodes（雙 brand）

```sql
-- 加在「List 主檔」群組底下、緊接「員工主檔」之後
WITH parent AS (
  SELECT id, brand_id FROM nav_nodes WHERE name='List 主檔' AND level=2
),
neighbor AS (
  SELECT n.brand_id, n.sort_order FROM nav_nodes n
  JOIN parent p ON n.parent_id = p.id
  WHERE n.name='員工主檔'
)
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
SELECT p.brand_id, p.id, 3, n.sort_order + 1, '員工角色', 'badge', '/admin/master-data/employee-roles', 'react_route', true, false
FROM parent p JOIN neighbor n USING (brand_id);

-- 同時把後面 sort_order >= n.sort_order+1 的節點 +1 騰位（按 SOP）
```

派工看板與員工主檔的入口已存在，無需新增。

---

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `supabase migration: create_employee_role_types` + `alter employees add role_codes` + `alter aftersales_technicians add employee_id` |
| 新增 | `src/domain/employee-roles.ts` + `src/domain/employee-roles.constants.ts` |
| 新增 | `src/lib/admin/employee-role-actions.ts` |
| 新增 | `src/app/(workspace)/admin/master-data/employee-roles/page.tsx` |
| 新增 | `src/app/(workspace)/admin/master-data/employee-roles/[code]/page.tsx` |
| 新增 | `src/app/(workspace)/admin/master-data/employee-roles/new/page.tsx` |
| 新增 | `src/app/(workspace)/admin/master-data/employee-roles/_components/employee-roles-board.tsx` |
| 新增 | `src/app/(workspace)/admin/master-data/employee-roles/[code]/_components/employee-role-detail-view.tsx` |
| 修改 | `src/domain/aftersales-staff.ts`（+ `listTechnicianCandidateEmployees` / `updateEmployeeRoles`） |
| 修改 | `src/domain/aftersales-technicians.ts`（+ `createTechnicianFromEmployee` / `bindTechnicianUser` / `listAuthUsersForTechBinding`，list 改 join employees） |
| 修改 | `src/lib/aftersales/aftersales-technician-actions.ts`（+ 對應 actions） |
| 修改 | `src/lib/admin/employee-actions.ts`（+ `updateEmployeeRolesAction`） |
| 修改 | `src/app/(workspace)/admin/master-data/employees/[id]/_components/employee-detail-view.tsx`（加 role_codes 多選 chip 區段、position 改副欄 placeholder「HR 職稱（給人看，非系統判斷）」）|
| 修改 | `src/app/(workspace)/parts/aftersales/management/dispatch/_components/dispatch-dashboard.tsx`（新增/編輯技師 modal 改：員工 dropdown 必填 + user_id 綁定欄）|
| 修改 | `src/lib/rbac/permissions.ts`（補 `MASTER_DATA_EDIT` 若無）|
| 一次性遷移腳本 | `supabase migration: backfill_employee_roles_and_technician_employee_id`（含 6 名技師 FK + 13 名員工 role_codes） |

---

## 9. Verification

落地完手測 checklist：

1. **角色主檔 CRUD**：新增「外包技師」角色（非 is_system）→ 設定 color/icon/sort_order → 員工主檔某員加此角色 → 派工看板「新增技師」員工 dropdown **不應**列出他（filter 是 `technician` 不是「外包技師」）
2. **is_system 防刪**：嘗試刪 `technician` → 拒絕 + UI 提示「系統內建角色不可停用」
3. **有員工在用拒刪**：嘗試停用「銷售顧問」（有 3 名員工掛）→ 拒絕 + 提示「請先把員工角色移除再停用」
4. **派工新增技師員工 dropdown**：只列 `is_active=true && 'technician' = ANY(role_codes)` 的員工，且 filter 出**尚未建技師檔**的（避免一人雙技師）
5. **user_id 綁定**：新增技師時填 email → 自動搜出 auth.user → 綁定 → 該帳號開 /tech 不再看「您的帳號尚未綁定技師」
6. **view-time join**：員工檔改 SA-004 陳建明名字為「陳建明（資深）」→ 派工看板技師卡顯示也跟著改（不靠 sync）
7. **遷移正確性**：跑遷移後查 `SELECT * FROM aftersales_technicians WHERE employee_id IS NULL` 應為 0；`SELECT * FROM employees WHERE 'technician' = ANY(role_codes)` 應含 SA-001/SA-004（原 position 含「技師」的 2 人）
8. **持久 fixture 完整**：`E2E-CROSS-RO-T1` 的 lead_technician_id 對應的技師 row 應已補 `employee_id`（不能因遷移破壞 E2E）
9. **天條**：`grep -rn "@/lib/supabase" "src/app/(workspace)/admin/master-data/employee-roles" "src/app/(workspace)/admin/master-data/employees" "src/app/(workspace)/parts/aftersales/management/dispatch"` = 0 hit
10. tsc 0 error、eslint 0 error
11. E2E 回歸：CROSS-01/02 仍綠（持久 fixture T1 未壞）

---

## 10. 開放問題（階段 3 拍板）

1. **`role_codes` 用 `text[]` 還是 junction table（`employee_role_assignments`）？**
   - 推薦 **`text[]` + GIN index**：POC 階段簡單、Postgres array 原生支援、查詢一行搞定（`'technician' = ANY(role_codes)`）；junction table 適合需要存 `assigned_at/assigned_by/expires_at` 的場景，目前用不上
   - 風險：text[] 軟 FK，角色主檔改 code 時不自動更新（要靠 app 層保護或「角色 code 一旦建立不可改、只能停用」規範）

2. **`employee_role_types` 是 global（不分 brand）還是雙 brand 各一份？**
   - 推薦 **global（不加 brand_id）**：技師/SA/業務這些角色定義集團共用、雙 brand 不 dup；若未來 ducati 想加「客製化角色」就加 `scope_brand_id text NULL` 欄
   - 影響：角色主檔頁不需要 brand 切換、RLS 改 admin-only（auth.role()='authenticated' 即可讀，寫靠 server action requirePermission）

3. **派工看板「新增技師」是否強制必選員工（拒絕「外部技師」）？**
   - 推薦 **強制必選**：POC 階段先嚴格，杜絕「沒員工的幽靈技師」；未來真有外包技師需求再加「allow_external_technician」設定
   - 影響：所有遷移後的 aftersales_technicians.employee_id 應該都有值（除非標 `metadata.external=true` 例外）

4. **一次性遷移要不要這輪做？**
   - 推薦 **這輪一起做**：6 名技師 + 13 名員工的人工 mapping，分開做反而要記兩次狀態；mapping 草案見下表
   - 風險：人工 mapping 有判斷成分（「業務經理」要不要同時掛 `rs_manager + sales_consultant`？），需 Ming 點頭
   - 替代：只做 schema + UI，舊資料保留 free text、`role_codes` 全空、員工/技師 FK 全 NULL，由 Ming 之後一筆筆透過新 UI 補

**遷移 mapping 草案（Indian 13 員工 → role_codes）**：

| emp_code | name | position（原） | 建議 role_codes |
|---|---|---|---|
| SA-001 / SA-004 | （技師） | 技師 / 資深技師 | `['technician']` |
| （售後接待 ×2）| | 售後接待 | `['sa']` |
| （銷售顧問 ×2 + 資深 ×1）| | 銷售顧問 / 資深銷售顧問 | `['sales_consultant']` |
| （業務經理）| | 業務經理 | `['rs_manager']`（不掛 sales_consultant，避免雙重身份）|
| （零件專員）| | 零件專員 | `['parts_specialist']` |
| （零配件主管）| | 零配件主管 | `['parts_manager']` |
| （維修廠長）| | 維修廠長 | `['workshop_manager', 'technician']`（兼任技師、可派工）|
| I-SAL-001~004 | （新建 SAL 4 人）| 業務經理 / 資深銷售顧問 / 銷售顧問 ×2 | 同上 |
| 1 人 position=null |  | — | `[]`（人工補）|

**6 名 aftersales_technicians → employee_id mapping**：依姓名 + dept_id（SVC）匹配。T1 陳建明 → employees.SA-004 陳建明（同名同部門）；其他 5 名同法。若有同名歧義（POC 階段不太可能），人工 review。

5. **角色主檔的 CRUD 權限走哪個 PERMISSIONS code？**
   - 候選 A：複用既有 `permissions` 中找一個現成的 master-data 權限（若有）
   - 候選 B：新增 `master_data.employee_role.edit`
   - 推薦 **新增**：權限粒度清晰、後續可獨立分配給 HR；同時授給現有 `manager` / `owner` 兩 role

6. **`updateEmployeeRoles` 把員工的 `technician` 拿掉時的行為**：
   - 候選 A：純改 role_codes、不動 aftersales_technicians（兩邊 desync 由 UI 警告）
   - 候選 B：自動把該員工的 aftersales_technicians.is_active=false（避免幽靈技師）
   - 候選 C：拒絕該操作、提示「請先到派工看板停用該技師再移除角色」
   - 推薦 **C**：最安全、防意外破壞；UI 跳對話框引導用戶到派工台
