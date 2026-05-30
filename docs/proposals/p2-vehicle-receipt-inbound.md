# P2 — 整車進貨（進口新車 GR/IR + 成本 ledger）

> **狀態**：已落地（2026-05-29）。DB migration `p2_vehicle_receipt_inbound` 已 apply 雲端，code 待 commit。
> **背景**：P2 整車 O2C（訂金/交車/尾款）已 e2e 驗綠，但 `deliverVehicle` 有硬依賴 —
> `getVehicleLandedCost(vehicle_id)` 讀 `inventory_cost_ledger` 最新 `value_after`，整車從未有成本 ledger →
> 先前 e2e 靠 `postCostEvent('opening_balance')` 假餵才能交車。本輪補上真正的「整車進貨」把這個依賴做實。

## 目標

把進口新車的「到貨 → 入庫 → 廠商發票 → 付款」做成完整 GR/IR P2P 閉環，產出：

1. **整車成本 ledger**（`inventory_cost_ledger` vehicle 路徑）→ 餵 `deliverVehicle` 的 `getVehicleLandedCost`。
2. **整車 GL 進貨分錄**：Dr 整車存貨 / Cr 車輛 GR/IR。
3. **整車廠商發票**清車輛 GR/IR 轉正式 AP。
4. **付款**：整車帳單就是 `vendor_bills` row → 直接沿用既有 `payments.ts`（`BILL_PAYMENT` ＋ 已實現匯損益），**零新 code**。

本輪鎖定**進口新車**（存貨 1210102 / 車輛 GR/IR 2170106）。

## 分錄設計（func/TWD；NetSuite GR/IR 模型）

| 動作 | transaction_type | 借 | 貸 |
|---|---|---|---|
| 到貨入庫 | `VEHICLE_INVENTORY_RECEIPT` | 1210102 存貨-新車(進口) `func_goods` | 2170106 GR/IR-車輛 `func_goods` |
| 廠商發票 | `VEHICLE_VENDOR_BILL` | 2170106 GR/IR-車輛 `func_goods` ＋ 進項稅 1190401 `func_tax` | AP（suppliers.gl_payable_coa_id → fallback 2170105）`func_goods+func_tax` |
| 付款 | `BILL_PAYMENT`（既有） | AP | 銀行 |
| 交車 COGS | `COGS_ON_VEHICLE_SALE`（既有） | 5100102 COGS-新車(進口) `func_cost` | 1210102 存貨 `func_cost` |

- GR/IR 進 / 清金額一致（皆 `cost_price`）→ 車輛 GR/IR 過完發票後歸零。
- 存貨 1210102：進貨 Dr `cost_price`、交車 COGS Cr `landed_cost`（= ledger `value_after`）→ 同 VIN 淨額歸零。

## 成本 ledger（RPC `post_inventory_cost_event`，subjectType='vehicle'）

- 個別認定（`specific_identification`）；**只動 `inventory_cost_ledger`**，不碰 `inventory_cost_state`（那是零件 MA 專用）。
- `receipt` qty=1 unitCostIn=cost → `value_after = cost`。
- `vehicle_sale`（交車時 deliverVehicle 觸發）→ `amount_delta = -prev_value`、`value_after = 0`（存貨歸零、整段成本轉 COGS）。
- `getVehicleLandedCost` 取最新 `value_after` → 進貨後即 = `cost_price`。

## 關鍵決策

### 1. 存貨科目鬆綁 SALESPERSON 必填（已經 Ming 拍板）

`1210101` / `1210102` 原 `required_dimensions` 含 `SALESPERSON`，但整車「到港進貨」時還沒業務員（是庫存、還沒賣），`validate_journal_entry_posting` 會擋。

**決定**：比照 NetSuite —— 存貨是**資產**、業務員是**銷售面維度**。把 `1210101/1210102` 的 `SALESPERSON` 從必填拿掉（保留 `MODEL/MODEL_YEAR/STORE/SUBSIDIARY/VEHICLE/VIN`）。COGS `5100102` / 收入 `4100102` **仍保留** SALESPERSON（毛利按業務員歸屬不變）。

- 符合 COA 設計原則 §6「Be specific where it matters, permissive where it doesn't」。
- 只改 `required_dimensions`（非 code/name/結構/is_postable/is_locked）→ 不違反 §5/§11。
- 既有已過帳分錄不受影響（它們有 SALESPERSON，只是不再「必填」）。

### 2. PDI 工時 / 運費 landed cost 本輪不做

現有車輛 `pdi_labor_cost / pdi_parts_cost / transfer_freight_cost` 全為 0，`cost_price == total_cost`。本輪只認**基本車價**（GL 與 cost ledger 完全一致）。PDI/運費資本化牽涉新清算科目 + 成本來源（內部工時 vs 第三方運費）決策，留下一輪。

### 3. 進口供應商

`new_car_inventory.purchase_order_id` 無 FK（鬆綁 uuid）→ 進口供應商由 caller 傳入 `createVehicleImportBill({ vendor_id })`，不從 PO 反查。

## 落地檔案

- **DB**（`apply_migration p2_vehicle_receipt_inbound`）：
  - `transaction_types` seed `VEHICLE_INVENTORY_RECEIPT`（2 行）、`VEHICLE_VENDOR_BILL`（3 行）
  - `chart_of_accounts` UPDATE：1210101 / 1210102 拿掉 SALESPERSON 必填
- `src/domain/vehicle-receipts.ts`（新）：`receiveVehicle` / `createVehicleImportBill` / `postVehicleImportBill`
- `src/domain/transactions.ts`：`TX_TYPES` 補 `VEHICLE_INVENTORY_RECEIPT` / `VEHICLE_VENDOR_BILL`

## 冪等 / 防呆

- `receiveVehicle` 以 `inventory_cost_ledger` 是否已有此車 `receipt` 事件為冪等鍵（重跑直接擋，不會重複建 ledger / 重複過帳）。
- GL 過帳失敗時成本 ledger 已建（append-only）→ 回報需人工沖銷 ledger 後重試（POC 邊界；正式 UI 上線時補反向）。
- 守門：cost > 0、年份（MODEL_YEAR）齊、store/subsidiary 可解析。

## e2e 驗證

臨時 authenticated route + stock_lead storageState curl，跑完整閉環：
`receiveVehicle`（建 ledger + GL）→ `createVehicleImportBill` + `postVehicleImportBill`（清車輛 GR/IR）→ `createPayment` + `applyAndPost`（沖 AP）→ 連結 SO + `deliverVehicle`（**不再用 opening_balance 假餵**，證明硬依賴已補實）→ 查 `journal_entry_lines` 驗借貸/維度/科目、查 `inventory_cost_ledger` 驗 VIN 成本歸零 → 驗完清測試資料還原。

## 對帳鐵律

- `SUM(inventory_cost_ledger.value_after)`（vehicle, 最新 per VIN）= GL 1210102 存貨餘額。
- 車輛 GR/IR（2170106）過完所有發票後 = 0。
