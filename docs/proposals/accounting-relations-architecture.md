# Accounting Relations Architecture — 主檔 ↔ 會計科目 ↔ 交易動作 對映設計

**Status**: Draft v1 · 等 Ming review
**Date**: 2026-05-10
**Author**: Claude
**Trigger**: User 指出「太早建資料」，要先把產品/客戶主檔跟會計科目的關聯架構（NetSuite Item-based Accounting）設計好，再灌兩個月模擬資料才有意義

---

## TL;DR

複製 NetSuite 的 4 層會計設計：
- **Layer 1（已建）**: COA 412 個 + GL Dimensions 29 個
- **Layer 2（要補）**: Item / Customer / Vendor 主檔上綁 default GL accounts
- **Layer 3（要建）**: `transaction_types` 表 — 每種業務動作（賣車、進零件、付薪資⋯⋯）對映一張標準分錄 template
- **Layer 4（業務模組）**: POS / 銷售 / 維修 / 採購 觸發 instantiate engine 自動產分錄

實作順序：**proposal → schema migration → 主檔 UI 加 binding → seed transaction_types → 回填主檔 coa → 補 customer_vehicles → 跑兩個月模擬 → 報表**。

預估 1.5–2 天 implementation。

---

## 為什麼要這個架構

### 現況限制

我們目前可以**手動切票**：登入 → 進 `/admin/accounting/journal-entries/new` → 選科目 → 填借/貸 → 填維度 → 過帳。但要支撐：
- POS 一筆結帳要自動產 5 行分錄（現金/收入/銷項稅/成本/存貨減）
- 業務銷售訂單交車要自動產 4-5 行
- 維修工單結案要自動產 3-4 行
- 採購進貨要自動產 3 行（含進項稅）
- 折舊月排程要自動產 N 行（每筆固資一行）

⋯⋯這些**業務動作 → 標準分錄**的對映現在不存在。沒有它，每個業務模組要 hardcode 自己的分錄邏輯，會變成 spaghetti 而且無法統一管理。

### NetSuite 怎麼解決

NetSuite 的會計核心 = **Item-based Accounting**：

```
業務動作 (Sales Order)
   ↓
查 Item 的 Income/COGS/Inventory account
查 Customer 的 AR account
查 Tax Code 的 GL account
   ↓
auto-generate 分錄（每行的 coa 都從 master 上拉）
```

這個設計的精髓是：**改科目對映只動主檔，不動業務 code**。例如想把「精品配件銷貨收入」從 4200201 改到 4200202，只要去 item 主檔改 income_account_coa_id 一個欄位，所有後續銷售自動就用新科目。

---

## 4 層架構

```
┌────────────────────────────────────────────────────────────┐
│  Layer 4: Business Modules                                  │
│  POS / 銷售 / 維修 / 採購 / 薪資 / 月結                       │
│  → 呼叫 instantiateTransaction(typeCode, ctx)               │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  Layer 3: Transaction Types (NEW TABLE)                     │
│  ~15-20 個業務動作 → 標準分錄 template (gl_template JSONB)  │
│  e.g. NEW_VEHICLE_SALE_LOCAL / PARTS_PURCHASE /             │
│       SERVICE_INVOICE / RENT_PAYMENT / MONTHLY_DEPRECIATION │
└────────────────────────────────────────────────────────────┘
            ↓                  ↓                    ↓
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Layer 2A:        │  │ Layer 2B:        │  │ Layer 2C:        │
│ Item Defaults    │  │ Party Defaults   │  │ System Defaults  │
│ ─────────────    │  │ ─────────────    │  │ ─────────────    │
│ vehicle_models:  │  │ customers:       │  │ system_settings  │
│  inventory_coa   │  │  ar_coa          │  │  output_vat_coa  │
│  income_coa      │  │  tax_code        │  │  input_vat_coa   │
│  cogs_coa        │  │  customer_type   │  │  withholding_coa │
│  tax_code        │  │ suppliers:       │  │  rounding_diff   │
│ items:           │  │  ap_coa          │  │  fx_gain/loss    │
│  inventory_coa   │  │  expense_coa     │  │  retained_earn   │
│  income_coa      │  │  withholding     │  │  default_cash    │
│  cogs_coa        │  │  supplier_type   │  │  default_bank    │
│  tax_code        │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  Layer 1: Chart of Accounts + Dimensions (DONE)             │
│  412 COA / 221 L5 postable / 29 dimensions                  │
└────────────────────────────────────────────────────────────┘
```

---

## Schema 變更清單

### 🆕 新增表 1: `tax_codes`

稅碼表，控制 VAT 5% / 0% / 免稅 / 扣繳 10% / 扣繳 20% 等情境，每個稅碼掛一個 GL 科目。

```sql
CREATE TABLE tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tax_code TEXT NOT NULL,         -- 'VAT_5_OUTPUT', 'VAT_5_INPUT', 'VAT_0', 'EXEMPT', 'WHT_10', 'WHT_20'
  name_zh_tw TEXT NOT NULL,
  rate NUMERIC(6,4) NOT NULL,     -- 0.0500 / 0.1000 / 0.2000
  direction TEXT NOT NULL CHECK (direction IN ('OUTPUT', 'INPUT', 'WITHHOLDING', 'EXEMPT')),
  coa_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, tax_code)
);
```

**Seed**:
| tax_code | name_zh_tw | rate | direction | 對映 coa |
|---|---|---|---|---|
| VAT_5_OUTPUT | 銷項稅額 5% | 0.0500 | OUTPUT | 2240xxx 銷項稅額 (要新增 L5) |
| VAT_5_INPUT | 進項稅額 5% | 0.0500 | INPUT | 1190401 留抵稅額 |
| VAT_0 | 零稅率（出口） | 0 | OUTPUT | 2240xxx (零稅額) |
| EXEMPT | 免稅 | 0 | EXEMPT | (none) |
| WHT_10 | 扣繳 10%（個人 / 一般） | 0.1000 | WITHHOLDING | 2200501 代扣所得稅 |
| WHT_20 | 扣繳 20%（外籍 / 顧問） | 0.2000 | WITHHOLDING | 2200501 代扣所得稅 |

⚠️ 順帶要新增 L5 科目「2240xxx 銷項稅額」（COA 目前只有「1190401 留抵稅額」on input 側，沒有 output 側專用科目）。

---

### 🆕 新增表 2: `transaction_types`

每種業務動作的 GL 影響 template。

```sql
CREATE TABLE transaction_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,              -- 'NEW_VEHICLE_SALE_LOCAL', ...
  name_zh_tw TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('sales','purchase','service','finance','admin','closing','adjustment')),
  description TEXT,
  gl_template JSONB NOT NULL,      -- 分錄行 template
  required_inputs JSONB NOT NULL,  -- 必填的 context 變數
  example_ctx JSONB,               -- 範例 context 給開發者參考
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 999,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);
```

**`gl_template` JSONB shape**:
```json
{
  "lines": [
    {
      "line_no": 1,
      "side": "D" | "C",
      "coa_resolver": {
        "type": "lookup" | "system" | "fixed",
        "source": "customer.ar_account_coa_id" | "system.output_vat_default_coa_id" | "fixed:1180101",
        "fallback_source": "system.default_ar_coa_id"
      },
      "amount_formula": "net_amount + tax_amount",
      "description_template": "{transaction_type.name_zh_tw} - {customer.name} - {vehicle.vin}",
      "dim_sources": {
        "CUSTOMER": "customer.id",
        "VEHICLE": "vehicle.id",
        "MODEL": "vehicle.model_id",
        "MODEL_YEAR": "vehicle.manufactured_year",
        "SALESPERSON": "ctx.salesperson_id",
        "STORE": "ctx.store_id",
        "SUBSIDIARY": "ctx.subsidiary_id"
      }
    }
  ]
}
```

**`required_inputs` shape**:
```json
{
  "customer_id": { "type": "uuid", "lookup_table": "customers" },
  "vehicle_id":  { "type": "uuid", "lookup_table": "customer_vehicles" },
  "salesperson_id": { "type": "uuid", "lookup_table": "employees" },
  "net_amount": { "type": "numeric", "min": 0 },
  "tax_amount": { "type": "numeric", "min": 0, "default_formula": "net_amount * 0.05" }
}
```

**預期 seed 的 transaction_types**（共 ~22 個）:

| category | code | 中文 | line 數 |
|---|---|---|---|
| sales | NEW_VEHICLE_SALE_LOCAL | 賣國產新車（一票完成）| 5 |
| sales | NEW_VEHICLE_SALE_IMPORT | 賣進口新車 | 5 |
| sales | USED_VEHICLE_SALE | 賣中古車 | 5 |
| sales | VEHICLE_DEPOSIT_RECEIPT | 收新車訂金 | 2 |
| sales | VEHICLE_FINAL_PAYMENT | 收尾款交車（拆訂金/尾款場景）| 4 |
| sales | PARTS_RETAIL_SALE | 零件零售（POS）| 5 |
| sales | ACCESSORY_SALE | 精品配件銷售 | 5 |
| service | SERVICE_INVOICE | 維修工單結案開立 | 5 |
| service | WARRANTY_CLAIM | 原廠保固理賠（向總代理請款）| 3 |
| service | INSURANCE_CLAIM | 保險公司理賠收入 | 3 |
| sales | INSURANCE_COMMISSION | 保險佣金收入 | 2 |
| sales | DEALER_BONUS | 總代理達標獎勵金 | 2 |
| purchase | VEHICLE_PURCHASE_LOCAL | 進國產新車 | 3 |
| purchase | VEHICLE_PURCHASE_IMPORT | 進口新車 | 3 |
| purchase | PARTS_PURCHASE | 進零件 | 3 |
| purchase | VEHICLE_PRE_PAYMENT | 預付車款給總代理 | 2 |
| finance | PAYMENT_RECEIPT_BANK | 收銀行匯款（沖 AR） | 2 |
| finance | PAYMENT_RECEIPT_CARD | 信用卡入帳 | 2 |
| finance | VENDOR_PAYMENT_BANK | 付供應商銀行匯款（沖 AP）| 2 |
| admin | SALARY_PAYMENT | 發薪資（含勞健保/扣繳）| 5 |
| admin | RENT_PAYMENT | 付租金（含進項稅+扣繳）| 4 |
| admin | UTILITY_PAYMENT | 水電瓦斯費 | 3 |
| admin | ADVERTISING_PAYMENT | 廣告費 | 3 |
| admin | INSURANCE_PAYMENT | 保險費 | 2 |
| closing | MONTHLY_DEPRECIATION | 月折舊 | N (per fixed asset) |
| closing | PREPAID_AMORTIZATION | 預付攤提 | 2 |
| closing | VAT_FILING | VAT 401 申報結算（雙月）| 3 |

---

### 🆕 新增表 3: `system_accounting_settings`（單例 per tenant）

全局會計政策設定。每個 tenant 一筆。

```sql
CREATE TABLE system_accounting_settings (
  tenant_id UUID PRIMARY KEY,
  -- VAT
  output_vat_default_coa_id UUID REFERENCES chart_of_accounts(id),
  input_vat_default_coa_id UUID REFERENCES chart_of_accounts(id),
  -- 扣繳
  withholding_5_coa_id UUID REFERENCES chart_of_accounts(id),
  withholding_10_coa_id UUID REFERENCES chart_of_accounts(id),
  withholding_20_coa_id UUID REFERENCES chart_of_accounts(id),
  -- 損益調整
  rounding_diff_gain_coa_id UUID REFERENCES chart_of_accounts(id),
  rounding_diff_loss_coa_id UUID REFERENCES chart_of_accounts(id),
  fx_gain_coa_id UUID REFERENCES chart_of_accounts(id),
  fx_loss_coa_id UUID REFERENCES chart_of_accounts(id),
  -- 結帳
  retained_earnings_coa_id UUID REFERENCES chart_of_accounts(id),
  current_year_pl_coa_id UUID REFERENCES chart_of_accounts(id),
  -- Fallback (主檔沒指定時用這)
  default_ar_coa_id UUID REFERENCES chart_of_accounts(id),
  default_ap_coa_id UUID REFERENCES chart_of_accounts(id),
  default_cash_coa_id UUID REFERENCES chart_of_accounts(id),
  default_bank_coa_id UUID REFERENCES chart_of_accounts(id),
  -- 元
  fiscal_year_start_month INT NOT NULL DEFAULT 1,
  base_currency TEXT NOT NULL DEFAULT 'TWD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
```

---

### ⚙️ 修改表 1: `vehicle_models` 加 GL binding

```sql
ALTER TABLE vehicle_models ADD COLUMN
  vehicle_category TEXT CHECK (vehicle_category IN ('NEW_LOCAL', 'NEW_IMPORT', 'USED', 'DEMO')) DEFAULT 'NEW_IMPORT',
  inventory_account_coa_id UUID REFERENCES chart_of_accounts(id),
  income_account_coa_id UUID REFERENCES chart_of_accounts(id),
  cogs_account_coa_id UUID REFERENCES chart_of_accounts(id),
  default_tax_code_id UUID REFERENCES tax_codes(id),
  standard_cost NUMERIC(20,2),  -- 預設成本（用於 instantiate 時填 cost_amount fallback）
  msrp NUMERIC(20,2);            -- 廠商建議零售價
```

**規則**: vehicle_category 決定 4 個 coa 的預設值（migration script 自動填）。

---

### ⚙️ 修改表 2: `items` 加 GL binding

```sql
ALTER TABLE items ADD COLUMN
  item_accounting_category TEXT CHECK (item_accounting_category IN
    ('PARTS_OEM', 'PARTS_AFTERMARKET', 'ACCESSORY', 'CONSUMABLE', 'SERVICE')) DEFAULT 'PARTS_OEM',
  inventory_account_coa_id UUID REFERENCES chart_of_accounts(id),
  income_account_coa_id UUID REFERENCES chart_of_accounts(id),
  cogs_account_coa_id UUID REFERENCES chart_of_accounts(id),
  expense_account_coa_id UUID REFERENCES chart_of_accounts(id),
  default_tax_code_id UUID REFERENCES tax_codes(id);
```

---

### ⚙️ 修改表 3: `customers` 加 GL binding

```sql
ALTER TABLE customers ADD COLUMN
  customer_type TEXT CHECK (customer_type IN
    ('INDIVIDUAL', 'CORPORATE', 'RELATED_PARTY', 'DEALER_DEMO', 'GOVERNMENT')) DEFAULT 'INDIVIDUAL',
  ar_account_coa_id UUID REFERENCES chart_of_accounts(id),
  default_tax_code_id UUID REFERENCES tax_codes(id),
  default_income_account_coa_id UUID REFERENCES chart_of_accounts(id),  -- override item
  credit_limit NUMERIC(20,2),
  payment_terms_days INT DEFAULT 30;
```

⚠️ `ar_account_coa_id` 可能已存在 — 跑 migration 前先 check。

---

### ⚙️ 修改表 4: `suppliers` 加 GL binding

```sql
ALTER TABLE suppliers ADD COLUMN
  supplier_type TEXT CHECK (supplier_type IN
    ('VEHICLE_DEALER', 'PARTS_SUPPLIER', 'LANDLORD', 'UTILITY', 'TAX_AUTHORITY',
     'SERVICE_CONTRACTOR', 'EMPLOYEE_AGENT', 'INSURANCE_CO', 'BANK')) DEFAULT 'PARTS_SUPPLIER',
  ap_account_coa_id UUID REFERENCES chart_of_accounts(id),
  default_expense_account_coa_id UUID REFERENCES chart_of_accounts(id),
  default_tax_code_id UUID REFERENCES tax_codes(id),
  is_withholding_required BOOLEAN DEFAULT FALSE,
  withholding_tax_code_id UUID REFERENCES tax_codes(id),
  payment_terms_days INT DEFAULT 30;
```

---

## 業務動作對映範例（詳細 line breakdown）

### 範例 1: NEW_VEHICLE_SALE_LOCAL（賣國產新車一票完成）

**Input ctx**:
```json
{
  "customer_id": "...",        // 客戶
  "vehicle_id": "...",          // 賣的那台車（customer_vehicles.id）
  "salesperson_id": "...",
  "net_amount": 1000000,        // 售價未稅
  "tax_amount": 50000,          // 5% 銷項稅
  "cost_amount": 800000,        // 從 vehicle.purchase_amount 或 vehicle_model.standard_cost
  "store_id": "...",            // 自動從 active scope
  "subsidiary_id": "..."        // 自動從 active scope
}
```

**自動產 5 行**:
```
# 收入面（含稅應收 + 收入 + 銷項稅）
1) D  customer.ar_account_coa_id      (1180101 應收新車尾款)  1,050,000  → CUSTOMER+VEHICLE+MODEL+SALESPERSON+STORE+SUB
2) C  vehicle_model.income_account_coa_id  (4100101 銷貨收入)   1,000,000  → +BRAND+DEPT
3) C  tax_codes[VAT_5_OUTPUT].coa_id  (2240xxx 銷項稅額)         50,000  → STORE+SUB

# 成本面（成本結轉）
4) D  vehicle_model.cogs_account_coa_id   (5100101 銷貨成本)     800,000  → +VIN
5) C  vehicle_model.inventory_account_coa_id  (1210101 存貨)     800,000  → +VIN
```

借: 1,050,000 + 800,000 = 1,850,000
貸: 1,000,000 + 50,000 + 800,000 = 1,850,000  ✓ 平衡

---

### 範例 2: PARTS_RETAIL_SALE（POS 刷卡賣零件）

**Input**:
```json
{
  "customer_id": "...",
  "items": [{ "item_id": "...", "qty": 2, "unit_price": 1500 }],
  "payment_method": "CARD",
  "net_amount": 2857,           // 3000/1.05 倒推（含稅）
  "tax_amount": 143
}
```

**自動產 5 行**:
```
1) D  system.default_card_coa_id         (1102101 銀行存款主要)  3,000  → STORE+SUB
2) C  item.income_account_coa_id         (4200201 零件銷貨收入)  2,857  → +BRAND+DEPT+PART_SKU
3) C  tax_codes[VAT_5_OUTPUT].coa_id     (2240xxx 銷項稅額)        143  → STORE+SUB
4) D  item.cogs_account_coa_id           (5200201 零件銷貨成本)  1,800  → +PART_SKU
5) C  item.inventory_account_coa_id      (1210201 存貨原廠零件)  1,800  → +PART_SKU+WAREHOUSE
```

---

### 範例 3: PARTS_PURCHASE（進零件付款）

```json
{
  "supplier_id": "...",
  "items": [{ "item_id": "...", "qty": 100, "unit_cost": 200 }],
  "net_amount": 20000,
  "tax_amount": 1000
}
```

```
1) D  item.inventory_account_coa_id      (1210201 存貨原廠零件)  20,000  → PART_SKU+WAREHOUSE+STORE+SUB
2) D  system.input_vat_default_coa_id    (1190401 留抵稅額)       1,000  → STORE+SUB
3) C  supplier.ap_account_coa_id         (2170102 應付帳款零件)  21,000  → VENDOR+STORE+SUB
```

---

### 範例 4: RENT_PAYMENT（付租金 ÷ 付房東）

```json
{
  "supplier_id": "...",        // 房東
  "gross_amount": 105000,      // 含稅總額
  "withholding_amount": 9524   // 10% 扣繳（個人房東；按未稅倒推 net 95238）
}
```

```
1) D  supplier.default_expense_account_coa_id  (6300101 租金費用)   95,238   → DEPT+STORE+SUB
2) D  system.input_vat_default_coa_id          (1190401 留抵稅額)    4,762   → STORE+SUB
3) C  system.withholding_10_coa_id             (2200501 代扣所得稅)  9,524   → VENDOR+STORE+SUB
4) C  system.default_bank_coa_id               (1102101 銀行存款)   90,476   → STORE+SUB
```

---

### 範例 5: SALARY_PAYMENT（發薪資）

```json
{
  "employee_id": "...",
  "gross_salary": 50000,
  "labor_insurance": 1100,
  "health_insurance": 750,
  "income_tax_withhold": 0
}
```

```
1) D  6210101 薪資費用                  50,000   → EMPLOYEE+DEPT+STORE+SUB
2) C  2200501 代扣所得稅                     0
3) C  代扣勞保（要新增 L5 in 22xx）         1,100  → EMPLOYEE+STORE+SUB
4) C  代扣健保                            750  → EMPLOYEE+STORE+SUB
5) C  system.default_bank_coa_id        48,150  → STORE+SUB
```

---

### 範例 6: VAT_FILING（雙月底申報結算）

每雙月底（4-5 月一次、6-7 月一次⋯⋯）跑：

```
1) D  2240xxx 銷項稅額（出清累積貸方餘額）  500,000   → STORE+SUB
2) C  1190401 留抵稅額（出清累積借方餘額）  300,000   → STORE+SUB
3) C  2200xxx 應付營業稅                   200,000   → STORE+SUB  (差額 = 應納稅額)
```

如果進項 > 銷項 則：
```
1) D  2240xxx 銷項稅額   200,000
2) D  1190xxx 留抵稅額餘額（保留下期）  100,000
3) C  1190401 留抵稅額（清總額）  300,000
```

---

## Mock data 填充順序

按依賴順序：

1. **建 system_accounting_settings 一筆**
   - 先得人工確認每個 fallback 科目要哪個（給開發者 SQL 腳本，user 一次審核 OK）
2. **建 tax_codes 6 個**
   - 順帶要新增 L5「2240xxx 銷項稅額」
3. **建 transaction_types 22 個**
   - 每個都附 `gl_template` JSONB + `example_ctx` 範例
4. **回填 vehicle_models 30 筆 × 5 欄位**（國產/進口 → 對應 4100101/4100102; 4 個 coa + tax）
5. **回填 items 61 筆 × 5 欄位**（依 category → 對應科目）
6. **回填 customers 10 筆 × 4 欄位**（個人 → 1180xxx; 公司 → 1180xxx）
7. **回填 suppliers 12 筆 × 6 欄位**（依 type → 對應科目 + 扣繳設定）
8. **補 customer_vehicles 10-15 筆**（每筆配 model + customer + cost）
9. **跑 instantiate engine** → 兩個月分錄 ~70 筆 entry

---

## 動工順序

按 dependencies 排：

| Phase | 工作 | 估時 |
|---|---|---|
| **1** | 寫 architecture proposal markdown（本檔）| 1 hr ✅ done |
| **2** | User 確認 + 細部調整（可能要改 schema） | TBD |
| **3** | DB schema migration：3 CREATE + 5 ALTER + 1 新 L5 (2240xxx) | 30 min |
| **4** | Seed system_accounting_settings + tax_codes + 22 transaction_types | 90 min |
| **5** | 回填 vehicle_models / items / customers / suppliers 預設 coa | 30 min |
| **6** | 主檔 UI 加 coa binding 欄位（先 vehicle_models + items 兩個最關鍵）| 90 min |
| **7** | 寫 instantiate engine: `instantiateTransaction(typeCode, ctx)` server action | 90 min |
| **8** | 補 customer_vehicles mock 10-15 筆 | 15 min |
| **9** | 寫兩個月模擬 script: 跑 ~70 個 transaction instantiate | 60 min |
| **10** | 報表 SQL views：trial_balance / income_statement / balance_sheet / vat_401 | 60 min |
| **11** | 報表 UI 4 頁 | 90 min |
| **12** | 驗證 + 寫 final 報告 | 30 min |

**合計**：~10 hr / 1.5–2 個工作天。

---

## 風險 / 取捨 / 開放問題

### 風險

1. **Schema lock-in**：transaction_types.gl_template 的 JSONB shape 一旦定下來，後續業務模組都依賴它的 contract。要先把 ~20 個 type 範例都列出來確認 shape 能 cover 所有 case。本文檔已列 6 個範例，proposal phase 還要再列剩下 16 個確認。

2. **稅務複雜度**：
   - 含稅 vs 未稅倒推（rounding error）
   - 零稅率 vs 免稅（401 表呈現不同）
   - 扣繳憑單 vs 二代健保
   - **建議**先做 VAT 5% + WHT 10% 兩個最常見，其他保留欄位但 stub 後加

3. **多幣別不在 v1 範圍**：fx_gain_coa_id 留欄位但不啟用。Ducati/Indian 都進口，將來必做，但這次先單幣 TWD。

4. **期間管理（fiscal_periods）尚缺**：兩個月模擬可以強制 entry_date 落在 2026-04 或 05；但沒有 period.locked 防護，user 可以亂改舊月份。建議先警示，下個 phase 再做 period table。

5. **Instantiate engine 的 expression eval**：`amount_formula: "net_amount * 0.05"` 要 safely eval。**不能用 `eval()`**。建議用簡單 parser（只支援 `+ - * /` 和變數），或用 sandbox library（mathjs）。

### 取捨

| 選項 | 優點 | 缺點 |
|---|---|---|
| **A) Item-based + Transaction Types**（本提案） | 比照 NetSuite，主檔改 coa 不改 code；業務模組 decouple | 一次性投入大 |
| **B) Hardcode in business modules** | 短期快 | 長期 spaghetti、改科目要動 N 處 code |
| **C) Hybrid — 通用 type 用 template，特殊 type 在 module 內 hardcode** | 平衡 | 兩套機制要 doc 清楚誰負責哪個 |

**建議 A**（user 已表態）。

### 開放問題（請 Ming 回答）

1. **q1**: 系統預設 fallback coa（system_accounting_settings 的 default_ar / default_ap / default_cash / default_bank / output_vat / input_vat / withholding）你想自己選還是我建議？我可以提預設清單給你 review。

2. **q2**: 主檔 UI 加 coa binding 欄位 — 是要做在所有 5 個主檔 page (vehicle_models / items / customers / suppliers / customer_vehicles) 還是先做最關鍵的 vehicle_models + items？(後者快很多)

3. **q3**: 兩個月模擬要不要做「業務情境的真實時間軸」（例如 4/5 進貨 → 4/15 賣車 → 5/10 收尾款 → 5/30 申報）還是只要「分錄數量上看起來合理」就好？前者要寫 narrative timeline，工多 30%。

4. **q4**: 報表 UI 你比較想看的是「**台灣四大報表的標準格式**（試算表 + I/S + B/S + 401 申報書）」還是「**NetSuite 風格的鑽透表**（從 P/L 點科目鑽進 GL → 鑽進原始 entry）」？前者快、後者強。

5. **q5**: 會計循環有沒有要包含「期初餘額」？例如 4 月開始時銀行存款已有 5,000,000、存貨已有 30 台車。**強烈建議要**，否則第一筆銷貨會出現「賣的車存貨沒有」的怪事。

---

## Out of Scope（v1 不做）

- 多幣別 + FX gain/loss（schema 留欄位）
- fiscal_periods 鎖期（v2）
- 預算 budget（v2）
- 部門間 inter-company elimination（v3）
- NetSuite live sync（已有 mapping table，v2 寫 push engine）
- 簽核 workflow（大額分錄 approval）

---

## 下一步

等 Ming 跑步回來 review proposal + 回答 5 個 open questions。確認後我從 Phase 3 schema migration 開始動工，預估完整跑完 ~10 hr。

---
