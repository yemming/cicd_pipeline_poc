# 第二十二輪提案 — GRP20 組織架構設定

> 集團管理 · 系統設定層。spec：`docs/20260529/DealerOS_最終版本/05_集團管理/05_系統設定/GRP20_組織架構設定_v1.html`（1456 行）。副標：「管理集團組織層級、門店節點、人員指派與頁面權限」。**這是集團管理模組最後幾頁之一、也是工程量最大的真 CRUD 頁。**

## 0. 資料真相校驗（已實測 2026-05-31）

GRP20 不是 seed dashboard，**五層樹的每一層都是真表**：

| spec 樹層 | DB 表 | 列數 | GRP20 用得到的 typed 欄位 |
|---|---|---|---|
| 集團 | `groups` | 3 | id,name,code,group_type,parent_group_id,is_active,sort_order,tenant_uuid,settings |
| 法人 | `subsidiaries` | 6 | tax_id,legal_name,tax_registration_no,**netsuite_subsidiary_id,accounting_book_id**,currency_code,responsible_person,group_id,brand_id |
| 品牌 | `brands` | — | code,brand_type,parent_brand_id,display_name,logo_url,color_primary,color_secondary |
| 門店 | `organizations` | 17 | type,parent_id,brand_id,subsidiary_id,code,store_type,region,manager_name,address,phone |
| 部門 | `departments` | 35 | store_id,brand_id,subsidiary_id,code,cost_center,manager_employee_id |

- 人員指派 = **`user_assignments`**（真表）：user_id, role_id, role_code, scope_type, scope_id, store_id, department_id, brand_id, is_primary, valid_from/until, assigned_by。
- 角色 = `roles`（存在）；無 `user_roles`（user_assignments 即關聯表）。
- 頁面權限 = `nav_nodes`（permission / is_admin_only 欄）。
- GRP20「進階設定」(統編/稅籍/NetSuite對應/成本中心) → 直接對映 subsidiaries + departments.cost_center 既有欄，**零新欄位**。

**spec 結構**（1456 行）：
- 左：組織樹狀結構（集團/法人/品牌/門店/部門/團隊）+ 每節點 [新增子節點][編輯][停用][刪除]
- 右：節點詳情 = 基本資料（類型/名稱/代碼/上層/排序/狀態）+ 進階設定（NetSuite對應/成本中心/稅籍/統編）+ 顯示設定（圖示/主題色）
- 人員指派（新增/搜尋人員/角色/移除）
- 頁面權限矩陣（6 功能模組 × 檢視/編輯/審核/匯出/管理）+ [儲存權限設定]
- 節點統計（直屬子節點/指派人員/本月異動/建立時間/最後更新）+ 操作紀錄 + 危險操作（轉移節點/封存節點）

## 1. 兩個必須拍板的架構張力

### Q1 — 重疊處置：GRP20 vs 既有 admin 頁
`/admin/org`(brands/groups/stores CRUD)、`/admin/rbac`(roles)、`/admin/navigation`(nav 權限 + 人員角色指派) 已分散覆蓋 GRP20 約 8 成功能。三種做法：

- **方案 A（推薦）唯讀統一樹 + 深連結**：`/group/org-structure` 做「五層樹**唯讀總覽** + 節點詳情唯讀 KV + 人員/權限唯讀清單」，每個區塊放「→ 前往 /admin/org 編輯」深連結。集團高層要的是「**看懂整個組織長怎樣**」，CRUD 留在既有 admin 頁（避免兩套寫入邏輯打架）。工程量中、風險低、不重造輪子。
- **方案 B 全功能真 CRUD**：GRP20 自己做五層樹的 create/edit/delete/停用 + 人員指派寫入 + 權限矩陣寫入。完全照 spec，但要寫 5 entity 的 actions、跟 admin 頁兩套寫入並存（schema 改一次要追兩處）。工程量大、風險高。
- **方案 C 樹視圖 + 單層 CRUD**：樹唯讀總覽，但「節點詳情」那一欄開真編輯（改 name/code/sort/狀態/進階設定），create/transfer/archive 等結構性操作留 admin。折衷。

### Q2 — brand 在樹的位置（模型張力）
CLAUDE.md 維度模型：brand 是「**虛**（行銷層、不掛統編、cross-cutting）」，正規階層是 集團→法人→門店→部門；brand 走 Custom Segment 橫切。但 GRP20 spec 把 集團>法人>**品牌**>門店>部門 畫成線性樹。

- **方案 A（推薦）照真模型**：樹 = 集團 → 法人 → 門店 → 部門；brand 當門店/法人的「標籤 chip」顯示、不當樹層。符合 §維度模型對齊 MANDATORY。
- **方案 B 照 spec 線性**：硬把 brand 插在法人與門店間當樹層（但 brands 無乾淨的 subsidiary FK，organizations.brand_id 才有）。會跟財務維度模型打架。

### Q3 — 「團隊」層
spec 樹列了「團隊」但 DB 無 teams 表。建議：團隊 = department 的子分組（metadata）或直接省略（樹做到部門層為止）。

## 2. 架構（依 Q1 拍板調整）

```
src/domain/org-structure.ts        ← helper：getOrgTree（groups→subs→orgs→depts 組樹）+ getNodeDetail + listNodeAssignments + getNodePermissions（reads createClient RLS）
（方案 B/C 才有）src/lib/group/org-structure-actions.ts  ← Result 型別 CRUD
src/app/(workspace)/group/org-structure/page.tsx + _components/org-tree-board.tsx
nav：雙 brand 新建「系統設定」level2 群組 或 掛在現有商務管理下（待定）
```

- demo 全 indian；reads createClient（RLS user_has_brand）；若有寫入走 service client + admin gate（沿用 GRP14 pattern）。
- 新元件：樹元件（左側可展開/收合的 5 層 tree）— 目前元件庫無，需手刻一個輕量 `<OrgTree>`（純展開/選取，非 D3）。權限矩陣是表格、無需新元件。

## 3. 驗證計畫（Deploy-then-Test）

`round22-verify.mjs`：登入 → `/group/org-structure` → 斷言樹渲染（集團/法人/門店/部門節點名）+ 點節點顯示詳情 KV + 人員指派清單 + 權限矩陣 +（方案 B/C）編輯寫入查 DB。截圖 `docs/test-evidence/round-22/`。

## 4. ✅ 拍板結果（2026-05-31，Ming）
- **Q1 = A 唯讀統一樹 + 深連結**：`/group/org-structure` 做五層樹唯讀總覽 + 節點詳情/人員/權限唯讀清單，每區塊「→ /admin/org 編輯」深連結。**不寫入 → 無 actions、無 service client、無新表，工程量大降。**
- **Q2 = A brand 不當樹層**：樹 = 集團 → 法人 → 門店 → 部門；brand 當門店/法人標籤 chip。符合 §維度模型 MANDATORY。
- **Q3（預設）= 團隊層省略**：樹做到部門為止（DB 無 teams 表）。

## 5. ⚠️ 落地前必補校驗（schema 已查出的雷）
- `user_assignments` 欄位是 **scope_type/scope_id**（非我初稿寫的 store_id/department_id/role_code）+ role_id（FK→roles）+ granted_at/by, expires_at, notes。人員清單要 join roles 取角色名、join auth.users/profiles 取人名。
- `departments` **無 store_id**！欄位是 parent_id/brand_id/subsidiary_id。部門掛門店的關係要落地時查清（可能 parent_id 指 organization，或靠 brand/subsidiary 對應）— **這是落地第一個要驗的點**。
- `organizations` 有 group_id/subsidiary_id/brand_id/parent_id/type/level/manager_user_id；`subsidiaries` 有 netsuite_subsidiary_id/tax_id/base_currency；`brands` 有 default_subsidiary_id。
- 列數（demo 夠）：groups 1 / subsidiaries 3 / brands 2 / organizations 10 / departments 7 / user_assignments 22。**全 demo 可能含 ducati**——落地查 indian scope 下各層列數，不夠再 seed（守 demo 全 indian 鐵律）。
- `roles` 表有；無 `user_roles`（user_assignments 即關聯）。權限矩陣讀 nav_nodes.permission/is_admin_only（唯讀展示既有設定）。

## 6. 落地 Batch（方案 A）
- A：`src/domain/org-structure.ts` helper（getOrgTree 組 groups→subs→orgs→depts 四層 + brand chip；getNodeDetail；listNodeAssignments join roles；getPermissionMatrix 讀 nav_nodes）。reads createClient RLS。先驗 departments 掛接關係。
- B：輕量 `<OrgTree>` client 元件（展開/收合/選取，純 React 非 D3）+ page.tsx + board.tsx（左樹 + 右詳情/人員/權限唯讀，深連結 /admin/org）。
- C：nav 雙 brand 新建「系統設定」level2 群組 + 掛 /group/org-structure（is_admin_only）+ Deploy-then-Test（樹渲染 + 節點詳情 + 深連結存在）。
