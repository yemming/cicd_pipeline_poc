# Feature Proposal — 估價核准 → 中古車庫存自動串接（G4）

> spec-to-feature Phase 1（結構分析）+ Phase 2（架構提案）。**僅提案、不改 code、不跑 migration。**
> 背景：第十一輪 E2E RS-09 揪出功能缺 — `approveEvaluation` 只把估價單 `status → 'approved'`，**不自動建 `used_car_inventory` row**。spec 要求「估完進中古庫存（★串接）」。本文規劃 approve 後**冪等衍生**中古庫存。

---

## 一、現況分析

### 1.1 精確路徑

| 角色 | 檔案 | 重點 |
|---|---|---|
| 估價 domain helper | `src/domain/used-car-evaluations.ts` | `approveEvaluation(id, approverId)` L196-215：只 update `status/approved_at/approved_by`，guard `.eq("status","submitted")` |
| 中古庫存 domain helper | `src/domain/used-car-inventory.ts` | `createUsedCar(input)` L178-187：insert，`status` 預設 `'available'` |
| 中古庫存常數 / 型別 | `src/domain/used-car-inventory.constants.ts` | `UsedCarDbStatus` / `CreateUsedCarInput` row 型別 |
| 估價 server action | `src/lib/used-car/evaluation-actions.ts` | `approveEvaluationAction(id)` L98-117：權限檢查 `USED_CAR_EVALUATION_APPROVE` → 呼叫 helper → `revalidatePath` |
| 審核 UI | `src/app/(workspace)/admin/approvals/tradein/_components/tradein-approvals-board.tsx` | L96 呼叫 `approveEvaluationAction(row.id)` |
| E2E | `tests/e2e/rs.spec.ts` L485-528 | RS-09，目前在註解標明功能缺 |

`after()` + `notifications.dispatch` 在 domain helper 內已是成熟 pattern（`transfers.ts` L1345、`aftersales-pickup-notify.ts` L382 等），可直接沿用。

### 1.2 `used_car_evaluations` 欄位（已驗證 information_schema）

`id` · `brand_id`(NN) · `organization_id` · `eval_no` · `vin` · `license_plate` · `brand_name` · `model` · `year` · `color` · `displacement` · `mileage` · `appraiser` · `evaluator_id` · `customer_id` · `condition_grade`(S/A/B/C/D) · `estimated_value`(numeric) · `decision` · `conclusion` · `status`(draft 預設) · `submitted_at` · `approved_at` · `approved_by` · `rejected_*` · `equipment_jsonb` · **`pricing_jsonb`** · `metadata` · timestamps。

**sample `pricing_jsonb`**（seed_round7）：
```json
{ "pNew":"720000","pMarket":"650000","pComm":"30000","pAdmin":"5000",
  "pTire":"0","pPaint":"0","pRepair":"15000","pWarranty":"0","pProfit":"20000" }
```
- `estimated_value` = 收購估價（給賣方的錢，sample 580000）
- `pricing_jsonb.pMarket` = 市場行情 / 建議售價（sample 650000）
- `pricing_jsonb.pProfit` = 目標毛利

### 1.3 `used_car_inventory` 欄位（已驗證）

`id` · `brand_id`(NN) · `organization_id` · `vin`(**UNIQUE** `used_car_inventory_vin_key`) · `license_plate` · `vehicle_model_id` · `model_display_name`(NN) · `year`(NN) · `color` · `color_hex` · `mileage_km`(預設 0) · `acquisition_price` · `listing_price` · `cost` · `margin` · `acquisition_source`(trade_in/auction/direct_buy/other) · `acquisition_date` · `listed_date` · `sold_date` · `status`(NN, 預設 `'available'`) · `condition_grade`(S/A/B/C/D) · `lien_cleared` · `inspection_due_date` · `recommended_services`(array) · `inspection_report`(jsonb) · `images`(array) · `note` · `metadata`(jsonb) · timestamps · `created_by`/`updated_by`。

**狀態 enum**（`used-car-inventory.constants.ts`）：`available`(在庫可售) / `reserved`(已保留) / `sold`(已售出) / `pending_inspection`(整備中) / `withdrawn`(已下架)。

**既有 index**：`vin` unique、`brand_id`、`status`、`condition_grade`；`metadata` 上**無 index、無 unique**。

⚠️ **關鍵約束**：`vin` 是 UNIQUE。估價單的 VIN 會原樣帶進庫存，所以「同一台車重複建庫存」會撞 `vin` unique（23505）— 但這只在 VIN 非空時成立，且不是我們想依賴的冪等鍵（語意上 unique key 應該是「來源估價單」而非 VIN，VIN 可能為空、可能多次估價）。

---

## 二、欄位對映表（估價單 → 中古庫存）

| 中古庫存欄位 | 來源 | 備註 / 缺值處理 |
|---|---|---|
| `brand_id` | `eval.brand_id` | 直帶（NN）|
| `organization_id` | `eval.organization_id` | 直帶（可空）|
| `vin` | `eval.vin` | 直帶；空則 null（避免空字串撞 unique）|
| `license_plate` | `eval.license_plate` | 直帶 |
| `model_display_name` | `eval.model` | NN；`eval.model` 也可空 → fallback `eval.brand_name + ' ' + (eval.model ?? '未指定車款')`，最終 fallback `'（未指定）'` |
| `year` | `eval.year` | NN；空 → `new Date().getFullYear()`（給安全預設，避免 insert 失敗）|
| `color` | `eval.color` | 直帶 |
| `color_hex` | — | null（估價單無此欄）|
| `mileage_km` | `eval.mileage` | 直帶；空 → 0（欄位預設）|
| `acquisition_price` | **`eval.estimated_value`** | 收購估價 = 入庫成本基礎 |
| `cost` | `eval.estimated_value + (pComm+pAdmin+pTire+pPaint+pRepair+pWarranty)` | 收購價 + 整備/規費（pricing_jsonb 字串需 `Number()`）；無 pricing_jsonb 時 = `estimated_value` |
| `listing_price` | **`pricing_jsonb.pMarket`** | 市場行情 = 初步上架建議價；空 → null（待整備後人工定價）|
| `margin` | `listing_price - cost`（兩者皆有時算）| 否則 null（不亂塞 0）|
| `acquisition_source` | 固定 `'trade_in'` | 估價來源語意就是舊換新收購 |
| `acquisition_date` | `today`（approve 當日）| date 型 |
| `listed_date` | **null** | 待整備完才上架，不在 approve 當下設 |
| `status` | **`'pending_inspection'`（整備中）** | 見 §3 決策 4 |
| `condition_grade` | `eval.condition_grade` | 直帶（同 enum）|
| `lien_cleared` | null | 未知，待人工 |
| `note` | `eval.conclusion` | 估價結論帶為備註 |
| `metadata.source_evaluation_id` | **`eval.id`** | 冪等鍵 + 雙向關聯（見 §3 決策 3/5）|
| `metadata.source_eval_no` | `eval.eval_no` | 顯示用 |
| `metadata.generated_from` | `'eval_approval'` | 來源標記 |
| `created_by` | `approverId` | 核准人 |

> 缺漏欄位（`color_hex`/`lien_cleared`/`vehicle_model_id`/`images`/`inspection_report`）一律 null / 預設，待中古車模組人工補。**不為了 future-proof 全部硬塞。**

---

## 三、架構提案（6 決策，每個含推薦）

### 決策 1 — 欄位對映（見 §2 完整表）

**核心 3 條對映**：`estimated_value → acquisition_price`、`pricing_jsonb.pMarket → listing_price`、`condition_grade → condition_grade`（同 enum 直帶）。

- **推薦**：照 §2 表。`cost` 用「收購價 + 整備規費」聚合，`margin` 只在 `listing_price`/`cost` 皆有時計算、否則留 null（中古庫存 KPI 的 `avgMarginRate` 本來就 skip null margin，安全）。
- **理由**：估價單的 `estimated_value` 是付給賣方的錢，語意上就是 `acquisition_price`；`pMarket` 是市場行情、最接近初步 `listing_price`；其餘照 typed core 能對就對、對不上丟 metadata 或 null，遵守「變動中 / 純顯示丟 jsonb」天條。

### 決策 2 — 觸發時機

- 選項 A：同步在 `approveEvaluation` 內 create（approve update 成功 → 立即 `createUsedCar`，同一函式內串接）
- 選項 B：`after()` 非阻塞 hook

- **推薦：A（同步在 helper 內 create）**，但包成 helper 內部子步驟、create 失敗時的處置見下。
- **理由**：
  1. 庫存衍生是 RS-09 的**主結果**（spec「估完進中古庫存」），不是副作用通知 — 使用者 approve 完應該**立刻**在中古庫存看到那台車，A 才保證 `revalidatePath` 後列表就有。B 非阻塞會有看不到、要刷新的 race。
  2. Supabase 無跨表交易 API，A 不是真 ACID transaction，但可用「**先建庫存、後改 status**」或「先改 status、建庫存失敗則 rollback status」其一保證一致。**推薦：先 update status→approved（既有 guard 不動），再 create inventory；create 失敗則 throw（action 回 error），但 status 已改 approved** → 為避免「approved 了卻沒庫存」的孤兒，靠**冪等**（決策 3）兜底：approve 可安全重按一次補建庫存。
  3. **通知**（可選）走 B：approve 成功後用 `after()` + `notifications.dispatch({ code: 'usedcar_inventory.created_from_eval' })` 推 LINE 給中古車負責人「有新車待整備」。通知失敗絕不回滾（既有 pattern）。

> 即 **主結果同步（A）＋ 通知非阻塞（B）** 混合，跟 `createTicket` 的「insert 同步、LINE 通知 after()」同型。

### 決策 3 — 冪等（不可建兩筆）

- 選項：(a) `metadata.source_evaluation_id` 當邏輯鍵、create 前先 query 是否已存在 / (b) typed column `source_evaluation_id` + partial unique index / (c) 靠 `vin` unique

- **推薦：(a) 為 v1，具體 key `metadata->>'source_evaluation_id' = eval.id`；create 前先查、已存在則 skip（回現有 inventory id）。** 若量級 / 競態變嚴重再升級 (b)。
- **理由**：
  1. `approveEvaluation` 的 status guard `.eq("status","submitted")` 已是第一道防線 — approve 第二次時 status 已是 approved、update 回 0 row、現行 throw「必須為待簽核」。**但**我們要支援「approved 卻沒庫存的孤兒補建」，所以衍生庫存的冪等不能只靠 status guard。
  2. v1 用 metadata 邏輯鍵 + 先查：`SELECT id FROM used_car_inventory WHERE brand_id=? AND metadata->>'source_evaluation_id'=?`。POC 單人操作、approve 非高併發，先查再 insert 足夠；撞 race 的機率極低。
  3. **不靠 `vin` unique 當冪等鍵**：VIN 可空（estimated_value 對映，VIN 是選填）、且語意錯（同台車可多次估價、估價單才是來源）。VIN unique 仍會在「VIN 重複」時擋下，當作第二道資料品質防線即可。
  4. **是否要 (b) typed column + partial unique index**：列為「決策 6 可選 migration」。若要硬性 DB 層防重（多 instance / 未來自動化 pipeline），加 `CREATE UNIQUE INDEX ... ON used_car_inventory (brand_id, source_evaluation_id) WHERE source_evaluation_id IS NOT NULL`。v1 POC 先不加，純查防重。

### 決策 4 — 新建 inventory 初始 status

- 候選（對齊既有 enum）：`pending_inspection`(整備中) / `available`(在庫可售) / `reserved`

- **推薦：`pending_inspection`（整備中）。**
- **理由**：剛收進來的中古車要先驗車 / 整備 / 規費 / 過戶才上架，業務語意就是「整備中」；`available` 是「可售」、不該一核准就直接上架販售。配合 §2 把 `listed_date` 留 null（整備完人工上架時才設），中古庫存看板的「庫齡」「在售」KPI 才不會被未整備車污染（`getUsedCarKpis` 的 `available`/`aged90` 都看 status，留 pending_inspection 不會誤算）。

### 決策 5 — 雙向關聯回寫

- **推薦**：
  - 庫存側：`used_car_inventory.metadata.source_evaluation_id = eval.id`（+ `source_eval_no` 顯示）→ 兼任冪等鍵 + 反查來源。
  - 估價側：`used_car_evaluations.metadata.generated_inventory_id = <new inventory id>`（在 create 成功後，同一個 approve 流程內補 update eval 的 metadata）→ 估價單詳情頁可顯示「已產生庫存 #xxx」連結。
- **理由**：兩邊都用 metadata jsonb（純顯示 / 關聯、形狀穩定後再 promote），不動 typed schema、零 migration。雙向都記，UI 兩邊都能跳轉，符合「metadata 純顯示 / 單頁專用」原則。estimation 側回寫放在 create inventory 成功之後、用 `updateEvaluation`-style 合併 metadata（讀現有 metadata → spread → 寫回），不可整碗覆蓋。

### 決策 6 — 是否需要 migration

- **推薦：v1 不需要 migration。**
- **理由**：兩表都已有 `metadata jsonb DEFAULT '{}'`，對映欄位（acquisition_price/listing_price/cost/margin/condition_grade/status…）全是既有 typed column。冪等用 metadata 邏輯鍵 + 先查即可。
- **可選（標 Ming 拍板）**：若要 DB 層硬性防重，加一條 partial unique index（見決策 3.4）。這是 additive、不破壞既有資料，但 POC 階段非必要。

---

## 四、落地清單（要改哪些檔、是否 migration、估工）

| # | 檔案 | 動作 | 估工 |
|---|---|---|---|
| 1 | `src/domain/used-car-evaluations.ts` | `approveEvaluation` 加「approve 後衍生庫存」：(1) 改 status（不動既有 guard）→ (2) 防重查 `metadata->>'source_evaluation_id'` → (3) 撈完整 eval row 組 `CreateUsedCarInput` → 呼叫 `createUsedCar` → (4) 回寫 eval.metadata.generated_inventory_id。import `createUsedCar`。回傳型別可擴成 `{ id; inventory_id?: string }` | 40 min |
| 2 | `src/domain/used-car-evaluations.ts` | 加純函式 `mapEvaluationToUsedCar(eval): CreateUsedCarInput`（§2 對映表 + pricing_jsonb `Number()` 解析），方便單測 | 20 min |
| 3 | `src/lib/used-car/evaluation-actions.ts` | `approveEvaluationAction` 不變或微調回傳；多 `revalidatePath("/usedcar/stock")` + `revalidatePath("/sales/showroom/used-cars")` 讓庫存頁立刻看到 | 10 min |
| 4 | （可選）`src/domain/used-car-evaluations.ts` | approve 成功後 `after()` + `notifications.dispatch({ code: 'usedcar_inventory.created_from_eval' })`；需先在 notification hub 註冊事件 code（另開）| 30 min（含事件註冊）|
| 5 | （可選）migration | partial unique index `(brand_id, source_evaluation_id)` — 僅在 Ming 要 DB 層防重時 | 10 min |
| 6 | `tests/e2e/rs.spec.ts` RS-09 | 補 approve→庫存斷言（見 §6）+ 移除「功能缺」註解 | 30 min |

**總估工**：核心（1/2/3/6）約 1.5 hr；含通知 +0.5 hr；migration +10 min。**無破壞性變更、無資料遷移。**

---

## 五、待 Ming 拍板項（決策 checklist）

- [ ] **D1 對映**：同意 `estimated_value→acquisition_price`、`pMarket→listing_price`、`cost=收購價+整備規費`、`margin` 只在兩者皆有時算？
- [ ] **D2 觸發**：同意「主結果同步建庫存（A）＋ 通知非阻塞（B）」，且採「先改 status、後建庫存、靠冪等兜底孤兒」？
- [ ] **D3 冪等**：同意 v1 用 `metadata.source_evaluation_id` + 先查防重（不加 unique index）？
- [ ] **D4 初始狀態**：同意新建庫存 status = `pending_inspection`（整備中）、`listed_date` 留 null？
- [ ] **D5 關聯**：同意雙向 metadata（庫存記 `source_evaluation_id`、估價記 `generated_inventory_id`）？
- [ ] **D6 migration / 通知**：是否要 (a) 加 partial unique index、(b) approve 推 LINE 通知中古車負責人？（兩者皆可選，預設不做）

---

## 六、驗收方式

### 6.1 手測

1. 開一張 evaluation（draft）→ 送簽（submitted）→ `/admin/approvals/tradein` approve。
2. 到 `/usedcar/stock` 或 `/sales/showroom/used-cars` → 應看到對應車款，status = 整備中、`acquisition_price`=估價、`listing_price`=pMarket。
3. SQL 核對：
   ```sql
   SELECT i.id, i.status, i.acquisition_price, i.listing_price, i.metadata->>'source_evaluation_id'
   FROM used_car_inventory i WHERE i.metadata->>'source_evaluation_id' = '<eval_id>';
   -- 預期 1 筆
   SELECT metadata->>'generated_inventory_id' FROM used_car_evaluations WHERE id='<eval_id>';
   -- 預期 = 上面那筆 inventory id
   ```

### 6.2 冪等驗證

- 同一估價單已 approved 後再呼叫 `approveEvaluation`（模擬重按 / 重試）→ inventory 仍**只有 1 筆**（先查命中 → skip create，回現有 id）。
- SQL：`SELECT count(*) FROM used_car_inventory WHERE metadata->>'source_evaluation_id'='<eval_id>'` 必 = 1。

### 6.3 RS-09 describe 補的斷言

在 `tests/e2e/rs.spec.ts` RS-09 block：
1. 移除 L525-527「功能缺」註解。
2. 新增 approve 流程（sales_lead 建 → 切 rs_manager storageState submit/approve；或直接走 admin/approvals/tradein）。
3. 斷言：
   - approve 後 `/usedcar/stock` 列表出現該車款（用 stamp 唯一 model/seller 定位）。
   - 該庫存 row status chip = 「整備中」。
   - **冪等**：第二次 approve（或重整）後列表該車**只有 1 筆**（`expect(rows).toHaveCount(1)`）。
   - 清理：測後刪該 inventory + evaluation（保持冪等可重跑）。

---

**結論**：v1 零 migration、純改 2 個 domain helper 檔 + 1 action 微調 + RS-09 補斷言，約 1.5 hr。核心是 `approveEvaluation` 內以 `metadata.source_evaluation_id` 防重、同步建一筆 `pending_inspection` 庫存並雙向回寫關聯。
