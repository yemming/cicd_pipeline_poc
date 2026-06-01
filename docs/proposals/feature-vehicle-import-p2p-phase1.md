# 提案：新車進口採購 P2P（Procurement-to-Stock）財務級全流程模組

> **狀態**：已批准（Ming 2026-06-01，plan mode sign-off）。本提案即 COA 紀律要求的 schema sign-off。
> **來源**：BrainDump 卡「高級進口摩托車 P2P 流程設計」`36c66adeb1d381608deddde780954bff`
> **計畫檔**：`~/.claude/plans/https-www-notion-so-yemming-p2p-…md`

## 一、背景與定位

進口高級重機 P2P 本質三層：**買進來 → 報進來 → 算進去**，骨子裡是成本管理 + 現金週期管理（下單到能賣壓 4-8 個月）。目標：每塊錢都有歸屬、每張單據都有去處、每台車精準算真實毛利。

第 15 輪（2026-05-27）已建整車供應鏈骨架（`/sales/inventory` 的 RS_INV01~06），但成本結算是簡化版（只關/運/保、按採購價平攤）。本模組是**同流程的財務級超集**，補完稅金引擎、Landed Cost 多基礎分攤、7-stage 文件、攤提/補列/凍結/GL。**沿用既有表深層擴充**，不另造平行表。

新模組：Level 0 `src/app/(workspace)/vehicle-import/`，module key `vehicle-import`，顯示名「新車進口採購」。

## 二、架構（三演員，照天條）

UI（`vehicle-import/**`）→ domain helper（`src/domain/import-*.ts`）→ Supabase。UI 禁止直連 supabase。tax/分攤純函式放 `*.constants.ts`（client 可 value-import 即時預覽）。

## 三、Schema 變更（核准後一次性 apply_migration）

### A. 擴充既有表（無欄位撞名，已查證）

- `vehicle_purchase_orders` ＋ `pi_no, incoterms, deposit_ratio, deposit_paid_at, balance_paid_at, origin_country`
- `new_car_inventory` ＋ `cif_value, gross_weight_kg, customs_duty, commodity_tax, import_fees, model_amortized_cost, cost_frozen_at, hs_code`
- `new_car_inventory.total_cost`（generated）重建：
  - 原 = `cost_price + pdi_labor_cost + pdi_parts_cost + transfer_freight_cost`
  - 新 = 原 ＋ `customs_duty + commodity_tax + import_fees + model_amortized_cost`
  - **進口營業稅（進項稅額）不入此公式** —— 走 GL 進項科目
  - 做法：`DROP COLUMN total_cost` → `ADD COLUMN total_cost numeric GENERATED ALWAYS AS (...) STORED`（值自動重算）

### B. 新增 5 張表（皆雙 brand RLS：`user_has_brand(brand_id)` 套 4 CMD）

1. `hs_code_tariffs` — 稅則 master + 年度版本（HS Code 8711.x、排氣量級距、關稅率、貨物稅率、推貿率、營業稅率）。`UNIQUE(brand_id, hs_code, effective_year)`
2. `import_shipments` — 進口批次 / 報關（Landed Cost Pool 容器）。B/L、報單、CIF、海關估價、7-stage `stage`、`status`。一批 = 多 VIN
3. `import_cost_pool_lines` — 費用明細。`cost_type / amount / allocation_basis(direct|cif|weight|qty|model_amort) / is_inventoriable / target_vehicle_id / coa_credit_code`
4. `import_cost_allocations` — 分攤結果（批次→個體映射、審計）。`pool_line_id × vehicle_id → allocated_amount / cost_ledger_id`，`UNIQUE(pool_line_id, vehicle_id)`
5. `import_documents` — 進口文件（PI/CI/PL/CO/COC/B-L/報單/完稅照/VSCC…）。可掛 shipment/PO/VIN

完整 DDL 見計畫檔 §Schema。`business_rules`（`rule_kind='model_amortization'`）承載車型攤提；補列 SOP 不另開表（pool line `metadata.is_post_addition` + 三道關 helper）。

## 四、核心引擎（純函式）

- **稅金引擎** `computeImportTaxes(cif, hsCode, year, weight?)`（手冊 §5.1 疊加）：關稅 = CIF×率；貨物稅 = (CIF+關稅)×17%；推貿 = CIF×0.04%；進口營業稅 = (CIF+關稅+貨物稅)×5%（進項、不入成本）。
- **分攤引擎** `allocateCostPool()`（推廣既有 `allocateImportCosts` 最大餘數法）：每 pool line 按 `allocation_basis` 分攤（direct/cif/weight/qty/model_amort），零尾差。❌ 禁按毛利/售價分攤（§6.4）。

## 五、GL 對映（COA 已備，無需新增科目）

| 事件 | 借 | 貸 |
|---|---|---|
| 付訂金 30% | 1250101 預付貨款－車輛 | 銀行 |
| 在途入帳 | 1210107 存貨－在途車 | 1250101 / 2170101 |
| 到岸+稅費入庫 | 1210102 存貨－新車（進口） | 應付海關 / 應付運費 2200304 / GR-IR 2170106 |
| 進口營業稅 | 進項稅額（VAT_INPUT, 1190x） | 銀行 |
| 售出凍結 | 5100102 銷貨成本－新車（進口） | 1210102 |

## 六、Phasing

- **Round A（本輪）**：schema + tax 引擎 + 分攤引擎 + 稅則 master 頁 + nav + Indian seed。
- **Round B**：shipments + Landed Cost Pool 結算 + 成本歸集卡。
- **Round C**：文件中心 + 7-stage + PO 訂金尾款 + 列印。
- **Round D**：GL 自動過帳（進項分離）+ 車型攤提 + 補列三道關 + 售出凍結 + 轉銷貨成本。

## 七、驗證

tsc/eslint 0 error；天條 audit 0 hit；稅金引擎用 §5.1 範例驗算（關稅 102,000 / 貨物稅 119,340 / 推貿 240 / 營業稅 41,067）；分攤零尾差；部署後 Playwright 正式站。demo 資料一律 `brand_id='indian'`。
