# CRM01B — 售後客戶基盤 / Phase 1 結構分析提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/02_售後CRM/CRM01B_售後客戶基盤_v1.html`
> 現行 list：`src/app/(workspace)/crm/aftersales/customer-base/_components/aftersales-customer-base-board.tsx`（478 行 DataGrid）
> 現行 detail：`src/app/(workspace)/crm/aftersales/customer-base/[id]/_components/aftersales-customer-base-detail-view.tsx`（1011 行）
> Domain helper：`src/domain/aftersales-customer-base.ts`、`src/domain/aftersales-customer-base.constants.ts`
> 對偶提案：`docs/proposals/feature-crm01-customer-base-phase1.md`（CRM01A 銷售側 / 已 BDN）
> 建檔：2026-05-16（BDN 第三輪 / phase 1 only / 待 Ming 拍板）

---

## 0. TL;DR

- **CRM01B 是 CRM01A 的售後鏡像**，但本質單純得多：不需要 leads/customers 分頁這種架構選邊題，**只是把現行 DataGrid + 獨立 detail page 改成「卡片 list + 右側 drawer」**，跟 CRM01A 的 v2 視覺語言對齊。
- **資料層 ~85% 就位**：`customers` + `customer_vehicles` + `work_orders` 已支撐現行 list 的 8 欄資料；spec 多出來的「客戶來源 badge / 保固到期 / Desmo Service 狀態 / SA 負責人 / NPS 分數 / 歷史消費總額 / 共享標籤」分四類：
  - ✅ **typed 已有**：`warranty_until`, `insurance_until`, `current_mileage`, `next_service_due_date`, `acquired_from`, `customers.source_module`
  - ⚠️ **typed 缺**：`assigned_sa` / `desmo_service_due_date`（**Q1**）
  - 🟡 **存 metadata 即可**：`metadata.nps_score` / `metadata.lifetime_spend`（衍生 cache）/ `metadata.preferred_slot`
  - ❌ **不入表、純衍生**：`return_status`（逾期/即將/正常/新客）/ `days_since_last_visit` / `next_warranty_days`
- **架構決定（不像 CRM01A 那樣需要選邊）**：directly **改造現行 component**，不另開新路由；現行 `/crm/aftersales/customer-base` 路徑、`getAftersalesCustomerBaseListPageData` helper 名字、`aftersales-customer-base-actions.ts` 都保留 — 升級內部視覺、不動 URL。
- **本提案分歧最大的點是 sidenav 與 sidebar 衝突**（DealerOS 已有 ModuleRail 56 + PagesPanel 240 = 296px，spec 又加 192px sidenav → 桌面三層 sidebar 視覺擁擠）— **預設方案是把 sidenav 收回 FilterBar + Sub Toolbar**（與 CRM01A 提案 Q4 同方向）。
- **落地拆分**：CRM01B.1（資料缺口 + helper 擴展）→ CRM01B.2（KPI 列 + 卡片 list 視覺重整）→ CRM01B.3（右側 drawer 詳情，取代現行 [id] page）→ CRM01B.4（快篩 chip + 客戶來源 badge）→ CRM01B.5（新增 modal 簡化 + RS05 提示）。
- **待 Ming 拍板 Q1-Q7**（見 §6）。

---

## 1. Spec 實際內容（逐 section）

### 1.1 Header / Sub Bar / 快篩列（3 層 sticky）

- **Top header（52px）**：DUCATI logo + `售後 CRM / CRM01B 售後客戶基盤` + v1 badge + **SA 售後專用** 綠章 + 右上 `[← CRM 導覽] [📞 電訪工作台] [＋ 新增客戶]`
- **Sub bar（白底，sticky top:52）**：搜尋框（姓名 / 電話 / 車牌 / VIN）+ 「全體 SA」select + 「所有回廠狀態」select + 「所有來源」select + 右側「共 N 筆」
- **快篩列（灰底，sticky top:104）**：`快篩：` label + 7 顆 pill button — `全部 / 🔴 逾期未回廠 / ⏰ 30天內到期保養 / 🛡️ 保固即將到期 / ⚙️ Desmo 到期提醒 / 💰 高消費客戶 / 🔗 RS05 交車同步` + 右側「⚙️ 管理篩選條件」（dashed border）

⚠️ DealerOS dual-rail shell 已佔 296px、spec 又佔 192px sidenav 跟 3 層 header — 落地時必須折疊：

- top header / sub bar / 快篩列 三層 sticky 都不照做，分配到 Topbar（`useSetPageHeader`）+ page-level FilterBar + 一條 chip 列
- **快篩 chip 列保留**（這是 spec 最有業務價值的設計）— 改成 page 內 toolbar segment
- 「管理篩選條件」 modal（spec 有完整 UI 給 SA 自定義 follow_date / mileage / warranty 條件）**v1 不做**（過度設計，6 個預設條件先夠用）

### 1.2 Layout — 兩欄（spec 規格 sidenav 192 + main flex:1）

```
┌─ Sidenav 192px ─┬─ Main flex:1 ──────────────────────┐
│ 回廠狀態        │ 統計列 5 欄                          │
│ ・全部客戶 (9)  │ ────────────────────                 │
│ ・逾期未回廠 3  │ 客戶卡片 list（vertical stack）      │
│ ・即將到期 2    │                                       │
│ ・正常 3        │                                       │
│ ・新客戶 1      │                                       │
│ ─────────       │                                       │
│ 保固 / 保險     │                                       │
│ ・保固即將到期2 │                                       │
│ ・Desmo 到期2   │                                       │
│ ・強制險到期 1  │                                       │
│ ─────────       │                                       │
│ 快速工具        │                                       │
│ ・電訪工作台    │                                       │
│ ・售後工單系統  │                                       │
│ ・NPS 滿意度    │                                       │
└─────────────────┴───────────────────────────────────────┘
```

⚠️ 跟 CRM01A 一樣的問題：DealerOS shell 56+240 已 296px，再加 192 = 488px 給 nav、main 在 1440 螢幕只剩 ~950px 寬。**預設方案**：取消 in-page sidenav，把它的內容重新分配（**Q4**）：

- 「回廠狀態」5 顆 → 拆成 FilterBar 內 select（已有）+ 上方 KPI 5 卡片本身可點當快篩
- 「保固 / 保險」3 顆 → 併入快篩 chip 列（保固即將到期、Desmo 到期 spec 本身就是兩顆快篩 pill）
- 「快速工具」3 顆 → 上方 Topbar action button 或 ★5 跨模組 banner

### 1.3 統計列（5 欄 KPI）

| 卡 | label | n | sub | border-left 顏色 |
|---|---|---|---|---|
| total | 售後客戶總數 | count(*) | 本月新增 X 位 | navy #1A3A5C |
| warn | 逾期未回廠 | count(return_status='overdue') | 需立即聯繫 | red #C8001A |
| amber | 30 天內到期保養 | count(soon) | 建議主動提醒 | amber #D4820A |
| new | 本月進廠台次 | count(work_orders.opened_at >= month_start) | 平均消費 NT$X,XXX | teal #0F6E56 |
| blue | RS05 交車同步 | count(source_module='rs05'/'sales') | 已完成 D+3 回訪 X 件 | blue #185FA5 |

第 4 卡的「本月進廠台次」與「平均消費」需 join `work_orders.total_amount` 算月平均；第 5 卡的「D+3 回訪完成」需要 `followup_cases` 表（**Q3**：要不要 v1 串）。

### 1.4 客戶卡片（list 主體 — spec 最大視覺變化）

每張卡片 from 左到右 3 區塊（spec class：`cust-card`, border-left 3px 套狀態色）：

```
┌─ Status Icon 40px ──┬─ 主資訊（flex:1）──────────────┬─ Actions（靠右）──┐
│ Status emoji 36×36  │ 姓名 + 電話 + 共享 badge        │ return-badge        │
│  ・🔴 / 🟡 / 🟢 / 🔵 │ source-badge tags row           │ 下次回廠: date      │
│ "逾期 57 天"        │ 4 個 info-item grid             │ [📞 電訪] [詳情›]   │
│                     │ note 一行 truncate              │                     │
└─────────────────────┴─────────────────────────────────┴─────────────────────┘
```

關鍵元素：
- **return-badge**（右上）4 色：`rb-overdue` 紅 / `rb-soon` 黃 / `rb-ok` 綠 / `rb-new` 藍
- **status icon**（左）大圓角方塊 + 下方天數標籤（"逾期 57 天"、"剩 12 天"、"剩 88 天"）
- **source-badge**（主資訊區）3 色：`sb-rs05` 綠（RS05 交車同步）/ `sb-walk` 藍（自行進廠）/ `sb-sa` 灰（SA 自建）
- **info-item row**（grid 4 欄）：🏍️ 車款 + 年份、📊 里程、🛡️ 保固到期、⚙️ Desmo 到期
- **tags row**：客戶標籤 `ctag` 4 色 + 共享標籤 `shared-badge`（從售後接待視角共享過來、唯讀）
- **note row**：一行 truncate `-webkit-line-clamp:1`

點卡片任一處 → 開右側 drawer。

### 1.5 Drawer（右側 520px slide-in，4 tabs）

```
┌─ Header ─ 姓名 + ×close ────────────────────┐
│ Tabs: 📋 基本資料 / 🏍️ 車輛&保固 / 🔧 工單歷史 / 📞 CRM 記錄 │
│                                                  │
│ Body (scroll)：                                  │
│   依 tab 渲染不同 section（見下）                │
│                                                  │
│ Footer: [關閉][📝 新開工單][📞 安排電訪][儲存] │
└──────────────────────────────────────────────────┘
```

各 tab 內容 spec demo：

- **基本資料**：info-grid 2 欄（電話 / 車牌 / 車款 / VIN / 年份 / 客戶來源 / 負責 SA / 加入日 / 累積消費 / 進廠次數）+ note section + 共享 SA 標籤 section（`shared-info-box` 唯讀）
- **車輛 & 保固**：info-grid 3 欄（車款 / 出廠年 / VIN / 里程 / 保養週期 / 上次保養 / 下次保養 / 保固到期 / 強制險到期 / Desmo Service 到期）— info-item 變色（warn 紅 / amber 黃 / ok 綠）
- **工單歷史**：ro-list（RO-No mono / 日期 / 金額 / 項目 / tag 陣列）— 最近 5–10 筆
- **CRM 記錄**：時間軸（type / date / result / sa）— 來自 followup_cases / call_tasks（**Q3**）

### 1.6 新增客戶 Modal

兩欄 form（11 欄）：客戶姓名* / 聯絡電話* / 車牌號碼* / 車款 / VIN / 出廠年份 / 目前里程 / 保養週期 / 保固到期日 / 強制險到期日 / 客戶來源 / 負責 SA / 備忘

頂部綠色提示：「💡 若客戶已由 **RS05 交車管理**同步，系統會自動建檔，無需重複新增。請先以電話搜尋確認。」— 這條業務規則需要在 server action 內**先 phone lookup**，找到就警告或直接 prefill（**Q5**）。

### 1.7 管理篩選條件 Modal

SA 可自訂快篩條件（條件名稱 + 條件邏輯 builder：下次回廠日 / 上次進廠日 / 目前里程 / 歷史消費總額 / 保固到期日 / Desmo 到期日 / 強制險到期日 / NPS 分數 / 客戶來源 / 負責 SA × 邏輯運算子 × 值）。

**v1 不做** — 6 個 hardcode 預設條件先夠用，未來要做時走 `business_rules` 表的 `rule_kind='aftersales_quick_filter'` + `config jsonb`（CLAUDE.md §資料存取架構慣例）。

---

## 2. 資料缺口 audit

### 2.1 `customers` 表（核心）

| spec 欄位 | DB 欄位 | 狀態 |
|---|---|---|
| 客戶代碼 | `code text` | ✅ typed |
| 客戶姓名 | `name text` | ✅ typed |
| 個人/公司 | `type text` | ✅ typed |
| 電話 | `phone text` | ✅ typed |
| Email | `email text` | ✅ typed |
| 統編 / 身份證 | `tax_id / national_id` | ✅ typed |
| 客戶來源 | `source_module text` | 🟡 typed 但語意不對齊 — spec 是「RS05 / walk / SA / referral / fb_ig / 客戶介紹」，DB 是「sales / aftersales / csi / service」（**Q2**） |
| brand 隔離 | `brand_id text` | ✅ typed |
| 啟用 | `is_active boolean` | ✅ typed |
| 加入日 | `created_at` | ✅ typed |
| 備忘 | `notes text` | ✅ typed |
| 累積消費 | — | ⚠️ **缺**（要 SUM(work_orders.total_amount)；存 typed 還是 metadata 快取？**Q6**） |
| NPS 分數 | — | ⚠️ **缺**（CRM05B 那邊有 nps_responses 表？要 join 還是 cache 在 metadata.nps_score？**Q3 + Q6**） |
| 負責 SA | — | ⚠️ **缺**（個人客戶配 SA 還是車輛配 SA？customer_vehicles 有 `preferred_technician_id` 但語意是技師不是 SA） |
| 共享標籤 | — | ⚠️ **缺**（暫塞 `metadata.shared_tags` 由售後接待視角寫入，drawer 顯示唯讀；CRM01A 同一個 Q5） |

### 2.2 `customer_vehicles` 表（車輛）

| spec 欄位 | DB 欄位 | 狀態 |
|---|---|---|
| 車牌 | `license_plate text` | ✅ typed |
| VIN | `vin text` | ✅ typed |
| 車款 | `model_id uuid` → vehicle_models | ✅ typed |
| 出廠年份 | `manufactured_year smallint` | ✅ typed |
| 目前里程 | `current_mileage numeric` | ✅ typed |
| 上次保養 | `last_service_date date` | ✅ typed |
| 下次保養 | `next_service_due_date date` | ✅ typed |
| 保固到期 | `warranty_until date` | ✅ typed |
| 強制險到期 | `insurance_until date` | ✅ typed（但 demo data 0 筆有值）|
| Desmo Service 到期 | — | ⚠️ **缺**（Ducati 重機 Desmo 是 24,000km/60,000km 階段服務、跟普通定保不同。**Q1**：typed 新欄位 `desmo_service_due_date / desmo_service_due_mileage` 還是 `metadata.desmo` 內 cache） |
| 保養週期 | — | ⚠️ **缺**（spec 的「每 10,000 km / 每 15,000 km / 每年一次」其實是 vehicle_models 的屬性、不是 customer_vehicles 的屬性 — 從 model 撈即可，無需新欄位） |
| 客戶來源（per 車輛）| `acquired_from text` | ✅ typed（demo 只有一種值、要看是 RS05/walk/sa 哪個） |

### 2.3 衍生欄位（純 query / runtime 算、不入表）

```ts
// 回廠狀態（spec 4 色）
function deriveReturnStatus(
  lastVisit: string | null,
  nextDue: string | null,
  createdAt: string,
  now: number
): 'overdue' | 'soon' | 'ok' | 'new' {
  // 新客戶：建檔 ≤ 90 天且還沒進廠
  if (!lastVisit && (now - new Date(createdAt).getTime()) <= 90 * 86400000) return 'new';
  if (!nextDue) return 'ok';
  const d = new Date(nextDue).getTime();
  if (d < now) return 'overdue';                   // 已過期
  if (d <= now + 30 * 86400000) return 'soon';      // 30 天內到期
  return 'ok';
}

// 距離天數（卡片左下「逾期 57 天 / 剩 12 天」）
function daysFromNow(d: string | null, now: number): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - now) / 86400000);
}

// 保固即將到期（warranty_until - now ≤ 60 天 且 ≥ 0）
function warrantyAlert(warranty: string | null, now: number): 'expired' | 'soon' | 'ok' | 'none' {
  if (!warranty) return 'none';
  const days = Math.round((new Date(warranty).getTime() - now) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 60) return 'soon';
  return 'ok';
}
```

⚠️ **語意對齊**：現行 `aftersales-customer-base.constants.ts` 的 `AftersalesServiceStatus`（`active_service / at_risk / dormant / unknown`）跟 spec 的 4 色（`overdue / soon / ok / new`）**語意不完全一致**：

- 現行 `at_risk` = 60 天內到期 ≈ spec `soon`
- 現行 `dormant` = 6 個月沒進廠 ≈ spec `overdue`（spec 看的是 next_due_date 過期、現行看的是 last_visit_at 過期）
- 現行 `active_service` = 90 天內有預定保養 ≈ spec `ok`
- 現行 `unknown` ≠ spec `new`（spec 用建檔日 < 90 天判定新客戶）

**Q7**：要不要把 enum rename 對齊 spec、或保留現行 enum 加 mapping 函式？

### 2.4 demo data 現況

```
ducati: 5 customers / 0 vehicles / 0 work_orders
indian: 6 customers / 5 vehicles / 8 work_orders
```

依專案規範 demo 一律 indian — 落地時要在 indian 那 6 客戶上多塞：
- warranty_until 已有 5/5（OK）
- insurance_until 0/5 → 補
- desmo_service_due_date（新欄位）→ 補
- customers.metadata（NPS / lifetime_spend / shared_tags / preferred_slot 等）→ 補
- 數量：spec demo 卡片有 9 筆、現有 6 筆 — 是否要加到 9 筆做出 4 種狀態各 2-3 筆？（**Q5**）

### 2.5 既有 helper / 既有 actions 可 reuse

| 檔 | 現況 | 處置 |
|---|---|---|
| `src/domain/aftersales-customer-base.ts` | 178 行 helper、`getAftersalesCustomerBaseListPageData` + `getAftersalesCustomerDetail` | ✅ 保留 + 擴展 row type（加 `return_status / warranty_alert / source_badge / desmo_due / days_since_visit / shared_tags[]`） |
| `src/domain/aftersales-customer-base.constants.ts` | 35 行 enum | ⚠️ 看 Q7 結論決定是否 rename enum |
| `src/lib/aftersales/customer-base-actions.ts` | server actions 已是 `Result<T>` 型別 | ✅ 不動 |
| `src/app/(workspace)/crm/aftersales/customer-base/[id]/_components/aftersales-customer-base-detail-view.tsx` | 1011 行 detail page | 🟡 **本提案最大爭議**：spec 把 detail 改成 drawer、現行 detail page 1011 行（含車輛 / 工單 / 預約 tabs + 編輯 modal） — 砍掉重練是浪費、保留作為 fallback 全頁編輯（在 drawer 點「展開完整檢視」連到 [id] page）— **Q4**：drawer 取代還是 drawer + detail page 並存？ |

### 2.6 缺口總表

| 項目 | 現況 | 處置 |
|---|---|---|
| customers 主檔欄位（spec 顯示用） | ✅ 全到位 | 不動 |
| customer_vehicles 主檔欄位 | ⚠️ 缺 desmo_service_due_date | **Q1** typed vs metadata |
| 負責 SA | ⚠️ 缺 | **Q1** 是否加 `customers.assigned_sa_user_id uuid` |
| 累積消費 / NPS 分數 | ⚠️ 缺 | **Q6** metadata cache vs runtime query |
| 共享標籤（從售後接待視角） | ⚠️ 缺 | **Q3** v1 hide / 即時 join / metadata cache |
| source_module 對映 | ⚠️ 語意不齊 | **Q2** 加 mapping 函式 or 改 enum |
| return_status 衍生 | ⚠️ 衍生欄位 | 寫 util 函式 |
| return_status enum 命名 | ⚠️ 跟現行 enum 衝突 | **Q7** rename or mapping |
| insurance_until 0 筆 demo data | ⚠️ 0 筆 | 補 fixture |
| Desmo Service 排程邏輯 | ⚠️ 缺商業規則 | **Q1.5** v1 hardcode 24,000/60,000 km / v2 走 service_schedules 表 |

---

## 3. 預設架構（不像 CRM01A 那樣需要選邊）

### 3.1 路由保留現行

```
/crm/aftersales/customer-base                ← list（升級為卡片）
/crm/aftersales/customer-base/[id]            ← detail（保留作為「展開全頁」備援，drawer 是主入口）
/crm/aftersales/customer-base/new             ← 新增（modal 開啟前的 server-render route，UX 整合進 list 內 modal）
```

**不另開新路由** — 跟 CRM01A 不同（CRM01A 有 leads vs customers 概念分歧），CRM01B 本身就是「客戶 + 售後視角」一條動線、沒有概念衝突。

### 3.2 資料層（domain helper 擴展）

```ts
// src/domain/aftersales-customer-base.ts — 擴展 row type
export type AftersalesCustomerBaseRow = {
  // ── 既有 typed ──
  id: string;
  code: string;
  name: string;
  type: 'individual' | 'corporate';
  phone: string | null;
  email: string | null;
  is_active: boolean;
  primary_license_plate: string | null;
  primary_mileage: number | null;
  vehicle_count: number;
  visit_count: number;
  last_visit_at: string | null;
  last_ro_no: string | null;
  next_due_date: string | null;
  // ── 新增（spec 多出來的）──
  primary_model_name: string | null;            // 解 model_id → vehicle_models.display_name
  primary_year: number | null;                  // customer_vehicles.manufactured_year
  warranty_until: string | null;                // customer_vehicles.warranty_until (min)
  insurance_until: string | null;               // customer_vehicles.insurance_until (min)
  desmo_due_date: string | null;                // ⚠️ Q1：typed 新欄位 or metadata
  source_module: string | null;                 // customers.source_module（看 Q2 是否 mapping）
  assigned_sa: { id: string; name: string } | null;  // ⚠️ Q1：典型 SA
  nps_score: number | null;                     // ⚠️ Q3 + Q6
  lifetime_spend: number;                       // ⚠️ Q6：SUM(work_orders.total_amount) or metadata cache
  shared_tags: { label: string; color: 'red'|'amber'|'teal'|'blue' }[];  // ⚠️ Q3
  custom_tags: { label: string; color: 'red'|'amber'|'teal'|'blue' }[];  // metadata.tags
  notes: string | null;
  // ── 衍生（runtime 算）──
  return_status: 'overdue' | 'soon' | 'ok' | 'new';
  days_until_next_due: number | null;           // 卡片左下「剩 12 天 / 逾期 57 天」用
  warranty_alert: 'expired' | 'soon' | 'ok' | 'none';
  desmo_alert: 'expired' | 'soon' | 'ok' | 'none';
};
```

KPI 一支 query 一次回：

```ts
export type AftersalesCustomerBaseKpi = {
  total: number;
  overdue: number;          // return_status='overdue'
  soon: number;             // return_status='soon'
  this_month_visits: number;  // count(work_orders.opened_at >= month_start)
  avg_spend_this_month: number;  // avg(work_orders.total_amount this month)
  rs05_count: number;       // count(source_module='sales'/'rs05')
  rs05_d3_done: number;     // count(followup_cases.kind='d3' AND status='done' this month) — Q3
};
```

### 3.3 預設 schema 補丁（**待 Ming 拍板**）

```sql
-- 預設方案 A：典型 SA 欄位走 typed（**Q1**）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_sa_user_id uuid REFERENCES auth.users(id);

-- 預設方案 A：Desmo Service 走 typed（**Q1**）— 因為 CRM 多處（CRM03B 電訪、CRM05B NPS、CRM01B 本頁）都會用
ALTER TABLE customer_vehicles ADD COLUMN IF NOT EXISTS desmo_service_due_date date;
ALTER TABLE customer_vehicles ADD COLUMN IF NOT EXISTS desmo_service_due_mileage numeric;

-- NPS 分數、共享標籤、累積消費 cache → metadata（**Q6**）
-- 不開新欄位、塞 customers.metadata.nps_score / .shared_tags / .lifetime_spend_cache
```

### 3.4 UI 視覺重整對映

| spec 結構 | DealerOS 落地 |
|---|---|
| Top header | Topbar（`useSetPageHeader`：title `售後客戶基盤` + tabs 隱藏 + search ON） |
| Sub bar 3 select + 搜尋 | FilterBar（4 欄）+ 主操作 pill `[查詢][重置][＋ 新增]` |
| 快篩列 7 chip | Toolbar segment 7 顆 chip（在 KPI 列下方、卡片列上方）— spec UI 保留 |
| Sidenav 192px | **取消**、內容重分配（KPI 卡可點當快篩 + chip 列） |
| 統計列 5 欄 | KPI 5 卡（同 spec 視覺、border-left 顏色直接套）— 加 `aria-pressed` 可點 |
| 客戶卡片 list | 卡片 list（保留 spec 結構：左 status icon / 中主資訊 / 右 actions） |
| 詳情 drawer 520px | 右側 slide-in drawer（fixed + transform，4 tabs：基本資料 / 車輛 & 保固 / 工單歷史 / CRM 記錄） |
| 新增客戶 modal | Modal（沿用現行 Modal helper）+ 內建 phone duplicate check |
| 管理篩選條件 modal | **v1 不做**（hardcode 6 個預設） |

### 3.5 為什麼 drawer 不直接砍掉現行 [id] detail page

現行 detail page 1011 行已含：
- 完整 KV grid（10+ 欄）
- 多車輛 tabs（每車一個 tab）
- 編輯 modal（PATCH 主檔）
- 工單列表（30 筆）
- 預約列表（20 筆）

drawer 限 520px 寬，spec demo 的 4 tabs 每 tab 只展示最近 5–10 筆 — 量大時不夠用。**建議drawer 內加一條「展開完整檢視 →」連到 `/[id]` 全頁**，雙模式並存：

- **drawer**：快速瀏覽、修改 notes / NPS、跳轉電訪、新開工單（80% 場景）
- **detail page**：深度檢視、批次車輛維護、多筆工單比對（20% 場景）

工時：drawer 是新建 component、現行 detail page 不動（只在 list 卡片點擊改為開 drawer 而非 navigate）— **(Q4)**。

---

## 4. 落地拆分（後續 BDN 條目）

### BDN CRM01B.1 · 資料缺口補齊 + helper 擴展（M, 1 天）

- 視 **Q1 / Q6** 拍板結果決定 schema：
  - 若 Q1.a → 跑 `ALTER TABLE customers ADD COLUMN assigned_sa_user_id` + `customer_vehicles ADD COLUMN desmo_service_due_date / desmo_service_due_mileage`
  - 若 Q1.b → 全部塞 metadata，無 DDL
- 補 indian demo fixture（insurance_until / desmo_due_date / customers.metadata.nps_score / metadata.shared_tags / metadata.lifetime_spend_cache）— 補到 6 筆並包含 4 種 return_status
- 擴展 `src/domain/aftersales-customer-base.ts` 的 row type（§3.2）
- 寫 `deriveReturnStatus / daysFromNow / warrantyAlert / desmoAlert` util 函式
- 視 Q7 拍板決定是否 rename `AftersalesServiceStatus` enum 對齊 `overdue/soon/ok/new`
- 寫 `getAftersalesCustomerBaseKpi(filters)` helper（一支 query 回 KPI 物件）
- 視 Q3 結論決定 `shared_tags` / `nps_score` 取得路徑

### BDN CRM01B.2 · KPI 列 + 卡片 list 視覺重整（M, 1.5 天）

- 把現行 `aftersales-customer-base-board.tsx`（DataGrid）改為卡片 list
- 新增 KPI 5 卡（可點當快篩）
- 卡片內三區塊（status icon / 主資訊 / actions）
- 客戶來源 badge / return-badge / source-badge 3 套 chip
- 4 個 info-item grid（車款 / 里程 / 保固 / Desmo）
- note 一行 truncate
- 沿用 `EmptyState` / `Banner` / 既有 server actions（停用 / 啟用 / 刪除）
- 不動 helper API、只改 component 視覺

### BDN CRM01B.3 · 右側 drawer 4 tabs（M, 1.5 天）

- 新 component：`src/app/(workspace)/crm/aftersales/customer-base/_components/customer-detail-drawer.tsx`
- 520px slide-in（fixed right + transform，跟 spec 對齊；overlay 半透明）
- 4 tabs（基本資料 / 車輛 & 保固 / 工單歷史 / CRM 記錄）
- 基本資料 tab：info-grid 2 欄 + note + 共享標籤 box
- 車輛 & 保固 tab：info-grid 3 欄、info-item 變色（warn/amber/ok）
- 工單歷史 tab：ro-list（最近 5 筆，footer「→ 更多歷史」連到 [id] page）
- CRM 記錄 tab：時間軸（依 Q3 結論決定資料源）
- footer 4 顆 button：[關閉][📝 新開工單][📞 安排電訪][儲存]
- 加「展開完整檢視 →」連到 [id] page

### BDN CRM01B.4 · 快篩 chip + 客戶來源 filter（S, 0.5 天）

- 快篩 chip 列 7 顆（全部 / 逾期 / 30天 / 保固 / Desmo / 高消費 / RS05）
- 客戶來源 select（spec：所有來源 / RS05 / walk / SA） — Q2 處理 mapping
- 快篩跟 URL searchParams 整合、refresh 不掉 state
- KPI 卡可點當快篩（按下加 `aria-pressed` + 同步 URL）
- 管理篩選條件 modal **不做**（hardcode 預設）

### BDN CRM01B.5 · 新增 modal + RS05 phone duplicate 檢查（S, 0.5 天）

- 簡化現行 `/new` page（變 modal）— 11 欄 two-col form
- 內建 phone duplicate check：blur 後查 `customers.phone` + `customer_vehicles.license_plate`、有 hit 顯示綠 banner「該客戶已由 RS05 同步」
- 整合既有 `createAftersalesCustomerAction` server action
- 視 Q5 結論決定要不要先做「合併進現有客戶」流程

**總計**：5 天（M + M + M + S + S）。

---

## 5. 邊界與不在範圍

- 不寫任何 `src/` code、不跑 migration、不動 nav_nodes
- 不做 Playwright 驗證
- 不動其他 BDN 條目
- CRM02B / CRM03B / CRM04B / CRM05B / CRM06B 售後側其他頁 v1 升級不在此次
- spec 的「管理快篩條件」modal v1 不做（過度設計）
- 售後接待視角 `/parts/aftersales/customers`（雙視角共享資料）不動（CRM01B 是 CRM 視角）

---

## 6. 待 Ming 拍板的決策清單

> **Q1**：Desmo Service 到期日 + 負責 SA 用 typed column 還是 metadata？
> - (a) typed（`customer_vehicles.desmo_service_due_date / desmo_service_due_mileage` + `customers.assigned_sa_user_id`）— 推薦（CRM 多處用 / 報表查詢 / RLS 可能要看）
> - (b) metadata（`customer_vehicles.metadata.desmo` + `customers.metadata.assigned_sa`）— 快、零 DDL
> - (c) 折衷：Desmo typed（多處用）、assigned_sa metadata（暫定）

> **Q1.5**：Desmo Service 排程規則 v1 怎麼算？
> - (a) hardcode：Panigale/Streetfighter/Multistrada V4 = 24,000 km；Monster/Scrambler/SuperSport/Hypermotard = 60,000 km
> - (b) 不算、純依賴 `desmo_service_due_date` 欄位由 SA 手填
> - (c) 走 `service_schedules` 表（dealer-demo 已有 schema 但 schema 沒落地）— v2 再做

> **Q2**：spec 的「客戶來源」（RS05 / walk / SA / referral / fb_ig）跟 DB `customers.source_module`（sales / aftersales / csi / service）語意不齊，怎麼對映？
> - (a) 加 mapping 函式：source_module='sales' → source_badge='RS05'；'aftersales' → 'walk'；'csi'/'service' → 'sa'
> - (b) 改 enum：新增 typed 欄位 `customers.acquisition_channel text`（RS05 / walk / sa / referral / fb_ig），保留 source_module 作系統來源
> - (c) 維持 source_module、display 直接顯示原值（demo 階段先這樣）

> **Q3**：drawer 內 NPS 分數 / 共享標籤 / CRM 記錄時間軸 v1 怎麼做？
> - (a) v1 全部 hide / 顯示 placeholder，等 CRM05B（NPS）+ CRM03B（電訪）+ followup_cases / customer_tags 表落地後再串
> - (b) 即時 join：drawer 開啟時 fetch（多 round-trip）
> - (c) cache 在 customers.metadata（webhook 同步 / nightly job）— 過度設計
> - 推薦 (a)，等對應模組 v2 升級後串

> **Q4**：drawer vs 現行 [id] detail page 並存策略？
> - (a) drawer 完全取代 detail page、`/[id]` 改成 redirect 回 list 並開 drawer — spec 對齊但砍掉 1011 行
> - (b) drawer 是主入口、detail page 保留作為「展開完整檢視」（drawer footer 加按鈕連過去）— 推薦
> - (c) drawer 顯示摘要、編輯動作（修改 / 刪除 / 停用）一律 redirect 到 [id]

> **Q5**：新增客戶 modal 的 phone duplicate check + RS05 合併流程？
> - (a) blur 時 fetch、找到 phone 重複顯示綠 banner「該客戶已存在、是否切換到該客戶？」+ 連結
> - (b) submit 時 check、撞到顯示 modal 「合併資料還是新建？」
> - (c) v1 不做、純信任 SA 不重複建檔（demo 階段）

> **Q6**：累積消費 / NPS 分數 cache 還是 runtime？
> - (a) cache 在 `customers.metadata.lifetime_spend_cache`（nightly job 跑 + work_order close 時觸發 trigger）— 列表查詢快
> - (b) runtime SUM(work_orders.total_amount)（每次列表 query 都跑） — 慢但乾淨
> - (c) v1 不顯示（卡片不放這欄、drawer 才即時算）

> **Q7**：現行 `AftersalesServiceStatus` enum（`active_service / at_risk / dormant / unknown`）跟 spec 的 4 色（`overdue / soon / ok / new`）對齊？
> - (a) rename enum 對齊 spec（推薦，畢竟 spec 才是 design intent）
> - (b) 保留現行 enum、加 mapping 函式（不破壞既有 component）
> - (c) 雙 enum 並存（type-only / display-only）

---

## 7. 不在本提案範圍

- 不寫任何 `src/` code、不跑 migration、不動 nav_nodes
- 不做 Playwright 驗證
- 不動其他 BDN 條目
- CRM01A 銷售側、CRM03B 電訪工作台、CRM05B NPS 看板 v1/v2 升級不在此次討論
- 售後接待視角 `/parts/aftersales/customers` 不動

---

**等 Ming 拍板（Q1-Q7 七點 + Q1.5）後**，由執行 sub-agent 接 CRM01B.1 開工。

---

## 2026-05-17 schema 盤點補充（Batch 1 Step 0 sub-agent）

> 為了第四輪 BDN Batch 1（共用元件抽取 + CRM01A/CRM01B 套用）開工前確認資料層現況，跑了 `information_schema.columns` audit。**結論：跟 §2 proposal 的初步盤點完全一致**，沒新驚喜。

### Batch 1 BDN 列出的 8 個關鍵欄位 vs 實際 DB 現況

| BDN spec 欄位 | DB 對映 | 現況 | v1 落地建議 |
|---|---|---|---|
| `rs05_sync_flag` | `customers.source_module` (text) | ✅ 已有；值為 `sales` 即 RS05 同步 | runtime derive：`source_module === 'sales' \|\| acquired_from === 'rs05'` |
| `desmo_due_date` | — | ❌ **缺 typed**；可暫塞 `customer_vehicles.metadata.desmo_due_date` | **Q1**：推 typed `customer_vehicles.desmo_service_due_date date` + `desmo_service_due_mileage numeric`（CRM 多處用） |
| `warranty_due_date` | `customer_vehicles.warranty_until` (date) | ✅ 已有 typed | 直接用 |
| `cumulative_spend` | — | ❌ **缺**；無 typed 也無 metadata 慣例 | **Q6**：runtime `SUM(repair_orders.total_amount)` v1 OK；上量後 cache 在 `customers.metadata.lifetime_spend_cache` |
| `sa_assignee_id` | — | ❌ **缺**；`customer_vehicles.preferred_technician_id` 是技師非 SA | **Q1**：推 typed `customers.assigned_sa_user_id uuid REFERENCES auth.users(id)` |
| `nps_score` | `nps_responses.score` (smallint) | ✅ 表已有 60 筆 demo；客戶最新分數要 join `nps_responses ORDER BY responded_at DESC LIMIT 1` | runtime join；可選 cache `customers.metadata.latest_nps_score` |
| `last_visit_date` | `repair_orders` / `work_orders` (兩張都有) | ✅ 兩張表都有 `opened_at` / `created_at`；現行 helper 用 `work_orders` 算 | 現行 helper 已 derive 為 `last_visit_at`，沿用 |
| `overdue_days` | — | ❌ 純衍生 | runtime util `daysFromNow(next_service_due_date)` 負值即逾期 |

### 鄰近表盤點

- `customer_tags` (22 rows) + `customer_personal_tags` (7 rows)：**共享標籤已有專屬表**，spec proposal §2.1 寫的「metadata.shared_tags」可改用 join `customer_tags` —— Q3 推薦 (a) v1 hide、待 CRM03B/CRM05B 落地後串時直接走 typed 表
- `nps_responses` (60 rows, `score` + `category` + `responded_at` + `kind`) ：Q3 推薦 (a) 但「v1 至少在 KPI 卡顯示推薦/被動/批評統計」做得到，不需要 hide
- `followup_cases` (12 rows, `case_no` + `status` + `last_contacted_at` + `sa_name`)：CRM 記錄 tab 可即時 join、不用 metadata cache
- `call_tasks` (15 rows, `kind` + `scheduled_at` + `call_result`)：電訪卡 source；CRM01B drawer 「CRM 記錄」tab 可顯示

### Batch 1 Step 0 不動 schema 的理由

本 sub-agent 範圍是「抽 4 個共用元件 + sandbox 預覽頁」、**純 UI**，不需要打 DB。Q1（typed assigned_sa_user_id + desmo_service_due_date 加欄位）的 DDL 留給 CRM01B.1 開工的下一個 sub-agent 跑，Ming 拍板 Q1 後再 apply migration。

### 共用元件 props 設計呼應的 schema 對映

4 個元件 props 全部接 `customer_vehicles` / `customers` 既有 typed 欄位 + 衍生 string/enum，不依賴尚未存在的欄位（`desmo_due_date` 等）—— 落地時 caller 傳 `null` 即可，元件不會炸。這代表 **共用元件不被 Q1-Q7 拍板結果綁住**，可先抽元件、後拍板 schema。

