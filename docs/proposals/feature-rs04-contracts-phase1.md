# Feature: RS04 Tab2 新車訂購合約書 + Tab3 中古車買賣切結合約書 — Phase 1 共同提案

**Date**: 2026-05-16
**Author**: Claude (BDN 夜跑 sub-agent)
**Status**: Phase 1 — 結構分析 + 架構提案；**待 Ming 拍板才落地**
**Spec**: `docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS04_賞車報價與成交訂單_v1.html`
**對應 BDN 條目**: #6（新車合約）、#7（中古車合約）

---

## 0. 為什麼合併處理

#6 與 #7 來自 **同一份 HTML 規格的兩個 sibling tab**，使用者旅程：

```
RS01 電子手卡 → RS04 Tab1 報價單 → 成交 → Tab2 (新車合約) 或 Tab3 (中古車合約) → RS05 交車
```

兩條合約：
- **共用** 買受人資料來源（RS01 handcard / customers 表）
- **共用** 報價單來源（RS04 Tab1 / 未來 sales_quotes 表）
- **共用** 簽名實作、PDF 輸出機制、合約狀態機、合約編號規則
- **差異點僅在** 車輛來源（新車庫存 vs 中古車評估）、payment fields、disclaimer 文案、簽名欄位語意

因此 **schema 一張表 + contract_type 區分** 是最自然的設計，避免兩張表的 80% 欄位重複。

當前現狀：`/sales/quote` 與 `/sales/orders` 兩支頁面 **已存在但是 mock-only**（用 localStorage `sales-quote-snapshot:v1` 傳資料），Wave 2/3 要做的就是把它們 wire 到真正的 `sales_contracts` 表。

---

## 1. Spec 實際內容（逐 tab 列）

### 1.1 Tab 2 新車訂購合約書（#6）

**HTML 結構**：4 個 section + 簽名 grid + footer 按鈕

| Section | 欄位 | 必填 | 來源 / 帶入規則 |
|---|---|---|---|
| **一、買受人資料** | 姓名 | ✓ | 從 RS01 handcard / `customers.name` 帶入（readonly 顯示） |
| | 身分證字號 | ✓ | `customers.national_id`（已存在） |
| | 聯絡電話 | ✓ | `customers.phone` |
| | 電子郵件 |  | `customers.email` |
| | 戶籍地址 | ✓ | `customers.address` |
| **二、車輛資料** | 車款型號 | ✓ | 從 RS04 Tab1 報價單帶入（readonly），來源 `sales_newcar_inventory` |
| | 車身顏色 | ✓ | 報價單帶入，可改 |
| | 車身號碼（VIN） |  | 配車後填入（建合約時可空，交車前必填） |
| | 引擎號碼 |  | 配車後填入 |
| **三、付款方式** | 付款方式 4 選 1 | ✓ | 現金全額 / 刷卡一次 / 銀行貸款 / 分期付款 |
| | 訂金金額 | ✓ | NT$ |
| | 預計交車日期 | ✓ | date |
| **四、特殊約定** | textarea | | 報價單帶入贈品 / 配件 / 折扣自動 prefill；可改 |
| | 法律條文 | readonly | 4 條固定條款 |
| **簽名 grid** | 買受人簽名 | ✓ | canvas 手寫 → base64 |
| | 銷售顧問（RS） | ✓ | 預設帶入 RS 名 + 日期，提供 canvas 補簽 |
| | 經銷商授權代表 | ✓ | 經銷商名（"DUCATI 台北展示中心"）+ canvas 簽 |

**互動 / 流程**：
1. 進頁面 → 依 quote_id query string 帶入車輛 / 客戶資料 → status=`draft`
2. 填完 4 段欄位 → 點「✅ 合約確認」（規格按鈕「✅ 合約確認，進入交車作業 →」）
3. 三方依序簽名 → status=`signed`
4. 匯出 PDF（規格的「📄 匯出 PDF」按鈕）
5. 確認後 router.push `/sales/delivery` → status=`released_to_delivery`

**合約編號**：規格寫 `PO-20260510-008`（`PO` = Purchase Order / 新車訂購）

### 1.2 Tab 3 中古車買賣切結合約書（#7）

| Section | 欄位 | 必填 | 來源 / 帶入規則 |
|---|---|---|---|
| **一、買賣雙方** | 賣方（甲方） | readonly | 固定 "DUCATI 台北展示中心"（後續可從 dealer_org 帶） |
| | 買受人（乙方）姓名 | ✓ | 從 handcard 帶 |
| | 乙方身分證字號 | ✓ | handcard |
| | 乙方聯絡電話 | ✓ | handcard |
| | 乙方戶籍地址 | ✓ | handcard |
| **二、車輛資料** | 廠牌/車款 | ✓ | 從 RS06 評估記錄 / `customer_vehicles` 帶 |
| | 出廠年份 | ✓ | `customer_vehicles.manufactured_year` |
| | 車牌號碼 | ✓ | `customer_vehicles.license_plate` |
| | 排氣量（cc） | ✓ | 從車款規格表帶 |
| | **車身號碼（VIN）** | ✓ | **與 RS06 評估記錄比對** → mismatch banner（核心驗證） |
| | 引擎號碼 | ✓ | `customer_vehicles.engine_no` |
| | 行駛里程（km） | ✓ | `customer_vehicles.current_mileage` |
| | 認證等級 | ✓ | CPO / DPO / PO 三選 1 |
| **三、成交價格與過戶** | 成交價格 | ✓ | NT$ |
| | 訂金金額 | ✓ | NT$ |
| | 尾款交付日期 | ✓ | date |
| | 過戶辦理 | ✓ | 本店代辦 / 買受人自行辦理 |
| **四、車輛現況與買受人切結** | 車況描述 textarea | ✓ | 從 RS06 評估記錄帶 |
| | 切結聲明 banner | readonly | 紅底固定文案 |
| **過戶必備文件 checklist**（規格沒明畫但 #7 卡片要求） | 行照 | ✓ | checkbox + 上傳檔案 |
| | 強制險證明 | ✓ | checkbox + 檔案 |
| | 動保塗銷單 | ✓ | checkbox + 檔案（質權設定塗銷） |
| | 過戶委託書 | ✓ | checkbox + 檔案 |
| **簽名 grid** | 賣方（甲方）簽章 | ✓ | 經銷商章 / 授權人簽 |
| | 買受人（乙方）簽名 | ✓ | canvas |
| | 見證人 / 銷售顧問 | ✓ | RS 簽 |

**互動 / 流程**：
1. 進頁面（由 RS04 Tab1「成交→中古車」進入）→ status=`draft`
2. **VIN 驗證**：填入 VIN onBlur → 跨表 query `customer_vehicles.vin`（暫用，未來改 used_vehicle_evaluations）→ 不存在則紅字「VIN 未在我司 RS06 評估記錄中找到，請確認」（不擋送出、僅警示）
3. 文件 checklist 四項全勾才能 status → `documents_ready`
4. 三方簽名 → status=`signed`
5. PDF 匯出
6. router.push `/sales/delivery?subtype=transfer` → status=`released_to_delivery`

**合約編號**：規格寫 `UA-20260510-008`（`UA` = Used Auto，但建議改用 `UC` = Used Contract，下面 schema 統一）

---

## 2. Schema 設計提案

### 2.1 策略：共用一張 `sales_contracts` 表 + `contract_type` + metadata jsonb

**理由**：
- 兩種合約 8 成欄位共用（買受人、簽名 base64、status、合約編號、PDF 輸出時間戳）
- 差異點（付款方式、文件 checklist、認證等級）丟 metadata，遵守 CLAUDE.md「形狀變動中 / 單頁專用 → jsonb」原則
- 未來如果合約類型擴增（試乘合約、保留金合約等）→ 同一張表 + 新 contract_type，UI 改 component dispatch、不動 DDL
- 報表 / 對帳 join 一張表比兩張快（合約月報、未完成合約 dashboard）

**反方案 A**：兩張表 `new_car_contracts` + `used_car_contracts`
- ❌ 80% 欄位重複、helper 也要 N 份
- ❌ 將來合約類型擴增就要再加新表
- 採用情境：若兩種合約欄位重疊低於 50%，但本案不是

**反方案 B**：把合約掛在 `sales_orders` 裡用 jsonb 存
- ❌ 合約是法律文件、要獨立簽名 / PDF 版本管理、不該跟訂單同表
- ❌ 三方簽名 base64 跟訂單欄位放一起會把 row 撐到 MB 級

**決定：採用方案（共用 sales_contracts 表）。**

### 2.2 DDL Draft

```sql
-- 注意：需先有 sales_quotes 表才能加 quote_id FK；Wave 1 落地時若 sales_quotes
-- 還沒做，先把 quote_id 設 nullable + 不加 FK，等 sales_quotes 落地再 ALTER。

CREATE TABLE sales_contracts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                    text NOT NULL,                     -- 'ducati' | 'indian'
  contract_no                 text NOT NULL,                     -- NC-202605-0001 / UC-202605-0001
  contract_type               text NOT NULL CHECK (contract_type IN ('new', 'used')),

  -- 來源關聯
  quote_id                    uuid,                              -- (FK sales_quotes 未來補)
  customer_id                 uuid NOT NULL REFERENCES customers(id),
  customer_vehicle_id         uuid REFERENCES customer_vehicles(id),  -- 中古車驗 VIN 用

  -- 買受人快照（合約 freeze 時刻的客戶資料，後續 customers 改了不影響合約）
  buyer_name                  text NOT NULL,
  buyer_national_id           text NOT NULL,
  buyer_phone                 text NOT NULL,
  buyer_email                 text,
  buyer_address               text NOT NULL,

  -- 車輛快照（同理 freeze）
  vehicle_model               text NOT NULL,
  vehicle_color               text,
  vehicle_vin                 text,                              -- 新車可 nullable（配車前）
  vehicle_engine_no           text,
  vehicle_year                smallint,
  vehicle_plate               text,                              -- 中古才有
  vehicle_cc                  integer,
  vehicle_mileage             numeric,                           -- 中古才有

  -- 金額
  deal_amount                 numeric(12, 0) NOT NULL,           -- 客戶實付總額
  deposit_amount              numeric(12, 0),
  final_payment_date          date,                              -- 中古才用：尾款日；新車：預計交車日

  -- 三方簽名
  buyer_signature_base64      text,                              -- canvas dataURL
  rs_signature_base64         text,
  witness_signature_base64    text,                              -- 新車=經銷商代表；中古=見證人 RS
  signed_at                   timestamptz,

  -- 狀態機
  status                      text NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'documents_ready', 'signed', 'released_to_delivery', 'cancelled')),

  -- 元數據（類型專屬）
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  /*
    新車 metadata：
    {
      payment_method: 'cash' | 'card' | 'loan' | 'installment',
      expected_delivery_date: '2026-05-17',
      special_terms: 'string',
      rs_user_id: uuid,
      rs_name: 'string',
      dealer_org_name: 'DUCATI 台北展示中心'
    }
    中古車 metadata：
    {
      certification_level: 'CPO' | 'DPO' | 'PO',
      transfer_handler: 'dealer' | 'self',
      condition_note: 'string',
      vin_match_status: 'matched' | 'mismatch' | 'not_found',  // VIN 驗證結果 snapshot
      documents: [
        { kind: 'license', checked: true,  file_url: '...', uploaded_at: '...' },
        { kind: 'compulsory_insurance', checked: true, file_url: '...' },
        { kind: 'lien_release', checked: false, file_url: null },
        { kind: 'transfer_poa', checked: true, file_url: '...' }
      ],
      witness_name: 'string',
      dealer_org_name: 'DUCATI 台北展示中心'
    }
  */

  pdf_url                     text,                              -- 匯出後可選保存
  pdf_generated_at            timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES auth.users(id),

  UNIQUE (brand_id, contract_no)
);

CREATE INDEX idx_sales_contracts_brand_status        ON sales_contracts (brand_id, status);
CREATE INDEX idx_sales_contracts_customer            ON sales_contracts (customer_id);
CREATE INDEX idx_sales_contracts_quote               ON sales_contracts (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_sales_contracts_vin                 ON sales_contracts (vehicle_vin) WHERE vehicle_vin IS NOT NULL;
CREATE INDEX idx_sales_contracts_created_at_desc     ON sales_contracts (created_at DESC);
```

**為何欄位快照而非 join**：合約是法律文件，需要凍結簽訂當下的買受人姓名 / 地址 / 車況。日後客戶改名 / 改地址 / 車輛換手 → 合約 PDF 不會被動到。RS01 handcard 端用 audit trail（已存在 metadata jsonb）。

### 2.3 合約編號生成規則

格式：`{TYPE}-{YYYYMM}-{SEQ04}`
- TYPE：`NC`（New Car）/ `UC`（Used Contract）— 比規格的 PO/UA 更直觀且不跟採購單衝突
- 月度流水 4 位：每月 1 號重置 0001、月內遞增
- 跨 brand 各算各的（brand_id, contract_no 是 unique 組合）

**實作**：Postgres function + advisory lock（避免並發產生重複編號）

```sql
CREATE OR REPLACE FUNCTION generate_sales_contract_no(
  p_brand_id text,
  p_contract_type text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  prefix text;
  yyyymm text;
  next_seq int;
  result text;
BEGIN
  IF p_contract_type NOT IN ('new', 'used') THEN
    RAISE EXCEPTION 'invalid contract_type: %', p_contract_type;
  END IF;
  prefix := CASE p_contract_type WHEN 'new' THEN 'NC' ELSE 'UC' END;
  yyyymm := to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYYMM');

  -- advisory lock by brand + type 範圍
  PERFORM pg_advisory_xact_lock(hashtext(p_brand_id || ':' || p_contract_type));

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(contract_no FROM '\d{4}$') AS int)
  ), 0) + 1
    INTO next_seq
  FROM sales_contracts
  WHERE brand_id = p_brand_id
    AND contract_no LIKE prefix || '-' || yyyymm || '-%';

  result := prefix || '-' || yyyymm || '-' || lpad(next_seq::text, 4, '0');
  RETURN result;
END;
$$;
```

Helper `createSalesContract` 在 transaction 內呼叫此 function 拿編號 + insert。

### 2.4 RLS

照其他 sales 表慣例（brand_id 邊界 + 後台 admin / RS 角色可寫）：

```sql
ALTER TABLE sales_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_contracts_brand_isolation ON sales_contracts
  FOR ALL USING (brand_id = current_brand_id());

CREATE POLICY sales_contracts_rs_write ON sales_contracts
  FOR ALL USING (
    has_permission('SALES_CONTRACT_VIEW')
  ) WITH CHECK (
    has_permission('SALES_CONTRACT_EDIT')
  );
```

權限 key 新增到 `src/lib/rbac/permissions.ts`：
- `SALES_CONTRACT_VIEW` / `SALES_CONTRACT_EDIT` / `SALES_CONTRACT_DELETE`

---

## 3. PDF 輸出機制（兩條共用）

### 選項對比

| 方案 | 複雜度 | 解析度 / 排版 | 浮水印 / 不可篡改 | 後端依賴 | 適用階段 |
|---|---|---|---|---|---|
| **(a) HTML print-CSS + `window.print()`** | 低 | 受瀏覽器 print preview 影響、A4 排版要調 `@page` | ❌ 無 | 無 | POC / Demo |
| (b) Client-side jsPDF | 中 | 程式畫，全 control；複雜表格要手刻 | 可加，但 client 端可被改 | 無 | 中量 |
| (c) Server-side Playwright / Puppeteer | 高 | 像素級複製 React 畫面 | ✓ 後端控制；可蓋章 / 浮水印 | 要 chromium binary | 正式上線 |

### 預設：(a) HTML print-CSS

**理由**：
- POC 階段：兩條合約上線初期只需要「能列印 / 存 PDF 給客戶看」即可，未做電子簽章 cert
- 複雜度最低：在 `_components/sales-contract-printable.tsx` 加 `@media print` style，用 `window.print()` 觸發瀏覽器另存 PDF
- 沒有後端依賴：Zeabur 部署不用加 chromium、構建時間不增加
- React DOM 直接渲染：合約版型 100% 跟畫面一致

**已知限制（明列）**：
- 解析度受 user 瀏覽器 print preview 影響（Chrome / Safari 對 `@page` 支援略不同）
- 無法在 PDF 上加「不可篡改」浮水印或數位章（client 端列印即可篡改）
- 列印對話框跳出時 user 體驗較粗糙（要選「另存 PDF」目的地）

**升級路徑**：當 Ming 要求「合約必須具法律效力 / 蓋章」時，再升 (c)。

### 拍板問題 Q1

> 確認預設選 (a) HTML print？還是 demo 階段就直接上 (c) puppeteer 避免來回升級？

---

## 4. 簽名實作

### 預設：自刻 ~50 行 canvas signature pad

**理由**：
- 不引入 `react-signature-canvas`（~30KB gzipped，過度）
- 共用元件 `<ContractSignaturePad>` 放 `src/components/feedback/` 旁邊或新建 `src/components/sales/signature-pad.tsx`
- 邏輯只有 4 件事：mousedown / mousemove / mouseup 畫線、touch event 對應、`toDataURL('image/png')` → base64
- 三方簽名 → render 三個獨立 `<ContractSignaturePad>`、各自 `onSave(base64) => updateContractField(...)`

### API 提案

```tsx
<ContractSignaturePad
  label="買受人簽名"
  initialValue={contract.buyer_signature_base64}
  disabled={contract.status === 'signed'}
  onSave={async (base64) => {
    await saveSignature(contract.id, 'buyer', base64);
  }}
/>
```

行為：
- 空畫板 → 顯示「請於下方簽名」placeholder
- 簽完點「儲存」→ 上傳 base64 → cell 鎖定、變 readonly 預覽
- 點「重簽」→ 清空 + unlock（status 仍為 draft 時才可）
- status=`signed` 後三個 pad 全鎖定（避免簽完又改）

### Base64 長度估算

300×120px canvas、黑色細線 → ~5-15KB base64 per signature。三方簽名 ~30-45KB / row，TEXT 欄位 OK；PG TOAST 自動處理。**不影響 row size 上限**。

### 拍板問題 Q2

> 簽名要不要存 storage 而非 DB？我提議：第一版直接存 base64 進 DB（簡單、單一查詢可拿），等合約量大（>10k）或要支援高解析度（簽到平板）再搬 supabase storage。

---

## 5. 落地優先序（Wave 拆分）

### Wave 1：底層共用基礎（**BDN #6.1**）

**目的**：把兩條合約共用的 schema / helper / 元件先做掉，後續 Wave 2/3 只刻 page。

範圍：
- `mcp__supabase__apply_migration` 跑 `sales_contracts` DDL + `generate_sales_contract_no` function + RLS
- `src/domain/sales-contracts.ts` helper：
  - `createSalesContract(input: { quote_id?, customer_id, contract_type, ... }): ActionResult<{ id, contract_no }>`
  - `updateSalesContract(id, patch): ActionResult<{ id }>`
  - `saveSignature(id, role: 'buyer' | 'rs' | 'witness', base64): ActionResult<{ id }>`
  - `submitContract(id): ActionResult<{ id }>`（status → signed）
  - `releaseToDelivery(id): ActionResult<{ id }>`（status → released_to_delivery）
  - `getSalesContractById(id)`
  - `listSalesContracts(filters: { brand_id, status?, customer_id?, contract_type? })`
  - `verifyVin(vin): { matched: bool, vehicle?: CustomerVehicle }`（中古車用）
  - `getCustomerForContract(customer_id)`（從 customers 撈快照）
- `src/domain/sales-contracts.constants.ts`：status / contract_type / payment_method / cert_level / document_kind enum
- `src/components/sales/signature-pad.tsx`：自刻 canvas pad（~80 行含 touch 事件）
- `src/components/sales/contract-printable.tsx`：A4 print-CSS layout shell
- 權限 keys 加入 `src/lib/rbac/permissions.ts`

### Wave 2：#6 新車合約 page 落地（**BDN #6.2**）

範圍：
- `/sales/contracts/new/[id]/page.tsx` 或 reuse `/sales/orders` route（決定見 Q3）
- 4 段 form + payment grid + signature grid + PDF 按鈕
- wire `createSalesContract({ contract_type: 'new' })` + 帶 quote_id query string
- 從 RS01 handcard 帶買受人；從 RS04 Tab1 / quote snapshot 帶車輛
- 「合約確認 → 進交車作業」按鈕：`releaseToDelivery` + `router.push('/sales/delivery?contract_id=...')`

### Wave 3：#7 中古車合約 page 落地（**BDN #7.1**）

範圍：
- 同樣的 page route 但 `contract_type='used'`
- VIN onBlur 驗證 → 紅字 banner（不擋送出）
- 文件 checklist 4 項（先做 checkbox + 假上傳 toast；真上傳到 supabase storage 留下一輪）
- 切結聲明 banner（readonly）
- 簽名 grid（甲方 / 乙方 / 見證人）

---

## 6. 轉成 BDN 子條目（主 agent 後續 append）

| BDN ID | Wave | 描述 | 預估 |
|---|---|---|---|
| **#6.1** | 1 | 建 `sales_contracts` 表 + `generate_sales_contract_no` function + RLS + `src/domain/sales-contracts.ts` helper + `<ContractSignaturePad>` + `<ContractPrintable>` shell + 權限 keys | 4-6h |
| **#6.2** | 2 | RS04 Tab2 新車訂購合約書 page 落地 — 取代現有 mock `/sales/orders?type=new` 區塊、wire DB、PDF 列印、三方簽名、push delivery | 6-8h |
| **#7.1** | 3 | RS04 Tab3 中古車買賣切結合約書 page 落地 — `contract_type=used`、VIN onBlur 驗證、文件 checklist 4 項、切結 banner、三方簽名 | 6-8h |

---

## 7. 待 Ming 拍板的關鍵決策點

**Q1 · PDF 輸出方案**
- (a) HTML print-CSS（預設、簡單、POC 夠用）
- (b) Client-side jsPDF
- (c) Server-side puppeteer（需電子簽章 / 浮水印才有意義）
- 👉 提議 **(a)**

**Q2 · 簽名儲存方式**
- 第一版 base64 直接存 `sales_contracts` 三個 column（提議）
- 還是直接走 supabase storage URL（多一次 round-trip、demo 階段過度設計）
- 👉 提議 **DB base64**

**Q3 · Route 規劃**
- 沿用既有 `/sales/orders?type=new|used`（拿掉 localStorage、改吃 contract_id query string）
- 還是另開 `/sales/contracts/new` + `/sales/contracts/[id]`（合約清單頁未來會用到，獨立 route 比較乾淨）
- 👉 提議 **新開 `/sales/contracts/[id]`**，`/sales/orders` 留作純訂單列表 / 報表入口（未來接 sales_orders 表）

**Q4 · 合約編號 prefix**
- 規格用 `PO`（新車）/ `UA`（中古）
- 提議改 `NC` / `UC` 避免跟採購單 `PO-` 撞名
- 👉 提議 **改成 NC / UC**

**Q5 · VIN 驗證來源**
- 中古車合約 #7 卡片提到「與 RS06 評估記錄比對」，但目前 **沒有 `used_vehicle_evaluations` 表**（RS06 是否已落地存疑，需確認）
- 過渡方案：暫用 `customer_vehicles.vin` 比對；RS06 落地後改指向 `used_vehicle_evaluations.vin`
- 👉 提議 **過渡用 customer_vehicles**，Wave 3 落地時若 RS06 已有真正評估表則切換

**Q6 · 文件 checklist 上傳**
- 第一版只做 checkbox 勾選（無真檔案上傳，metadata 只記 checked: true / false）
- Wave 3.5 / Wave 4 再做 supabase storage upload
- 👉 提議 **第一版純 checkbox**

---

## 8. 邊界 / 不在本提案範圍

- ❌ 不做電子簽章法律效力（cert / 數位章）
- ❌ 不做合約版本控制（修改後保留歷史版本）— v1 是 in-place update，要審計再加 `sales_contract_revisions` 表
- ❌ 不做合約自動發 LINE 通知客戶（雖然規格有「📲 傳送客戶」按鈕，但那是報價單；合約 PDF 推送留下一輪）
- ❌ 不接 NetSuite（合約是 DealerOS 本地物件，會計入帳走 sales_orders 那條鏈）
- ❌ 不重寫 RS04 Tab1 報價單（沿用既有 `/sales/quote` mock；Wave 1.5 才做 sales_quotes 表）
- ❌ 不做合約管理列表頁（Wave 4）

---

## 9. 驗證 checklist（Wave 1 落地時要綠燈）

- [ ] migration apply 後 `\d sales_contracts` 顯示完整 schema
- [ ] `SELECT generate_sales_contract_no('ducati', 'new')` 兩次連續呼叫產出 `NC-202605-0001` / `NC-202605-0002`
- [ ] 並發測試：`SELECT generate_sales_contract_no(...) ` 開 5 個 session 同時呼叫，無重複編號
- [ ] `tsc --noEmit` = 0 errors
- [ ] `eslint src/domain/sales-contracts.ts src/components/sales/` = 0 errors
- [ ] 紀律 audit：`grep -rn "@/lib/supabase" src/app/(workspace)/sales/contracts` = 0 hit
- [ ] 手測：在 Indian brand 下開 `/sales/contracts/[id]` 三方簽名 → 重新整理 → 簽名 still 在
- [ ] RLS 測：A brand 的 token 撈 B brand 合約 → empty
