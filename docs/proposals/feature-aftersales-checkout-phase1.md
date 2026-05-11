# 提案：售後工單模組 — 結帳收款（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/08_結帳收款.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（售後模組目前在 Ducati nav 樹下；Indian 視業務拍板再補）
> 姊妹頁（同模組，已做 Phase 1）：
> - `feature-aftersales-overview-phase1.md`、`feature-aftersales-flow-diagram-phase1.md`
> - `feature-aftersales-appointments-phase1.md`
> - `feature-aftersales-ro-phase1.md`、`feature-aftersales-ro-lines-phase1.md`
> - `feature-aftersales-precheck-{ro,sa}-phase1.md`、`feature-aftersales-addons-phase1.md`、`feature-aftersales-addon-loop-phase1.md`
> - `feature-aftersales-final-check-phase1.md`、`feature-aftersales-management-phase1.md`

---

## 0. 頁面定位（先釐清這頁是什麼）

**結帳收款 = RO 工單 pipeline 的金流終點站 + 整個模組副作用最密集的一頁。**

售後工單流程線：

```
01 預約 → 02 RO 建立 → 04 預檢 → 03/04/05 增項閉環 → 06 竣工複檢 → 【08 結帳收款】→ RO 關單
                                                                       ↑ 本頁
```

|維度|答案|
|---|---|
|是 wizard / 多步驟單據嗎？|✅ **是。4-step linear wizard**（費用確認 → 車主二簽 → 收款方式+發票 → 關單成功畫面）|
|是 list view 嗎？|❌ 不是。**逐張 RO 的單筆結帳精靈**，沒有 list。歷史結帳查詢走 10_工單查詢。|
|是 master data 設定嗎？|❌ 不是。完全 transactional。|
|是金流關卡嗎？|✅ **是的**。本頁是「狀態機推進到結案 + 收款記錄寫入 + 發票寫入 + 觸發 GL 分錄 + 推 LINE」的單一入口|
|寫入哪些表？|`repair_orders.status` 改 `已關單`、新表 `service_invoices` + `service_payments`、可能寫 audit log、觸發 `gl_journal_entries`（透過 transaction_types 引擎）|
|跟既有 COA / gl_journal_entries 的關係？|本頁是「服務維修發票」（`SERVICE_INVOICE` transaction_type，accounting-relations-architecture.md §範例 1-6 已草擬）的觸發點。本提案不重做 GL 引擎，**走既有 transaction_types template + 補資料 / 接 helper 即可**。|

### 結帳精靈 4 步驟對照（從 HTML）

| Step | 名稱 | 主要動作 | 副作用 |
|---|---|---|---|
| 1 | 費用確認 | SA 與車主對帳、套折扣（無折扣 / VIP 九五折 / 主管授權九折） | 折扣 ≥ 主管授權門檻 → 需 07 折扣審批（[需確認] Phase 1 是否走完整審批 / 先簡化） |
| 2 | 車主第二次簽名 | 4 項聲明 + 電子簽名 + 防竄改時間戳 | 寫 `service_invoices.customer_signature_at` + signature blob |
| 3 | 收款方式 + 發票 | 4 種付款方式（信用卡/現金/行動支付/銀行轉帳）+ 4 種發票（電子/載具/統編/捐贈） | 寫 `service_payments`、開立電子發票、推「謝謝光臨」/取車通知、觸發 GL 分錄 |
| 4 | RO 關單成功畫面 | 顯示結帳摘要、列印收據、返回看板、下次預約提醒 | RO `status = 已關單`、`closed_at = now()`、cron / 邏輯排「下次保養回廠」提醒 |

⚠️ **跟 HTML 對比的重要 gap**：HTML 只列**單一付款方式**單選 radio，但任務描述提到「**多種付款方式**（現金 / 信用卡 / 轉帳 / 客戶儲值 / 保險折抵）」、且加上「客戶儲值 / 保險折抵」兩個 HTML 沒有的選項。Phase 1 提案我會把 schema 設計成**支援多筆 payment line per invoice**，但 UI 是否 Phase 1 就做 split-payment 由 Phase 3 拍板（HTML 等同 single-payment 簡化版）。

### 不做 / 不在本頁的事

- ❌ **應收帳款追蹤、月結對帳、紅字沖銷** → 那是會計模組的職責、本頁只負責「產 invoice + payment + 寫 GL」
- ❌ **退費 / 折讓 / 客訴重開** → 屬於 invoice reversal，Phase B 之後做、本頁不處理
- ❌ **零件出庫扣庫存** → 已在 03_維修項目零件明細 / 05_增項閉環 完成（領料時就扣了），結帳不再動
- ❌ **發票機 / 電子發票上傳到財政部** → 走外部 API，本頁只標記 `invoice_issued = true`，實際呼叫由 Phase B 整合或人工跑

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

```
A. 服務維修發票（service_invoices）← 本頁新增主表
   fields:
     - id uuid PK
     - brand_id text
     - subsidiary_id uuid FK              (報表 / 法人歸屬，重要 — brand ≠ subsidiary)
     - store_id uuid FK → organizations   (level=2，門店)
     - repair_order_id uuid FK → repair_orders (UNIQUE)
     - invoice_no text                    (店內單號，例 'INV-260508-001'；對外發票號碼另存)
     - issued_at timestamptz
     - issued_by_employee_id uuid FK → employees   (操作 SA)
     -- 金額三件套（皆未稅 / 含稅都存方便報表，typed）
     - subtotal_amount numeric(12,2)      (各 line 加總，未稅)
     - discount_amount numeric(12,2)      (折扣總額)
     - tax_amount numeric(12,2)           (5% 銷項稅)
     - total_amount numeric(12,2)         (應付總計 = subtotal - discount + tax)
     - paid_amount numeric(12,2)          (實收，多筆 payment 加總)
     -- 折扣關聯
     - discount_kind text                 ('none' / 'vip_5' / 'supervisor_10' / 'custom')
     - discount_pct numeric(5,2)
     - discount_authorized_by_employee_id uuid FK → employees    (主管授權時記，可 null)
     - discount_approval_status text      ('not_required' / 'pending' / 'approved' / 'rejected')
     - discount_approval_chain jsonb      (從 07 business_rules 算出來的審批鏈快照)
     -- 車主第二次簽名（Step 2）
     - customer_signature_at timestamptz
     - customer_signature_blob text       (base64 SVG / canvas, 防竄改 — typed 比 jsonb 好查)
     - customer_acknowledged_terms text[] (那 4 條聲明的 enum 陣列，方便日後條款版本管理)
     -- 發票
     - invoice_type text                  ('cloud_personal' / 'carrier' / 'company_tax_id' / 'donate')
     - invoice_carrier text               (載具號 — 只在 carrier 時)
     - invoice_company_tax_id text        (統編 — 只在 company_tax_id 時)
     - invoice_donate_code text           (捐贈碼 — 只在 donate 時)
     - external_invoice_no text           (對外正式發票號碼，由電子發票 API 回填 — Phase 1 可 null)
     - external_invoice_issued_at timestamptz
     -- 狀態
     - status text                        ('draft' / 'in_payment' / 'paid' / 'closed' / 'voided')
     - closed_at timestamptz              (Step 4 通過時寫)
     - voided_at timestamptz              (Phase B 退款用)
     - voided_reason text
     - metadata jsonb                     (HTML 上「無爭議聲明」、「列印收據次數」等)
     - created_at / updated_at
   relationships:
     - { to: repair_orders, kind: 'fk', unique: true }   # 一張 RO 對應一張 invoice
     - { to: subsidiaries / organizations / employees }
     - { to: service_payments, kind: '1m' }              # 一張發票多筆收款

B. 服務收款明細（service_payments）← 本頁新增子表
   fields:
     - id uuid PK
     - brand_id text
     - invoice_id uuid FK → service_invoices
     - payment_method text                ('card' / 'cash' / 'mobile_pay' / 'bank_transfer'
                                           / 'customer_credit' / 'insurance_claim')
     - amount numeric(12,2)
     - paid_at timestamptz
     - reference_no text                  (信用卡末四碼 / 銀行交易碼 / 行支單號 等)
     - card_acquirer text                 (收單行；只 method=card)
     - bank_account_id uuid               (Phase B 串銀行帳號主檔)
     - customer_credit_account_id uuid    (Phase B 串客戶儲值；reuse 客戶側「儲值帳戶」)
     - insurance_claim_no text            (保險公司理賠單號；只 method=insurance_claim)
     - insurance_company_id uuid          (保險公司主檔；Phase B)
     - received_by_employee_id uuid FK → employees
     - metadata jsonb
     - created_at
   ⚠️ 多筆 payment per invoice 是「混合付款」（例：刷卡 6000 + 現金 3135 = 9135）
   ⚠️ insurance_claim 跟 customer_credit 兩個方式 HTML 沒有、是任務描述補的，Phase 3 拍板要不要 Phase 1 就做

C. 客戶儲值帳戶（customer_credit_accounts）← 候選新表，[Phase 2/3] 才做
   ⚠️ Phase 1 先不開、若選用 'customer_credit' 付款方式則先讓資料卡住 / 不支援
   ⚠️ 客戶儲值是「先存錢、後消費」的預收款（會計上是負債 2160xxx 預收款項）
   schema 草案:
     - id uuid PK
     - brand_id text
     - customer_id uuid FK → customers
     - balance numeric(12,2)
     - last_transaction_at timestamptz
     - metadata jsonb
   並有 sub-table customer_credit_transactions (deposit / withdraw / refund 流水)
   ⚠️ 接這個會牽動 09_人車檔案、客戶模組整體；建議 Phase 2 後獨立提案

D. 保險折抵 / 理賠（insurance_claims）← 候選新表，[Phase 2/3] 才做
   ⚠️ HTML 沒有；任務描述提示要支援，但同樣牽涉保險公司主檔 / 保固模組
   ⚠️ accounting-relations-architecture §範例 transaction_types 已列 INSURANCE_CLAIM 走獨立分錄路徑
   schema 草案:
     - id uuid PK / brand_id / repair_order_id
     - insurance_company_id (FK; Phase B 主檔)
     - claim_no / claim_amount / approved_amount / status (submitted/approved/rejected/paid)
   ⚠️ 跟 service_payments 的關係：成功的 insurance_claim 在結帳時建一筆 service_payments
       (method='insurance_claim', amount=approved_amount)
   ⚠️ 建議 Phase 1 不做、Phase 2-3 開保險模組獨立提案

E. 折扣審批單（discount_approval_requests）← 候選新表
   ⚠️ 等 07_售後管理.崗位折扣設定 落地後決定
   ⚠️ 兩種設計選擇（Phase 3 拍板）:
       (1) 折扣審批走 service_invoices.discount_approval_status 內聯 + business_rules 算審批鏈
           → 適合「同步審批」/ POC 簡化版（SA 找主管當面點頭 → SA 自己 mark approved）
       (2) 獨立 discount_approval_requests 表 + status 機 + 推 LINE 給主管 + 線上點按審批
           → 適合「異步審批」/ Phase B 完整版
   ⚠️ Phase 1 推薦走 (1) — 簡化版

F. 既有表寫入 / 改動：
   - repair_orders.status → 'closed' / 'closed_at' = now()
   - repair_orders.invoice_id (新欄位，typed FK) — 方便反查
   - gl_journal_entries (+ gl_journal_lines) ← 走既有 transaction_types 引擎；本頁只是觸發點
   - audit_log（如有）— 結帳是「不可逆」動作，建議寫 audit log

G. transaction_types reuse（GL 分錄模板）
   ⚠️ accounting-relations-architecture.md §範例 1-2 / 服務側 transaction_type code = 'SERVICE_INVOICE'
   ⚠️ template 應該包含 5 行（範例參考新車銷售 / 零件零售）:
       1) D customer.ar_account_coa_id 或 cash/card_coa  (應收 or 收款)
       2) C item.income_account_coa_id (服務收入 / 工資收入；可拆兩 line)
       3) C tax_codes['VAT_5_OUTPUT'].coa_id (銷項稅)
       4) D item.cogs_account_coa_id (零件 COGS — 因為實際零件已出庫 / 但成本到結帳這刻才結轉)
       5) C item.inventory_account_coa_id (存貨)
   ⚠️ 折扣的處理（要新增第 6 行）:
       6) D system.sales_discount_coa_id (銷貨折讓；Phase 3 拍板是 net 還是 gross 入帳)
   ⚠️ 本頁不重新寫 GL 引擎；只 call `postTransactionType('SERVICE_INVOICE', ctx)` 即可
       (helper 預期在 src/domain/accounting.ts，由 accounting 模組落地時提供)
```

### actions

```
費用確認（Step 1）:
  getRoCheckoutContext(ro_id)              → Promise<{ ro, lines, addons, totals, discount_options }>
    從 02 RO + 03 lines + 04/05 addons 算 subtotal / tax / total

  previewDiscount(ro_id, discount_input)   → Promise<{ valid, requires_approval, approval_chain, computed_total }>
    內部呼 `aftersales-discounts.checkDiscountAuthority(grade, kind, pct)`（07 提案的 helper）

  requestDiscountApproval(ro_id, discount_input, current_user_grade)
    → Promise<Result<{ approval_status, approval_chain }>>
    [副作用：推 LINE 給審批人 / Phase 1 走簡化版可能直接 inline confirm]

車主簽名（Step 2）:
  saveCustomerSignature(invoice_draft_id, signature_blob)
    → Promise<Result>
    [副作用：寫 signature_at + signature_blob + 防竄改時間戳]

收款 + 發票（Step 3）:
  createServiceInvoice(input)
    → Promise<Result<{ invoice_id }>>
    input: { ro_id, totals, discount, customer_signature, invoice_type, invoice_extra }
    [副作用：建 service_invoices 一筆 + status='in_payment']

  addPayment(invoice_id, payment)
    → Promise<Result<{ payment_id }>>
    [可多次呼叫 — 支援 split payment]
    [副作用：建 service_payments / 累加 paid_amount / 若 paid >= total → status='paid']

  removePayment(payment_id)
    → Promise<Result>
    [收銀員打錯時用、需 require_approval（管理員權限）]

  confirmCheckout(invoice_id)
    → Promise<Result<{ invoice, ro_status }>>
    ⭐ 整頁副作用最集中的一個 action，內部:
      1. 驗證 paid_amount == total_amount
      2. UPDATE service_invoices.status='closed' / closed_at=now()
      3. UPDATE repair_orders.status='closed' / closed_at=now() / invoice_id
      4. 觸發 GL 分錄 — call postTransactionType('SERVICE_INVOICE', ctx)
         (建 gl_journal_entries + gl_journal_lines，含 5-6 lines)
      5. 觸發開立電子發票（external API — Phase B；Phase 1 標記 invoice_issued=false 待人工跑）
      6. 推 LINE 給客戶（取車通知 / 謝謝光臨）— 走 notifications.dispatch
      7. 寫 audit_log (Phase 3 拍板)
      8. revalidatePath('/parts/aftersales/management/bays') 等相關頁
    ⚠️ 必須是 server action / RPC，client side 不可能跑這麼多副作用

關單後（Step 4 已成功，僅 UI）:
  reprintReceipt(invoice_id)               → Promise<{ html: string }> (純 read)
  scheduleNextServiceReminder(invoice_id)  → Promise<Result>
    [副作用：建一筆「下次保養回廠提醒」cron 排程；走通知 hub]
```

### kpis

本頁本身不是 KPI 頁，但**結帳資料**是後續多個 dashboard 的根：

```
- 本日結帳張數 / 金額                   ← 01_預約看板 / 售後管理首頁要顯示
- 各付款方式佔比                         ← 老闆級財務 dashboard
- 平均單張結帳金額 / 工時佔比 / 零件佔比 ← 售後績效報表
- 折扣使用率 / 主管授權折扣總額           ← 07_售後管理 異常監控
- 發票開立失敗率 (external_invoice_issued_at IS NULL)  ← 維運 alert
```

### implied_schema

```
service_invoices                       (本頁新增)
service_payments                       (本頁新增)
gl_journal_entries / gl_journal_lines  (既有 — 透過 transaction_types 引擎寫入)
transaction_types (+ 'SERVICE_INVOICE' template seed)  (既有架構，本頁要確保 seed 完成)

repair_orders（既有）
  + status 推進到 'closed'
  + ALTER ADD COLUMN invoice_id uuid FK → service_invoices (方便反查)
  + ALTER ADD COLUMN closed_at timestamptz

customer_credit_accounts / customer_credit_transactions  (Phase 2-3 後做)
insurance_claims                                          (Phase 2-3 後做)
discount_approval_requests                                (Phase 3 拍板，建議走簡化版不獨立建表)
```

雙 brand：每張新表 `brand_id text` + 4 條 `user_has_brand()` RLS。

### implied_pages

```
kind: 'wizard'（multi-step、不套標準 List/Page design pattern）
  route: /parts/aftersales/checkout/[ro_id]
       step query param: ?step=1|2|3|4
       Phase 1 主要落地的就這一頁

kind: 'list'（歷史結帳查詢 — 已經有 10_工單查詢，可在那邊加 filter，不另開）
  route: /parts/aftersales/repair-orders?status=closed  (在 10 查詢頁加 filter)

kind: 'detail'（單張 invoice 詳情 / 重印）
  route: /parts/aftersales/checkout/[ro_id]/receipt
       狀態 = closed 後直接 readonly view、含列印 button
       可以跟 wizard step 4 共用同一個 component
```

---

## 2. Schema 草案（先草、Phase 3 拍板）

```sql
-- A. 服務維修發票
CREATE TABLE service_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  store_id uuid REFERENCES organizations(id),
  repair_order_id uuid NOT NULL REFERENCES repair_orders(id),
  invoice_no text NOT NULL,
  issued_at timestamptz,
  issued_by_employee_id uuid REFERENCES employees(id),
  -- 金額（皆 NT$；多幣別 Phase B 再做）
  subtotal_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  -- 折扣
  discount_kind text CHECK (discount_kind IN ('none','vip_5','supervisor_10','custom')),
  discount_pct numeric(5,2),
  discount_authorized_by_employee_id uuid REFERENCES employees(id),
  discount_approval_status text CHECK (discount_approval_status IN ('not_required','pending','approved','rejected')) DEFAULT 'not_required',
  discount_approval_chain jsonb,
  -- 車主二簽
  customer_signature_at timestamptz,
  customer_signature_blob text,
  customer_acknowledged_terms text[] DEFAULT ARRAY[]::text[],
  -- 發票
  invoice_type text CHECK (invoice_type IN ('cloud_personal','carrier','company_tax_id','donate')),
  invoice_carrier text,
  invoice_company_tax_id text,
  invoice_donate_code text,
  external_invoice_no text,
  external_invoice_issued_at timestamptz,
  -- 狀態
  status text NOT NULL CHECK (status IN ('draft','in_payment','paid','closed','voided')) DEFAULT 'draft',
  closed_at timestamptz,
  voided_at timestamptz,
  voided_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (brand_id, invoice_no),
  UNIQUE (repair_order_id)                              -- 一張 RO 對應一張結帳發票
);
CREATE INDEX ON service_invoices (brand_id, status, issued_at DESC);
CREATE INDEX ON service_invoices (brand_id, store_id, issued_at DESC);

-- B. 服務收款明細
CREATE TABLE service_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES service_invoices(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN (
    'card','cash','mobile_pay','bank_transfer','customer_credit','insurance_claim'
  )),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference_no text,
  card_acquirer text,
  bank_account_id uuid,
  customer_credit_account_id uuid,                      -- Phase 2-3 才實際綁
  insurance_claim_no text,
  insurance_company_id uuid,                            -- Phase 2-3 才實際綁
  received_by_employee_id uuid REFERENCES employees(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON service_payments (brand_id, invoice_id);
CREATE INDEX ON service_payments (brand_id, payment_method, paid_at DESC);

-- F. repair_orders 既有表變更
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES service_invoices(id);
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;
-- status enum 應該已含 'closed'（02 RO 提案的 status 列表是 '進行中/維修中/待結帳/已關單/已取消'）

-- RLS（4 條 × 2 表 = 8 條，沿用 user_has_brand pattern，略）
```

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `subtotal/discount/tax/total/paid_amount` | typed | 報表、會計核對、index | 
| `discount_kind / discount_pct` | typed | 異常監控 / 報表（主管授權折扣總額） |
| `discount_approval_chain` | jsonb | 結構隨 07 business_rules 變、純展示 + 留存快照 |
| `customer_signature_blob` | typed (text) | 大文字但結構穩、防竄改 / e-discovery 要單獨欄好查 |
| `customer_acknowledged_terms` | typed (text[]) | 條款版本管理會 group by；Postgres array 性能足夠 |
| `invoice_type / invoice_carrier / company_tax_id / donate_code` | typed | 發票合規 / 報表 / 申報必查 |
| `external_invoice_no / external_invoice_issued_at` | typed | 對外發票號碼是法定欄、必查 |
| `payment_method` | typed + CHECK | 報表分群 |
| `reference_no / card_acquirer / insurance_claim_no` | typed | 對帳查找 |
| `metadata`（列印次數 / UI 偏好 / 「無爭議聲明 timestamp」等花絮） | jsonb | 變動中、單頁專用 |

---

## 3. Domain Helper 規劃

```
src/domain/aftersales-checkout.ts        ← 新建，本頁主 helper
   getRoCheckoutContext / previewDiscount / requestDiscountApproval
   saveCustomerSignature
   createServiceInvoice / addPayment / removePayment / confirmCheckout
   reprintReceipt / scheduleNextServiceReminder
   // 內部 import:
   //   - src/domain/aftersales-discounts.ts (07 提案的 helper, checkDiscountAuthority)
   //   - src/domain/accounting.ts (postTransactionType — 由會計模組提供)
   //   - src/lib/notifications (推 LINE)
```

每個函式內部實作策略：

| Helper | Day 1 預設 | 理由 |
|---|---|---|
| `getRoCheckoutContext` | supabase 直連讀多張表 | 純 read、無副作用 |
| `previewDiscount` | client 計算 + 內部 call `checkDiscountAuthority` | 純算 / 無寫入 |
| `createServiceInvoice` | server action | 寫單表 + 後續要連動，從一開始就走 server action |
| `addPayment` | server action | 寫 + 累加 paid_amount + 可能改 invoice status |
| **`confirmCheckout`** | **server action（必走）** | 跨 6+ 表 + 推 LINE + 觸發 GL；client 完全做不到 |
| `requestDiscountApproval` | server action | 推 LINE 給主管 |

---

## 4. 副作用清單（⭐ 本頁特別密集，金流關卡）

| 動作 | 副作用類型 | 細節 | 確定性 |
|---|---|---|---|
| `previewDiscount` | C 業務規則 | 從 07 business_rules `aftersales_discount_authority` 算 SA 是否能用該折扣 | **確定**（07 已規劃） |
| `requestDiscountApproval` | B 通知 | 推 LINE 給審批人（主管 / 店長） | **[需確認]** Phase 1 走簡化 inline / 還是 Phase B 才異步 |
| `requestDiscountApproval` | D Audit | 寫 audit log（誰申請、誰批） | [需確認] |
| `saveCustomerSignature` | F Cache | 寫入後 revalidatePath；signature 是不可逆動作 | 確定 |
| `saveCustomerSignature` | D Audit | 「電子簽名具有法律效力 / 防竄改時間戳」 — HTML 明寫，建議寫 audit log | **[強烈推薦]** |
| `createServiceInvoice` | 無 | 純寫單表 service_invoices draft | 確定 |
| `addPayment` | A 跨表 | 寫 service_payments + UPDATE service_invoices.paid_amount | 確定 |
| **`confirmCheckout`** | **A 跨表（重）** | 1) UPDATE service_invoices closed / 2) UPDATE repair_orders status='closed' / 3) **觸發 gl_journal_entries** (透過 transaction_types 引擎) / 4) 標記發票待開立 | **確定**（金流關卡核心） |
| `confirmCheckout` | B 通知 | 推 LINE 給客戶「謝謝光臨 / 取車通知」、推 LINE 給 SA「結帳完成」 | **[需確認]** event code + 範圍 |
| `confirmCheckout` | E 外部 API | 開立電子發票（呼財政部 / 第三方電子發票服務） | **[Phase B]** Phase 1 只標 pending |
| `confirmCheckout` | D Audit | 結帳是不可逆 → audit log | **[強烈推薦]** |
| `confirmCheckout` | F Cache | revalidatePath 多個 dashboard | 確定 |
| `scheduleNextServiceReminder` | B 通知 | 排定下次保養回廠提醒 cron / scheduled push | [需確認] 排程方式 |
| `reprintReceipt` | D Audit | 列印次數 +1（HTML 沒明說、但業務上有意義） | [需確認] |

### 會計分錄子清單（confirmCheckout 觸發）

走 `transaction_types.code = 'SERVICE_INVOICE'` template（在 accounting-relations-architecture.md §範例 1-2 / 服務側 已草擬），預期 **5-6 lines**：

```
1) D customer.ar_account_coa_id  或  system.default_cash_coa_id / card_coa_id
                                       (應收 or 現金 / 銀行入帳，依 payment_method 動態 resolve)
                                       金額 = total_amount = subtotal - discount + tax
   → CUSTOMER + VEHICLE + STORE + SUBSIDIARY 維度

2) C 工資收入 coa (4xxxxxx 服務工資收入)        金額 = labor_subtotal
   → BRAND + DEPT + STORE + SUB

3) C 零件銷貨收入 coa (item.income_account_coa_id)   金額 = parts_subtotal
   → BRAND + DEPT + STORE + SUB + PART_SKU

4) C tax_codes['VAT_5_OUTPUT'].coa_id (2240xxx 銷項稅額)   金額 = tax_amount
   → STORE + SUB

5) D 零件 COGS (item.cogs_account_coa_id)              金額 = parts_cogs
   → STORE + SUB + PART_SKU
6) C 零件存貨 (item.inventory_account_coa_id)          金額 = parts_cogs
   → STORE + SUB + PART_SKU + WAREHOUSE

# 折扣行（Phase 3 拍板：銷售折讓 gross / 還是直接 net 入收入）
7) D system.sales_discount_coa_id（銷貨折讓）          金額 = discount_amount
   → STORE + SUB + 視 discount_kind 加 EMPLOYEE 維度
```

⚠️ **本提案不重做 GL 引擎**。只要：
- (a) 確保 `transaction_types` 已 seed 'SERVICE_INVOICE' template
- (b) helper 內部 `await postTransactionType('SERVICE_INVOICE', ctx)`
- (c) ctx 帶足 customer / vehicle / lines / payment_method / store / subsidiary

⚠️ **支付方式對 Line 1 的影響**：
- `cash` → debit `default_cash_coa_id`
- `card` / `mobile_pay` → debit `default_card_coa_id` (或銀行存款 — Phase 3 拍板要不要拆 acquirer)
- `bank_transfer` → debit `default_bank_coa_id`
- `customer_credit` → debit `customer_credit_liability_coa_id` (預收款項 2160xxx) — 需 Phase 2 客戶儲值落地
- `insurance_claim` → debit `customer.ar_account_coa_id`（保險公司是 AR debtor）+ 後續走獨立 `INSURANCE_CLAIM_PAYMENT` template 沖銷

⚠️ **split-payment**：多筆 payment 時 Line 1 可能要拆成多行（不同 method 各自 debit 不同科目）。POC 階段建議：
- Phase 1 UI 仍 single-payment（HTML 等同 single） — GL Line 1 單行
- Phase 2 開放 split-payment → GL Line 1 變多行（loop over service_payments）

### 跟 07 折扣審批的整合點（任務要求重點）

| 整合點 | 來源（07） | 用法（08） |
|---|---|---|
| `business_rules` rule_kind='aftersales_discount_authority' | 07 提案 §4 | 08 `previewDiscount` 內部 call `aftersales-discounts.checkDiscountAuthority(grade, kind, pct)` 即時驗 |
| `business_rules` rule_kind='aftersales_discount_approval_workflow' | 07 提案 §4 | 08 `requestDiscountApproval` 內部讀 workflow config 算審批鏈 + 推 LINE |
| 「折扣應用範圍 — 商品（零件）/ 人工（工時）/ 全場」 | 07 提案 | 08 UI 套折扣下拉時要傳對應 kind ('total'/'goods'/'labor') |
| 「逾期未審批 → 自動退回」 | 07 提案 workflow | 08 結帳 wizard 在 step 1 卡住、待審批；逾期自動退回時要推 LINE 給 SA + 解鎖 wizard |
| 整合方向 | 07 是規則定義者、08 是規則消費者 | 嚴格單向、08 不寫 business_rules |

⚠️ **Phase 1 簡化策略推薦**（待 Phase 3 拍板）：

| 場景 | 簡化版（Phase 1） | 完整版（Phase B） |
|---|---|---|
| 折扣 ≤ SA 個人權限上限 | 直接通過、不要審批 | 同左 |
| 折扣 > SA 上限 但 ≤ 主管上限 | SA UI 上跳「請主管當面授權」彈窗 → 主管在當下用密碼 / 指紋 → SA 自己 mark approved + 寫 `discount_authorized_by_employee_id` | 走 `discount_approval_requests` 表異步審批 + 推 LINE + 主管在自己手機點按 approve |
| 折扣 > 主管上限 | 同上、但 chain 走「主管 → 店長」 | 同上 |

簡化版**不需要新建 `discount_approval_requests` 表**，只用 invoice 內聯欄位 + 主管帳號簽名即可。

---

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 結帳精靈（4-step wizard） | `/parts/aftersales/checkout/[ro_id]` | **客製 Wizard**（不套 design pattern §List/Page） | 自刻：step-nav + 4 個 step-panel；URL query `?step=1\|2\|3\|4` 保存進度 |
| Step 1: 費用確認 | (同上、step=1) | 客製 | RO line summary table + 折扣下拉 + 應付總計 + 進下一步 button |
| Step 2: 車主二簽 | (同上、step=2) | 客製 | 4 項聲明 + 簽名 canvas + 時間戳 |
| Step 3: 收款 + 發票 | (同上、step=3) | 客製 | payment-options grid + invoice-options grid + 統編 input |
| Step 4: 關單成功 | (同上、step=4) | 客製 | 成功畫面 + 列印 / 返回 / 預約提醒 button |
| 結帳完成後 readonly 詳情 | `/parts/aftersales/checkout/[ro_id]` (RO status=closed 時直接 render step 4) | 客製 | 同 step 4 + 重印 button |

⚠️ **是 wizard、不套 §List/Page design pattern**：HTML 已是設計稿、按那個 4-step 結構落地即可。pending 鎖 / 進行式文字 / 失敗 banner 等 §UX 互動規範一律照做。

⚠️ **特別注意 confirmCheckout 的 UI 鎖**：這個 action 跨 6 表 + 推 LINE + 觸發 GL，server round-trip 可能 2-5 秒。Step 3 「確認收款，關閉工單」按鈕 pending 時要：
- 文字換「結帳處理中⋯」
- 整個 wizard `pointer-events-none opacity-60`
- 防止使用者狂點 → 重複結帳 / GL 重複入帳

---

## 6. nav_nodes（雙 brand）— Phase 4 才動，Phase 1 規劃

⚠️ **結帳是「逐 RO 的精靈頁」，不是頂層 sidebar 入口**。

```sql
-- 結帳精靈正常**不該掛 sidebar**：使用者從 06_竣工複檢 / 工位看板 / 工單查詢 點「結帳」按鈕進來
-- 但如果未來想要老闆 / 出納能 deep-link 進結帳模式查詢，可以加一個「待結帳工單清單」入口

-- 推薦：不掛 sidebar、只在其他頁的 button 觸發 router.push('/parts/aftersales/checkout/{ro_id}')

-- 替代：在 10_工單查詢 加 filter 「狀態=待結帳」即可，不另開 nav node
```

⚠️ Phase 3 拍板：要不要在「售後管理 → 即時看板」群組加一個「待結帳工單看板」？目前 HTML 沒有，可能不必。

---

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/aftersales-checkout.ts` |
| 新增 | `src/app/(workspace)/parts/aftersales/checkout/[ro_id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/checkout/[ro_id]/_components/checkout-wizard.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/checkout/[ro_id]/_components/step-fee-review.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/checkout/[ro_id]/_components/step-customer-signature.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/checkout/[ro_id]/_components/step-payment-invoice.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/checkout/[ro_id]/_components/step-success.tsx` |
| 新增 | `src/lib/aftersales/checkout-actions.ts`（server actions，confirmCheckout 等） |
| 跨模組 reuse | `src/domain/aftersales-discounts.ts`（07 提案）— `checkDiscountAuthority` |
| 跨模組 reuse | `src/domain/accounting.ts`（會計模組 — 預期既有 / 由會計提案落地） — `postTransactionType('SERVICE_INVOICE', ctx)` |
| 跨模組 reuse | `src/lib/notifications`（既有）— LINE / 取車通知推送 |
| 跨模組變更 | `repair_orders` 加 `invoice_id` + `closed_at` 欄位（ALTER） |
| 跨模組變更 | `transaction_types` seed 'SERVICE_INVOICE' template（如果還沒） |

---

## 8. Verification（落地完手測 — Phase 5 用）

1. **跨模組進入點**：06_竣工複檢按「結帳」 → push 到 `/parts/aftersales/checkout/{ro_id}?step=1`、ro_id 帶對 / lines 顯示對
2. **Step 1 費用算對**：subtotal = Σ line.amount、tax = round(subtotal × 0.05)、total = subtotal + tax；切「九五折」total 更新對、sig-amt / pay-amt 同步更新
3. **折扣審批整合（07 ↔ 08）**：登入「售後接待」角色 → 試套「主管授權九折」→ 觸發 `requestDiscountApproval` → 看到「請主管授權」彈窗（簡化版）/ 推 LINE（完整版）；主管批准後 wizard 解鎖
4. **Step 2 簽名防竄改**：簽名後 invoice draft 上能看到 customer_signature_at + blob、強制設成過去時間應該被拒絕
5. **Step 3 split-payment**（Phase 3 拍板要 / 不要 Phase 1 做）：兩筆 payment 加總 == total 才能 confirm
6. **Step 3 → confirmCheckout 跨表事務**：執行後檢查 (a) service_invoices.status='closed' (b) repair_orders.status='closed' / invoice_id 對 (c) gl_journal_entries 新增一筆 + 平衡借貸 (d) gl_journal_lines 6 行（含折扣 line）+ 維度 STORE/SUB/CUSTOMER 等齊 (e) audit_log 一筆
7. **GL 分錄借貸平衡**：跑 SQL `SELECT SUM(debit) - SUM(credit) FROM gl_journal_lines WHERE entry_id = <new>;` = 0
8. **付款方式對科目影響**：分別 cash / card / mobile_pay / bank_transfer 各跑一張 → Line 1 debit 科目分別對 default_cash / default_card / 同上 / default_bank
9. **發票方式落欄位**：選「統一編號」+ 輸入「12345678」→ service_invoices.invoice_company_tax_id='12345678'、invoice_type='company_tax_id'
10. **通知**：confirmCheckout 後查 notification_deliveries → 應有對應 event_code（如 `service_invoice.closed` / `repair_order.ready_for_pickup`）寄出記錄
11. **雙 brand RLS**：Ducati 帳號看不到 Indian 的 invoice / payment
12. **不可重複結帳**：對 status='closed' 的 RO 再 push `/checkout/{ro_id}` → render readonly view、不能再走 wizard；UI 不顯示「確認收款」button
13. `npx tsc --noEmit` / `npx eslint <touched>` 0 errors

---

## 9. 開放問題（Phase 3 拍板）

- [ ] **付款方式範圍**：Phase 1 是否就支援 6 種（含 `customer_credit` / `insurance_claim`）？還是只做 HTML 上的 4 種（card / cash / mobile_pay / bank_transfer）、儲值與保險折抵延到 Phase 2-3 開獨立模組時補？
- [ ] **split-payment**（混合付款）：Phase 1 UI 是否提供 add-payment / remove-payment？還是先 single-payment（HTML 等同）、schema 預留 1:N、UI Phase B 才開？
- [ ] **折扣審批流**：走簡化版（主管當面授權、SA 自己 mark approved）/ 走完整版（推 LINE 給主管異步點按審批）？前者 Phase 1 就能交付、後者要新建 discount_approval_requests 表
- [ ] **折扣科目處理**：銷貨折讓走 D 銷貨折讓 coa（gross 入帳法）/ 還是直接 net 從收入扣（淨額入帳法）？影響 transaction_types template Line 6-7 設計
- [ ] **電子發票 API**：Phase 1 是否整合（呼第三方 / 財政部）？還是只標 `external_invoice_issued_at=null` 待人工或排程跑？
- [ ] **下次保養回廠提醒**：用什麼觸發（cron 排程 / supabase scheduled function / 寫 reminders 表 + cron 掃）？提醒間隔（90 / 180 / 365 天）由誰定（item.recommended_service_interval）？
- [ ] **車主二簽 signature_blob 存儲格式**：base64 SVG / base64 PNG / canvas dataURL？大小 limit？是否壓縮？
- [ ] **「無爭議聲明」typed vs jsonb**：是否需要條款版本管理（不同時期的聲明文字不同）→ 是的話要建 `service_invoice_terms_versions` 主檔，每張 invoice 記版本 id
- [ ] **`service_invoices.invoice_no` 取碼規則**：流水序設計（每店每日 reset / 全廠每月 reset？）；是否要做 `service_invoice_sequences` 表？
- [ ] **重印收據是否限制次數**：通常老闆會關心「重印 = 可能對外開假發票」→ 是否要審批 / 記列印次數？
- [ ] **confirmCheckout 失敗 rollback**：如果 GL 引擎 fail / LINE 推送 fail，要不要把 invoice / payment / RO status 整組 rollback？POC 階段建議：寫入 DB 成功 = commit、副作用（LINE / 發票 API）非同步、失敗只記 deliveries 表不 rollback 主流程
- [ ] **`transaction_types` 'SERVICE_INVOICE' template seed 由誰負責**：本提案 / 還是會計模組獨立提案？建議由會計模組統一管 template seed、本提案只列依賴
- [ ] **車主儲值 / 保險折抵的會計處理**：兩者各需要獨立 transaction_type（CUSTOMER_CREDIT_USE / INSURANCE_CLAIM_PAYMENT）還是用同一個 SERVICE_INVOICE template 的 dynamic resolver？影響後續會計設計
- [ ] **Indian brand 是否同步建**：本模組整體 Ducati-only 還是雙 brand？

---

## 附錄 — 與其他模組的整合點地圖

```
  ┌───────────────────────────────────────────────────────────────────┐
  │  08_結帳收款（本頁）                                                │
  │  ────────────────────                                              │
  │  ↑ from:                                                           │
  │    - 06_竣工複檢「結帳」button → /checkout/[ro_id]                  │
  │    - 10_工單查詢「狀態=待結帳」list 點進 → /checkout/[ro_id]        │
  │    - 工位看板「完工交棒」推進 → 06 → 本頁                            │
  │                                                                    │
  │  → out:                                                             │
  │    - 02_RO: status='closed' / closed_at / invoice_id                │
  │    - 07_管理.折扣設定: read business_rules（規則消費者）              │
  │    - 會計模組: postTransactionType('SERVICE_INVOICE', ctx)           │
  │                  → 寫 gl_journal_entries / gl_journal_lines          │
  │    - Notification Hub: dispatch 'service_invoice.closed' /          │
  │                                'repair_order.ready_for_pickup'      │
  │    - 客戶儲值（Phase B）: 扣 customer_credit_accounts.balance        │
  │    - 保險理賠（Phase B）: 建 / 結 insurance_claims                   │
  │    - 電子發票 API（Phase B）: 呼外部 / 回填 external_invoice_no       │
  │    - 09_人車檔案: 累計客戶消費紀錄、用於 VIP 折扣判斷                  │
  └───────────────────────────────────────────────────────────────────┘
```

**特別強調的副作用集中點**：

> 本頁 `confirmCheckout` action 是售後模組**單一最複雜的副作用聚合點**，跨 6+ 表寫入 + GL 分錄觸發 + 至少 2 個 notification + 1 個外部 API（發票）。
>
> Phase 1 落地時建議：
> 1. 嚴格走 server action（不可放 client）
> 2. GL 分錄走既有 `transaction_types` 引擎，不另建路徑
> 3. 非同步副作用（LINE / 發票 API）用 Next 16 `after()` 不阻塞主流程
> 4. 主流程交易內（service_invoices + service_payments + repair_orders + gl_journal_entries）必須**原子**，可考慮在 Supabase RPC 內 BEGIN/COMMIT；如果 GL 引擎是異步 worker，需設計 outbox pattern 確保不漏
> 5. confirmCheckout pending 期間 UI 整鎖（CLAUDE.md §UX 規範）

---

> Phase 1 結束。等用戶 review 本提案、Phase 3 透過 AskUserQuestion 拍板上面 §9 開放問題，再進 Phase 4 落地。
