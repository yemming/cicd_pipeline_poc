# P2 續（整車 O2C）落地提案 — 整車成本認列 + 整車 AR + 訂金（NetSuite 走法）

**狀態**：⏳ heads-up（依「財務規格預設走 NetSuite、不多問」準則，spec 直接照 NetSuite 定案；DDL 僅在既有 ar_invoices 加 2 欄）
**日期**：2026-05-29
**前置**：P1 整車個別認定成本引擎（`post_inventory_cost_event` vehicle 路徑、`getVehicleLandedCost`）已建驗過；P2 AP/AR 零件已落地。
**tenant**：`e4cd1ac2-...`、base=`TWD`、demo brand=`indian`

---

## 1. 目標

把整車「訂金→交車→尾款」接成正式 O2C，交車時認列成本（個別認定 by VIN）+ 收入 + AR：

```
下訂 訂金 ─► VEHICLE_DEPOSIT      Dr 銀行 / Cr 預收訂金-新車(2230101)
交車      ─► COGS_ON_VEHICLE_SALE Dr 整車COGS(5100102) / Cr 整車存貨(1210102)  by VIN（+ vehicle_sale 成本事件，存貨歸零）
          ─► VEHICLE_AR_INVOICE   Dr AR 新車尾款(1180101) / Cr 整車收入(4100102) / Cr 銷項稅(2250101)
          ─► VEHICLE_DEPOSIT_APPLY Dr 預收訂金(2230101) / Cr AR(1180101)   （訂金沖抵 AR）
尾款      ─► VEHICLE_RECEIPT      Dr 銀行 / Cr AR(1180101)
```

NetSuite 對照：訂金 = Customer Deposit（負債，未認收入）；交車 = Item Fulfillment(COGS) + Invoice(收入/AR)；Deposit Application 把預收沖 AR；尾款 = Customer Payment。

**本輪鎖定「進口新車」**（Indian/Ducati 都是進口 → 存貨 1210102 / COGS 5100102 / 收入 4100102）。國產(0101)/中古(0103)/試乘轉售(0105) 之後加同款 type 換科目即可。

---

## 2. 整車 GL 科目（COA 既有，按進口新車）

| 用途 | 科目 | required_dimensions |
|---|---|---|
| 整車存貨 | 1210102 存貨-新車(進口) | MODEL, MODEL_YEAR, SALESPERSON, STORE, SUBSIDIARY, VEHICLE, VIN |
| 整車 COGS | 5100102 銷貨成本-新車(進口) | MODEL, MODEL_YEAR, SALESPERSON, STORE, SUBSIDIARY, VEHICLE, VIN |
| 整車收入 | 4100102 銷貨收入-新車(進口) | BRAND, DEPT, MODEL, MODEL_YEAR, SALESPERSON, STORE, SUBSIDIARY, VEHICLE |
| 整車 AR | 1180101 應收帳款-新車尾款 | CUSTOMER, MODEL, MODEL_YEAR, SALESPERSON, STORE, SUBSIDIARY, VEHICLE |
| 預收訂金 | 2230101 預收訂金-新車 | CUSTOMER, MODEL, MODEL_YEAR, ORDER, SALESPERSON, STORE, SUBSIDIARY, VEHICLE |
| 銷項稅 | 2250101 銷項稅額-應稅5% | STORE, SUBSIDIARY |
| 銀行 | 1102101（system default bank） | BANK, STORE, SUBSIDIARY |

**維度值解析**（trigger 只驗 key 存在、不驗值）：MODEL=`vehicle_model_id`、MODEL_YEAR=`year`、SALESPERSON=SO 業務（`created_by`/`rs_name`）、VEHICLE=`new_car_inventory.id`、VIN=`vin`、STORE=`organization_id`（缺則該法人首店）、SUBSIDIARY=店鏈、BRAND=scope、DEPT=該 brand「業務部」(code=SAL)、CUSTOMER=`customer_id`、ORDER=`sales_order.id`。helper 一律用 service client 解析（同 AP/AR）。

---

## 3. DDL（最小：ar_invoices 加 2 欄；不新增表）

整車 AR 沿用既有 `ar_invoices`/`customer_receipts`/`receipt_applications`，加 2 欄區分 AR 控制科目與整車連結：
```sql
ALTER TABLE public.ar_invoices ADD COLUMN ar_coa_code text NOT NULL DEFAULT '1180104';  -- 零件預設；整車='1180101'
ALTER TABLE public.ar_invoices ADD COLUMN vehicle_id uuid REFERENCES new_car_inventory(id);
```
> 對帳鐵律改 group by `ar_coa_code`：`SUM(open_func) WHERE ar_coa_code='1180101'` = GL 1180101 餘額；零件同理對 1180104。
> 訂金不另開表：記在 `customer_receipts`（`metadata.kind='vehicle_deposit'`，credit 2230101 而非 AR），不走 application。交車時的 deposit application 由 helper 直接 fire `VEHICLE_DEPOSIT_APPLY` GL。

---

## 4. transaction_types（5 個新；dim_sources 逐行涵蓋 required_dimensions）

ctx 金額一律 func(TWD)。共同 ctx：`vehicle_id, model_id, model_year, salesperson, store_id, subsidiary_id, brand_id, dept_id, customer_id, order_id, vin, bank_id`。

1. **COGS_ON_VEHICLE_SALE**：`D 5100102 func_cost / C 1210102 func_cost`（dims 兩行皆 MODEL/MODEL_YEAR/SALESPERSON/STORE/SUBSIDIARY/VEHICLE/VIN）。func_cost = VIN landed cost。
2. **VEHICLE_DEPOSIT**：`D 銀行(default_bank) func_amount / C 2230101 func_amount`（C 行 dims CUSTOMER/MODEL/MODEL_YEAR/ORDER/SALESPERSON/STORE/SUBSIDIARY/VEHICLE；D 行 BANK/STORE/SUBSIDIARY）。
3. **VEHICLE_AR_INVOICE**：`D 1180101 func_net+func_tax / C 4100102 func_net / C 2250101 func_tax`。
4. **VEHICLE_DEPOSIT_APPLY**：`D 2230101 func_dep / C 1180101 func_dep`。
5. **VEHICLE_RECEIPT**：`D 銀行 func_amount / C 1180101 func_amount`（尾款；本輪假設 TWD，整車外幣留後續）。

> 整車本輪先不做整車外幣已實現匯損益（國內整車交易為主、TWD）；外幣整車進貨成本已由 P1 vehicle ledger 處理。

---

## 5. Domain helper `src/domain/vehicle-sales.ts`

```ts
collectDeposit({ sales_order_id, amount, bank_coa_id? })   // VEHICLE_DEPOSIT；記 customer_receipts(kind=vehicle_deposit)
deliverVehicle(sales_order_id)                              // 交車：
  // 1) 取 linked vehicle（new_car_inventory）+ landed cost（getVehicleLandedCost）
  // 2) postCostEvent vehicle 'vehicle_sale'（qty -1，存貨歸零）
  // 3) COGS_ON_VEHICLE_SALE（func_cost = landed cost）
  // 4) 建 ar_invoices(ar_coa_code='1180101', vehicle_id) + VEHICLE_AR_INVOICE
  // 5) 若有未沖訂金 → VEHICLE_DEPOSIT_APPLY + 更新 AR open
receiveVehicleBalance({ sales_order_id, amount })           // VEHICLE_RECEIPT + 沖 ar_invoices open
```
維度解析 helper（service client）：store←org/法人首店、dept←SAL、model/year/vin/vehicle←new_car_inventory、salesperson←SO。

---

## 6. 防重複 / 邊界

- 整車成本真相 = `inventory_cost_ledger`（P1，vehicle 路徑），`new_car_inventory.total_cost` 是 generated 不可寫。COGS 取 `getVehicleLandedCost(vehicle_id)`。
- vehicle_sale 成本事件讓該 VIN ledger value_after 歸 0；COGS_ON_VEHICLE_SALE 的 Cr 存貨金額 = 同一 landed cost → 與成本帳 tie-out。
- 訂金未認收入（NetSuite Customer Deposit）；收入只在交車 VEHICLE_AR_INVOICE 認。
- POS/零件路徑不受影響；整車走獨立 type。

---

## 7. 驗證（scripted e2e，真 runtime+RLS）

建一張測試：挑一台 indian 進口新車（有 landed cost）+ 建測試 SO 連結 + 測試客戶 →
1. collectDeposit（訂金）→ 查 `VEHICLE_DEPOSIT` Dr 銀行/Cr 預收訂金 平衡、維度齊
2. deliverVehicle → 查 `COGS_ON_VEHICLE_SALE`(Dr COGS/Cr 存貨=landed cost) + vehicle ledger value_after=0 + `VEHICLE_AR_INVOICE`(Dr AR/Cr 收入/Cr 銷項稅) + `VEHICLE_DEPOSIT_APPLY`(Dr 預收訂金/Cr AR)
3. receiveVehicleBalance（尾款）→ `VEHICLE_RECEIPT` Dr 銀行/Cr AR；AR open=0、預收訂金 net=0
4. 全部借貸平衡、必填維度齊、可過帳；測試資料清乾淨還原（含 vehicle ledger + new_car_inventory 狀態）

---

## 8. 落地順序
1. ALTER ar_invoices（+2 欄）
2. seed 5 transaction_types + TX_TYPES
3. `vehicle-sales.ts`
4. scripted e2e + 清乾淨
5. 更新記憶；不主動 commit
