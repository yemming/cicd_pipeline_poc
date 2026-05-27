# DealerOS 系統盤點報告

**品牌主線**：Indian Motorcycle（Ducati 僅有 Stitch 設計稿 HTML，無獨立程式，不納入本報告主體）
**產出日期**：2026-05-28　**統計基準**：`src/app/(workspace)` 全部 page.tsx + Supabase 線上 schema
**技術棧**：Next.js 16 App Router + Supabase(Postgres) + Tailwind；資料存取一律走 `@/domain/*` helper（天條）

---

## 一、報告方法論

本報告不靠記憶、不靠主觀印象，三項數據全部由工具實測：

- **頁面實作度**：掃描 `(workspace)` 底下全部 `page.tsx`，依「是否 import `@/domain` / `@/lib` 資料存取層、或委派給接資料的 `_components`」判定是否接真資料庫；再分出嵌 Stitch HTML 殼、接 mock 假資料、純 redirect 別名、靜態頁五類。
- **資料庫結構**：直接查 Supabase `information_schema.columns` 取全部欄位，`pg_stat_user_tables` 取實際資料量。
- **導航註冊**：查 `nav_nodes` 表（全站 sidebar 的 single source of truth），Indian 共登記 259 個 react_route 頁面節點。

---

## 二、總覽數字

| 指標 | 數量 | 說明 |
|---|---|---|
| `(workspace)` 總頁面 (page.tsx) | 437 | Indian 主線全部路由 |
| **A. 完整實作・接真 DB・可運行** | **307** | 接 `@/domain`/`@/lib` 資料層、有 CRUD/互動 |
| B. 前端完成・接 mock/demo 假資料 | 24 | UI 做好但尚未接真資料庫 |
| C. 只有 Stitch HTML 殼・尚未寫程式 | 28 | `StitchInline` 嵌設計稿、無資料無互動 |
| D. 靜態說明 / 導覽 / 開發 sandbox | 28 | 刻意的靜態頁，非功能缺口 |
| — 舊路徑 redirect 別名 | 50 | 301 導向真實作，不是獨立功能 |
| Domain 業務 helper | 134 | `src/domain/*.ts`（另含 82 個 `.constants.ts`） |
| 列印 / PDF 路由 | 8 | 採購單・銷售單・報價單・工單・領料・調撥・進貨・中古估價 |
| 後端 API route | 10 群組 | admin / auth / chat / einvoice / global-search / holidays / line / pdf / pos / weather |
| 資料表 + 視圖 | 184 | 線上 public schema 全量 |

> **一句話結論**：DealerOS Indian 已是一套**可運行的完整營運系統** —— 307 個頁面接真資料庫能跑，覆蓋進銷存、維修、銷售、CRM、會計、電子發票、通知、AI 等全模組；僅剩 28 個頁面停在 Stitch HTML 殼、24 個頁面接 demo 假資料待接 DB。

---

## 三、已完整實作・接真資料庫・可運行（A 類）

共 **307** 頁。以下按模組統計頁面數，並列出代表功能與對應資料層。

| 模組 | 完整頁數 | 代表功能 |
|---|---|---|
| 核心進銷存 + 售後維修 (parts) | 131 | 品號主檔・庫存水位・採購單/申請/退貨・進貨GRN・領料/調撥/盤點/調整・補貨計畫・ABC分類・告警升級・零件保固全流程・內部領用・售後預約/工單/領料/PDI/PI/驗車 |
| 經銷商管理 / ERP 核心 (admin) | 68 | ERP 主檔(供應商/品號/客戶/員工/車型/工單/保固/盤點政策)・會計(科目表COA/維度/分錄/期間)・RBAC權限矩陣・組織法人樹・導航節點管理・通知中樞後台・全站搜尋註冊 |
| 銷售管理 (sales) | 50 | 銷售訂單・報價單・接待手卡・試乘預約・潛客名單・保險投保・KPI目標・業務戰情・推播行銷 |
| 客戶關係管理 (crm) | 28 | 客戶主檔・休眠喚回・電訪任務・NPS問卷・滿意度・推播模板(銷售/售後雙線) |
| 電子發票 (einvoice) | 6 | 電子發票開立・折讓・作廢・字軌號碼池 |
| 交車服務 (delivery) | 6 | 交車典禮・PDI 配件點交・保固簽署・交車確認 |
| AI Curve 騎乘筆記 (ai-curve) | 5 | AI 騎乘曲線筆記 |
| 中古車交易 (usedcar) | 3 | 中古車庫存・估價單(可列印)・收購需求・潛客・成交分析・財務報表 |
| 意見回饋 / 許願單 CI-CD (feedback) | 2 | 許願單 CI/CD pipeline(提需求→LINE通知→開發→部署)・留言・Excalidraw 畫布 |
| 儀表板 (dashboard) | 2 | 營運總覽儀表板 |
| 個人設定 (me) | 1 | 個人設定 |
| 技師工作站 (tech) | 1 | 技師工作站 |
| 客服管理 (customer-service) | 1 | 客服管理 |
| POS 收銀 (pos) | 1 | POS 收銀(部分 mock) |
| 客戶滿意度 CSI (csi) | 1 | 滿意度問卷・轉介紹 |
| 進口配額 / 庫存政策 (inventory) | 1 | 進口配額/庫存政策(部分 Stitch) |

### 支撐 A 類的資料存取層（134 個 domain helper）

依天條，所有 UI 讀寫只透過 `@/domain/*` helper。代表性領域檔：

- **進銷存**：`items` `stock` `procurement` `receipts` `transfers` `count` `adjustments` `replenishment` `parts-abc` `alerts` `suppliers` `supplier-pricing` `warehouse` `inventory-reservations`
- **維修售後**：`repair-orders` `repair-order-lines` `appointments` `service-bays` `pre-inspections` `final-inspections` `warranty` `ro-checkouts` `ro-handoffs` `work-orders` `tech-workstation`
- **零件保固**：`parts-warranty` `parts-warranty-staging` `parts-warranty-used-parts` `parts-alert-work-order-loop` `parts-alerts-escalation` `parts-purchase-returns` `internal-sale-issues/receipts`
- **銷售/CRM**：`sales-orders` `sales-quote` `sales-handcards` `sales-test-drives` `sales-leads`(dormant) `sales-customer-base` `sales-call-tasks` `sales-nps` `sales-insurance` `sales-push-*` `crm-aftersales-*`
- **整車/中古**：`new-car-inventory` `used-car-inventory` `used-car-evaluations` `used-purchase-requests` `vehicle-models` `vehicle-arrivals` `vehicle-purchase-orders` `vehicle-transfers` `consignment` `pdi-workorder` `recon-workorder` `final-inspections`
- **會計/組織**：`accounting` `org` `org-admin` `rbac` `rules` `employee-roles` `customers` `customer-tags` `customer-private`
- **平台**：`notifications` `navigation` `feedback-tickets` `feedback-canvas` `rag-chat` `rag-ingest` `ai-*`(駕照/名片/車牌辨識) `einvoice` `analytics`

### 列印 / PDF 路由（server-side Chromium，8 條）

`/print/{slug}/[id]` + `/api/pdf/{slug}/[id]`：採購單 `purchase-order`、銷售訂單 `sales-order`、報價單 `quotation`、維修工單 `repair-order`、領料單 `stock-issue`、調撥單 `stock-transfer`、進貨單 `stock-receipt`、中古估價 `usedcar-evaluation`。

---

## 四、前端完成・接 mock/demo 假資料（B 類）

共 **24** 頁。UI 已照設計規格做好，但資料來源是 mock 檔 / demo store / 前端寫死，**尚未接真 Supabase**。這是「看得到、點得動，但資料不會落地」的一批。

| 頁面 | 模組 | 性質 |
|---|---|---|
| `dev/demo-dashboard/page.tsx` | 新功能開發區 | Demo 儀表板，接 `dealer-demo/store` |
| `dev/preflight-ro-v1/page.tsx` | 新功能開發區 | 工單預檢 demo |
| `dev/preflight-sa-v2/page.tsx` | 新功能開發區 | SA 預檢 demo |
| `pos/ledger/page.tsx` | POS | POS 帳本，接 `mock-ledger` |
| `pos/products/page.tsx` | POS | POS 商品，接 `mock-products` |
| `sales/showroom/page.tsx` | 銷售管理 | 展間車款，接 `ducati-models` 靜態 |
| `settings/api/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `settings/data-io/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `settings/dictionary/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `settings/general/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `settings/models/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `settings/notifications/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `settings/roles/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `settings/serial/page.tsx` | 系統設定 | 系統設定 demo（`mock-shell`+`demo-banner`，未接真設定表） |
| `tools/daily-cost/page.tsx` | 業務小工具 | 每日成本試算，前端 scoring |
| `tools/rival-smash/page.tsx` | 業務小工具 | 對手比拼，前端資料 |
| `tools/wpm/page.tsx` | 業務小工具 | 打字遊戲，前端 scoring |
| `usedcar/finance-report/page.tsx` | 中古車交易 | 中古車分析儀表板（`demo-banner`，圖表為示意資料） |
| `usedcar/followup-analysis/page.tsx` | 中古車交易 | 中古車分析儀表板（`demo-banner`，圖表為示意資料） |
| `usedcar/lead-analysis/page.tsx` | 中古車交易 | 中古車分析儀表板（`demo-banner`，圖表為示意資料） |
| `usedcar/open-rate/page.tsx` | 中古車交易 | 中古車分析儀表板（`demo-banner`，圖表為示意資料） |
| `usedcar/ops-data/page.tsx` | 中古車交易 | 中古車分析儀表板（`demo-banner`，圖表為示意資料） |
| `usedcar/sale/page.tsx` | 中古車交易 | 中古車銷售，接 `mock-vehicles`/`mock-sale-orders` |
| `usedcar/sales-dashboard/page.tsx` | 中古車交易 | 中古車分析儀表板（`demo-banner`，圖表為示意資料） |

> 多數 settings/* 與 usedcar 分析頁屬「展示用儀表板」，真要上線需各自建對應 query + 資料表（部分表已存在如 `pos_*`、`used_car_inventory`，只差把頁面從 mock 改接 domain helper）。

---

## 五、只有 Stitch HTML 殼・尚未寫成程式（C 類）

共 **28** 頁。這些頁面用 `<StitchInline>` 把 Stitch 設計稿 HTML 內嵌進共用 shell，**只有畫面、無資料、無互動**，是真正「還沒寫」的部分。按模組分組：

**經銷商管理 / ERP 核心 (admin)**（6）
- `admin/approval-flow/page.tsx`
- `admin/approvals/discount/page.tsx`
- `admin/approvals/history/page.tsx`
- `admin/approvals/page.tsx`
- `admin/approvals/refund/page.tsx`
- `admin/approvals/transfer/page.tsx`

**客戶滿意度 CSI (csi)**（1）
- `csi/referrals/page.tsx`

**集團管理 (group)**（6）
- `group/briefing/page.tsx`
- `group/dashboard-mobile/page.tsx`
- `group/dashboard/page.tsx`
- `group/group-overview/page.tsx`
- `group/reports/page.tsx`
- `group/sales-target/page.tsx`

**進口配額 / 庫存政策 (inventory)**（5）
- `inventory/compliance/page.tsx`
- `inventory/marketing/page.tsx`
- `inventory/policy/page.tsx`
- `inventory/quota/page.tsx`
- `inventory/rebate/page.tsx`

**動態導航節點 (n)**（1）
- `n/[nodeId]/page.tsx`

**核心進銷存 + 售後維修 (parts)**（2）
- `parts/[...slug]/page.tsx`
- `parts/overview/flow/page.tsx`

**銷售管理 (sales)**（4）
- `sales/customers/page.tsx`
- `sales/leads/page.tsx`
- `sales/reception/new/page.tsx`
- `sales/reception/records/page.tsx`

**系統設定 (settings)**（2）
- `settings/org/page.tsx`
- `settings/staff/page.tsx`

**中古車交易 (usedcar)**（1）
- `usedcar/auction/page.tsx`

> 升級路徑：每頁走 `spec-to-feature` skill → 套 List View / Page View design pattern → 接對應 domain helper。多數對應的資料表其實已存在（如簽核、集團報表、進口配額），主要差「把 HTML 換成接資料的 React 元件」。

---

## 六、靜態說明 / 導覽 / 開發頁（D 類）＋ 路由別名

**D 類靜態頁（28）**：模組首頁 gallery（`parts` `sales` `crm`）、流程說明圖（`parts/purchase/flow`）、設計 token / 圖表 sandbox（`admin/*-sandbox` `admin/design-tokens`）、開發元件展示（`dev/*`）、業務小工具靜態頁、官網首頁 `d2c/home`。這些是**刻意的靜態頁，不是功能缺口**。

**路由別名 redirect（50）**：舊路徑 301 導向真實作，保住歷史外連。最大宗是 `service/*` → `parts/aftersales/*`（第八輪整併）、`sales/crm/*` 與 `aftersales/crm/*` → 統一的 `crm/*`。這些**不是獨立功能**，對應功能已在 A 類實作完成。

---

## 七、資料庫結構與欄位對應

Supabase `public` schema 共 **184** 張表/視圖。下方按 15 個功能模組分組，列出每張表的**實際資料量**（線上估計值）與**完整欄位（含型別）**。所有業務表均帶 `brand_id`（品牌隔離）與 `metadata jsonb`（彈性欄位）。

### 組織・法人・權限 (Org / RBAC)

**`groups`**　（資料量：1 筆）

id (text), name (text), short_name (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), tenant_uuid (uuid)

**`group_brands`**　（資料量：2 筆）

group_id (text), brand_id (text), effective_from (date)

**`brands`**　（資料量：2 筆）

id (text), name (text), manufacturer (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), netsuite_segment_value_id (text), netsuite_synced_at (timestamp with time zone), default_subsidiary_id (uuid)

**`brand_modules`**　（資料量：31 筆）

brand_id (text), module_key (text), enabled (boolean), updated_at (timestamp with time zone), updated_by (uuid)

**`brand_appearance`**　（資料量：2 筆）

brand_id (text), dashboard_tagline (text), footer_badge_url (text), footer_badge_path (text), sidebar_theme (text), updated_at (timestamp with time zone), updated_by (uuid), brand_palette (text), custom_palette (jsonb), shell_layout (text), shell_options (jsonb)

**`subsidiaries`**　（資料量：3 筆）

id (uuid), group_id (text), tax_id (text), tax_id_country (character), legal_name (text), short_name (text), base_currency (character), parent_subsidiary_id (uuid), is_root (boolean), address (text), phone (text), responsible_person (text), notes (text), netsuite_subsidiary_id (text), netsuite_external_id (text), synced_at (timestamp with time zone), external_source (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`organizations`**　（資料量：6 筆）

id (uuid), brand_id (text), parent_id (uuid), type (text), level (smallint), code (text), name (text), short_name (text), address (text), phone (text), manager_user_id (uuid), is_active (boolean), external_id (text), external_source (text), synced_at (timestamp with time zone), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), responsible_person (text), bank_account (text), store_type (text), group_id (text), subsidiary_id (uuid), netsuite_location_id (text), netsuite_synced_at (timestamp with time zone), metadata (jsonb)

**`store_brands`**　（資料量：4 筆）

store_id (uuid), brand_id (text)

**`departments`**　（資料量：7 筆）

id (uuid), brand_id (text), parent_id (uuid), code (text), name (text), is_active (boolean), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), manager_employee_id (uuid), netsuite_department_id (text), netsuite_synced_at (timestamp with time zone), metadata (jsonb), subsidiary_id (uuid)

**`profiles`**　（資料量：18 筆）

id (uuid), name (text), updated_at (timestamp with time zone), address (text), avatar_url (text), avatar_path (text), preferred_palette_key (text), preferred_custom_palette (jsonb), preferred_sidebar_theme_key (text), default_landing_path (text), default_brand_id (text)

**`profile_brands`**　（資料量：20 筆）

user_id (uuid), brand_id (text), role (text), created_at (timestamp with time zone)

**`profile_subsidiaries`**　（資料量：12 筆）

id (uuid), user_id (uuid), subsidiary_id (uuid), is_active (boolean), created_at (timestamp with time zone)

**`app_admins`**　（資料量：2 筆）

email (USER-DEFINED), granted_at (timestamp with time zone), granted_by (uuid), notes (text)

**`roles`**　（資料量：13 筆）

id (text), name (text), description (text), is_system (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`role_permissions`**　（資料量：421 筆）

role_id (text), permission_code (text)

**`permissions`**　（資料量：97 筆）

code (text), label (text), module (text), category (text), created_at (timestamp with time zone)

**`user_assignments`**　（資料量：22 筆）

id (uuid), user_id (uuid), role_id (text), scope_type (text), scope_id (text), granted_at (timestamp with time zone), granted_by (uuid), expires_at (timestamp with time zone), notes (text)

**`employees`**　（資料量：30 筆）

id (uuid), brand_id (text), user_id (uuid), emp_code (text), name (text), email (text), phone (text), dept_id (uuid), position (text), hire_date (date), leave_date (date), pay_rate (numeric), employment_status (text), is_active (boolean), notes (text), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), national_id (text), metadata (jsonb), subsidiary_id (uuid), avatar_url (text), role_codes (ARRAY)

**`employee_role_types`**　（資料量：14 筆）

code (text), name_zh (text), name_en (text), description (text), color (text), icon (text), sort_order (integer), is_system (boolean), is_active (boolean), suggested_rbac_role_id (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid)

**`employee_certifications`**　（資料量：4 筆）

id (uuid), brand_id (text), employee_id (uuid), cert_type (text), cert_name (text), issuer (text), issued_at (date), expires_at (date), notes (text), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`aftersales_technicians`**　（資料量：13 筆）

id (uuid), brand_id (text), organization_id (uuid), subsidiary_id (uuid), code (text), name (text), grade (text), avatar_color (text), status (text), current_ro_code (text), current_item (text), current_bay_code (text), started_at (timestamp with time zone), jobs_total (integer), jobs_done (integer), sold_minutes (integer), actual_minutes (integer), available_minutes (integer), is_active (boolean), sort_order (integer), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), user_id (uuid), employee_id (uuid)

### 導航與全站搜尋 (Navigation / Search)

**`nav_nodes`**　（資料量：600 筆）

id (uuid), brand_id (text), parent_id (uuid), level (smallint), sort_order (integer), name (text), icon (text), accent (text), description (text), module_key (text), permission (text), home (text), page_kind (text), href (text), html_storage_path (text), stitch_screen_id (text), sprint (text), device (text), is_admin_only (boolean), coming_soon (boolean), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), emoji (text), section_group (text), section_group_color (text), badge (text)

**`global_search_index`**　（資料量：598 筆）

id (uuid), brand_id (text), entity_type (text), entity_id (uuid), title (text), subtitle (text), keywords (text), href (text), updated_at (timestamp with time zone)

### 客戶與 CRM (Customer / CRM)

**`customers`**　（資料量：82 筆）

id (uuid), brand_id (text), code (text), name (text), type (text), tax_id (text), phone (text), email (text), address (text), birthday (date), source_module (text), notes (text), gl_receivable_coa_id (uuid), is_active (boolean), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), national_id (text), customer_type (text), default_tax_code_id (uuid), payment_terms_days (integer), credit_limit (numeric), metadata (jsonb), assigned_sa_user_id (uuid), habc_grade (text), follow_up_status (text), next_follow_up_date (date), subsidiary_id (uuid), avatar_url (text), aftersales_dormancy_status (text), aftersales_lost_reason (text), aftersales_lost_at (timestamp with time zone), assigned_rs_user_id (uuid)

**`customer_contacts`**　（資料量：1 筆）

id (uuid), brand_id (text), customer_id (uuid), role (text), name (text), phone (text), email (text), relation (text), notes (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), subsidiary_id (uuid)

**`customer_vehicles`**　（資料量：110 筆）

id (uuid), brand_id (text), customer_id (uuid), model_id (uuid), vin (text), license_plate (text), engine_no (text), color (text), manufactured_year (smallint), acquired_from (text), purchase_date (date), purchase_amount (numeric), current_mileage (numeric), last_service_date (date), last_service_mileage (numeric), next_service_due_date (date), next_service_due_mileage (numeric), warranty_until (date), insurance_company (text), insurance_policy_no (text), insurance_until (date), preferred_technician_id (uuid), is_active (boolean), notes (text), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), desmo_service_due_date (date), desmo_service_due_mileage (numeric), subsidiary_id (uuid)

**`customer_tags`**　（資料量：46 筆）

id (uuid), brand_id (text), code (text), label (text), color (text), emoji (text), description (text), is_active (boolean), sort_order (integer), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), tag_kind (text), usage_count (integer)

**`customer_personal_tags`**　（資料量：8 筆）

id (uuid), brand_id (text), owner_id (uuid), name (text), color (text), note (text), is_active (boolean), use_count (integer), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), visibility (text)

**`customer_sales_private`**　（資料量：20 筆）

customer_id (uuid), brand_id (text), credit_limit (numeric), sales_notes (text), discount_history (jsonb), metadata (jsonb), updated_at (timestamp with time zone), updated_by (uuid)

**`customer_service_private`**　（資料量：3 筆）

customer_id (uuid), brand_id (text), health_notes (text), complaint_history (jsonb), service_notes (text), metadata (jsonb), updated_at (timestamp with time zone), updated_by (uuid)

**`sales_leads`**　（資料量：64 筆）

id (uuid), brand_id (text), code (text), name (text), phone (text), email (text), habc (text), intent_model (text), source (text), rs_name (text), follow_date (date), last_visit_at (date), note (text), converted_customer_id (uuid), is_active (boolean), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), dormancy_status (text), lost_reason (text), competitor_brand (text), lost_at (timestamp with time zone), revive_attempt_count (integer), last_revive_at (timestamp with time zone), next_revive_at (timestamp with time zone), assignee_id (uuid), kind (text)

**`call_tasks`**　（資料量：214 筆）

id (uuid), brand_id (text), kind (text), customer_id (uuid), survey_template_id (uuid), assignee_id (uuid), scheduled_at (timestamp with time zone), status (text), call_result (text), attempt_count (integer), last_attempt_at (timestamp with time zone), answers (jsonb), notes (text), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), call_type (text)

**`followup_cases`**　（資料量：12 筆）

id (uuid), brand_id (text), source_addon_id (uuid), source_ro_id (uuid), case_no (text), title (text), safety_level (text), estimated_fee (numeric), customer_name (text), vehicle_model (text), vehicle_license_plate (text), sa_id (uuid), sa_name (text), status (text), next_contact_at (date), last_contacted_at (timestamp with time zone), closed_at (timestamp with time zone), closed_reason (text), appointment_id (uuid), recovered_amount (numeric), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), escalation_level (integer), escalated_at (timestamp with time zone), manager_id (uuid), closure_evidence_url (text)

**`followup_events`**　（資料量：2 筆）

id (uuid), brand_id (text), case_id (uuid), event_type (text), outcome (text), body (text), acted_by (uuid), acted_by_name (text), occurred_at (timestamp with time zone), metadata (jsonb), created_at (timestamp with time zone)

**`nps_responses`**　（資料量：167 筆）

id (uuid), brand_id (text), kind (text), customer_id (uuid), call_task_id (uuid), survey_template_id (uuid), score (smallint), category (text), comment (text), store_id (uuid), sales_person (text), responded_at (timestamp with time zone), metadata (jsonb), created_at (timestamp with time zone)

**`survey_templates`**　（資料量：15 筆）

id (uuid), brand_id (text), kind (text), code (text), name (text), description (text), target_segment (text), questions (jsonb), effective_from (date), effective_to (date), is_active (boolean), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`survey_responses`**　（資料量：6 筆）

id (uuid), template_id (uuid), target_customer_id (uuid), target_user_id (uuid), token (text), status (text), response_json (jsonb), sent_at (timestamp with time zone), responded_at (timestamp with time zone), source_module (text), source_id (uuid), brand_id (text), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`push_campaigns`**　（資料量：22 筆）

id (uuid), brand_id (text), kind (text), name (text), template_id (uuid), channel (text), message_body (text), buttons (jsonb), target_habc (ARRAY), extra_conditions (jsonb), audience_count (integer), scheduled_at (timestamp with time zone), status (text), sent_count (integer), read_count (integer), click_count (integer), convert_count (integer), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), sent_at (timestamp with time zone)

**`push_message_templates`**　（資料量：17 筆）

id (uuid), brand_id (text), kind (text), category (text), name (text), channel (text), icon (text), body (text), buttons (jsonb), used_count (integer), open_rate (numeric), metadata (jsonb), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`kpi_targets`**　（資料量：29 筆）

id (uuid), brand_id (text), subsidiary_id (uuid), subject_type (text), subject_id (uuid), metric_code (text), period_type (text), period_key (text), target_value (numeric), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### 銷售 (Sales)

**`sales_orders`**　（資料量：123 筆）

id (uuid), brand_id (text), order_no (text), contract_type (text), status (text), customer_id (uuid), customer_name (text), customer_phone (text), customer_email (text), customer_address (text), buyer_national_id (text), rs_name (text), lead_id (uuid), vehicle_model_id (uuid), vehicle_model_name (text), vehicle_color (text), vehicle_vin (text), vehicle_engine_no (text), used_vehicle_id (uuid), used_brand_model (text), used_year (text), used_plate (text), used_cc (text), used_mileage (text), used_cert_level (text), payment_method (text), total_amount (numeric), down_payment (numeric), delivery_date (date), final_payment_date (date), transfer_by (text), deal_price (numeric), quote_snapshot (jsonb), special_notes (text), condition_notes (text), signature_buyer (text), signature_seller (text), signature_witness (text), signed_at (timestamp with time zone), fulfilled_at (timestamp with time zone), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid), submitted_at (timestamp with time zone), reviewed_at (timestamp with time zone), reviewed_by (uuid), review_note (text)

**`sales_quotes`**　（資料量：24 筆）

id (uuid), brand_id (text), quote_no (text), vehicle_kind (text), status (text), customer_id (uuid), customer_name (text), customer_phone (text), rs_name (text), vehicle_model_id (uuid), vehicle_model_name (text), used_brand_model (text), vehicle_amount (numeric), addon_amount (numeric), discount_amount (numeric), total_amount (numeric), lines (jsonb), expires_at (date), sent_at (timestamp with time zone), closed_at (timestamp with time zone), estimated_delivery_date (date), converted_order_id (uuid), notes (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid)

**`sales_handcards`**　（資料量：17 筆）

id (uuid), brand_id (text), organization_id (uuid), reception_date (date), reception_period (text), customer_name (text), customer_phone (text), customer_email (text), customer_identity (text), customer_id (uuid), lead_id (uuid), assigned_rs_name (text), assigned_rs_user_id (uuid), lead_grade (text), intent_level (integer), purchase_timing (text), intended_models (ARRAY), trial_status (text), competitor_brand (text), competitor_model (text), quoted_amount (numeric), quote_remark (text), notes (text), status (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid), latest_test_drive_id (uuid)

**`sales_test_drives`**　（資料量：11 筆）

id (uuid), brand_id (text), customer_id (uuid), vehicle_model_id (uuid), lead_id (uuid), sales_consultant_id (uuid), scheduled_at (timestamp with time zone), completed_at (timestamp with time zone), status (text), notes (text), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), handcard_id (uuid)

**`sales_dictionary`**　（資料量：90 筆）

id (uuid), brand_id (text), kind (text), code (text), label (text), description (text), is_system (boolean), sort_order (integer), is_active (boolean), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`handcard_voice_notes`**　（資料量：6 筆）

id (uuid), brand_id (text), handcard_id (uuid), storage_path (text), mime_type (text), size_bytes (integer), duration_seconds (integer), transcript (text), ai_suggestions (jsonb), ai_processed_at (timestamp with time zone), ai_latency_ms (integer), ai_tokens_in (integer), ai_tokens_out (integer), reviewed_decisions (jsonb), reviewed_at (timestamp with time zone), created_by (uuid), created_at (timestamp with time zone)

**`insurance_policies`**　（資料量：32 筆）

id (uuid), brand_id (text), customer_id (uuid), vehicle_id (uuid), policy_no (text), insurer (text), policy_type (text), start_date (date), end_date (date), premium (numeric), status (text), renewal_type (text), renewal_reminded_at (timestamp with time zone), assigned_to (uuid), call_count (integer), last_called_at (timestamp with time zone), next_action_date (date), lost_reason_code (text), notes (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid)

**`insurance_attempts`**　（資料量：0 筆）

id (uuid), policy_id (uuid), brand_id (text), attempted_at (timestamp with time zone), attempted_by (uuid), result (text), next_action_date (date), notes (text), metadata (jsonb), created_at (timestamp with time zone)

**`vehicle_models`**　（資料量：30 筆）

id (uuid), brand_id (text), series (text), model_name (text), display_name (text), year_start (integer), year_end (integer), engine_cc (integer), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), netsuite_segment_value_id (text), netsuite_synced_at (timestamp with time zone), vehicle_type (USER-DEFINED), engine_kw (integer), gl_inventory_coa_id (uuid), gl_revenue_coa_id (uuid), gl_cogs_coa_id (uuid), default_tax_code_id (uuid), standard_cost (numeric), msrp (numeric), metadata (jsonb), subsidiary_id (uuid), warranty_months (integer)

### 交車 (Delivery)

**`deliveries`**　（資料量：31 筆）

id (uuid), brand_id (text), subsidiary_id (uuid), organization_id (uuid), delivery_no (text), sales_order_id (uuid), customer_id (uuid), customer_vehicle_id (uuid), vehicle_model_id (uuid), vehicle_model_name (text), vehicle_color (text), vin (text), scheduled_delivery_date (date), actual_delivery_date (date), status (text), customer_name (text), customer_phone (text), customer_email (text), customer_address (text), customer_birthday (date), rs_name (text), step_completion (jsonb), pdi_work_order_no (text), pdi_checklist (jsonb), accessories_list (jsonb), accessories_note (text), delivery_checklist (jsonb), plate_no (text), plate_date (date), warranty_receive_date (date), warranty_start_date (date), warranty_registered (boolean), warranty_registered_at (timestamp with time zone), warranty_no (text), warranty_consents (jsonb), warranty_checklist (jsonb), sig_technician (timestamp with time zone), sig_rs (timestamp with time zone), sig_customer (timestamp with time zone), delivered_at (timestamp with time zone), delivered_by (uuid), received_by_customer_name (text), ceremony_photos (ARRAY), handover_docs_checklist (jsonb), keys_count (integer), keys_delivered_at (date), customer_doc_signature (text), notes (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid)

### 維修・售後修護 (Service)

**`appointments`**　（資料量：179 筆）

id (uuid), brand_id (text), subsidiary_id (uuid), store_id (uuid), appointment_date (date), appointment_time (time without time zone), customer_id (uuid), vehicle_id (uuid), service_type (text), service_subtype (text), estimated_hours (numeric), assigned_technician_id (uuid), status (text), arrived_at (timestamp with time zone), started_at (timestamp with time zone), completed_at (timestamp with time zone), notes (text), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`service_appointments`**　（資料量：3 筆）

id (uuid), brand_id (text), customer_id (uuid), vehicle_id (uuid), appt_no (text), scheduled_at (timestamp with time zone), duration_minutes (smallint), service_type (text), mileage_at_appointment (numeric), status (text), advisor_id (uuid), work_order_id (uuid), notes (text), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`service_bays`**　（資料量：16 筆）

id (uuid), brand_id (text), organization_id (uuid), subsidiary_id (uuid), code (text), name (text), bay_type (text), purpose (text), status (text), current_ro_code (text), current_item (text), current_tech_name (text), current_tech_color (text), started_at (timestamp with time zone), done_today (integer), used_minutes (integer), is_active (boolean), sort_order (integer), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`work_orders`**　（資料量：63 筆）

id (uuid), brand_id (text), ro_no (text), customer_id (uuid), vehicle_id (uuid), appointment_id (uuid), status (text), advisor_id (uuid), lead_technician_id (uuid), opened_at (timestamp with time zone), dispatched_at (timestamp with time zone), qc_at (timestamp with time zone), closed_at (timestamp with time zone), mileage_in (numeric), mileage_out (numeric), customer_complaint (text), diagnosis (text), work_summary (text), parts_amount (numeric), labor_amount (numeric), external_amount (numeric), discount_amount (numeric), total_amount (numeric), notes (text), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), subsidiary_id (uuid)

**`work_order_items`**　（資料量：4 筆）

id (uuid), brand_id (text), work_order_id (uuid), line_no (smallint), kind (text), item_id (uuid), labor_code (text), description (text), qty (numeric), unit_price (numeric), amount (numeric), technician_id (uuid), labor_minutes (smallint), is_warranty (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), qty_allocated (numeric), metadata (jsonb)

**`repair_orders`**　（資料量：153 筆）

id (uuid), brand_id (text), subsidiary_id (uuid), store_id (uuid), ro_code (text), prefix_p1 (text), prefix_p2 (text), issue_date (date), sequence_no (integer), appointment_id (uuid), pre_inspection_id (uuid), customer_id (uuid), vehicle_id (uuid), mileage_in (integer), sa_id (uuid), status (text), opened_at (timestamp with time zone), closed_at (timestamp with time zone), warranty_status_snapshot (jsonb), estimated_subtotal (numeric), estimated_labor_units (numeric), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), lines_subtotal (numeric), lines_total (numeric), lead_technician_id (uuid), images (ARRAY), fee_allocation (text), related_new_car_id (uuid), related_used_car_id (uuid)

**`repair_order_lines`**　（資料量：261 筆）

id (uuid), repair_order_id (uuid), brand_id (text), line_no (smallint), kind (text), labor_name (text), labor_units (numeric), labor_note (text), item_id (uuid), part_code (text), part_name (text), qty (numeric), unit_price (numeric), amount (numeric), is_warranty (boolean), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), source (text), source_ref_id (uuid), done (boolean), done_at (timestamp with time zone), done_by (uuid)

**`repair_order_addons`**　（資料量：28 筆）

id (uuid), brand_id (text), ro_id (uuid), addon_no (integer), name (text), addon_type (text), safety_level (text), estimated_fee (numeric), tech_reason (text), proposed_by (uuid), proposed_at (timestamp with time zone), confirm_method (text), customer_decision (text), customer_decision_at (timestamp with time zone), decided_by_sa_id (uuid), decision_note (text), followup_case_id (uuid), reserved_at (timestamp with time zone), reserved_movement_id (uuid), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`labor_time_sessions`**　（資料量：1 筆）

id (uuid), brand_id (text), repair_order_id (uuid), repair_order_line_id (uuid), technician_id (uuid), started_at (timestamp with time zone), ended_at (timestamp with time zone), status (text), duration_seconds (integer), metadata (jsonb), created_at (timestamp with time zone)

**`ro_checkouts`**　（資料量：5 筆）

id (uuid), brand_id (text), repair_order_id (uuid), checkout_no (text), status (text), fee_summary (jsonb), fees_confirmed_at (timestamp with time zone), customer_signature (jsonb), payment (jsonb), invoice (jsonb), closed_at (timestamp with time zone), receipt_printed_at (timestamp with time zone), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`inspection_records`**　（資料量：2 筆）

id (uuid), brand_id (text), kind (text), vehicle_id (uuid), work_order_id (uuid), appointment_id (uuid), inspector_id (uuid), inspected_at (timestamp with time zone), mileage_at_inspection (numeric), overall_status (text), customer_signature_url (text), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`inspection_findings`**　（資料量：2 筆）

id (uuid), brand_id (text), inspection_id (uuid), category (text), item_label (text), status (text), measurement (text), notes (text), photo_url (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`pre_inspections`**　（資料量：10 筆）

id (uuid), brand_id (text), organization_id (uuid), pi_no (text), status (text), appointment_id (uuid), customer_id (uuid), vehicle_id (uuid), repair_order_id (uuid), customer_name (text), customer_phone (text), vehicle_license_plate (text), vehicle_model_name (text), mileage_in (integer), sa_id (uuid), sa_name (text), estimated_subtotal (numeric), estimated_labor_units (numeric), metadata (jsonb), signed_at (timestamp with time zone), transferred_at (timestamp with time zone), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), mode (text), photos (ARRAY)

**`final_inspections`**　（資料量：7 筆）

id (uuid), brand_id (text), repair_order_id (uuid), inspection_no (text), status (text), inspector_id (uuid), inspector_name (text), inspector_role (text), line_results (jsonb), issue_note (text), test_drive (jsonb), cleaning (jsonb), signed_at (timestamp with time zone), signature_text (text), signoff_note (text), notifications (jsonb), next_service (jsonb), closed_at (timestamp with time zone), metadata (jsonb), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), photos (jsonb)

**`warranty_claims`**　（資料量：2 筆）

id (uuid), brand_id (text), cl_no (text), ro_id (uuid), vin (text), customer_id (uuid), vehicle_model_id (uuid), claim_type (text), claim_date (date), status (text), applied_amount (numeric), approved_amount (numeric), parts_cost (numeric), labor_cost (numeric), forecast_receipt_date (date), actual_receipt_date (date), oem_reference_no (text), notes (text), submitted_at (timestamp with time zone), approved_at (timestamp with time zone), received_at (timestamp with time zone), gl_posted (boolean), gl_posted_at (timestamp with time zone), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), subsidiary_id (uuid)

**`warranty_claim_lines`**　（資料量：1 筆）

id (uuid), brand_id (text), cl_id (uuid), line_no (integer), item_id (uuid), serial_no (text), old_part_id (uuid), qty (numeric), parts_cost (numeric), labor_cost (numeric), applied_amount (numeric), approved_amount (numeric), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`reminder_definitions`**　（資料量：12 筆）

id (uuid), code (text), label (text), description (text), icon (text), accent (text), category (text), query_kind (text), target_href_template (text), permission (text), display_order (integer), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`user_reminder_subscriptions`**　（資料量：72 筆）

id (uuid), user_id (uuid), brand_id (text), reminder_code (text), slot_index (integer), is_visible (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`pickup_notification_templates`**　（資料量：6 筆）

id (uuid), brand_id (text), name (text), channel (text), subject (text), body_template (text), variables (jsonb), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`pickup_notification_schedules`**　（資料量：4 筆）

id (uuid), brand_id (text), template_id (uuid), trigger_event (text), offset_minutes (integer), target_role (text), quiet_hours_start (time without time zone), quiet_hours_end (time without time zone), is_active (boolean), created_at (timestamp with time zone), metadata (jsonb)

### 零件進銷存 (Parts / Inventory)

**`items`**　（資料量：260 筆）

id (uuid), brand_id (text), code (text), name (text), name_en (text), category (text), control_type (text), base_uom (text), weight_kg (numeric), volume_cm3 (numeric), spec_description (text), default_supplier_id (uuid), standard_cost (numeric), suggested_price (numeric), serial_tracking_required (boolean), batch_tracking_required (boolean), warranty_months (integer), shelf_life_months (integer), gl_inventory_coa_id (uuid), gl_cogs_coa_id (uuid), gl_revenue_coa_id (uuid), is_active (boolean), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), image_url (text), image_display_height (integer), default_lead_time_days (integer), gl_expense_coa_id (uuid), default_tax_code_id (uuid), metadata (jsonb)

**`item_skus`**　（資料量：38 筆）

id (uuid), brand_id (text), item_id (uuid), sku_type (text), sku_code (text), supplier_id (uuid), spec (text), is_primary (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`item_store_prices`**　（資料量：54 筆）

id (uuid), brand_id (text), item_id (uuid), org_id (uuid), price (numeric), pricing_type (text), promo_start_date (date), promo_end_date (date), is_active (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`item_vehicle_compatibility`**　（資料量：189 筆）

id (uuid), brand_id (text), item_id (uuid), vehicle_model_id (uuid), year_start (integer), year_end (integer), notes (text), is_verified (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`classifications`**　（資料量：0 筆）

id (uuid), brand_id (text), type (text), code (text), name (text), is_active (boolean), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_dictionary`**　（資料量：34 筆）

id (uuid), brand_id (text), kind (text), code (text), label (text), description (text), accent_color (text), sort_order (integer), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`stock_items`**　（資料量：254 筆）

id (uuid), brand_id (text), item_id (uuid), warehouse_id (uuid), bin_id (uuid), serial_no (text), batch_no (text), qty (numeric), status (text), unit_cost (numeric), warranty_start (date), warranty_end (date), source_receipt_line_id (uuid), source_transfer_line_id (uuid), reserved_for_doc_type (text), reserved_for_doc_id (uuid), last_movement_at (timestamp with time zone), notes (text), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), consignment_id (uuid)

**`stock_movements`**　（資料量：847 筆）

id (uuid), brand_id (text), item_id (uuid), warehouse_id (uuid), direction (text), qty (numeric), reason (text), source_table (text), source_id (uuid), created_by (uuid), created_at (timestamp with time zone), metadata (jsonb)

**`stock_thresholds`**　（資料量：67 筆）

id (uuid), brand_id (text), warehouse_id (uuid), item_id (uuid), abc_class (text), min_stock (numeric), reorder_point (numeric), max_stock (numeric), alert_priority (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), safety_stock (numeric), metadata (jsonb)

**`warehouses`**　（資料量：8 筆）

id (uuid), brand_id (text), org_id (uuid), code (text), name (text), type (text), address (text), is_active (boolean), external_id (text), external_source (text), synced_at (timestamp with time zone), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), sort_order (integer), is_warranty_staging (boolean)

**`warehouse_zones`**　（資料量：26 筆）

id (uuid), brand_id (text), warehouse_id (uuid), code (text), name (text), control_level (text), is_active (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), sort_order (integer)

**`warehouse_slots`**　（資料量：24 筆）

id (uuid), brand_id (text), warehouse_id (uuid), bin_id (uuid), code (text), position (text), abc_required (boolean), is_occupied (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), sort_order (integer)

**`warehouse_bins`**　（資料量：147 筆）

id (uuid), brand_id (text), warehouse_id (uuid), zone_id (uuid), code (text), name (text), capacity (integer), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), sort_order (integer)

**`suppliers`**　（資料量：25 筆）

id (uuid), brand_id (text), code (text), name (text), type (text), primary_contact (text), phone (text), email (text), address (text), tax_id (text), payment_terms (text), default_currency (text), gl_payable_coa_id (uuid), notes (text), is_active (boolean), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), supplier_type (text), default_expense_coa_id (uuid), default_tax_code_id (uuid), is_withholding_required (boolean), withholding_tax_code_id (uuid), payment_terms_days (integer), metadata (jsonb), subsidiary_id (uuid)

**`supplier_contracts`**　（資料量：12 筆）

id (uuid), brand_id (text), supplier_id (uuid), contract_no (text), effective_from (date), effective_to (date), payment_terms (text), min_order_amount (numeric), notes (text), status (text), document_url (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`supplier_item_pricing`**　（資料量：61 筆）

id (uuid), brand_id (text), supplier_id (uuid), item_id (uuid), is_primary (boolean), unit_price (numeric), currency (text), lead_time_days (integer), min_order_qty (numeric), order_multiple (numeric), valid_from (date), valid_to (date), notes (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`purchase_requisitions`**　（資料量：11 筆）

id (uuid), brand_id (text), req_no (text), org_id (uuid), warehouse_id (uuid), source (text), source_ref_id (uuid), status (text), notes (text), required_date (date), approved_by (uuid), approved_at (timestamp with time zone), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), priority (text), budget_limit (numeric)

**`purchase_requisition_lines`**　（資料量：11 筆）

id (uuid), brand_id (text), req_id (uuid), line_no (integer), item_id (uuid), qty_required (numeric), uom (text), expected_date (date), notes (text), qty_converted (numeric), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`purchase_orders`**　（資料量：24 筆）

id (uuid), brand_id (text), po_no (text), vendor_id (uuid), org_id (uuid), warehouse_id (uuid), source_req_id (uuid), purchase_type (text), status (text), po_date (date), eta_date (date), currency (text), exchange_rate (numeric), amount_pretax (numeric), amount_tax (numeric), amount_total (numeric), paid_amount (numeric), qty_ordered_total (numeric), qty_received_total (numeric), receipt_progress_pct (integer), notes (text), approved_by (uuid), approved_at (timestamp with time zone), closed_at (timestamp with time zone), gl_posted (boolean), gl_posted_at (timestamp with time zone), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`purchase_order_lines`**　（資料量：57 筆）

id (uuid), brand_id (text), po_id (uuid), line_no (integer), item_id (uuid), source_req_line_id (uuid), uom (text), qty_ordered (numeric), qty_received (numeric), qty_returned (numeric), unit_price (numeric), tax_rate (numeric), line_amount_pretax (numeric), line_amount_tax (numeric), line_amount_total (numeric), serial_required (boolean), batch_required (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`purchase_returns`**　（資料量：17 筆）

id (uuid), brand_id (text), rt_no (text), po_id (uuid), vendor_id (uuid), warehouse_id (uuid), return_reason (text), return_date (date), status (text), qty_return_total (numeric), amount_total (numeric), refund_amount (numeric), logistics_provider (text), logistics_tracking_no (text), notes (text), approved_by (uuid), approved_at (timestamp with time zone), external_id (text), external_source (text), synced_at (timestamp with time zone), gl_posted (boolean), gl_posted_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`purchase_return_lines`**　（資料量：18 筆）

id (uuid), brand_id (text), rt_id (uuid), line_no (integer), po_line_id (uuid), item_id (uuid), qty_return (numeric), uom (text), unit_price (numeric), line_amount (numeric), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`stock_receipts`**　（資料量：74 筆）

id (uuid), brand_id (text), gr_no (text), type (text), source_doc_type (text), source_doc_id (uuid), warehouse_id (uuid), vendor_id (uuid), customer_id (uuid), receipt_date (date), status (text), qty_received_total (numeric), amount_total (numeric), notes (text), posted_at (timestamp with time zone), posted_by (uuid), gl_posted (boolean), gl_posted_at (timestamp with time zone), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), voided_at (timestamp with time zone), voided_by (uuid), void_reason (text)

**`stock_receipt_lines`**　（資料量：73 筆）

id (uuid), brand_id (text), gr_id (uuid), line_no (integer), source_line_id (uuid), source_line_type (text), item_id (uuid), bin_id (uuid), qty_received (numeric), uom (text), unit_cost (numeric), line_amount (numeric), serial_required (boolean), batch_required (boolean), warranty_start (date), warranty_end (date), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`stock_issues`**　（資料量：279 筆）

id (uuid), brand_id (text), gi_no (text), type (text), source_doc_type (text), source_doc_id (uuid), warehouse_id (uuid), customer_id (uuid), ro_id (uuid), issue_date (date), status (text), qty_issued_total (numeric), amount_total (numeric), notes (text), posted_at (timestamp with time zone), posted_by (uuid), gl_posted (boolean), gl_posted_at (timestamp with time zone), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), voided_at (timestamp with time zone), voided_by (uuid), void_reason (text), destination_store_id (uuid), delivery_eta_at (timestamp with time zone), delivery_address (text), recipient_name (text), recipient_phone (text), delivery_status (text)

**`stock_issue_lines`**　（資料量：279 筆）

id (uuid), brand_id (text), gi_id (uuid), line_no (integer), item_id (uuid), bin_id (uuid), qty_issued (numeric), uom (text), unit_cost (numeric), unit_price (numeric), line_amount (numeric), serial_no (text), batch_no (text), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`stock_transfers`**　（資料量：34 筆）

id (uuid), brand_id (text), tr_no (text), source_warehouse_id (uuid), target_warehouse_id (uuid), transfer_type (text), reason (text), status (text), ship_date (date), expected_arrival_date (date), actual_arrival_date (date), qty_requested_total (numeric), qty_shipped_total (numeric), qty_received_total (numeric), logistics_provider (text), logistics_tracking_no (text), notes (text), shipped_by (uuid), shipped_at (timestamp with time zone), received_by (uuid), received_at (timestamp with time zone), external_id (text), external_source (text), synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), voided_at (timestamp with time zone), voided_by (uuid), void_reason (text)

**`stock_transfer_lines`**　（資料量：37 筆）

id (uuid), brand_id (text), tr_id (uuid), line_no (integer), item_id (uuid), source_bin_id (uuid), target_bin_id (uuid), qty_requested (numeric), qty_shipped (numeric), qty_received (numeric), uom (text), unit_cost (numeric), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`inventory_adjustments`**　（資料量：58 筆）

id (uuid), brand_id (text), adj_no (text), ct_id (uuid), warehouse_id (uuid), type (text), reason (text), total_amount (numeric), status (text), approved_by (uuid), approved_at (timestamp with time zone), posted_at (timestamp with time zone), gl_posted (boolean), gl_posted_at (timestamp with time zone), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`inventory_adjustment_lines`**　（資料量：8 筆）

id (uuid), brand_id (text), adj_id (uuid), line_no (integer), item_id (uuid), qty_delta (numeric), unit_cost (numeric), line_amount (numeric), serial_no (text), batch_no (text), bin_id (uuid), notes (text), metadata (jsonb), created_at (timestamp with time zone)

**`inventory_counts`**　（資料量：14 筆）

id (uuid), brand_id (text), ct_no (text), plan_id (uuid), warehouse_id (uuid), count_date (date), status (text), freeze_warehouse (boolean), first_counter_id (uuid), second_counter_id (uuid), approver_id (uuid), approved_at (timestamp with time zone), total_lines (integer), variance_lines (integer), variance_amount (numeric), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), count_type (text)

**`inventory_count_plans`**　（資料量：16 筆）

id (uuid), brand_id (text), plan_name (text), warehouse_id (uuid), plan_type (text), abc_filter (text), schedule_cron (text), next_run_at (timestamp with time zone), last_run_at (timestamp with time zone), is_active (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`inventory_count_lines`**　（資料量：14 筆）

id (uuid), brand_id (text), ct_id (uuid), line_no (integer), item_id (uuid), bin_id (uuid), qty_system (numeric), qty_first_count (numeric), qty_second_count (numeric), qty_final (numeric), variance (numeric), variance_amount (numeric), unit_cost (numeric), status (text), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`inventory_reservations`**　（資料量：14 筆）

id (uuid), brand_id (text), item_id (uuid), warehouse_id (uuid), stock_item_id (uuid), reserved_qty (numeric), consumed_qty (numeric), source_type (text), source_id (uuid), ro_id (uuid), status (text), reserved_by (uuid), reserved_at (timestamp with time zone), released_at (timestamp with time zone), release_reason (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`replenishment_policies`**　（資料量：2 筆）

id (uuid), brand_id (text), warehouse_id (uuid), frequency (text), horizon_days (integer), auto_create_pr_for_urgent (boolean), include_forecast (boolean), notes (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), subsidiary_id (uuid)

**`replenishment_runs`**　（資料量：15 筆）

id (uuid), brand_id (text), warehouse_id (uuid), policy_id (uuid), horizon_days (integer), triggered_by (uuid), trigger_kind (text), total_lines (integer), total_amount (numeric), status (text), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`replenishment_run_lines`**　（資料量：26 筆）

id (uuid), brand_id (text), run_id (uuid), item_id (uuid), warehouse_id (uuid), abc_class (text), on_hand_qty (numeric), on_order_qty (numeric), allocated_qty (numeric), gross_demand_qty (numeric), safety_stock (numeric), reorder_point (numeric), net_demand_qty (numeric), suggested_qty (numeric), supplier_id (uuid), unit_price (numeric), est_amount (numeric), lead_time_days (integer), latest_order_date (date), required_date (date), priority (text), status (text), converted_pr_line_id (uuid), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`abc_classification_config`**　（資料量：2 筆）

id (uuid), brand_id (text), recalc_trigger (text), rolling_period_months (integer), threshold_a_pct (numeric), threshold_b_pct (numeric), count_freq_a_days (integer), count_freq_b_days (integer), count_freq_c_days (integer), safety_stock_days_a (integer), safety_stock_days_b (integer), safety_stock_days_c (integer), new_item_default_class (text), new_item_grace_months (integer), last_recalc_at (timestamp with time zone), is_active (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`abc_classification_results`**　（資料量：30 筆）

id (uuid), brand_id (text), item_id (uuid), warehouse_id (uuid), abc_class (text), output_amount_12m (numeric), output_qty_12m (numeric), rank_in_brand (integer), cum_pct (numeric), prev_class (text), recalc_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`alert_rules`**　（資料量：5 筆）

id (uuid), brand_id (text), code (text), name (text), alert_type (text), trigger_dsl (jsonb), severity (text), auto_action (text), notify_channels (ARRAY), cooldown_minutes (integer), is_enabled (boolean), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`alert_events`**　（資料量：0 筆）

id (uuid), brand_id (text), rule_id (uuid), ref_type (text), ref_id (uuid), payload (jsonb), severity (text), status (text), notified_via (ARRAY), notified_at (timestamp with time zone), acked_by (uuid), acked_at (timestamp with time zone), resolved_by (uuid), resolved_at (timestamp with time zone), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`document_number_rules`**　（資料量：20 筆）

id (uuid), brand_id (text), doc_type (text), prefix (text), pattern (text), current_seq (integer), reset_period (text), last_reset_at (timestamp with time zone), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`consignment_stocks`**　（資料量：4 筆）

id (uuid), brand_id (text), con_no (text), supplier_id (uuid), item_id (uuid), warehouse_id (uuid), bin_id (uuid), initial_qty (numeric), remaining_qty (numeric), transferred_qty (numeric), unit_cost (numeric), start_date (date), end_date (date), status (text), notes (text), transferred_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

**`old_parts`**　（資料量：5 筆）

id (uuid), brand_id (text), wc_no (text), ro_id (uuid), cl_id (uuid), item_id (uuid), serial_no (text), vin (text), warehouse_id (uuid), bin_id (uuid), entry_date (date), expiry_date (date), disposal_action (text), status (text), disposed_at (timestamp with time zone), disposed_by (uuid), notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb)

### 零件保固與內部領用 (Parts Warranty)

**`parts_warranty_claims`**　（資料量：25 筆）

id (uuid), brand_id (text), claim_no (text), ro_no (text), item_label (text), hours_label (text), warranty_type (text), apply_amount (numeric), approved_amount (numeric), status (text), status_label (text), expected_pay_date (date), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb), submitted_at (timestamp with time zone), approved_at (timestamp with time zone), reimbursed_at (timestamp with time zone), sla_days (integer), ro_id (uuid), notes (text)

**`parts_warranty_claim_types`**　（資料量：8 筆）

id (uuid), brand_id (text), code (text), label (text), icon (text), description (text), accent (text), is_active (boolean), sort_order (integer), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`parts_warranty_flow_config`**　（資料量：2 筆）

brand_id (text), banner_text (text), banner_enabled (boolean), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`parts_warranty_flow_steps`**　（資料量：12 筆）

id (uuid), brand_id (text), step_no (integer), title (text), description (text), is_terminal (boolean), is_active (boolean), sort_order (integer), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`parts_warranty_staging_rules`**　（資料量：2 筆）

brand_id (text), isolate_from_sellable (boolean), exclude_from_alerts (boolean), exclude_from_count (boolean), allow_temp_borrow (boolean), alert_days_first (integer), alert_days_escalate (integer), cost_calc_method (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_warranty_timing_rules`**　（資料量：8 筆）

id (uuid), brand_id (text), claim_type_id (uuid), apply_window (text), storage_rule (text), close_goal_days (integer), is_active (boolean), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`parts_warranty_ro_link_config`**　（資料量：2 筆）

brand_id (text), dms_label (text), dms_endpoint (text), dms_connected (boolean), sync_ro_to_issue (boolean), sync_vin_check (boolean), sync_warranty_label (boolean), sync_technician (boolean), sync_estimate (boolean), sync_frequency (text), fallback_action (text), expiry_alert_days (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_warranty_ro_link_records`**　（資料量：9 筆）

id (uuid), brand_id (text), ro_no (text), vin (text), model (text), warranty_type (text), sync_status (text), sync_status_label (text), out_no (text), claim_no (text), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_warranty_cost_recovery_config`**　（資料量：2 筆）

brand_id (text), remind_7_days_before (boolean), alert_on_overdue (boolean), auto_settle_cost (boolean), sync_finance_system (boolean), monthly_report_auto (boolean), monthly_report_to_manager (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_warranty_used_parts_config`**　（資料量：2 筆）

brand_id (text), trigger_auto_reserve (boolean), trigger_scan_inbound (boolean), trigger_manual_no_serial (boolean), trigger_require_photo (boolean), trigger_auto_barcode (boolean), inbound_warehouse (text), auto_update_claim (boolean), auto_link_cost_recovery (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_warranty_used_parts_items`**　（資料量：6 筆）

id (uuid), brand_id (text), barcode (text), item_name (text), item_code (text), ro_no (text), inbound_date (date), damage_level (text), damage_label (text), status (text), status_label (text), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_warranty_used_parts_lifecycle_rules`**　（資料量：12 筆）

id (uuid), brand_id (text), stage (text), action_label (text), sla_days (integer), requires_approval (boolean), channel (text), target_role (text), notes (text), is_active (boolean), sort_order (integer), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`parts_workorder_loop_entries`**　（資料量：31 筆）

id (uuid), brand_id (text), ro_no (text), missing_parts (text), sa_name (text), shortage_reason (text), po_no (text), eta_label (text), days_pending (integer), status (text), is_overdue (boolean), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_internal_sale_issues`**　（資料量：5 筆）

id (uuid), brand_id (text), doc_no (text), customer_label (text), warehouse_label (text), issue_date (date), status (text), qty_total (numeric), amount_total (numeric), notes (text), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_internal_sale_receipts`**　（資料量：5 筆）

id (uuid), brand_id (text), doc_no (text), source_label (text), warehouse_label (text), receipt_date (date), status (text), qty_total (numeric), amount_total (numeric), notes (text), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_alert_escalation_rules`**　（資料量：26 筆）

id (uuid), brand_id (text), alert_type (text), alert_label (text), alert_priority (text), alert_icon (text), trigger_desc (text), tier (integer), tier_label (text), delay_minutes (integer), recipient_label (text), channel_push (boolean), channel_sms (boolean), channel_email (boolean), is_active (boolean), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`parts_alert_receivers`**　（資料量：8 筆）

id (uuid), brand_id (text), display_name (text), role_label (text), avatar_color (text), default_push (boolean), default_sms (boolean), default_email (boolean), is_active (boolean), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

### 整車庫存・中古車 (Vehicle / Used Car)

**`new_car_inventory`**　（資料量：62 筆）

id (uuid), brand_id (text), subsidiary_id (uuid), organization_id (uuid), vin (text), external_id (text), vehicle_model_id (uuid), color (text), color_hex (text), config (jsonb), year (integer), engine_no (text), build_date (date), cost_price (numeric), list_price (numeric), status (text), arrival_date (date), displayed_date (date), reserved_date (date), sold_date (date), delivered_date (date), license_plate_status (text), license_plate_no (text), linked_sales_order_id (uuid), note (text), images (ARRAY), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid), pdi_workorder_id (uuid), pdi_labor_cost (numeric), pdi_parts_cost (numeric), transfer_freight_cost (numeric), total_cost (numeric), purchase_order_id (uuid), arrival_batch_id (uuid), damage_flag (boolean), damage_notes (text)

**`used_car_inventory`**　（資料量：45 筆）

id (uuid), brand_id (text), organization_id (uuid), vin (text), license_plate (text), vehicle_model_id (uuid), model_display_name (text), year (integer), color (text), color_hex (text), mileage_km (integer), acquisition_price (numeric), listing_price (numeric), cost (numeric), margin (numeric), acquisition_source (text), acquisition_date (date), listed_date (date), sold_date (date), status (text), condition_grade (text), lien_cleared (boolean), inspection_due_date (date), recommended_services (ARRAY), inspection_report (jsonb), images (ARRAY), note (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid), recon_workorder_id (uuid), recon_labor_cost (numeric), recon_parts_cost (numeric), bodywork_cost (numeric), transfer_freight_cost (numeric), total_cost (numeric)

**`used_car_evaluations`**　（資料量：9 筆）

id (uuid), brand_id (text), organization_id (uuid), eval_no (text), vin (text), license_plate (text), brand_name (text), model (text), year (integer), color (text), displacement (text), mileage (integer), appraiser (text), evaluator_id (uuid), customer_id (uuid), condition_grade (text), estimated_value (numeric), decision (text), conclusion (text), status (text), submitted_at (timestamp with time zone), approved_at (timestamp with time zone), approved_by (uuid), rejected_at (timestamp with time zone), rejected_by (uuid), rejection_reason (text), equipment_jsonb (jsonb), pricing_jsonb (jsonb), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`used_purchase_requests`**　（資料量：1 筆）

id (uuid), brand_id (text), application_no (text), source_type (text), seller_name (text), seller_phone (text), seller_id_no (text), vin (text), vehicle_model_id (uuid), year (integer), color (text), mileage_km (integer), grade_ext (text), grade_mech (text), market_ref_price (numeric), recon_estimate (numeric), suggested_price (numeric), actual_price (numeric), decision (text), used_car_id (uuid), recon_workorder_id (uuid), images (jsonb), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid)

**`vehicle_arrivals`**　（資料量：1 筆）

id (uuid), brand_id (text), arrival_no (text), purchase_order_id (uuid), arrival_date (date), warehouse_id (uuid), total_vehicles (integer), confirmed_vehicles (integer), damaged_vehicles (integer), status (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid)

**`vehicle_purchase_orders`**　（資料量：1 筆）

id (uuid), brand_id (text), subsidiary_id (uuid), po_no (text), supplier_name (text), order_date (date), expected_arrival (date), warehouse_id (uuid), currency (text), exchange_rate (numeric), freight_estimate (numeric), insurance_estimate (numeric), customs_rate (numeric), status (text), notes (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid)

**`vehicle_purchase_order_items`**　（資料量：0 筆）

id (uuid), purchase_order_id (uuid), seq (integer), vehicle_model_id (uuid), color (text), color_code (text), qty (integer), unit_price_source (numeric), unit_price_twd (numeric), factory_order_no (text), created_at (timestamp with time zone)

**`vehicle_transfers`**　（資料量：0 筆）

id (uuid), brand_id (text), transfer_no (text), vehicle_kind (text), new_car_id (uuid), used_car_id (uuid), from_warehouse_id (uuid), to_warehouse_id (uuid), transfer_date (date), freight_type (text), freight_amount (numeric), carrier (text), reason (text), status (text), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid)

### POS 收銀

**`pos_products`**　（資料量：50 筆）

id (uuid), sku (text), name (text), category (text), unit_price (integer), stock_qty (integer), low_stock_at (integer), barcode (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), brand_id (text), metadata (jsonb)

**`pos_transactions`**　（資料量：3 筆）

id (uuid), merchant_trade_no (text), total_amount (integer), payment_method (text), cash_received (integer), change_amount (integer), staff_id (uuid), staff_name (text), invoice_type (text), carrier_code (text), tax_id (text), ecpay_invoice_no (text), ecpay_invoice_date (text), ecpay_random_number (text), ecpay_status (text), created_at (timestamp with time zone), brand_id (text), einvoice_id (uuid), metadata (jsonb)

**`pos_transaction_lines`**　（資料量：2 筆）

id (uuid), transaction_id (uuid), product_id (uuid), product_sku (text), product_name (text), qty (integer), unit_price (integer), subtotal (integer), created_at (timestamp with time zone), brand_id (text), metadata (jsonb)

**`pos_payment_orders`**　（資料量：2 筆）

merchant_trade_no (text), form_params (jsonb), amount (integer), item_name (text), status (text), ecpay_trade_no (text), paid_at (timestamp with time zone), created_at (timestamp with time zone), expires_at (timestamp with time zone), brand_id (text), metadata (jsonb)

**`pos_ledger_entries`**　（資料量：3 筆）

id (uuid), date (date), type (text), category (text), amount (integer), payment_method (text), description (text), ref_id (uuid), created_by (uuid), created_at (timestamp with time zone), brand_id (text), metadata (jsonb)

**`pos_shipments`**　（資料量：0 筆）

id (uuid), transaction_id (uuid), merchant_trade_no (text), logistics_type (text), logistics_sub_type (text), all_pay_logistics_id (text), ecpay_status (text), ecpay_error (text), receiver_name (text), receiver_phone (text), receiver_address (text), receiver_zip (text), receiver_store_id (text), goods_name (text), goods_amount (integer), created_at (timestamp with time zone), brand_id (text), metadata (jsonb)

### 電子發票 (E-Invoice)

**`einvoices`**　（資料量：9 筆）

id (uuid), brand_id (text), source_module (text), source_id (uuid), source_ref (text), ecpay_invoice_no (text), ecpay_invoice_date (date), ecpay_random_number (text), ecpay_status (text), ecpay_error_msg (text), invoice_type (text), carrier_type (text), carrier_code (text), tax_id (text), buyer_name (text), buyer_address (text), buyer_email (text), buyer_phone (text), donation_code (text), total_amount (integer), tax_amount (integer), tax_type (text), items (jsonb), remark (text), issued_at (timestamp with time zone), issued_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`einvoice_allowances`**　（資料量：0 筆）

id (uuid), brand_id (text), einvoice_id (uuid), ecpay_allowance_no (text), total_amount (integer), tax_amount (integer), items (jsonb), reason (text), status (text), ecpay_error_msg (text), notify_method (text), notify_target (text), is_online (boolean), issued_at (timestamp with time zone), issued_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`einvoice_voids`**　（資料量：0 筆）

id (uuid), brand_id (text), einvoice_id (uuid), reason (text), voided_at (timestamp with time zone), voided_by (uuid), created_at (timestamp with time zone), metadata (jsonb)

**`einvoice_number_pools`**　（資料量：0 筆）

id (uuid), brand_id (text), period (text), prefix (text), start_no (integer), end_no (integer), used_count (integer), is_active (boolean), synced_at (timestamp with time zone), created_at (timestamp with time zone), metadata (jsonb)

### 會計・財務 (Accounting)

**`chart_of_accounts`**　（資料量：365 筆）

id (uuid), tenant_id (uuid), account_code (character varying), parent_code (character varying), parent_id (uuid), level (USER-DEFINED), depth (smallint), l1_code (character), l2_code (character), l3_code (character), l4_code (character), l5_code (character), name_zh_tw (character varying), name_en (character varying), display_indent_name (character varying), l1_category (USER-DEFINED), dealer_category (USER-DEFINED), tax_treatment (USER-DEFINED), moea_code (character), moea_name_zh (character varying), netsuite_account_internal_id (character varying), netsuite_account_number (character varying), netsuite_synced_at (timestamp with time zone), netsuite_sync_status (character varying), is_postable (boolean), normal_balance (character), is_active (boolean), is_locked (boolean), is_system_default (boolean), required_dimensions (jsonb), ai_tags (jsonb), benchmark_enabled (boolean), description (text), posting_example (text), display_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid), metadata (jsonb)

**`coa_seed_accounts`**　（資料量：412 筆）

id (integer), template_packs (ARRAY), account_code (character varying), parent_code (character varying), level (USER-DEFINED), depth (smallint), l1_code (character), l2_code (character), l3_code (character), l4_code (character), l5_code (character), name_zh_tw (character varying), name_en (character varying), l1_category (USER-DEFINED), dealer_category (USER-DEFINED), tax_treatment (USER-DEFINED), moea_code (character), moea_name_zh (character varying), is_postable (boolean), normal_balance (character), default_enabled (boolean), is_locked (boolean), required_dimensions (jsonb), ai_tags (jsonb), description (text), posting_example (text), display_order (integer), version (character varying), created_at (timestamp with time zone)

**`gl_dimensions`**　（資料量：29 筆）

id (uuid), tenant_id (uuid), dimension_code (character varying), dimension_name (character varying), description (text), reference_table (character varying), reference_value_column (character varying), is_required_globally (boolean), is_active (boolean), is_system_default (boolean), display_order (integer), netsuite_segment_type (character varying), netsuite_segment_script_id (character varying), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`journal_entries`**　（資料量：25 筆）

id (uuid), tenant_id (uuid), entry_no (text), entry_date (date), description (text), status (text), posted_at (timestamp with time zone), posted_by (uuid), reversed_by_entry_id (uuid), netsuite_journal_id (text), netsuite_synced_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), metadata (jsonb), period_id (uuid), transaction_type_id (uuid), cash_flow_section (text)

**`journal_entry_lines`**　（資料量：62 筆）

id (uuid), entry_id (uuid), line_no (integer), coa_id (uuid), debit (numeric), credit (numeric), dimensions (jsonb), description (text), created_at (timestamp with time zone), metadata (jsonb)

**`accounting_periods`**　（資料量：17 筆）

id (uuid), tenant_id (uuid), fiscal_year (integer), period_number (integer), period_type (text), start_date (date), end_date (date), status (text), closed_at (timestamp with time zone), closed_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), metadata (jsonb)

**`tax_codes`**　（資料量：6 筆）

id (uuid), tenant_id (uuid), tax_code (text), name_zh_tw (text), rate (numeric), direction (text), coa_id (uuid), is_active (boolean), is_system_default (boolean), description (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`transaction_types`**　（資料量：7 筆）

id (uuid), tenant_id (uuid), code (text), name_zh_tw (text), category (text), description (text), gl_template (jsonb), required_inputs (jsonb), example_ctx (jsonb), cash_flow_section (text), is_active (boolean), is_system_default (boolean), display_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid), metadata (jsonb)

**`netsuite_dim_mapping`**　（資料量：0 筆）

id (uuid), tenant_id (uuid), dealeros_dim (character varying), dealeros_id (text), netsuite_internal_id (text), netsuite_external_id (text), netsuite_segment_type (character varying), netsuite_segment_script_id (character varying), synced_at (timestamp with time zone), sync_status (character varying), sync_notes (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`system_accounting_settings`**　（資料量：1 筆）

tenant_id (uuid), output_vat_default_coa_id (uuid), input_vat_default_coa_id (uuid), withholding_5_coa_id (uuid), withholding_10_coa_id (uuid), withholding_20_coa_id (uuid), rounding_diff_gain_coa_id (uuid), rounding_diff_loss_coa_id (uuid), fx_gain_coa_id (uuid), fx_loss_coa_id (uuid), retained_earnings_coa_id (uuid), current_year_pl_coa_id (uuid), default_ar_coa_id (uuid), default_ap_coa_id (uuid), default_cash_coa_id (uuid), default_bank_coa_id (uuid), default_credit_card_coa_id (uuid), fiscal_year_start_month (integer), base_currency (text), vat_filing_period (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), updated_by (uuid), metadata (jsonb)

**`business_rules`**　（資料量：156 筆）

id (uuid), brand_id (text), rule_kind (text), scope_role_code (text), scope_store_id (uuid), scope_subsidiary_id (uuid), config (jsonb), metadata (jsonb), is_active (boolean), sort_order (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone), created_by (uuid), updated_by (uuid)

### 通知中樞 (Notification Hub)

**`notification_channels`**　（資料量：2 筆）

id (uuid), code (text), display_name (text), is_active (boolean), config (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`notification_templates`**　（資料量：24 筆）

id (uuid), code (text), event_code (text), channel_code (text), format (text), body (jsonb), description (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`notification_subscriptions`**　（資料量：13 筆）

id (uuid), event_code (text), target_id (uuid), template_code (text), filter_rules (jsonb), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), brand_id (text), module (text)

**`notification_targets`**　（資料量：6 筆）

id (uuid), channel_id (uuid), target_type (text), target_ref (text), display_name (text), metadata (jsonb), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone), brand_id (text)

**`notification_target_candidates`**　（資料量：3 筆）

id (uuid), channel_code (text), target_type (text), target_ref (text), discovered_via (text), source_user_id (text), display_name (text), last_message_text (text), last_seen_at (timestamp with time zone), message_count (integer), promoted_target_id (uuid), dismissed_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), brand_id (text)

**`notification_automation_rules`**　（資料量：3 筆）

id (uuid), brand_id (text), kind (text), name (text), trigger_event (text), trigger_config (jsonb), channel (text), template_id (uuid), description (text), is_active (boolean), metadata (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`notification_deliveries`**　（資料量：17 筆）

id (uuid), event_code (text), event_payload (jsonb), subscription_id (uuid), channel_code (text), target_ref (text), template_code (text), status (text), attempts (integer), last_error (text), rendered_body (jsonb), sent_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), brand_id (text)

### 意見回饋 / 許願單 CI-CD (Feedback)

**`feedback_tickets`**　（資料量：6 筆）

id (uuid), title (text), url (text), description (text), status (USER-DEFINED), created_by (uuid), assignee_id (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone), archived_at (timestamp with time zone), brand_id (text), metadata (jsonb)

**`feedback_comments`**　（資料量：1 筆）

id (uuid), ticket_id (uuid), author_id (uuid), body (text), created_at (timestamp with time zone), parent_id (uuid), brand_id (text), metadata (jsonb)

**`feedback_comment_attachments`**　（資料量：0 筆）

id (uuid), comment_id (uuid), uploader_id (uuid), file_name (text), mime_type (text), size_bytes (bigint), storage_path (text), created_at (timestamp with time zone), brand_id (text), metadata (jsonb)

**`feedback_canvas_snapshots`**　（資料量：2 筆）

ticket_id (uuid), snapshot (jsonb), updated_at (timestamp with time zone), brand_id (text), metadata (jsonb)

### AI・RAG・辨識 (AI / RAG / Scan)

**`rag_chunks`**　（資料量：1280 筆）

id (uuid), brand_id (text), source_type (text), source_id (uuid), chunk_index (integer), content (text), embedding (USER-DEFINED), metadata (jsonb), embedding_model (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`chat_sessions`**　（資料量：1 筆）

id (uuid), brand_id (text), user_id (uuid), title (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`chat_messages`**　（資料量：10 筆）

id (uuid), session_id (uuid), role (text), content (text), retrieved_chunks (jsonb), tokens_in (integer), tokens_out (integer), latency_ms (integer), created_at (timestamp with time zone)

**`chat_message_feedback`**　（資料量：0 筆）

id (uuid), message_id (uuid), rating (text), reason (text), created_by (uuid), created_at (timestamp with time zone), updated_at (timestamp with time zone)

**`manuals`**　（資料量：1 筆）

id (uuid), brand_id (text), title (text), description (text), storage_path (text), mime_type (text), size_bytes (integer), page_count (integer), total_chunks (integer), status (text), error_message (text), ingested_at (timestamp with time zone), uploaded_by (uuid), created_at (timestamp with time zone), vehicle_model_ids (ARRAY)

**`business_card_scans`**　（資料量：1 筆）

id (uuid), brand_id (text), storage_path (text), mime_type (text), size_bytes (integer), ai_suggestions (jsonb), ai_processed_at (timestamp with time zone), ai_latency_ms (integer), ai_tokens_in (integer), ai_tokens_out (integer), reviewed_decisions (jsonb), reviewed_at (timestamp with time zone), customer_id (uuid), duplicate_of_customer_id (uuid), created_by (uuid), created_at (timestamp with time zone)

**`driving_license_scans`**　（資料量：2 筆）

id (uuid), brand_id (text), storage_path (text), mime_type (text), size_bytes (integer), ai_suggestions (jsonb), ai_processed_at (timestamp with time zone), ai_latency_ms (integer), ai_tokens_in (integer), ai_tokens_out (integer), reviewed_decisions (jsonb), reviewed_at (timestamp with time zone), customer_id (uuid), duplicate_of_customer_id (uuid), created_by (uuid), created_at (timestamp with time zone)

**`license_plate_scans`**　（資料量：5 筆）

id (uuid), brand_id (text), storage_path (text), mime_type (text), size_bytes (integer), ai_plate (text), ai_plate_normalized (text), ai_confidence (numeric), ai_latency_ms (integer), ai_tokens_in (integer), ai_tokens_out (integer), matched_vehicle_id (uuid), matched_customer_id (uuid), created_by (uuid), created_at (timestamp with time zone)

### 其他 / 未分類

**`followup_stats_by_store`**　（資料量：—）

brand_id (text), store_id (uuid), store_name (text), total_count (bigint), open_count (bigint), closed_count (bigint), recovered_count (bigint), escalated_count (bigint), total_lost_amount (numeric), recovered_amount (numeric), avg_close_days (numeric)

**`sales_funnel_metrics`**　（資料量：—）

brand_id (text), period_type (text), period_key (text), rs_name (text), contacts (integer), builds (integer), trials (integer), quotes (integer), orders (integer), deliveries (integer)

**`v_inventory_turnover`**　（資料量：—）

brand_id (text), item_id (uuid), item_code (text), item_name (text), abc_class (text), warehouse_id (uuid), warehouse_code (text), warehouse_name (text), qty_out_12m (numeric), amount_out_12m (numeric), qty_on_hand (numeric), avg_unit_cost (numeric), turnover_rate_12m (numeric), days_of_stock (numeric)

**`v_stale_inventory`**　（資料量：—）

brand_id (text), item_id (uuid), item_code (text), item_name (text), item_category (text), abc_class (text), warehouse_id (uuid), warehouse_code (text), warehouse_name (text), qty_on_hand (numeric), avg_unit_cost (numeric), stale_amount (numeric), last_movement_at (timestamp with time zone), days_no_movement (integer), stale_severity (text)

**`v_stock_balances`**　（資料量：—）

brand_id (text), item_id (uuid), item_code (text), item_name (text), item_category (text), abc_class (text), uom (text), warehouse_id (uuid), warehouse_code (text), warehouse_name (text), qty_available (numeric), qty_reserved (numeric), qty_frozen (numeric), qty_in_transit (numeric), qty_consignment (numeric), qty_quarantine (numeric), qty_total (numeric), avg_unit_cost (numeric), last_movement_at (timestamp with time zone)

---

## 八、結論與建議

**1. 系統成熟度**：Indian 主線是一套已可運行的 dealer ERP。307/437 頁接真資料庫，核心金流鏈（採購→進貨→庫存→領料→工單→銷售→交車→發票→會計）完整貫通，且有資料量佐證（庫存異動 847 筆、領料單 279 筆、工單明細 261 筆、品號 260 筆、電訪任務 214 筆）。

**2. 收尾清單**：真正「還沒寫」的只有 28 個 Stitch HTML 頁，集中在簽核流程、集團報表、進口配額三塊；另有 24 個 demo 頁待從 mock 改接真 DB（POS、系統設定、中古車分析儀表板）。

**3. 架構紀律良好**：134 個 domain helper 把 UI 與 Supabase 解耦，天條（UI 禁止直連 supabase）落實；每張表 typed core + `metadata jsonb` 的升降級策略一致；列印走 server-side Chromium 避開瀏覽器 URL header。

**4. 建議優先序**：(a) 把簽核 5 頁從 Stitch 升級成真流程（已有審批 domain 基礎）；(b) POS 從 mock 接真 `pos_*` 表（表已存在）；(c) 中古車分析儀表板接 `used_car_*` 真資料。

