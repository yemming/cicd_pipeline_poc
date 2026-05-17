# CRM01A — 銷售客戶基盤 v2 / Phase 1 結構分析提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/01_銷售CRM/CRM01A_銷售客戶基盤_v2.html`
> 現行：`src/app/(workspace)/crm/sales/customer-base/_components/customer-base-board.tsx`（419 行 DataGrid）
> 建檔：2026-05-16（BDN 第三輪 / phase 1 only / 待 Ming 拍板）

---

## 0. TL;DR

- **Spec v2 不是現行 customer-base 的進化版** — 它要的是「**潛客 (sales_lead)**」視角，而現行 customer-base 是「**已成交 ERP 客戶 (customer)**」視角。兩者本質不同。
- **資料層 ~95% 已就位**：`sales_leads` 表已有 `habc / intent_model / rs_name / follow_date / last_visit_at / source / dormancy_status / metadata` 全套欄位，indian brand 已有 8 筆 dormancy_status='active' 的 demo row，metadata 內甚至**已內建 spec 要的 tags + timeline 陣列**（前人留下的 future hook）。
- **架構選邊題**（必須 Ming 拍板）：
  - **(A) 改造 customer-base** — 把 customer-base 整頁拆掉、改吃 sales_leads；ERP 視角搬去 `/admin/master-data/customers`
  - **(B) 另開 leads-board** — 新建 `/crm/sales/leads-board`（or `/leads`），customer-base 不動
  - sub-agent **傾向 (B)**（理由 §3.3），但這是策略題、不自選。
- **落地拆分**：CRM01.1（資料缺口、最小）→ CRM01.2（卡片 list）→ CRM01.3（看板 + 雙模式）→ CRM01.4（drawer + KPI）→ CRM01.5（新增 modal + CRM03A 串接）。

---

## 1. Spec 實際內容（逐 section）

### 1.1 Header / Sub Bar（共 104px sticky）

- Top header（52px）：品牌 logo + 模組名 + v2 badge + 右上 [← 總覽] [電訪工作台] [＋ 新增潛客]
- Sub bar（白底 borderbottom）：搜尋框（姓名 / 電話 / 車款）+ 「全體 RS」select + 「跟進狀態」select（urgent / today / ok / none）+ view-toggle（**☰ 列表** ↔ **⊞ 看板**）+ 右側「共 N 筆」
- ⚠️ 我們是 dual-rail shell（ModuleRail + PagesPanel + Topbar），spec 的 header / sub bar 落地時要拆：
  - Topbar 用 `useSetPageHeader()` 設 title / tabs（view-toggle 走 tabs 或 toolbar segment）/ search
  - 「＋ 新增潛客」按鈕走 page-level toolbar（不是 Topbar 全域按鈕）

### 1.2 Layout — 三欄

```
┌─ Sidenav 190px ─┬─ Main flex:1 ──────────────────────┐
│ HABC 快篩       │ 統計列 5 欄                          │
│ ・全部潛客      │ ────────────────────                 │
│ ・H 熱潛客      │ 列表 / 看板（view switch）            │
│ ・A 積極跟進    │                                       │
│ ・B 培養中      │                                       │
│ ・C 長期維護    │                                       │
│ ─────────       │                                       │
│ 跟進狀態        │                                       │
│ ・逾期未跟進    │                                       │
│ ・今日需跟進    │                                       │
│ ─────────       │                                       │
│ 快速工具        │                                       │
│ ・電訪工作台    │                                       │
│ ・銷售漏斗看板  │                                       │
└─────────────────┴───────────────────────────────────────┘
```

⚠️ DealerOS shell 左邊已經有 ModuleRail (56px) + PagesPanel (240px)。如果再加一條 190px sidenav 變四欄：56 + 240 + 190 + main，桌面寬度吃不消。**建議走 in-page sidenav**（main 內部左欄）— `<aside class="w-[190px]"> + <section class="flex-1">`、跟現行 PagesPanel 並列（這跟 Q4 有關，等 Ming 拍）。

### 1.3 統計列（5 欄 KPI）

| 卡 | label | n | sub | border-left 顏色 |
|---|---|---|---|---|
| total | 全部潛客 | count(*) | 本月新增 X 位 | navy #1A3A5C |
| H | H 熱潛客 | count(habc='H') | 需本週內跟進 | red #C8001A |
| A | A 積極跟進 | count(habc='A') | 3 個月內購買 | amber #F0C97E |
| B | B 培養中 | count(habc='B') | 半年左右 | blue #185FA5 |
| C | C 長期維護 | count(habc='C') | 每月維持接觸 | gray #9A9890 |

「本月新增 X」需要：`count(created_at >= date_trunc('month', now()))`、純資訊性、可在同一 query 算出來。

### 1.4 列表 view — 客戶卡片

每張卡的結構（從左到右）：

```
┌─ grade-pill 32×32 ─┬─ 主資訊（flex-1）──────┬─ 動作（靠右）──┐
│  H / A / B / C    │ 姓名 + 電話 + tags        │ follow-badge   │
│  N 天前           │ 🏍️ bike  👤 RS  📥 source │ 下次跟進: date │
│                   │ note 一行 truncate         │ [電訪] [詳情›] │
└───────────────────┴────────────────────────────┴────────────────┘
```

- `cust-card` 左 border-left 3px 套 grade 顏色
- `tags` 是 chip 陣列（red/yellow/green/blue）— 來自 `metadata.tags`
- `follow-badge` 4 色：urgent / today / ok / none
- `days-ago` = `now - last_visit_at`
- 點卡片任一處 → 開 drawer

### 1.5 看板 view — Kanban 4 欄

按 habc 分 4 欄（H / A / B / C），每張小 kb-card 顯示：姓名 / 車款 / 前 2 個 tag / RS / follow-badge。**spec 沒做拖拉**（onclick 開 drawer 而已），所以 v1 不需 react-dnd。

### 1.6 Detail Drawer（右側 480px 滑出）

由上到下的 section：

1. **SA 共享標籤**（P-08 唯讀）— `c.saTags`、來自售後側、唯讀；本表沒這欄位、暫塞 `metadata.sa_tags` 或從 followup_cases 撈。**確認題：Q5**
2. **基本資料 info-grid（2 欄）**：HABC chip / 電話 / 意向車款 / 負責 RS / 最後到訪 / 下次跟進 / 來源管道（跨欄）
3. **客戶標籤** — 來自 `metadata.tags`，可編輯（spec 沒做編輯 UI 但暗示 P-08 之外的都是「我的觀察」）
4. **備註** — `sales_leads.note`
5. **接觸時間軸** — `metadata.timeline` 陣列（dot / time / text）；長期應走 normalized 表，但 v1 沿用 metadata 即可
6. **調整 HABC** — 4 顆大按鈕直接切

Drawer footer：[關閉] [開新手卡 → RS01] [📞 安排電訪 → CRM03A] [儲存]

### 1.7 新增潛客 Modal

兩欄 form：

- 客戶姓名*（text）
- 聯絡電話*（tel）
- 意向車款（select：Panigale V4 / V2 / Streetfighter V4 / V2 / Monster SP / Multistrada V4 / Diavel V4 / Scrambler）
- HABC 級別*（select，預設 A）
- 負責 RS（select）
- 來源（select：RS01 手卡同步 / 展廳到訪 / 車展活動 / FB IG 社群 / 老車主轉介紹 / DRE 活動）
- 備註（textarea）
- 下次跟進日期（date）— 「儲存後自動排程至 CRM03A 電訪工作台」

→ 寫 `sales_leads` + 寫 `call_tasks`（CRM03A 那張）— **這是 Q1 串接點**。

---

## 2. 資料缺口 audit

### 2.1 `sales_leads`（核心表）— 95% 就位

| spec 欄位 | DB 欄位 | 狀態 |
|---|---|---|
| HABC 級別 | `habc text` | ✅ typed |
| 客戶姓名 | `name text` | ✅ typed |
| 電話 | `phone text` | ✅ typed |
| Email | `email text` | ✅ typed |
| 意向車款 | `intent_model text` | ✅ typed |
| 來源 | `source text` | ✅ typed |
| 負責 RS | `rs_name text` | ✅ typed（注意：純名字字串、沒 FK 到 sales_staff，Q2） |
| 下次跟進日 | `follow_date date` | ✅ typed |
| 最後到訪 | `last_visit_at date` | ✅ typed |
| 備註 | `note text` | ✅ typed |
| 跟進狀態 | — | ⚠️ **缺**（spec 的 urgent/today/ok/none 是**衍生欄位** = follow_date vs now 推導，不需 store） |
| 客戶標籤 | `metadata.tags` | ✅ jsonb（已有 demo data） |
| 接觸時間軸 | `metadata.timeline` | ✅ jsonb（已有 demo data） |
| dormancy | `dormancy_status text` | ✅ typed（active / dormant / lost / revived；本頁只看 active） |
| kind | `kind text default 'sales'` | ✅ typed |
| brand 隔離 | `brand_id text` | ✅ typed |
| assignee | `assignee_id uuid` | ✅ typed（vs rs_name，雙存 — Q2） |
| converted | `converted_customer_id uuid` | ✅ typed（轉成交客戶用） |

### 2.2 跟進狀態衍生邏輯（不入表、純 query 算）

```ts
function deriveFollowStatus(followDate: string | null, today: Date): 'urgent' | 'today' | 'ok' | 'none' {
  if (!followDate) return 'none';
  const d = new Date(followDate).getTime();
  const t = today.getTime();
  if (d < t - 86400000) return 'urgent';   // 已過期
  if (d <= t + 86400000) return 'today';   // 今明
  return 'ok';                              // 未來
}
```

### 2.3 SA 共享標籤（Q5）

spec 把售後側 P-08 標籤共享到 sales drawer（唯讀）。三條路：

- (i) sales_leads.metadata.sa_tags（drawer 開啟時去 followup_cases / customer_tags 撈再 cache） — 簡單但有 staleness
- (ii) 即時 join — drawer 開啟時 fetch `getSaTagsForCustomer(lead_id or phone)` — 較準但多一 round trip
- (iii) v1 不做（暫 hide）— 等 SA 側標籤體系定下來再串

### 2.4 demo data 現況

```
indian / kind=sales / dormancy=active     8 筆 ← 直接給 v2 用
indian / kind=sales / dormancy=dormant    2 筆 ← dormant-leads 頁吃
indian / kind=sales / dormancy=lost       2 筆 ← dormant-leads 頁吃
indian / kind=sales / dormancy=revived    1 筆 ← dormant-leads 頁吃
ducati：0 筆（依專案規範，demo 一律 indian）
```

active 那 8 筆 metadata 已有 `tags` + `timeline`，**完全可以直接渲染**（前人已照 spec 預灌）。

### 2.5 缺口總表

| 項目 | 現況 | 處置 |
|---|---|---|
| sales_leads 主檔欄位 | ✅ 全部到位 | 不動 |
| metadata.tags 結構 | ✅ 已有 demo | 補 helper：`normalizeTags(metadata) → { color, label }[]` |
| metadata.timeline 結構 | ✅ 已有 demo | 補 helper：`getTimeline(metadata)` |
| follow_status 衍生 | ⚠️ 衍生欄位 | 寫 `deriveFollowStatus()` util |
| sales_lead → call_task 自動排程 | ⚠️ 待實作 | helper 建議 `createLeadWithAutoCallTask()`（Q1） |
| SA 共享標籤 | ⚠️ 待設計 | Q5 |
| RS 下拉清單來源 | ⚠️ 寫死 vs 撈 sales_staff | Q2 |

### 2.6 既有 helper / 既有頁面 可 reuse

- `src/domain/sales-dormant-leads.ts` — 已操作 sales_leads，row type 可 reuse / 擴展
- `src/domain/sales-call-tasks.ts` — call_tasks 表的 helper，建單時用它寫入
- `src/app/(workspace)/crm/sales/dormant-leads/_components/dormant-leads-board.tsx` — 已是 sales_leads 視角的 list view 範本，可 fork

---

## 3. 架構選邊提案（必須 Ming 拍板）

### 3.1 (A) 改造 customer-base → 升級為「潛客 + 已成交客」混合視角

**做法**：把現行 customer-base 整頁掀掉，改成讀 sales_leads（active）；已成交客戶切到 `/admin/master-data/customers` 或 `customer-base` 加個「已成交 tab」。

**利**：
- 路由不變、入口連續性高
- sidebar 不用新增條目

**弊**：
- ❌ 概念混淆：customer-base 字面意思「客戶基盤」應是已成交，現在突然變潛客
- ❌ 撞掉現行 `/crm/sales/customer-base/[id]` detail page（已寫好的 ERP 客戶詳情）
- ❌ DataGrid 顯示 ERP 統編 / 應收 / 車輛數的需求**沒消失**（會計報表會用、admin 仍需要）— 等於要在另一頁重建一次
- ❌ 跟現行 `/crm/sales/dormant-leads`（dormant + lost + revived）切分變奇怪：「active 潛客在 customer-base、休眠潛客在 dormant-leads」？同一張表強行切兩頁

**工時估**：~6 天（含搬遷 detail page + 改現有 sidebar 路由 + 教育使用者新語意）

### 3.2 (B) 另開 `/crm/sales/leads-board`（or `/crm/sales/leads`），customer-base 不動

**做法**：新建 leads-board 頁（4 view：list / kanban / drawer / 統計）、吃 sales_leads where dormancy_status='active' AND kind='sales'。customer-base 保留 ERP 已成交視角不動。

**利**：
- ✅ 語意清楚：leads-board = 潛客流程、customer-base = 已成交客戶（兩條獨立業務動線）
- ✅ 跟現有 dormant-leads 對稱：`active leads（CRM01）→ dormant leads（CRM04）→ lost leads（CRM04）` 三頁吃同一張 sales_leads，dormancy_status 切分
- ✅ 不破壞既有 customer-base 既有 detail page + Excel 匯出 + ERP 客戶報表
- ✅ converted_customer_id 是天然 bridge：潛客成交 → 寫 customers row → 設 `sales_leads.converted_customer_id`、流程閉環

**弊**：
- 路由多一個入口（sidebar 新增一條）
- 第一次使用者可能不知「客戶基盤 vs 潛客看板」差別 — 但這正是業務分流的正解

**工時估**：~5 天（含 sidebar nav_nodes 雙 brand insert）

### 3.3 sub-agent 中立分析意見

**業務邏輯來看**，潛客（sales_lead）跟已成交客戶（customer）是兩個不同的生命週期物件：
- 潛客有 HABC / 意向車款 / 跟進日 / 戰敗原因 — 銷售 funnel
- 已成交客戶有統編 / 應收 / 車輛 / 保固 / 維修紀錄 — ERP 主檔

把兩者塞同一頁、靠 tab 切，會讓「客戶」這個詞的歧義永遠存在。**(B) 兩頁分工是行業標準**（HubSpot / Salesforce 都是 Leads ≠ Contacts ≠ Accounts）。

**從專案資料看**：`sales_leads` 表的 `converted_customer_id` 欄位、`/crm/sales/dormant-leads` 已存在、indian 已有 8 筆 active demo — 這些事實**早就替 (B) 鋪好路**，前人留的 metadata.tags / metadata.timeline 也只在 sales_leads 上、沒在 customers 上。

**從工時看**：(B) 5 天 < (A) 6 天，(A) 還要搬 detail page、改既有路由語意，風險更高。

**從未來擴充看**：CRM02（電訪問卷）/ CRM03（電訪工作台）/ CRM04（休眠戰敗）/ CRM05（NPS）/ CRM06（推播）這 5 個兄弟頁，**全部吃 sales_leads 或衍生（call_tasks）**，跟 customer-base（ERP）零交集。把 CRM01 也擺到 leads 命名空間，模組內聚性最高。

**結論（不拍板、給暗示）**：sub-agent 在所有客觀指標上都傾向 **(B)** — 但 (A) 在「路由連續性」這條使用者體感上有非零價值。**最終由 Ming 從業務人員心智模型角度決定**。如果 Ming 認為「客戶 / 潛客」對銷售人員是同一個東西、不該分頁，那 (A) 是對的；如果認為「潛客追蹤 / 客戶服務」是兩條動線、應分頁清楚，那 (B) 是對的。

---

## 4. 4 種 view 細節

### 4.1 卡片 list vs 看板的資料模型差異

**完全沒差** — 都是同一份 `LeadsBoardRow[]` 陣列，前端 client-side filter + group by habc：

```ts
type LeadsBoardRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  habc: 'H' | 'A' | 'B' | 'C';
  intent_model: string | null;
  source: string | null;
  rs_name: string | null;
  follow_date: string | null;
  last_visit_at: string | null;
  note: string | null;
  tags: { label: string; color: 'red'|'amber'|'teal'|'blue' }[];   // 解 metadata.tags
  timeline: { dot: string; time: string; text: string }[];          // 解 metadata.timeline
  sa_tags: { label: string; color: string }[];                       // SA 共享（Q5）
  // 衍生欄位
  follow_status: 'urgent' | 'today' | 'ok' | 'none';                  // 在 helper 算
  days_since_visit: number | null;
};
```

list view 與 kanban view 共用同一個 `rows` state、`viewMode = 'list' | 'kanban'` toggle 切渲染。

### 4.2 Drawer 結構

- 4 個 section + 1 個操作區（Adjust HABC）+ footer 4 顆 button
- 設計 token 沿用 DealerOS Design Pattern（不用 spec 的 #C8001A / #185FA5 寫死、改用我們的 `bg-[#FDECEA] text-[#CC0000]` 系列 — Q3）
- 內 KV grid 走我們的 `<Kv label value />` helper

### 4.3 KPI 5 欄計算邏輯

```sql
SELECT
  count(*)                                           AS total,
  count(*) FILTER (WHERE habc='H')                   AS h,
  count(*) FILTER (WHERE habc='A')                   AS a,
  count(*) FILTER (WHERE habc='B')                   AS b,
  count(*) FILTER (WHERE habc='C')                   AS c,
  count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS this_month
FROM sales_leads
WHERE brand_id = $1 AND kind='sales' AND dormancy_status='active' AND is_active = true;
```

→ helper 一次回傳 `{ total, h, a, b, c, this_month, urgent_count, today_count }`。urgent/today 是衍生：

```sql
count(*) FILTER (WHERE follow_date IS NOT NULL AND follow_date < CURRENT_DATE) AS urgent,
count(*) FILTER (WHERE follow_date = CURRENT_DATE)                              AS today,
```

### 4.4 新增 modal + CRM03A 自動排程串接點

```
[user 按 ＋ 新增潛客]
        ↓
   Modal submit
        ↓
   client → server action createLeadAction({
     name, phone, habc, intent_model, source, rs_name, note, follow_date
   })
        ↓
   server action:
     1) INSERT sales_leads (...)  → 拿 new lead.id
     2) if (follow_date) {
          INSERT call_tasks {
            kind: 'sales',
            customer_id: ???     ← ⚠️ Q1
            survey_template_id: null  (or 預設模板？Q1)
            scheduled_at: follow_date,
            status: 'pending',
            assignee_id: 解 rs_name → sales_staff.id,
            metadata: { source_lead_id: new lead.id }
          }
        }
     3) return { ok, data: { id: lead.id } }
        ↓
   client: showBanner('✅ 已新增潛客 / 已排程 CRM03A 電訪提醒')
   client: 關 modal、refresh
```

**⚠️ call_tasks 表的 `customer_id` 是 NOT NULL 但指向 `customers` — 而潛客還沒成交、不該寫 customers row**。這是 **Q1**：

- 選 1：放鬆 call_tasks.customer_id 為 nullable + 加 lead_id 欄位
- 選 2：先把 lead 寫成 customer（is_active=false / type='lead'）— 髒
- 選 3：建 `sales_lead_call_tasks` 獨立表 — 乾淨但要新表

---

## 5. 落地拆分（後續 BDN 條目）

### BDN CRM01.1 · 資料缺口補齊 + helper 骨架（S, 0.5 天）

- 補 `src/domain/sales-leads.ts`（新檔，沿用 dormant-leads 的 type 擴展 active view）
- 寫 `deriveFollowStatus()` + `normalizeMetadataTags()` + `getTimeline()` util
- 寫 `getLeadsBoardData(filters)` helper（一支 query 回 rows + kpiCounts）
- 視 Q1 結論決定是否動 call_tasks schema

### BDN CRM01.2 · 卡片 list view 基礎模式（M, 1.5 天）

- 新建 `src/app/(workspace)/crm/sales/leads-board/page.tsx`（or 覆蓋 customer-base，依 Ming 拍板結果）
- `_components/leads-board.tsx` — 統計列 + filter bar + 卡片 list
- in-page sidenav（HABC 快篩 + 跟進狀態 + 快速工具）
- 共 5 個 grade chip 樣式（H/A/B/C/all）
- 列表卡片渲染（grade-pill / 主資訊 / 動作三欄）
- 沿用既有 DealerOS color token、不寫死 spec 顏色

### BDN CRM01.3 · 看板 view + 雙模式切換（M, 1 天）

- view-toggle button（list ↔ kanban）
- kanban 4 欄 by habc
- kb-card 簡化版（只 5 個欄位）
- 客戶端 filter 共享、無拖拉（v1 不做 react-dnd）

### BDN CRM01.4 · Drawer 詳情 + 5 段 section（M, 1 天）

- 480px 右側 drawer（fixed + transform translateX）
- SA 共享標籤 section（依 Q5 結論）
- 基本資料 info-grid（2 欄）
- 客戶標籤 chip 列
- 備註 / 接觸時間軸
- 調整 HABC 4 按鈕（觸發 `updateLeadHabcAction`）
- footer 4 顆 button（關閉 / 開新手卡 / 安排電訪 / 儲存）

### BDN CRM01.5 · 新增 modal + CRM03A 自動排程（S, 1 天）

- 8 欄 form modal（兩欄 grid）
- `createLeadAction()` server action（依 Q1 結論決定是否同時建 call_task）
- sidebar nav_nodes 雙 brand insert（如選 B）
- 跑 typecheck + lint + 手測 8 個 demo lead 渲染

**總計**：5 天（如 (B) 路徑）；(A) 路徑 +1 天搬遷 + 改路由教育。

---

## 6. 待 Ming 拍板的決策清單

> **Q1**：新增潛客 → 自動排程 CRM03A 電訪提醒，怎麼串？
> - (a) 放鬆 `call_tasks.customer_id` 為 nullable、新增 `lead_id uuid` 欄位（推薦）
> - (b) 為潛客寫 customers row（type='lead' / is_active=false）— 髒
> - (c) 新建 `sales_lead_call_tasks` 獨立表 — 過度設計？
> - (d) v1 不做、modal 的「下次跟進日期」只寫 `sales_leads.follow_date`、由 CRM03A 自己每天 scan 撈

> **Q2**：「負責 RS」UI 下拉清單從哪來？
> - (a) 寫死 spec 那 4 個名字（demo 用）
> - (b) 撈 `sales_staff` 表（已存在）— 推薦
> - (c) 撈 `assignee_id` 用、不撈 `rs_name`（rs_name 純 free text legacy）

> **Q3**：spec 的色碼（`#C8001A` / `#185FA5` / `#F0C97E`）跟我們 DealerOS Design Pattern token（`#CC0000` / `#185FA5` / `#854F0B`）有小差異 — 落地照哪邊？
> - (a) 嚴格照 DealerOS token（我們的字級 / 色碼規格贏設計稿）
> - (b) spec 為主、保留視覺一致性
> - (c) 折衷：grade chip 用 spec 色（給識別度）、其餘 button / banner 走 DealerOS token

> **Q4**：spec 的 190px in-page sidenav 怎麼處理？
> - (a) 完全照做 — main 內部多一條 190px 左欄（+ DealerOS 既有 296px = 486px 被佔）
> - (b) 改成 toolbar segment control（HABC 快篩變 5 顆 chip 在頁面頂部）— 桌面友善
> - (c) 把 HABC 快篩做成 filter bar 內的 select、跟「跟進狀態」並列、移除 sidenav

> **Q5**：SA 共享標籤（drawer P-08 唯讀區）v1 怎麼做？
> - (a) v1 直接 hide、留 section placeholder — 推薦
> - (b) drawer 開啟時即時 join `followup_cases` + `customer_tags` 撈
> - (c) 灌進 metadata.sa_tags 由 SA 側 webhook 同步（要先設計 webhook）

> **Q6**：架構主選邊 — (A) 改造 customer-base vs (B) 另開 leads-board？
> - sub-agent 客觀傾向 (B)、最終由 Ming 拍。

> **Q7**：sales_leads 沒有 `vehicle_count` 欄位（潛客還沒車） — spec 列表卡片要顯示「🏍️ V4 / Monster SP」是 intent_model（意向車款）、不是已擁有車輛。確認語意就是這個沒錯？

> **Q8**：是否要做「轉成交」按鈕（潛客 → 寫入 customers + 設 converted_customer_id）？spec 沒畫、但業務閉環需要。
> - (a) v1 做、放在 drawer footer
> - (b) v1 不做、等 RS04（成交簽單）配套頁面再串

---

## 7. 不在本提案範圍

- 不寫任何 `src/` code、不跑 migration、不動 nav_nodes
- 不做 Playwright 驗證
- 不動其他 BDN 條目
- CRM02 / CRM03 / CRM04 / CRM05 / CRM06 v2 升級不在此次討論

---

**等 Ming 拍板（Q1-Q8 八點）後**，由執行 sub-agent 接 CRM01.1 開工。
