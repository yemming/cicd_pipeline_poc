# Feature Proposal — RS_M3 Tab3「RS 人員」主管設定（sales 視角）

- 建立日期：2026-05-16
- 任務來源：BDN 第三輪 #3 — RS 人員管理（sales 視角）
- spec：`docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html` § Tab3
- route：`/sales/manager/staff`
- 範本：`docs/CLAUDE.md` §Design Pattern + `aftersales-staff` helper（同一張 employees 表）

---

## Phase 1 · 結構分析（已做）

### 1. spec 要求

Tab3「RS 人員管理」要做的事（看 HTML 行 519–540 + RS 名單 894–926）：

- 列出 RS 名單：姓名 / 帳號 / **負責車系** / 本月成交數 / 本月接觸數 / 啟用狀態
- 可新增 RS（spec mock 用 `{name, acc, series, del, cont, active, color}` 結構）
- 可指定**負責車系**（多選，含「全車系」、Panigale / Monster / Diavel / Multistrada / Hypermotard / Scrambler）
- 可停用 RS（active toggle）
- 主管視角：list-only 操作，沒有 detail page

### 2. DB schema audit（2026-05-16 量過）

| 表 | 狀態 |
|---|---|
| `profiles` | **不適合**。只有 11 個 typed columns（name / address / avatar / palette 等顯示偏好）、**沒有 metadata jsonb 欄位**、**沒有 brand_id**。auth 用戶資料，不是員工主檔。 |
| `employees` | **正確掛點**。已有 brand_id / emp_code / name / email / dept_id / position / is_active / `metadata jsonb` / `user_id`（連 profiles）/ external_id。aftersales-staff 已用此表 + metadata jsonb 慣例。 |
| `vehicle_models` | 30 筆（Indian 15 + Ducati 15）、有 `series` text 欄。可 distinct 撈 series 給多選 dropdown 用，不用寫死常數。 |
| `sales_leads` | 19 筆都在 Indian brand。`rs_name` text（目前用名字字串記、沒 FK 到 employees）、`converted_customer_id` 非 null 即「成交」、`created_at` 有時間戳可算月份範圍。 |
| `sales_handcards` | **不存在**。spec 提的「接觸數」走 sales_leads.count by rs_name 替代。 |
| `departments` | 已有 `SAL` 業務部，Indian / Ducati 各一筆。 |

### 3. 既有 employees 資料現況

```
brand=ducati: 6 筆（5 個維修部 + 1 個業務部 RS「林雅婷 D-EMP-002，position='銷售顧問'」）
brand=indian: 9 筆（全部維修部 / 零配件部、**0 個業務部 RS**）
```

> Indian brand 沒有任何業務部員工。Ming 在 dev 環境登入用的就是 Indian → **/sales/manager/staff 第一次打開會是空畫面**。
>
> 任務指示：「不要 INSERT profiles 新 row、UI 顯示空狀態、proposal 標等 Ming 建 RS seed」→ 嚴格遵守，不會自動建 RS。

### 4. 既有 helper / 範本

- `src/domain/aftersales-staff.ts` — 用 employees 表 + metadata jsonb 的 canonical 實作（dept 篩 SVC/PRT）。直接抄一份改成 `sales-staff.ts`（dept 篩 SAL）。
- `src/components/data-grid` — list view 必用元件。

---

## Phase 2 · 架構提案（已自動拍板，依任務指示）

### A. 落地點

| 軸 | 決策 |
|---|---|
| 員工主檔 | **employees 表**（不用 profiles；任務原話「reuse 既有 user 系統」應理解為 DealerOS 員工系統 = employees + role_id；profiles 是 auth/顯示偏好層、不裝業務屬性） |
| RS 過濾邏輯 | `departments.code='SAL'`（業務部）+ is_active 篩選；對應 aftersales-staff 的 SVC/PRT 慣例 |
| 負責車系 | **metadata.sales.responsible_models = string[]**（陣列、可空、有元素表示限定特定 series；陣列空 / 不存在 = 「全車系」） |
| 車系來源 | distinct `vehicle_models.series` where brand_id=當前 brand & is_active=true（不寫死常數，spec 的車系名只是 mock） |
| 本月接觸數 | `sales_leads.count` where rs_name=employees.name AND created_at in 本月（first-day 00:00 / last-day 23:59 by Asia/Taipei） |
| 本月成交數 | `sales_leads.count` where rs_name=employees.name AND converted_customer_id is not null AND `updated_at` in 本月 |
| 接觸/成交 = 0 時 | 不顯示「mock 數」，照實 0；spec 心目中沒有「接得到時帶 mock」這條 — DealerOS 慣例是空資料就空 |
| 啟用狀態 | `employees.is_active` 直接 toggle（已有欄位、有 set_active_action 套路） |

### B. metadata jsonb 結構

```jsonc
{
  // 既有售後 keys（不動）
  "grade": "...",
  "work_type": "...",
  "final_inspection_auth": false,
  "system_account": "...",
  // 新增 sales 命名空間（避免污染 root）
  "sales": {
    "responsible_models": ["Panigale", "Monster"]   // 空陣列或 unset = 全車系
  }
}
```

> 之後 sales 還會加新欄位（KPI 個人目標、簽核權限等）→ 都掛 `metadata.sales.{key}`，跟 aftersales 並存。

### C. 檔案落地

```
src/domain/sales-staff.constants.ts   (常數 / 純 helper / metadata typing)
src/domain/sales-staff.ts             (list / get / update server actions、Result<T>)
src/app/(workspace)/sales/manager/staff/page.tsx
src/app/(workspace)/sales/manager/staff/_components/sales-staff-board.tsx
```

不做 detail page（任務指示：profiles 編輯走 /admin/navigation/users）。

### D. UI — List View 規格（照 DealerOS design pattern）

**Filter Bar**：[搜尋 q] / [啟用狀態 all/active/inactive] / [負責車系 all/{series...}] / [查詢] [重置] (不做新增按鈕；員工主檔走 admin)

**DataGrid columns**：

1. 員工編號（emp_code，mono，可隱藏=false）
2. 姓名（連 metadata.sales chip）
3. 帳號（email / system_account）
4. 負責車系（metadata.sales.responsible_models chip 列；空 = 「全車系」灰 chip）
5. 本月接觸（數字 / 0）
6. 本月成交（數字 / 0）
7. 狀態（啟用/停用 chip）
8. 操作（編輯車系 / 啟用停用 — 2 顆，沒有刪除因為員工主檔在 admin）

**Modal**：點「編輯車系」開 — 顯示「全車系」checkbox（取消勾就出現各 series 多選 checkbox），存 metadata.sales.responsible_models。

**互動規範**：寫入時 pending 鎖整個 DataGrid（`disabled={isPending}`）+ 文字「儲存中⋯」+ banner 成功/失敗。

### E. 不做的事（依任務指示）

- ❌ 不新建 profiles row
- ❌ 不新建 employees row（員工主檔在 admin、不在 sales manager 設定頁）
- ❌ 不做 detail page
- ❌ 不做員工九宮格 / KPI 達成率視覺化（別條任務）
- ❌ 不動 nav_nodes（這份 proposal 末標 sidebar 入口位置給 Ming review）

### F. 待 Ming 後續決策（不阻塞落地）

1. **Indian brand 沒 RS seed** — 是否要造 2~3 名業務部 RS demo data？建議至少 2 名（讓 dev 環境看得到 list view 不是空）。SQL 建議：

```sql
-- 範例：等 Ming 點頭再跑
INSERT INTO employees (id, brand_id, emp_code, name, dept_id, position, is_active, metadata)
VALUES
  (gen_random_uuid(), 'indian', 'RS-I01', '林佳蓉',
   (SELECT id FROM departments WHERE brand_id='indian' AND code='SAL'),
   '銷售顧問', true,
   '{"sales":{"responsible_models":["FTR"]}}'::jsonb),
  (gen_random_uuid(), 'indian', 'RS-I02', '王俊傑',
   (SELECT id FROM departments WHERE brand_id='indian' AND code='SAL'),
   '銷售顧問', true,
   '{"sales":{"responsible_models":[]}}'::jsonb);
```

2. **sidebar 入口** — `/sales/manager/staff` 該掛在「銷售管理 > 主管工作台」底下、跟 KPI 目標值並排。需要 `nav_nodes` 雙 brand 各 INSERT 一筆，DDL 也標在這（proposal 不主動執行）：

```sql
SELECT id, brand_id, name FROM nav_nodes
WHERE name='主管工作台' AND level=2
ORDER BY brand_id;
-- 取上述各 brand 的 id 當 parent_id，sort_order 接在 kpi-targets 之後
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('ducati', '<ducati-mgr-parent>', 3, <next>, 'RS 人員管理', 'groups', '/sales/manager/staff', 'react_route', true, false),
  ('indian', '<indian-mgr-parent>', 3, <next>, 'RS 人員管理', 'groups', '/sales/manager/staff', 'react_route', true, false);
```

3. profiles.user_id 連結 — 目前 employees.user_id 全部 null，未來 Ming 在 /admin/navigation/users 補連結後、UI 就可以顯示「→ 對應的登入帳號」。本次先不做。

---

## Phase 3 · 拍板狀態

依任務指示「真正需要 Ming 拍板的（如 metadata jsonb vs 新表）→ 預設選 metadata jsonb 繼續落地」、「sales_role 欄位 / 車系存哪 / 接待數 aggregate from 哪 → 自動選預設」— 全部已自動拍板，**進 Phase 4 落地**。

唯一不自動拍板的事：**Indian brand RS seed**（任務明文禁止 INSERT profiles 新 row，員工 row 也比照辦理）→ UI 顯示空狀態 + 提示「請先到 /admin/navigation 建立業務部員工」、proposal F.1 標記等 Ming。
