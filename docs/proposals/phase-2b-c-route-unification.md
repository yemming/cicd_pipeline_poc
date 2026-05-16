# Phase 2B — C 模組路徑統一漸進式 cutover 規劃

> **Status**: 規劃中（等 Ming 拍板）
> **Owner**: Ming
> **Date**: 2026-05-16
> **Scope**: 純規劃 + nav_nodes UPDATE 對照表。**本提案不執行搬家**，只列順序、配套與 rollback。
> **Phase**: 接續 Phase 2A CRM 路徑統一（`/(sales|aftersales)/crm/* → /crm/(sales|aftersales)/*`，已完工、保留 redirect stub）

---

## TL;DR — 任務口語號碼 vs 實際盤點

任務交辦寫的數字（14 / 32）與實際 file system 盤點略有出入，本提案用實際數字落地：

| 路徑 | 任務口語 | 實際盤點 | 性質 |
|------|----------|----------|------|
| `/aftersales/*` (workspace) | 14 | **10**（全部是 redirect stub） | Phase 2A CRM 搬家殘留，已搬到 `/crm/aftersales/*`，**不是真路徑共存源** |
| `/parts/aftersales/*` | 32 | **34** | 售後修護業務頁主力（Phase 3B C1–C14 + ★1–6 都在這邊或 cross 到 `/service/*`） |
| `/service/*` | 未列 | **14** | C 模組另一條業務頁路徑，跟 `/parts/aftersales/*` **部分共存** ← 這才是真正要 cutover 的對象 |

**結論**：真正的「C 模組雙路徑」是 **`/service/*` ↔ `/parts/aftersales/*`**，不是任務交辦寫的 `/aftersales/*`。本提案以此為核心。

---

## 第 1 節 · `/aftersales/*` 10 個 page 一覽（Phase 2A 殘留 redirect stub）

實際 10 個 page.tsx 全部是 `redirect()` server stub，搬家在 Phase 2A CRM 路徑統一已完成。對應 v2 規格 HTML 在 `docs/DUCATI_v2_output/02_客服管理/` 而非 `03_售後修護/`，因為 CRM 模組已從 `aftersales` 切到獨立的 `/crm/*` namespace。

| # | 舊路徑 | redirect 目的地 | v2 規格 | 是否升級過 | nav_nodes | 處置 |
|---|--------|-----------------|---------|------------|-----------|------|
| 1 | `/aftersales/crm/call-tasks/page.tsx` | `/crm/aftersales/call-tasks` | `02_客服管理/*call-tasks*.html` | ✅ Phase 2A 已搬 | 無 row | 保留 stub |
| 2 | `/aftersales/crm/call-tasks/[id]/page.tsx` | `/crm/aftersales/call-tasks/{id}` | 同上 | ✅ | 無 | 保留 stub |
| 3 | `/aftersales/crm/customer-base/page.tsx` | `/crm/aftersales/customer-base` | `02_客服管理/*customer-base*.html` | ✅ | 無 | 保留 stub |
| 4 | `/aftersales/crm/customer-base/[id]/page.tsx` | `/crm/aftersales/customer-base/{id}` | 同上 | ✅ | 無 | 保留 stub |
| 5 | `/aftersales/crm/dormant-customers/page.tsx` | `/crm/aftersales/dormant-customers` | `02_客服管理/*dormant*.html` | ✅ | 無 | 保留 stub |
| 6 | `/aftersales/crm/dormant-customers/[id]/page.tsx` | `/crm/aftersales/dormant-customers/{id}` | 同上 | ✅ | 無 | 保留 stub |
| 7 | `/aftersales/crm/nps-dashboard/page.tsx` | `/crm/aftersales/nps` | `02_客服管理/*nps*.html` | ✅ | 無 | 保留 stub |
| 8 | `/aftersales/crm/push-notifications/page.tsx` | `/crm/aftersales/push-notifications` | `02_客服管理/*push*.html` | ✅ | 無 | 保留 stub |
| 9 | `/aftersales/crm/survey-templates/page.tsx` | `/crm/aftersales/survey-templates` | `02_客服管理/*survey*.html` | ✅ | 無 | 保留 stub |
| 10 | `/aftersales/crm/survey-templates/[id]/page.tsx` | `/crm/aftersales/survey-templates/{id}` | 同上 | ✅ | 無 | 保留 stub |

**Phase 2B 對這 10 個 stub 沒有額外動作**。保留 server-side redirect 防舊外連 / bookmark 404。可於 Phase 2C / Phase 3 收尾時統一刪除（觀察 1 個 sprint 沒人撞到再砍）。

> nav_nodes 該 namespace 已無 `/aftersales/crm/*` 入口（已遷至 `/crm/*`），所以不需要再動 nav。

---

## 第 2 節 · `/parts/aftersales/*` 34 個 page 一覽

C 售後修護業務頁主力，Phase 3B C1–C14 + ★1–6 大部分都升級在這邊。**這是統一後的 canonical 路徑候選**（理由見第 4 節）。

按目錄分類：

### 2.1 預約 / 接待（5 頁）

| # | 路徑 | 對應 v2 規格 | 是否升級 | nav_nodes | 備註 |
|---|------|--------------|----------|-----------|------|
| 1 | `appointments/page.tsx` | `03_售後修護/01_售後接待/01_預約管理看板.html` | ✅ C1（basePath prop）| `869aca0b` (ducati) / `ce276bdb` (indian) | 跟 `/service/appointments` reuse 同一 `AppointmentsBoard` 元件 |
| 2 | `appointments/[id]/page.tsx` | 同上 | ✅ | — | detail subroute |
| 3 | `appointments/new/page.tsx` | 同上 | ✅ | — | new subroute |
| 4 | `pre-inspections/page.tsx` | `04_預檢單_SA環檢_v3.html` | ✅ C2 v3 | `b2bb8c17` / `f5bc7def` (ducati) / `85fe5edf` / `8b77d003` (indian) | 雙 brand 有 ducati 2 row（static_html + react_route 共存） |
| 5 | `pre-inspections/transfer/page.tsx` | `04_預檢單_RO串接_v3.html` | ✅ C3 | `f6f94ecd` / `e0855702` | RO 串接 verify-only |

### 2.2 工單 / RO（7 頁）

| # | 路徑 | v2 規格 | 升級 | nav_nodes | 備註 |
|---|------|--------|------|-----------|------|
| 6 | `repair-orders/page.tsx` | `10_工單查詢.html` | ✅ C4 visual refresh | `e6922488` / `c5ef9142` / `99954c5a` | indian 雙 row |
| 7 | `repair-orders/[id]/page.tsx` | `02_正式工單RO.html` | ✅ | — | |
| 8 | `repair-orders/[id]/lines/page.tsx` | `03_維修項目零件明細.html` | ✅ | — | |
| 9 | `repair-orders/lines/page.tsx` | 同上 | ✅ | `1dd6d0cb` / `2b54c385` / `d96443e8` | indian 雙 row |
| 10 | `repair-orders/new/page.tsx` | `02_正式工單RO.html` | ✅ | `330b4339` / `5fc3c3c0` / `f305a569` | indian 雙 row |
| 11 | `ro-handoff/page.tsx` | C3 串接相關 | ✅ | `f5f5f6e3` | |
| 12 | `ro-handoff/[id]/page.tsx` | 同上 | ✅ | — | |
| 13 | `ro-search/page.tsx` | `10_工單查詢.html` (v2 search variant) | ✅ | `40a2351c` | |

### 2.3 增項 / 閉環 / 竣工（5 頁）

| # | 路徑 | v2 規格 | 升級 | nav_nodes | 備註 |
|---|------|--------|------|-----------|------|
| 14 | `addons/page.tsx` | `04_追加項目記錄.html` | ✅ | `68f13de5` / `b30282c4` | indian 雙 row |
| 15 | `followups/page.tsx` | `05_增項閉環_完整子模組.html` | ✅ ★3 | `ef58334c` / `1d418ca2` / `3bae1aea` | indian 雙 row |
| 16 | `followups/[id]/page.tsx` | 同上 | ✅ | — | |
| 17 | `final-inspections/page.tsx` | `06_竣工複檢_v1.html` | ✅ C8 ★4 | `cb5fa62c` / `fa9d788c` / `3d6c721b` | indian 雙 row |
| 18 | `final-inspections/[id]/page.tsx` | 同上 | ✅ | — | |

### 2.4 收款 / 取車（3 頁）

| # | 路徑 | v2 規格 | 升級 | nav_nodes | 備註 |
|---|------|--------|------|-----------|------|
| 19 | `checkout/page.tsx` | `08_結帳收款.html` | ✅ | `4e215f4f` / `264fc71f` / `49ba75ea` | indian 雙 row |
| 20 | `checkout/[id]/page.tsx` | 同上 | ✅ | — | |
| 21 | `pickup-notifications/page.tsx` | `11_取車通知設定.html` | ✅ | `bb3b7121` (indian only) | ducati 沒 nav row |
| 22 | `settings/pickup-notify/page.tsx` | 同上 | ✅ | `881eff90` / `b458019f` | |

### 2.5 主管設定 / 名冊 / 客戶（10 頁）

| # | 路徑 | v2 規格 | 升級 | nav_nodes | 備註 |
|---|------|--------|------|-----------|------|
| 23 | `customers/page.tsx` | `09_人車檔案.html` | ✅ | 無 row | nav 走 `/crm/aftersales/customer-base`、本頁是備援 |
| 24 | `management/bays/page.tsx` | `02_售後主管設定/*bays*.html` | ✅ | `5bee7d4a` / `7137fdde` | |
| 25 | `management/customer-tags/page.tsx` | `*customer-tags*.html` | ✅ | `84d301a5` / `3dc5cd52` / `37074ca5` | indian 雙 row |
| 26 | `management/discounts/page.tsx` | `*discounts*.html` | ✅ | `474413a2` / `5eb169cc` | |
| 27 | `management/dispatch/page.tsx` | `*dispatch*.html` | ✅ | `cee26944` / `34969e23` | |
| 28 | `management/permissions/page.tsx` | `*permissions*.html` | ✅ | `cd02bb80` / `4fbc35c7` | |
| 29 | `management/ro-numbering/page.tsx` | `*ro-numbering*.html` | ✅ | `6ac6ccfc` / `6bbfad23` | |
| 30 | `management/staff/page.tsx` | `*staff*.html` | ✅ | `b88d1b0d` / `76565d1c` | |
| 31 | `management/staff/[id]/page.tsx` | 同上 | ✅ | — | |
| 32 | `management/staff/new/page.tsx` | 同上 | ✅ | — | |

### 2.6 入口 / 概覽（2 頁）

| # | 路徑 | v2 規格 | 升級 | nav_nodes | 備註 |
|---|------|--------|------|-----------|------|
| 33 | `page.tsx` (workspace `/parts/aftersales`) | 售後總覽 | ✅ | 無（透過 sidebar parent） | |
| 34 | `repair-orders/[id]/lines/page.tsx` 重計入 2.2 | — | — | — | （上面已列） |

> 修正：扣掉重複，純計 34 個 file。

---

## 第 3 節 · `/service/*` 14 個 page 一覽（任務口語沒列、實際雙路徑共存的另一端）

C 模組另一條業務頁路徑。Phase 3B C1–C14 多筆改動其實落在這邊（pi、workorders、inspection、dropoff、parts、warranty）。

| # | 路徑 | v2 規格 | 升級 (Phase 3B item) | nav_nodes | `/parts/aftersales/*` 對應 |
|---|------|--------|---------------------|-----------|---------------------------|
| 1 | `service/page.tsx` | 入口 | — | 無 | `/parts/aftersales/page.tsx` |
| 2 | `service/appointments/page.tsx` | `01_預約管理看板.html` | ✅ C1（basePath wrapper、reuse `AppointmentsBoard`） | `907e3b30` (ducati) / `4aeefce1` (indian, **is_active=false**) | `/parts/aftersales/appointments/page.tsx` ✓ |
| 3 | `service/pi/page.tsx` | `04_預檢單_SA環檢_v3.html` | ✅ C2 visual refresh v3 | 無 row（pre-inspections 走 `/parts/aftersales`） | `/parts/aftersales/pre-inspections/page.tsx` ◐ 結構不同 |
| 4 | `service/pdi/page.tsx` | （新車驗收，非 v2 售後核心 spec） | — | `3bd0eca7` / `f3836e74` (is_active=false) | 無對應 |
| 5 | `service/workorders/page.tsx` | `02_正式工單RO.html` | ✅ C3+C4 v2 visual refresh（4 alerts） | `e3cf1179` / `63ff9179` (is_active=false) | `/parts/aftersales/repair-orders/new/page.tsx` ◐ |
| 6 | `service/workshop/page.tsx` | `*技師派工*.html` | — | `c7daedc3` / `6c11563f` (is_active=false) | `/parts/aftersales/management/dispatch/page.tsx` ◐ |
| 7 | `service/inspection/page.tsx` | `06_竣工複檢_v1.html` | ✅ C8 ★4 | `01eece00` / `a37aea3c` (is_active=false) | `/parts/aftersales/final-inspections/page.tsx` ◐ |
| 8 | `service/dropoff/page.tsx` | `05_增項閉環*.html` (簡化版) | ✅ C6 ★2 | `4c3cb15a` / `9c9a29ef` (is_active=false) | `/parts/aftersales/followups/page.tsx` ◐ |
| 9 | `service/parts/page.tsx` | 配件庫存 | — | `8de93760` / `a701ad74` (is_active=false) | 無對應（屬 inventory module） |
| 10 | `service/warranty/page.tsx` | 保固管理 | — | `0290f2f7` / `0d22f71d` (is_active=false) | 無對應 |
| 11 | `service/manager/customer-tags/page.tsx` | `*customer-tags*.html` | ✅ | `a5aff2ed` (indian) | `/parts/aftersales/management/customer-tags/page.tsx` ⚠️ 雙實作 |
| 12 | `service/manager/employees/page.tsx` | `*staff*.html` | ✅ | `0f312234` (indian) | `/parts/aftersales/management/staff/page.tsx` ⚠️ 雙實作 |
| 13 | `service/manager/ro-prefix/page.tsx` | `*ro-numbering*.html` | ✅ | `e32193d0` (indian) | `/parts/aftersales/management/ro-numbering/page.tsx` ⚠️ 雙實作 |
| 14 | `service/manager/workshop/page.tsx` | `*管理看板*.html` | ✅ | `9ee1815d` (indian) | `/parts/aftersales/management/bays/page.tsx` ◐ |

> 圖示：✓ 完全 alias（同元件 reuse）；◐ 業務上對應但 UI 結構不同；⚠️ 雙實作（兩套 code 各做一份）

**indian brand 的 `/service/*` 大多 `is_active=false`** — 意思是 Indian 使用者實際走 `/parts/aftersales/*`，`/service/*` 對 Indian 已基本下架。Ducati brand 還活著兩條路徑並存。

---

## 第 4 節 · 共通 / 重複 page 對照表

統計兩條路徑的關係：

| 類別 | 數量 | 範例 |
|------|------|------|
| ✓ 完全 alias（reuse 同元件） | **1** 對 | `/service/appointments` ↔ `/parts/aftersales/appointments` |
| ◐ 業務對應但 UI 結構不同 | **6** 對 | pi↔pre-inspections、workorders↔repair-orders/new、workshop↔dispatch、inspection↔final-inspections、dropoff↔followups、manager/workshop↔management/bays |
| ⚠️ 雙實作（純重複）| **3** 對 | manager/customer-tags、manager/employees↔management/staff、manager/ro-prefix↔management/ro-numbering |
| 🟦 只 `/service/*` 有（C 模組以外） | **4** | service/page.tsx、pdi、parts、warranty |
| 🟩 只 `/parts/aftersales/*` 有 | **24+** | addons、ro-handoff、ro-search、checkout、pickup-notifications、settings、management/discounts/permissions/dispatch、customers 等 |

**Cutover 對齊原則**：
- ✓ alias 對 → 第一波先動 nav，code 不動
- ⚠️ 雙實作對 → 第二波先做 code 收斂（決定誰是真身、誰變 alias / redirect），再動 nav
- ◐ 結構不同對 → 第三波 / 觀察期，要做更深 spec 對齊（可能需要 spec-to-feature 再跑一次）
- 🟦 純 `/service/*` 而非 C 售後核心 → **不搬**（pdi 是新車驗收、parts 屬 inventory、warranty 自成模組）
- 🟩 純 `/parts/aftersales/*` → **不搬**（已是 canonical 路徑）

---

## 第 5 節 · 統一後的 canonical 路徑選擇

**決策提議**：以 `/aftersales/*` 為 C 模組 canonical 路徑（新 namespace），把目前散在 `/service/*` + `/parts/aftersales/*` 的業務頁逐步搬過去。

理由：
1. **語意對齊**：`/aftersales`（售後修護）= 業務語境；`/parts/aftersales` 名字暗示「parts 模組底下的售後」、語意錯位；`/service` 太泛（涵蓋 PDI / 配件 / 保固非售後核心）。
2. **Phase 2A CRM 已示範**：`/(sales|aftersales)/crm/* → /crm/(sales|aftersales)/*` 同款手法成功過，可複製 redirect stub pattern。
3. **`/aftersales/*` namespace 目前 10 個 stub 都是 redirect 殼**，搬完 stub 自然到期可砍（已 grace 一輪）。
4. **`/service/*` Indian brand 已基本 deactive**，搬走對 Indian 0 影響。Ducati 仍活兩條 → 用 redirect 平滑切。
5. **nav_nodes 改動成本可控**：兩個 brand 加總 ~50 row、SQL UPDATE 一條跑完。

**反方意見**：modules.ts `home: "/service/appointments"`（line 147）+ stitchScreenId 都掛 `/service/*`、改動牽動 sidebar registry。**處置**：modules.ts 跟著一起改、nav_nodes 是 SSOT、modules.ts 是 fallback、兩邊同步即可。

> 若 Ming 偏好「直接以 `/parts/aftersales/*` 做 canonical 不搬」也合理 — 只需做 ⚠️ 雙實作對的收斂、把 `/service/*` 對 ducati 也設 `is_active=false` 即可。本提案先以 `/aftersales/*` 為 canonical 規劃；如要切換，配套對照表結構相同、只是新 href 字串改。

---

## 第 6 節 · 搬家優先順序（3 波 + 觀察期）

### 第一波（First Wave）— 低風險 alias 與雙實作清理

**前提**：`/service/*` Indian rows 已 deactive，本波只動 Ducati。

| 順序 | 頁 | 動作 | 風險 | 預估 |
|------|----|------|------|------|
| 1 | `/service/appointments` → `/aftersales/appointments` | 改 server wrapper 的 basePath、nav UPDATE、新 wrapper、舊位 redirect | 極低（已是 reuse） | 30 min |
| 2 | `/service/manager/customer-tags` → `/aftersales/management/customer-tags` | 雙實作清理：選 `/parts/aftersales/management/customer-tags` 為真身、搬到 `/aftersales/management/customer-tags`、`/service/manager/*` redirect | 低 | 1 hr |
| 3 | `/service/manager/employees` → `/aftersales/management/staff` | 同上 | 低 | 1 hr |
| 4 | `/service/manager/ro-prefix` → `/aftersales/management/ro-numbering` | 同上 | 低 | 1 hr |
| 5 | `/service/manager/workshop` → `/aftersales/management/bays` | 雙實作 ◐ 結構不同 → 先 redirect 到 `/parts/aftersales/management/bays`、後續 spec 對齊 | 中 | 1 hr |

**第一波驗證 checklist**：
- ☐ 兩 brand sidebar 都能看到新 nav 入口
- ☐ 舊路徑 redirect 命中
- ☐ Phase 3B verify scripts（`verify-service-appointments.mjs` etc.）pass
- ☐ TypeScript 0 errors

### 第二波（Second Wave）— C 模組業務核心（◐ 結構不同對）

| 順序 | 頁 | 處置 | 風險 | 預估 |
|------|----|------|------|------|
| 6 | `/service/pi` → `/aftersales/pre-inspections` | `/service/pi` 是 SA 視角單頁、`/parts/aftersales/pre-inspections` 是 list/board → 兩頁併列 sub-tab 或拆 SA / 主管視角；先 redirect `/service/pi` → `/aftersales/pre-inspections?view=sa` | 中 | 2 hr |
| 7 | `/service/workorders` → `/aftersales/repair-orders` | `/service/workorders` 是 6-tab 整合頁、`/parts/aftersales/repair-orders` 是 list；先 redirect `/service/workorders` → `/aftersales/repair-orders/new`（新 RO 表單 sub-route） | 中 | 2 hr |
| 8 | `/service/inspection` → `/aftersales/final-inspections` | 結構接近，redirect + nav UPDATE | 低 | 1 hr |
| 9 | `/service/dropoff` → `/aftersales/followups` | C6 已對齊 v2 banner，redirect + nav | 低 | 1 hr |
| 10 | `/service/workshop` → `/aftersales/management/dispatch` | 派工結構相近，redirect + nav | 中 | 1 hr |

**第二波驗證**：所有 ★1–6 跨模組 e2e 點重跑 Playwright。

### 第三波 / 觀察期 — 殘留收尾

| 順序 | 頁 | 處置 |
|------|----|------|
| 11 | `/service/pdi` | 非 C 售後核心、**不搬**。考慮搬到 `/inventory/pdi` 或保留 |
| 12 | `/service/parts` | 屬於 inventory 模組、**不搬** |
| 13 | `/service/warranty` | 自成模組、**不搬**或搬到 `/aftersales/warranty` |
| 14 | `/service/page.tsx` | 模組入口、刪除或 redirect 到 `/aftersales` |
| 15 | `/parts/aftersales/*` 34 個 | **可選**：第二步 cutover 把 `/parts/aftersales/*` 也搬到 `/aftersales/*`；或保留 `/parts/aftersales/*` 為 canonical（不動）。Phase 2B 不強制做、列入 Phase 2C |
| 16 | 觀察 30 天 | 沒人撞 404 → 砍 Phase 2A `/aftersales/crm/*` 10 個 stub + 本 Phase 新增的 `/service/*` redirect stub |

---

## 第 7 節 · nav_nodes UPDATE 對照表

> 對齊「第一波 + 第二波」搬家計畫。共 **23 row** 需要動 href（不含新增 row、不含 `is_active` 切換）。

### 第一波（5 對、Ducati 5 row + 已 deactive Indian 不動）

| row id (ducati) | name | 舊 href | 新 href | 對應頁 |
|-----------------|------|---------|---------|--------|
| `907e3b30-4274-42e2-825d-ec72471f8ba8` | 預約看板 | `/service/appointments` | `/aftersales/appointments` | first-wave #1 |
| `a5aff2ed-873f-456a-9433-6cb970d66e6b` | 客戶標籤主管設定 | `/service/manager/customer-tags` | `/aftersales/management/customer-tags`（or 直接合併到既有 `84d301a5` row、本 row 設 `is_active=false`） | first-wave #2 |
| `0f312234-b087-437b-9519-3a2b692134d3` | 員工人員名冊 | `/service/manager/employees` | `/aftersales/management/staff`（合併到 `b88d1b0d`） | first-wave #3 |
| `e32193d0-9c6e-4700-90f5-89f72fb170da` | 工單前綴碼設定 | `/service/manager/ro-prefix` | `/aftersales/management/ro-numbering`（合併到 `6ac6ccfc`） | first-wave #4 |
| `9ee1815d-1fd4-4731-ac75-92facc14d7d5` | 車間管理看板 | `/service/manager/workshop` | `/aftersales/management/bays`（合併到 `5bee7d4a`） | first-wave #5 |

> 注意：上面 `a5aff2ed` / `0f312234` / `e32193d0` / `9ee1815d` 都只有 Indian brand 一筆。Ducati 對應 row 在 `/parts/aftersales/management/*` 那條已存在（不重複建）。

### 第二波（5 對、雙 brand 各動）

| row id | brand | name | 舊 href | 新 href |
|--------|-------|------|---------|---------|
| `3bd0eca7-e091-4bb6-a4f3-626e2e972a15` | ducati | PDI 作業 | `/service/pdi` | `/aftersales/pdi`（如保留 C 內）or **不動** |
| `e3cf1179-b56f-4103-982b-e2468fe16407` | ducati | 維修工單 | `/service/workorders` | `/aftersales/repair-orders/new` |
| `c7daedc3-0bb3-44d1-9c05-7c24161e76ec` | ducati | 技師派工 | `/service/workshop` | `/aftersales/management/dispatch` |
| `01eece00-0bab-4539-8918-9815619a3bee` | ducati | 竣工複檢 | `/service/inspection` | `/aftersales/final-inspections` |
| `4c3cb15a-7a9d-4949-9853-30e3efff83e5` | ducati | 增項管理 | `/service/dropoff` | `/aftersales/followups` |
| `8de93760-531f-420c-a50f-8b7c18a9c47d` | ducati | 配件庫存 | `/service/parts` | **不動**（非 C 模組） |
| `0290f2f7-b41d-4eb2-acee-5b87f5dd6310` | ducati | 保固管理 | `/service/warranty` | **不動** or `/aftersales/warranty` |
| `f3836e74-6896-cf0a-e782-c476b08933a4` | indian | PDI 作業（deactive） | `/service/pdi` | **不動** |
| `4aeefce1-6f6f-da6f-b45a-58b0361fbb9b` | indian | 預約看板（deactive） | `/service/appointments` | **不動**或刪除 |
| `9c9a29ef-5d30-d041-9e03-89b46da5dc57` | indian | 增項管理（deactive） | `/service/dropoff` | **不動** |
| `a37aea3c-369a-6923-5824-267cf1d0ed10` | indian | 竣工複檢（deactive） | `/service/inspection` | **不動** |
| `a701ad74-9ace-86eb-8be9-f2ca898dcb4c` | indian | 配件庫存（deactive） | `/service/parts` | **不動** |
| `0d22f71d-ca95-9ce2-38ce-af1a9dc7b49a` | indian | 保固管理（deactive） | `/service/warranty` | **不動** |
| `63ff9179-f371-9b3c-564a-c7171ae9906f` | indian | 維修工單（deactive） | `/service/workorders` | **不動** |
| `6c11563f-1edd-7358-4b84-2c4306a8a866` | indian | 技師派工（deactive） | `/service/workshop` | **不動** |

> 對 Indian 已 deactive row 採「不動」原則（避免亂改 dead data 留麻煩）；如真要清乾淨可在觀察期統一 `DELETE FROM nav_nodes WHERE is_active = false AND href LIKE '/service/%'`。

### 預備 SQL 樣板

```sql
-- 第一波 #1（預約看板）
UPDATE nav_nodes
SET href = '/aftersales/appointments'
WHERE id = '907e3b30-4274-42e2-825d-ec72471f8ba8';

-- 第一波 #2~#5：合併 Indian manager row → 既有 parts/aftersales row（避免雙 row 同 nav）
-- step a：把 Indian manager row deactivate
UPDATE nav_nodes
SET is_active = false
WHERE id IN ('a5aff2ed-873f-456a-9433-6cb970d66e6b',
             '0f312234-b087-437b-9519-3a2b692134d3',
             'e32193d0-9c6e-4700-90f5-89f72fb170da',
             '9ee1815d-1fd4-4731-ac75-92facc14d7d5');
-- step b：對應的 `/parts/aftersales/management/*` row 改 href 到 `/aftersales/management/*`（如選擇 `/aftersales/*` 為 canonical）
UPDATE nav_nodes
SET href = REPLACE(href, '/parts/aftersales/', '/aftersales/')
WHERE href LIKE '/parts/aftersales/management/%'
  AND is_active = true;
```

> ⚠️ 跑前先 `SELECT` 預覽影響 row 數；`page_kind` 不要動（保 'react_route'）；level / parent_id / sort_order 不要動。

### modules.ts 同步改點

`src/lib/modules.ts` line 147–158：

- `home: "/service/appointments"` → `home: "/aftersales/appointments"`
- 8 個 service/* href 對齊上述 UPDATE 結果
- stitchScreenId 不變（綁 page 內容、不綁 path）

---

## 第 8 節 · 搬家配套（code 變動清單）

### 8.1 第一波每頁 cutover SOP（30 min × 5 頁）

對 `/service/appointments` 這類 alias 對：

1. 新建 `src/app/(workspace)/aftersales/appointments/page.tsx` — 同款 server wrapper、改 basePath
2. `src/app/(workspace)/service/appointments/page.tsx` 改成 `redirect("/aftersales/appointments")`
3. nav_nodes UPDATE（見第 7 節）
4. modules.ts UPDATE
5. 寫 `scripts/verify-aftersales-appointments.mjs`（覆蓋三條 path：`/aftersales/*` 新身、`/service/*` redirect、`/parts/aftersales/*` 原 source）
6. tsc + eslint + verify pass

### 8.2 第一波雙實作收斂 SOP

對 `/service/manager/customer-tags` ↔ `/parts/aftersales/management/customer-tags`：

1. diff 兩個檔案的元件、決定真身（**預設選 `/parts/aftersales/management/*`**，因為 sales 模組 + ducati nav 已落它）
2. `/service/manager/customer-tags/page.tsx` 改 redirect 到 `/aftersales/management/customer-tags`（或暫先 `/parts/aftersales/management/customer-tags`、第二步再切）
3. 刪除 `/service/manager/customer-tags/_components/`（如有）
4. nav UPDATE
5. verify script

### 8.3 第二波 ◐ 結構不同對 cutover SOP

例 `/service/workorders` ↔ `/parts/aftersales/repair-orders/new`：

1. 對齊兩頁的 demo state（看 `useServiceDemo` shared context 是否已 cover、PI → RO state 流入是否仍 work）
2. 新建 `/aftersales/repair-orders/new/page.tsx`（或沿用 `/parts/aftersales/repair-orders/new`、把 `/service/workorders` redirect 過去）
3. nav UPDATE
4. verify：手測 PI（now `/aftersales/pre-inspections`）→ RO 整個 6-tab flow

---

## 第 9 節 · Rollback 計畫（如使用者迷路 / 流量斷層 / 業務驗收不過）

### Rollback 觸發條件

- Ming / 客戶在新路徑下找不到舊功能、Sprint demo 卡住
- 跨模組 ★1–6 e2e 任一條斷
- 業務頁 demo state（PI → RO state 流入）失效

### Rollback 步驟（10 分鐘可回滾、不需要 git revert）

**Step 1** — nav_nodes 倒回（最快）：

```sql
-- 一行倒回所有第一波 UPDATE（保留 audit）
UPDATE nav_nodes
SET href = REPLACE(href, '/aftersales/', '/service/')
WHERE href LIKE '/aftersales/appointments%'
   OR href LIKE '/aftersales/management/%';
-- 或更精準：用 row id 列表逐筆 SET 回舊 href（從本提案第 7 節對照表反推）
```

**Step 2** — 把舊 `/service/*` redirect stub 改回 full page（用 git checkout 該檔的前一個 commit 即可）：

```bash
git checkout HEAD~1 -- "src/app/(workspace)/service/appointments/page.tsx"
# 對每個第一波 cutover 過的檔重跑
```

**Step 3** — modules.ts revert：

```bash
git checkout HEAD~1 -- src/lib/modules.ts
```

**Step 4** — `/aftersales/*` 新身保留為 alias（不刪）— 容錯：使用者已 cache 新 path 的 bookmark 仍能用 redirect 回 `/service/*`。

### Rollback 預演（dry run）

第一波每完成 1 頁 → 跑 5 分鐘手測 `verify-*.mjs`、確認不對就立刻 rollback、Ming 確認再進下一頁。**禁止一次跑完 5 頁再 verify。**

### 灰度策略（小步走）

每天最多搬 1–2 頁、隔夜觀察 Ming demo 是否撞到、確認後再下一波。第一波預計 1 個工作日跑完、第二波 2–3 天、第三波觀察期 2 週。

---

## 第 10 節 · 附錄：相關 file path（絕對路徑）

- 本提案：`/home/ming/projects/cicd_pipeline_poc/docs/proposals/phase-2b-c-route-unification.md`
- 模組 registry：`/home/ming/projects/cicd_pipeline_poc/src/lib/modules.ts`
- HANDOFF：`/home/ming/projects/cicd_pipeline_poc/.claude/HANDOFF.md`
- v2 規格 HTML：`/home/ming/projects/cicd_pipeline_poc/docs/DUCATI_v2_output/03_售後修護/01_售後接待/`
- Phase 2A 殘留 stub（已搬完不動）：`src/app/(workspace)/aftersales/crm/*/page.tsx`
- C 模組業務頁主力：`src/app/(workspace)/parts/aftersales/`（34 頁）
- C 模組舊路徑：`src/app/(workspace)/service/`（14 頁）

---

## 第 11 節 · Open Questions（等 Ming 拍板）

1. **canonical 路徑投票**：`/aftersales/*`（本提案）vs `/parts/aftersales/*`（不搬大量、只清雙實作）vs `/service/*`（反向、保留 `/service` 純化 `/parts/aftersales`）— 投哪邊？
2. **`/service/pdi`、`/service/parts`、`/service/warranty`** 非 C 售後核心、要不要從 `/service` 抽出（搬到 `/inventory/*` / 自成獨立模組）？
3. **第一波是否只跑 Ducati**（Indian 全 deactive 不動）？或要順手刪 Indian dead row？
4. **Rollback 演練**：要不要在第一波第 1 頁完成後刻意演練一次 rollback、驗證 SOP 10 min 內可回滾？
