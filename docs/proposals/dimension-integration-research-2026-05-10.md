# DealerOS 維度整合研究與落地紀錄（v1.0）

> **狀態**：Phase 1（DB 落地 + 前端 MVP）已完成於 2026-05-10
> **作者**：Ming（決策） × Claude Code（實作）
> **對應規格**：`docs/coa-spec/` v2.0（412 筆 seed + 5 層 + MOEA 錨點）

---

## 0. TL;DR

DealerOS 從原本「**每個品牌獨立 Server Deploy**」升級為**集團 / 品牌 / 法人 / 門店 / 部門**五軸維度模型，並落地 Taiwan MOEA 對齊的 5 層會計科目表（COA v2.0）。本文記錄四件事：

1. 為何要把 NetSuite 原生四維度（Subsidiary / Department / Class / Location）跟 DealerOS 自家維度整合
2. 為何 **Brand ≠ Subsidiary**（這是台灣經銷商實務的關鍵差異）
3. 今天（2026-05-10）已落地哪些 DB / 前端構件
4. 後續路線圖（Phase 2～Phase 12）

---

## 1. 問題陳述

DealerOS 同時面對 **五類維度族群**：

| 維度族群 | 來源 | 落地前狀態 | 落地後狀態 |
|---|---|---|---|
| **NetSuite 原生四維度** | NetSuite OneWorld 標配 | 未對映 | 對映表已建（`netsuite_dim_mapping`） |
| **DealerOS scope 維度** | 集團 / 品牌 / 法人 / 門店 | 集團 / 品牌 / 門店 已落地，**法人層缺** | 法人層 (`subsidiaries`) 已建 |
| **會計科目維度** | COA v2.0 五層 | 未落地（只有 mock `accounts`） | `chart_of_accounts` 365 rows 部署完成 |
| **產品線維度** | 車系 / 車型 / 年份 | `motorcycle_models`(30) 但無 GL dimension | `gl_dimensions` 29 個預設含 MODEL_LINE / MODEL / MODEL_YEAR |
| **業務分析維度** | VIN / 業務員 / 技師 / 工單 / ... | 表存在但未統一為 GL dimension | 統一在 `gl_dimensions` 預設 16 個 |

**核心挑戰**：沒有對齊圖時：

- 寫財務分錄時，不知道「賣 Panigale V4 給高雄展示中心」要打哪些維度
- 報表想看「凡和集團 × 台北店 × 新車部 × Panigale 車系 × 2025 年款」毛利，每個維度走的表都不同
- NetSuite sync 時，DealerOS 的 brand → 對映誰？dealer_category（業務類別）→ 對映誰？
- 跨集團 AI benchmark 想做時，發現對齊鏡頭不一致

---

## 2. 維度層級總覽（修正版 — 把「虛 / 實」分清楚）

### 2.1 關鍵澄清

> **Brand 是虛的**（行銷品牌，跨法人共用，不掛統編）
> **Subsidiary 是實的**（法人實體 = 統一編號 = 會計帳本 = 稅務申報單位）
> 一個門市可能就是一個 subsidiary（自帶統編、獨立帳本）
> 因此 brand 與 subsidiary 是**正交**的兩個維度，不能混為一談

### 2.2 五軸結構圖

```
   ┌──────────────────────────────────────────────────────────────────┐
   │  SaaS 層    Tenant ≡ Group (集團, 虛)    groups.tenant_uuid     │
   │             一個集團 = 一個 SaaS 客戶                              │
   └──────────────────────────────────────────────────────────────────┘
                                  │
       ┌──────────────────────────┴──────────────────────────┐
       ▼  虛軸（行銷 / 業務切片）                              ▼  實軸（法人 / 帳本）
   ┌──────────────────────────────────┐         ┌──────────────────────────────────┐
   │  Brand (品牌, 虛)                │         │  Subsidiary (法人, 實) ⭐ NEW    │
   │  brands.id ('ducati', 'indian')  │         │  subsidiaries.id (uuid)          │
   │  ─ 行銷品牌 / 經銷代理品牌         │         │  ─ 統一編號 (tax_id)             │
   │  ─ 跨法人共用                     │         │  ─ 法人名 / 本位幣 / 地址         │
   │  ─ 對應 NetSuite Custom Segment   │         │  ─ 會計帳本歸屬                   │
   │                                   │         │  ─ ★ 對應 NetSuite Subsidiary    │
   └──────────────┬───────────────────┘         └──────────────┬───────────────────┘
                  │                                             │
                  │ 多對多 (一個法人營運多 brand,                 │ 一對多
                  │  一個 brand 跨多法人各有店)                   │
                  └─────────────────────┬───────────────────────┘
                                        │
                                        ▼
                       ┌──────────────────────────────────────┐
                       │  Store (門店, 實)                     │
                       │  organizations.id (level=2)          │
                       │  ─ 必歸屬一個 subsidiary（會計實體）    │
                       │  ─ 可掛多 brand（複合店）              │
                       │  ─ ★ 對應 NetSuite Location           │
                       └──────────────┬───────────────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────────────┐
                       │  Department (部門) → Class (業態)     │
                       │  departments / dealer_category       │
                       │  ─ ★ 對應 NetSuite Department / Class │
                       └──────────────────────────────────────┘
```

### 2.3 正交性說明

- 一筆銷售 JE 同時帶 `BRAND='ducati'` 與 `SUBSIDIARY=fanho-taipei-ltd`，兩者各自獨立，不可互推
- 一筆 internal transfer JE 可能跨 subsidiary（要做 inter-company elimination）但同 brand
- 一筆行銷費用 JE 可能跨 brand（聯合行銷）但同 subsidiary
- 一筆庫存出庫 JE 同 brand 同 subsidiary 但跨 store（倉間調撥）

---

## 3. NetSuite 原生四維度的角色與對映

### 3.1 對映表

| NetSuite 維度 | 語意 | DealerOS 對映 | 對映欄位 |
|---|---|---|---|
| **Subsidiary** | 法人實體 / 帳本 / 本位幣 / 統編 | ⭐ **`subsidiaries`** （不是 brand） | `subsidiaries.netsuite_subsidiary_id` |
| **Department** | 部門（成本中心） | `departments` | `departments.netsuite_department_id` |
| **Class** | 業務類型切片 | `chart_of_accounts.dealer_category` | enum 對映 mapping table |
| **Location** | 地點（倉庫 / 店點） | `organizations` (type='store') | `organizations.netsuite_location_id` |
| (Custom Segment) | 自訂分析維度 | `brands` 等 | `brands.netsuite_segment_value_id` |

### 3.2 為什麼新建 `subsidiaries` 表

台灣經銷商實務常見三種法人組合：

| 組合 | store : subsidiary | 範例 |
|---|---|---|
| **A. 集中法人** | N : 1 | 「凡和重車有限公司」一個統編，下面有台北 / 高雄 / 台中三個門店 |
| **B. 一店一法人** | 1 : 1 | 每個店各別公司：「凡和重車台北分公司」「凡和重車高雄分公司」各自獨立統編 |
| **C. 混合** | N : M | 同集團下：北中為「凡和重車」一個法人共 4 家，南部「凡和南方」另一法人 2 家 |

只用 `organizations.tax_id` **只能 cover B**（已被刪除）。獨立 `subsidiaries` 表 + `organizations.subsidiary_id` 才能同時 cover A / B / C。

### 3.3 為什麼 Class = `dealer_category` 而不是 brand

NetSuite **Class** 是「業務線（business line）」切片 — 經銷商有「整車銷售業」「維修服務業」「零件批發業」。**這跟 `dealer_category` enum 完全吻合**（VEHICLE_SALES / SERVICE / PARTS / INSURANCE / FINANCE）。

如果把 Class 給 brand，會：
- 失去「業務線」這個基本會計切片
- 跨集團 AI benchmark 找不到對齊維度
- 跨 brand 的同業務線（Ducati 維修費 + Indian 維修費 = 集團維修總額）變難

所以 **Brand 走 Custom Segment**（NetSuite OneWorld 自訂維度，不佔用四個原生 segment 任何一個）。

### 3.4 集團層的 NetSuite 對映

NetSuite OneWorld 在 Subsidiary 之上有 `Parent Subsidiary` → **直接對應集團**：
- 集團 (`groups`) → NetSuite Root Subsidiary（虛擬 holding，無交易）
- 法人 (`subsidiaries`) → NetSuite Subsidiary（實際發生交易）
- `subsidiaries.parent_subsidiary_id` 指向 group 對應的 NetSuite root subsidiary

---

## 4. 已落地構件（2026-05-10）

### 4.1 Schema

| 表 | 角色 | 狀態 |
|---|---|---|
| `groups` | 集團 | 加 `tenant_uuid UUID UNIQUE` |
| `subsidiaries` ⭐ | 法人 | **新建**：tax_id / legal_name / base_currency / parent_subsidiary_id / is_root / NetSuite 對映欄位 |
| `organizations` | 門店 | 加 `subsidiary_id UUID NOT NULL`、刪 `tax_id`（移到 subsidiaries） |
| `chart_of_accounts` | 會計科目表 | **新建**：5 層架構、4 個 ENUM、5 個 CHECK constraint、12 個 index、RLS |
| `coa_seed_accounts` | 出廠 412 筆種子 | **新建** + **412 筆全灌入** |
| `gl_dimensions` ⭐ | 統計科目表 | **新建** + **29 個預設**（規格 16 + 補 13） |
| `netsuite_dim_mapping` ⭐ | 中臺對映 | **新建**：dealeros_dim × dealeros_id × ns_internal_id |
| `departments` / `brands` / `motorcycle_models` | 業務表 | 各加 `netsuite_*_id` 預留欄位 |

`accounts`（20 mock rows）已 DROP CASCADE，5 個 GL FK column 暫時 NULL，等下一階段重接到 `chart_of_accounts`。

### 4.2 資料

| 計量 | 數值 |
|---|---|
| `subsidiaries` 法人 | 3（1 root + 2 actual：Ducati 部 / Indian 部） |
| `organizations` 補 `subsidiary_id` | 9 / 9 (100%) |
| `coa_seed_accounts` 種子 | 412 / 412 (100%) |
| `chart_of_accounts` 部署（MOTORCYCLE pack） | 365 rows（L1=8 / L2=14 / L3=41 / L4=81 / L5=221） |
| 可入帳 L5 帳戶 | 221 / 221 (100%) |
| `parent_id` 對映 orphan | 0（除 L1） |
| `gl_dimensions` 預設 | 29 個（system default，sentinel tenant） |

### 4.3 前端

新增模組「會計財務設定」(`accounting`)，三個頁面：

| URL | 頁面 | 功能 |
|---|---|---|
| `/admin/accounting/coa` | 會計科目表 | 365 筆樹狀 list（縮排 + chip + filter）、可 toggle is_active |
| `/admin/accounting/dimensions` | 統計科目表 | 29 筆預設 + 可加自訂 dimension（modal） |
| `/admin/accounting/netsuite-mapping` | Mapping 表 | 對映 list + 「⚡ 自動產生預設對映」按鈕（呼叫 `seedDefaultMappingsAction`） |

`nav_nodes` 雙 brand 各 INSERT：1 L1（會計財務設定 module）+ 1 L2（會計設定 section）+ 3 L3（葉節點），共 10 row。

`src/lib/modules.ts` 加新 module（fallback registry 對齊 nav_nodes）。

---

## 5. 推薦的 `gl_dimensions` 29 個預設

```
✅ 規格已有（16）：
  STORE, VEHICLE, VIN, SALESPERSON, TECHNICIAN, CUSTOMER, VENDOR, RO,
  PART_SKU, CAMPAIGN, CONTRACT, BANK, INSURER, DEALER, DEPT, EMPLOYEE

➕ 補上（13）：
  GROUP         集團                 → groups
  SUBSIDIARY    法人 / 統編           → subsidiaries (新表)        ★ native
  BRAND         品牌（虛軸）           → brands                    ★ custom segment
  REGION        區域                 → organizations(type='region')
  MODEL_LINE    車系                 → motorcycle_models.series
  MODEL         車型                 → motorcycle_models
  MODEL_YEAR    年份                 → customer_vehicles.manufactured_year
  WAREHOUSE     倉庫                 → warehouses
  WAREHOUSE_BIN 庫位                 → warehouse_bins
  WARRANTY_CLAIM 保固索賠            → parts_warranty_claims
  APPOINTMENT   維修預約              → service_appointments
  CONSIGNMENT   寄存單                → consignment_stocks
  COUNT_SESSION 盤點場次              → inventory_counts
```

對 COA L5 帳戶的 `required_dimensions` 默認規則（plan §4.10）：

| Account 性質 | 預設必填 dimensions |
|---|---|
| 任何 L5 帳戶 | `[SUBSIDIARY, STORE]` 為硬規則 |
| 收入類 (L1=REVENUE) | + `[BRAND, DEPARTMENT]` |
| 整車相關 (dealer_category='VEHICLE_SALES'\|'VEHICLE_INV') | + `[VEHICLE, MODEL, MODEL_YEAR, SALESPERSON]` |
| 服務相關 (dealer_category='SERVICE') | + `[RO, TECHNICIAN, VEHICLE]` |
| 零件相關 (dealer_category='PARTS') | + `[PART_SKU, WAREHOUSE]` |
| 保險代理 (dealer_category='INSURANCE') | + `[INSURER, CONTRACT]` |
| 銀行 / 現金 (moea_code='1101'\|'1102') | + `[BANK]` |

⚠️ COA 規格 v2.0 種子的 `required_dimensions` 還沒包含 `SUBSIDIARY`、`BRAND`、`GROUP`。Phase 2 健檢時要把這三個維度補進去。

---

## 6. NetSuite 中臺 / Medallion 整合接點

```
Bronze (raw mirror)        ← NetSuite SuiteQL 拉的原始 JSON
   ↓
Silver (cleaned & joined)  ← 對映 internal_id 到 DealerOS uuid
   │  靠 netsuite_dim_mapping 做 lookup
   ↓
Gold (data mart)
   ├─ chart_of_accounts (sync from NetSuite COA via moea_code)
   ├─ journal_entries (DealerOS 自產 + NetSuite 雙向)
   ├─ inventory snapshots (5min)
   └─ trial_balance / income_statement / balance_sheet
```

`netsuite_dim_mapping` 是中臺的維度單一事實源，Bronze→Silver 翻譯都靠它做 lookup。

---

## 7. 升級計畫（Roadmap）

| Phase | 範圍 | 狀態 |
|---|---|---|
| 0. README + CLAUDE.md 規則 | ✅ 完成（2026-05-10） |
| 1. Audit & 清理：刪 mock accounts、audit motorcycle_models | ✅ 完成（2026-05-10） |
| 2. Migration SOP 建立：建 `supabase/migrations/` baseline | ⏳ 待規劃 |
| 3. 法人層落地：建 `subsidiaries` + `tenant_uuid` + `subsidiary_id` | ✅ 完成（2026-05-10） |
| 4. 健檢報告：對齊 plan §4 修正（required_dimensions 補 SUBSIDIARY/BRAND/GROUP） | ⏳ 待做 |
| 5. COA 落地：5 層 schema + ENUM + chart_of_accounts | ✅ 完成（2026-05-10） |
| 6. Seed 灌入：412 筆 → coa_seed_accounts；MOTORCYCLE pack 部署 | ✅ 完成（365 rows，2026-05-10） |
| 7. gl_dimensions 落地：表 + 29 個預設 | ✅ 完成（2026-05-10） |
| 8. NetSuite 預留欄位 + netsuite_dim_mapping | ✅ 完成（2026-05-10） |
| 9. journal_entries / posting validator | ⏳ 待做 |
| 10. NetSuite middleware MVP（Bronze + Silver 同步） | ⏳ 待做（已在 plan 規劃） |
| 11. 跨維度報表（5 軸切片 dashboard） | ⏳ 待做 |
| 12. AI benchmark hooks（opt-in benchmark_enabled） | ⏳ 待做 |

---

## 8. 已知開放議題

1. **COA seed 的 `required_dimensions` 還沒包含 SUBSIDIARY / BRAND / GROUP** — Phase 4 健檢時要 batch UPDATE 補進去
2. **`group_brands` / `store_brands` 多對多時是否需要 `is_primary` flag** — 因為 brand 是虛軸（Custom Segment），暫不需要；如未來有特別需求再加
3. **`motorcycle_models` 缺 `variant` 欄位** — MVP 不擋，未來加（影響 MODEL dimension 的細粒度）
4. **`customers.gl_receivable_account_id` / `suppliers.gl_payable_account_id` / `items.gl_*_account_id` 5 個 column 目前是 NULL** — Phase 2 後要重接 FK 到 `chart_of_accounts.id`，並在前端 selector 改用 chart_of_accounts
5. **`accounts` 表 5 個 FK column 重接策略**：要重命名為 `*_coa_id` 還是保留原名？建議重命名以對齊新 source
6. **`supabase/migrations/` migration-based 工作流是否要建立** — 目前透過 supabase MCP `apply_migration` 直接打 Cloud；migration history 可在 Supabase Studio 查到，但本地沒有 SQL 檔案備份。建議 Phase 2 把現有 migration 匯出成檔案
7. **journal_entries posting validator 落地時機** — 目前只有 metadata 三表，沒有真實分錄。需要先有業務模組產生分錄，validator 才有實質作用

---

## 9. 對齊指引（給未來 AI / 人類接手）

寫任何「會計」「財務」「報表」「跨維度」的 code 前必讀：

1. `docs/coa-spec/03_design_principles.md`（規格 13 章）
2. 本檔 §2 五軸結構圖
3. 本檔 §3 NetSuite 對映表
4. CLAUDE.md「COA 規格使用規則」段落

⚠️ **絕不**：
- ❌ 把 brand 當 subsidiary 用
- ❌ 把 dealer_category 當 brand 用
- ❌ 寫死 tenant_id 而不從 `groups.tenant_uuid` 取
- ❌ 在 L1-L4 帳戶上 posting（被 `chk_postable_only_l5` 擋）
- ❌ 改 L1-L3 結構（被 `is_locked` 擋）
- ❌ 修改 `docs/coa-spec/` 任何檔案

---

*— End of dimension integration research v1.0. 後續 Phase 升級時更新本檔。*
