# P2（零件 P2P 閉環）落地提案 — AP 子帳 + GR/IR + 多幣別

**狀態**：⏳ 等 Ming 簽核（DDL 未跑）
**日期**：2026-05-29
**範圍決策**：Ming 已選「零件 P2P 閉環優先」（AR / 整車 / UI 下一輪）
**前置**：P0 地基 + P1 成本引擎已落地（`~/.claude/plans/erp-netsuite-memoized-chipmunk.md` 半部 B B1–B5）
**tenant**：`e4cd1ac2-0fe1-49e7-8509-7c337324c574`、base_currency=`TWD`、demo brand=`indian`

---

## 1. 目標與非目標

把採購到付款這條接成正式 AP 子帳閉環，並讓它咬合已驗過的成本引擎：

```
採購單 PO ──► 進貨 GRN ──────► 廠商發票 Vendor Bill ──────► 付款 Bill Payment
            INVENTORY_RECEIPT   VENDOR_BILL                BILL_PAYMENT(+FX)
            Dr 存貨 / Cr GR/IR   Dr GR/IR + Dr 進項稅 / Cr AP  Dr AP / Cr 銀行 (+已實現匯損益)
            + 成本 ledger 事件    （清 GR/IR、不再碰存貨）
```

**本輪做**：
- 4 張表：`vendor_bills` / `vendor_bill_lines` / `payments` / `payment_applications`（+ RLS）
- 4–5 個 transaction_type：`INVENTORY_RECEIPT`、`VENDOR_BILL`、`BILL_PAYMENT`（+ `BILL_PAYMENT_FX_GAIN`/`BILL_PAYMENT_FX_LOSS`）
- domain helpers：`vendor-bills.ts`、`payments.ts`、`exchange-rates.ts`
- rewire `receiveStock`：改 fire `INVENTORY_RECEIPT` + 補 fire 成本 ledger 事件（目前缺）+ 用 PO 幣別/匯率換 func 成本
- 多幣別：交易幣別存單據、GL 永遠存 func（TWD）、沖帳算已實現匯損益
- 驗證：scripted e2e（TWD + USD 各一）+ 對帳鐵律 + GRN UI 回歸（Playwright）

**本輪不做（明列、下一輪）**：
- AR 半部（`ar_invoices` / `customer receipts`）、整車 O2C、`COGS_ON_VEHICLE_SALE`
- vendor-bill / payment 的 List/Detail **UI 路由 + nav_nodes**（本輪用 domain helper + scripted e2e 驗，不點 UI）
- PPV 採購價差強制比對（3-way match 連結欄先建、**不強制**，假設帳單金額=進貨金額）
- 代扣稅（withholding）扣繳分錄（零件供應商通常無代扣；屬服務/租金/勞務帳單，隨 AR/費用帳單下一輪做）
- 期間關帳 subsidiary 化、期初餘額（P3）、財務報表（P4）

---

## 2. GR/IR 會計模型（為什麼要 rewire receiveStock）

### 現況（會重複入帳，不能與 Vendor Bill 並存）
`receiveStock` 現在一步到位走 `PARTS_PURCHASE`：

```
進貨即認 AP：  Dr 存貨 5xxx        Cr 應付帳款 AP        Dr 進項稅
```

若此時再開 Vendor Bill 走 `Dr GR/IR / Cr AP`，**AP 會被借一次又貸一次以外還多貸一次** → 重複入帳、GR/IR 懸空。兩者不能並存。

### 目標（GR/IR 清算科目當契約接口）

| 步驟 | 分錄（func/TWD） | 說明 |
|---|---|---|
| GRN `INVENTORY_RECEIPT` | Dr 存貨 `1210201`／Cr GR/IR 零件 `2170107` | 收到貨、欠單未到，先掛暫估應付（GR/IR）。**同時** fire 成本 ledger receipt 事件 |
| Vendor Bill `VENDOR_BILL` | Dr GR/IR `2170107` + Dr 進項稅 `1190401`／Cr AP（`suppliers.gl_payable` fallback `2170105`） | 發票到，清掉 GR/IR、認進項稅、轉成正式 AP |
| Bill Payment `BILL_PAYMENT` | Dr AP／Cr 銀行 `1102101`（+ 已實現匯損益） | 付款沖 AP |

對帳鐵律：`SUM(inventory_cost_ledger.value_after)` = GL 存貨餘額；`SUM(vendor_bills.open_func_amount)` = GL AP 控制科目餘額。GR/IR 在「收貨後、開票前」會有餘額，開票後歸零。

---

## 3. DDL（4 張表 + RLS）

> 全部含 `metadata jsonb DEFAULT '{}'`、`brand_id` + RLS 4 條 `user_has_brand(brand_id)`（鏡像 `stock_receipts`）。金額一律 `numeric`。交易幣別欄 + `func_*` 本位幣快照欄並存。

### 3.1 `vendor_bills`（廠商發票單頭）

```sql
CREATE TABLE public.vendor_bills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        text NOT NULL,
  subsidiary_id   uuid REFERENCES subsidiaries(id),
  bill_no         text NOT NULL,                 -- VB-yyyymmdd-NNN（系統流水）
  vendor_invoice_no text,                        -- 廠商自己的發票號
  vendor_id       uuid NOT NULL REFERENCES suppliers(id),
  bill_date       date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,                          -- = bill_date + suppliers.payment_terms_days
  -- 交易幣別金額
  currency        text NOT NULL DEFAULT 'TWD',
  exchange_rate   numeric NOT NULL DEFAULT 1,    -- 交易幣別 → func（TWD）當下快照
  amount_pretax   numeric NOT NULL DEFAULT 0,
  amount_tax      numeric NOT NULL DEFAULT 0,
  amount_total    numeric NOT NULL DEFAULT 0,    -- = pretax + tax
  withholding_amount numeric NOT NULL DEFAULT 0, -- 本輪恆 0（withholding 下一輪）
  -- 本位幣（func）快照 = 交易 × exchange_rate
  func_amount_pretax numeric NOT NULL DEFAULT 0,
  func_amount_tax    numeric NOT NULL DEFAULT 0,
  func_amount_total  numeric NOT NULL DEFAULT 0,
  -- 沖帳餘額
  open_amount     numeric NOT NULL DEFAULT 0,    -- 交易幣別未沖（初始 = amount_total）
  open_func_amount numeric NOT NULL DEFAULT 0,   -- func 未沖（對帳 AP 控制科目用）
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','posted','partially_paid','paid','void')),
  source_doc_type text,                          -- purchase_order / stock_receipt / manual
  source_doc_id   uuid,
  journal_entry_id uuid REFERENCES journal_entries(id),
  gl_posted       boolean NOT NULL DEFAULT false,
  gl_posted_at    timestamptz,
  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  UNIQUE (brand_id, bill_no)
);
```

### 3.2 `vendor_bill_lines`（發票明細 + 3-way match 連結）

```sql
CREATE TABLE public.vendor_bill_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        text NOT NULL,
  bill_id         uuid NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
  line_no         integer NOT NULL,
  line_type       text NOT NULL DEFAULT 'inventory'
                  CHECK (line_type IN ('inventory','expense')),  -- inventory 清 GR/IR；expense 直接 Dr 費用
  item_id         uuid REFERENCES items(id),
  description     text,
  qty             numeric NOT NULL DEFAULT 0,
  unit_cost       numeric NOT NULL DEFAULT 0,    -- 交易幣別
  line_amount     numeric NOT NULL DEFAULT 0,    -- 交易幣別未稅
  tax_code_id     uuid REFERENCES tax_codes(id),
  tax_amount      numeric NOT NULL DEFAULT 0,
  gl_account_coa_id uuid REFERENCES chart_of_accounts(id),  -- expense 行用；inventory 行留空（走 GR/IR）
  -- 3-way match（本輪只記錄、不強制；PPV 下一輪）
  po_id           uuid REFERENCES purchase_orders(id),
  po_line_id      uuid REFERENCES purchase_order_lines(id),
  stock_receipt_line_id uuid REFERENCES stock_receipt_lines(id),
  matched_qty     numeric NOT NULL DEFAULT 0,
  match_status    text NOT NULL DEFAULT 'unmatched'
                  CHECK (match_status IN ('unmatched','matched','over','under')),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### 3.3 `payments`（付款單；本輪僅 AP 付款）

```sql
CREATE TABLE public.payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        text NOT NULL,
  subsidiary_id   uuid REFERENCES subsidiaries(id),
  payment_no      text NOT NULL,                 -- PAY-yyyymmdd-NNN
  vendor_id       uuid NOT NULL REFERENCES suppliers(id),
  payment_date    date NOT NULL DEFAULT CURRENT_DATE,
  currency        text NOT NULL DEFAULT 'TWD',
  exchange_rate   numeric NOT NULL DEFAULT 1,    -- 付款當下 交易→func 匯率
  amount          numeric NOT NULL DEFAULT 0,    -- 交易幣別付款額
  func_amount     numeric NOT NULL DEFAULT 0,    -- func 快照
  bank_coa_id     uuid REFERENCES chart_of_accounts(id),  -- 從哪個銀行戶付（留空走 default_bank）
  payment_method  text NOT NULL DEFAULT 'bank_transfer'
                  CHECK (payment_method IN ('bank_transfer','cash','check')),
  realized_fx_func numeric NOT NULL DEFAULT 0,   -- 本次已實現匯損益（func；+gain/-loss）
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','posted','void')),
  journal_entry_id uuid REFERENCES journal_entries(id),
  gl_posted       boolean NOT NULL DEFAULT false,
  gl_posted_at    timestamptz,
  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  UNIQUE (brand_id, payment_no)
);
```

### 3.4 `payment_applications`（付款 ↔ 發票沖帳 + 已實現匯損益）

```sql
CREATE TABLE public.payment_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          text NOT NULL,
  payment_id        uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_id           uuid NOT NULL REFERENCES vendor_bills(id),
  applied_amount    numeric NOT NULL DEFAULT 0,  -- 交易幣別本次沖額
  applied_func_amount numeric NOT NULL DEFAULT 0,-- 付款當下 rate 的 func
  bill_exchange_rate numeric NOT NULL DEFAULT 1, -- 帳單當下 rate（算匯損益用）
  realized_fx_func  numeric NOT NULL DEFAULT 0,  -- = applied_amount × (pay_rate − bill_rate)
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid
);
```

### 3.5 RLS（每張表）

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_scoped_select ON <table> FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY brand_scoped_insert ON <table> FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY brand_scoped_update ON <table> FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY brand_scoped_delete ON <table> FOR DELETE USING (user_has_brand(brand_id));
```

> domain helper 走 service-role（如 `posting.ts`）時繞過 RLS；UI 走 `createClient()` 的讀取靠這 4 條擋跨 brand。

---

## 4. transaction_types（gl_template JSON）

> 全用引擎現有 resolver 型別（`master_field` / `system_default` / `tax_code_coa` / `fixed_coa` + `fallback`）。amount 一律非負、方向由 side 固定。**ctx 金額一律 func（TWD）**，caller 先乘匯率。

### 4.1 `INVENTORY_RECEIPT`（取代 GRN 的 PARTS_PURCHASE）
ctx：`item_id, func_goods, warehouse_id, supplier_id, store_id?`

```
line1 D 存貨   master_field items.gl_inventory_coa_id (lookup item_id)  amount=func_goods
line2 C GR/IR  system_default grir_parts_coa_id                         amount=func_goods
dims: SUBSIDIARY/STORE/WAREHOUSE/PART_SKU/VENDOR
```

### 4.2 `VENDOR_BILL`（清 GR/IR、認進項稅、轉 AP）
ctx：`supplier_id, func_goods, func_tax`（func_total = func_goods + func_tax）

```
line1 D GR/IR    system_default grir_parts_coa_id                       amount=func_goods
line2 D 進項稅   system_default input_vat_default_coa_id                amount=func_tax
line3 C AP       master_field suppliers.gl_payable_coa_id
                 fallback system_default default_ap_coa_id (lookup supplier_id)  amount=func_goods+func_tax
dims: SUBSIDIARY/VENDOR
```

### 4.3 `BILL_PAYMENT`（無匯差；TWD 或匯率未動）
ctx：`supplier_id, func_amount, bank_id?`

```
line1 D AP    master_field suppliers.gl_payable_coa_id fallback default_ap (lookup supplier_id)  amount=func_amount
line2 C 銀行  system_default default_bank_coa_id                                                  amount=func_amount
dims: SUBSIDIARY/VENDOR/BANK
```

### 4.4 `BILL_PAYMENT_FX_GAIN` / `BILL_PAYMENT_FX_LOSS`（有已實現匯差時依正負選）
ctx：`supplier_id, func_ap（沖掉的 AP 帳面 func）, func_bank（實付 func）, func_fx（差額絕對值）`

```
GAIN（AP 帳面 > 實付 → 賺）：
  D AP   func_ap
  C 銀行 func_bank
  C 兌換利益 fx_gain_coa_id  func_fx        （func_ap = func_bank + func_fx）
LOSS（AP 帳面 < 實付 → 賠）：
  D AP   func_ap
  D 兌換損失 fx_loss_coa_id  func_fx
  C 銀行 func_bank                          （func_bank = func_ap + func_fx）
```

> fx_gain/loss 的 COA：用 fixed_coa（`7100302`/`7500302`，已在 settings）或新增 `system_default` 走 `fx_gain_coa_id`/`fx_loss_coa_id`。引擎 `system_default` resolver 直接吃 settings 欄位，**用 system_default 最乾淨**。

---

## 5. Domain helpers（天條：UI 只走 helper）

### `src/domain/exchange-rates.ts`
```ts
getRate(from, to, date?, rateType?): Promise<number>   // 查 exchange_rates；查無回 1（同幣別）或丟錯
```

### `src/domain/vendor-bills.ts`
```ts
type Result<T> = { ok:true; data:T } | { ok:false; error:string };
createVendorBill(input): Result<{ id, bill_no }>       // 建 draft + lines；func_* = 交易 × getRate
postVendorBill(id, userId): Result<...>                // postDocToGl('VENDOR_BILL', ...) + 回寫 status=posted/open_amount
listVendorBills / getVendorBillById                    // 給下一輪 UI
voidVendorBill(id): reverseDocGl + status=void
// 便利：createBillFromReceipt(stock_receipt_id) — 從 GRN 帶出 vendor/明細/金額（3-way match 連結自動填）
```

### `src/domain/payments.ts`
```ts
createPayment(input): Result<{ id, payment_no }>
applyAndPost(payment_id, applications[], userId): Result<...>
  // 1) 寫 payment_applications（算每筆 realized_fx）
  // 2) 更新 vendor_bills.open_amount/open_func_amount/status
  // 3) postDocToGl：無匯差→BILL_PAYMENT；有→BILL_PAYMENT_FX_GAIN/LOSS（依 Σrealized_fx 正負）
  // 4) payments.status=posted
```

---

## 6. receiveStock rewire（動到一條上線流程，本輪唯一改既有行為）

`src/domain/receipts.ts` 第 597–630 行那段 `after()` 改：

1. **GL**：`PARTS_PURCHASE` → `INVENTORY_RECEIPT`（Dr 存貨／Cr GR/IR，**不再認 AP/進項稅**；稅與 AP 移到 Vendor Bill）。
2. **成本 ledger（目前缺、補上）**：每張 GR line fire `postCostEvent({ subjectType:'part', eventType:'receipt', itemId, warehouseId, qty, unitCostIn: func 單位成本, sourceTable:'stock_receipts', sourceId, stockItemId })` → 更新 `inventory_cost_ledger` + `inventory_cost_state`（不再只靠 rebuild RPC 對齊）。
3. **多幣別**：`receiveStock` 加撈 `purchase_orders.currency, exchange_rate`；func 成本 = PO 單位成本 × exchange_rate（USD 進貨才有差，TWD rate=1）。`func_goods` = Σ(line func)。
4. GL 仍維持「整單聚合一張 entry、item_id 取第一筆代表」的 POC 簡化（與現況一致）；成本 ledger 則**逐行** fire（精確到 item/warehouse bucket）。

---

## 7. ⚠️ 待 Ming 拍板（3 點）

1. **舊 `payReceipt` / `returnReceipt`（GRN 詳情頁的「結款 / 退回」metadata 捷徑）怎麼處理？**
   rewire 後 GRN 認的是 GR/IR 不是 AP，舊 `payReceipt`（`VENDOR_PAYMENT_BANK`: Dr AP/Cr 銀行）會借一個從未貸過的 AP → 帳會歪。
   - **建議**：本輪 GRN 走 `INVENTORY_RECEIPT` 後，正式付款一律走 Vendor Bill → Payment。舊 `payReceipt`/`returnReceipt` 標 `@deprecated` 留著（不自動 fire、需人工點），等下一輪做 vendor-bill UI 時把 GRN 詳情頁的「結款」按鈕改成「建立廠商發票」並移除捷徑。
   - 替代：本輪直接讓 `payReceipt`/`returnReceipt` 回錯誤擋掉。→ 但會讓既有 GRN 詳情頁兩顆按鈕壞掉、UX 突兀。**傾向建議案。**

2. **fx_gain/loss COA 用 system_default（吃 settings 欄）還是 fixed_coa（寫死 7100302/7500302）？** 建議 system_default（已回填、改科目不動 template）。

3. **`payments` 表命名**：本輪只做 AP 付款。要叫 `payments`（之後 AR 收款用對稱的 `receipts`）還是 `ap_payments`？計畫書用 `payments`/`receipts` 分立。建議照計畫用 `payments`。

> 其餘已是計畫既定、不另問：GR/IR 零件/車輛分開、func 化、雙法成本、PPV/withholding 延後。

---

## 8. 驗證計畫（對帳鐵律 + 回歸）

落地後跑：
- `npx tsc --noEmit` = 0、`npx eslint <新檔>` = 0
- 天條 audit：`grep -rn "@/lib/supabase" "src/app/(workspace)" src/components` = 0 hit
- **scripted e2e（indian、DO 區塊內 RAISE 回滾或真寫後清）**：
  1. **TWD 案**：建 PO(TWD) → receiveStock → 查 `INVENTORY_RECEIPT` 分錄(Dr存貨/Cr GR/IR 平衡) + `inventory_cost_state` 均價更新 → createVendorBill+post(Dr GR/IR+進項稅/Cr AP，GR/IR 歸零) → createPayment+applyAndPost(Dr AP/Cr 銀行，無匯差) → AP 控制科目歸零
  2. **USD 案**：PO(USD@31) → GRN(func 成本=USD×31) → Vendor Bill → Payment@33 → 驗 `BILL_PAYMENT_FX_LOSS` 分錄、`realized_fx_func` 正確、借貸平衡
- **對帳鐵律**：`SUM(inventory_cost_ledger.value_after)` = GL 存貨餘額；`SUM(vendor_bills.open_func_amount)` = GL AP 控制科目餘額（兩條全綠）
- **GRN UI 回歸（Playwright，因 receiveStock 是上線流程）**：以 indian 登入 → 開一張 PO 一鍵收貨 → 確認入庫成功 + `INVENTORY_RECEIPT` 分錄落地、無 server error

---

## 9. 落地順序（簽核後）

1. apply DDL（4 表 + RLS）
2. seed 4–5 transaction_types + 補 `TX_TYPES`
3. 寫 `exchange-rates.ts` / `vendor-bills.ts` / `payments.ts`
4. rewire `receiveStock`（GL + 成本事件 + func）+ 處理 payReceipt（依拍板）
5. 驗證（§8）
6. 更新長期記憶 `project_erp_financial_spine.md`，不主動 commit（等 Ming 點頭）
