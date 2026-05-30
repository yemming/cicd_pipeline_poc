# P2 續（AR 半部：零件賒帳）落地提案 — AR 子帳 + 收款沖帳 + 多幣別

**狀態**：⏳ 等 Ming 簽核（DDL 未跑）
**日期**：2026-05-29
**前置**：P2 AP 半部已落地驗過（`docs/proposals/p2-ap-parts-p2p.md`）。本提案對稱複製 AP 模式到 AR。
**範圍決策**：Ming 已選「AR 半部後端」（整車 O2C / UI / PPV 下一輪）
**tenant**：`e4cd1ac2-0fe1-49e7-8509-7c337324c574`、base=`TWD`、demo brand=`indian`

---

## 1. 目標與非目標

把賒帳銷售到收款接成正式 AR 子帳閉環，對稱 AP：

```
賒帳零件銷售 ──► AR 發票 AR_INVOICE ──────► 收款 CUSTOMER_RECEIPT(+FX)
                Dr AR / Cr 收入 / Cr 銷項稅    Dr 銀行 / Cr AR (+已實現匯損益)
（出貨領料另由 COGS_ON_ISSUE 過 Dr COGS/Cr 存貨 — AR_INVOICE 不重複認 COGS）
```

**本輪做（鎖定「零件賒帳」一種 AR）**：
- 4 表：`ar_invoices` / `ar_invoice_lines` / `customer_receipts` / `receipt_applications`（+RLS）
- 4 個 transaction_type：`AR_INVOICE`、`CUSTOMER_RECEIPT`、`CUSTOMER_RECEIPT_FX_GAIN`/`_LOSS`
- domain helpers：`ar-invoices.ts`、`customer-receipts.ts`（getRate 重用既有 `exchange-rates.ts`）
- 多幣別 func 化 + 已實現匯損益（對稱 AP）
- scripted e2e（TWD+USD）+ 對帳（ΣopenFunc = AR 控制科目）

**本輪不做（明列、下一輪）**：
- 整車 AR（新車尾款 1180101）/ 維修 AR（1180103）/ 保固理賠（1180301）— 各有專屬科目 + 重維度，獨立做
- COGS_ON_VEHICLE_SALE、整車 O2C
- AR/收款 UI（List+Detail + nav_nodes）— 本輪 domain helper + scripted e2e
- 呆帳（1180901）、AR 帳齡 RPC、對帳單

---

## 2. AR 科目選擇（關鍵：default_ar 是整車專用，不能用）

COA 的 AR 是「按用途分科目」，各有專屬 required_dimensions：

| 科目 | 用途 | required_dimensions |
|---|---|---|
| **1180104 應收帳款－零件銷售** | **本輪用** | CUSTOMER, PART_SKU, STORE, SUBSIDIARY, WAREHOUSE |
| 1180103 維修保養 | 下一輪 | CUSTOMER, RO, STORE, SUBSIDIARY, TECHNICIAN, VEHICLE |
| 1180101 新車尾款（= settings `default_ar_coa_id`） | 下一輪 | CUSTOMER, MODEL, MODEL_YEAR, SALESPERSON, STORE, SUBSIDIARY, VEHICLE |
| 1180301 保固理賠 | 下一輪 | DEALER, RO, STORE, SUBSIDIARY, TECHNICIAN, VEHICLE |

→ **AR_INVOICE 零件用 `fixed_coa` 1180104**，不走 settings `default_ar_coa_id`（那是整車、會被 MODEL/VEHICLE/SALESPERSON 維度卡死）。整車/維修 AR 之後用各自科目 + 各自 transaction_type。

---

## 3. DDL（4 表 + RLS，鏡像 AP）

> 全含 `metadata jsonb`、`brand_id` + RLS 4 條 `user_has_brand`。交易幣別 + `func_*` 快照。

### 3.1 `ar_invoices`
```sql
CREATE TABLE public.ar_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  invoice_no text NOT NULL,                    -- ARV-yyyymmdd-NNN
  customer_id uuid NOT NULL REFERENCES customers(id),
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,                               -- = invoice_date + customers.payment_terms_days
  currency text NOT NULL DEFAULT 'TWD',
  exchange_rate numeric NOT NULL DEFAULT 1,
  amount_pretax numeric NOT NULL DEFAULT 0,
  amount_tax numeric NOT NULL DEFAULT 0,
  amount_total numeric NOT NULL DEFAULT 0,
  func_amount_pretax numeric NOT NULL DEFAULT 0,
  func_amount_tax numeric NOT NULL DEFAULT 0,
  func_amount_total numeric NOT NULL DEFAULT 0,
  open_amount numeric NOT NULL DEFAULT 0,
  open_func_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','partially_paid','paid','void')),
  source_module text,                          -- sales_order | repair_order | parts_counter | manual
  source_doc_id uuid,
  einvoice_id uuid REFERENCES einvoices(id),   -- 稅務憑證雙向連結
  -- 代表維度（AR 控制科目 1180104 需 PART_SKU/WAREHOUSE；收款沖帳沿用）
  rep_item_id uuid REFERENCES items(id),
  rep_warehouse_id uuid REFERENCES warehouses(id),
  journal_entry_id uuid REFERENCES journal_entries(id),
  gl_posted boolean NOT NULL DEFAULT false,
  gl_posted_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (brand_id, invoice_no)
);
```

### 3.2 `ar_invoice_lines`
```sql
CREATE TABLE public.ar_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES ar_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  item_id uuid REFERENCES items(id),
  description text,
  qty numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  line_amount numeric NOT NULL DEFAULT 0,      -- 交易幣別未稅
  tax_code_id uuid REFERENCES tax_codes(id),
  tax_amount numeric NOT NULL DEFAULT 0,
  revenue_coa_id uuid REFERENCES chart_of_accounts(id),  -- 留空走 items.gl_revenue_coa_id
  warehouse_id uuid REFERENCES warehouses(id),
  source_module text,
  source_doc_line_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.3 `customer_receipts`（mirror payments）
```sql
CREATE TABLE public.customer_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  receipt_no text NOT NULL,                    -- RCP-yyyymmdd-NNN
  customer_id uuid NOT NULL REFERENCES customers(id),
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL DEFAULT 'TWD',
  exchange_rate numeric NOT NULL DEFAULT 1,
  amount numeric NOT NULL DEFAULT 0,
  func_amount numeric NOT NULL DEFAULT 0,
  bank_coa_id uuid REFERENCES chart_of_accounts(id),
  receipt_method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (receipt_method IN ('bank_transfer','cash','check')),
  realized_fx_func numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','void')),
  journal_entry_id uuid REFERENCES journal_entries(id),
  gl_posted boolean NOT NULL DEFAULT false,
  gl_posted_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (brand_id, receipt_no)
);
```

### 3.4 `receipt_applications`
```sql
CREATE TABLE public.receipt_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  receipt_id uuid NOT NULL REFERENCES customer_receipts(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES ar_invoices(id),
  applied_amount numeric NOT NULL DEFAULT 0,
  applied_func_amount numeric NOT NULL DEFAULT 0,
  invoice_exchange_rate numeric NOT NULL DEFAULT 1,
  realized_fx_func numeric NOT NULL DEFAULT 0, -- = applied × (receipt_rate − invoice_rate)，+ = 利益
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
```

RLS：4 表各 4 條 `user_has_brand(brand_id)`（同 AP）。

---

## 4. transaction_types（dim_sources 逐行涵蓋 required_dimensions — AP 那輪踩過的雷）

> ctx 金額一律 func（TWD）。AR 科目 1180104 需 CUSTOMER/PART_SKU/STORE/SUBSIDIARY/WAREHOUSE；收入 4100201 需 DEPT/BRAND/PART_SKU/STORE/SUBSIDIARY/WAREHOUSE；銷項稅 2250101 需 STORE/SUBSIDIARY。零稅 line 由引擎自動跳過（已實作）。

### 4.1 `AR_INVOICE`（零件賒帳）
ctx：`customer_id, item_id, func_net, func_tax, warehouse_id, store_id, subsidiary_id, brand_id, dept_id`
```
line1 D AR     fixed_coa 1180104              amount=func_net+func_tax  dims:CUSTOMER,PART_SKU,STORE,SUBSIDIARY,WAREHOUSE
line2 C 收入   master_field items.gl_revenue_coa_id (lookup item_id)  amount=func_net   dims:DEPT,BRAND,STORE,CUSTOMER,PART_SKU,WAREHOUSE,SUBSIDIARY
line3 C 銷項稅 system_default output_vat_default_coa_id  amount=func_tax  dims:STORE,SUBSIDIARY
```

### 4.2 `CUSTOMER_RECEIPT`（無匯差）
ctx：`customer_id, func_amount, item_id, warehouse_id, store_id, subsidiary_id, bank_id`
```
line1 D 銀行  system_default default_bank_coa_id  amount=func_amount  dims:BANK,STORE,SUBSIDIARY
line2 C AR    fixed_coa 1180104                   amount=func_amount  dims:CUSTOMER,PART_SKU,STORE,SUBSIDIARY,WAREHOUSE
```
（AR 沖帳 line 需 PART_SKU/WAREHOUSE → 用發票的 `rep_item_id`/`rep_warehouse_id`）

### 4.3 `CUSTOMER_RECEIPT_FX_GAIN` / `_LOSS`
收 func > AR 帳面 func → 利益；< → 損失。
```
GAIN：D 銀行 func_bank / C AR func_ar / C 兌換利益 func_fx     （func_bank = func_ar + func_fx）
LOSS：D 銀行 func_bank / D 兌換損失 func_fx / C AR func_ar     （func_ar = func_bank + func_fx）
```
fx 科目走 system_default `fx_gain_coa_id`/`fx_loss_coa_id`（dims STORE/SUBSIDIARY）。AR line dims 同上（含 PART_SKU/WAREHOUSE 代表維度）。

---

## 5. Domain helpers

### `src/domain/ar-invoices.ts`
```ts
createArInvoice(input)         // 建 draft+lines；func 化；rep_item/rep_warehouse 取第一行；due_date 由 customers.payment_terms_days
postArInvoice(id)              // postDocToGl('AR_INVOICE', ctx{customer,item,func_net,func_tax,warehouse,store,subsidiary,brand,dept})；status=posted
voidArInvoice(id)             // 無收款才可作廢；reverseDocGl
createInvoiceFromSalesOrder(so_id)  // 便利：賒帳 SO 帶出（本輪零件型；整車型下一輪）
```
- `store_id` 解析該法人下一個 store（同 AP，service client）；`dept_id` 解析該 brand「零配件部」(code=PRT)；`brand_id`=scope。

### `src/domain/customer-receipts.ts`
```ts
createReceipt(input)
applyAndPost(receipt_id, applications[])   // 算 realized_fx；無匯差→CUSTOMER_RECEIPT，有→_FX_GAIN/_LOSS；更新 ar_invoices.open_*/status；postDocToGl
```

---

## 6. ⚠️ 待 Ming 拍板（4 點，多為計畫確認）

1. **AR 第一塊鎖「零件賒帳」**（科目 1180104），整車/維修/保固 AR 各用專屬科目 + 各自 transaction_type，下一輪。同意？
2. **不動 settings `default_ar_coa_id`（=1180101 整車）**；AR_INVOICE 零件直接 `fixed_coa 1180104`。同意？（按交易型別走專屬 AR 科目，不靠單一 default）
3. **防重複入帳鐵則**：POS 現金維持 `PARTS_RETAIL_SALE`（已含 COGS）；`AR_INVOICE` 只給**賒帳**、**只認收入不認 COGS**（COGS 由領料 `COGS_ON_ISSUE` 過）；`einvoices` 純稅務憑證、`ar_invoices.einvoice_id` 連結。同意？
4. **DEPT 維度**：收入科目需 DEPT → helper 解析該 brand「零配件部」(PRT)。同意？

---

## 7. 驗證（對稱 AP）

- tsc 0 / eslint 0 / 天條 audit 0
- scripted e2e（indian、真 runtime + RLS）：
  1. TWD：建賒帳 AR 發票（零件）→ post（Dr AR 1180104 / Cr 收入 / Cr 銷項稅，平衡）→ createReceipt → applyAndPost（Dr 銀行 / Cr AR，無匯差）→ 發票 paid、open=0
  2. USD：發票@31 → 收款@33 → 預期 `CUSTOMER_RECEIPT_FX_GAIN`（收 func 3300 > AR 帳面 3100 → 利益 200）借貸平衡、realized_fx 正確
- 對帳：`SUM(ar_invoices.open_func_amount)` = GL AR 控制科目（1180104）餘額
- 測試資料清乾淨還原

---

## 8. 落地順序（簽核後）
1. apply DDL（4 表 + RLS）
2. seed 4 transaction_types + 補 TX_TYPES
3. `ar-invoices.ts` / `customer-receipts.ts`
4. 驗證（§7）
5. 更新長期記憶；不主動 commit
