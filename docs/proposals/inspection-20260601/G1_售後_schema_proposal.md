# Schema Proposal · G-1 售後完整閉環 DDL 批次

**日期：2026-06-02　｜ 狀態：⏳ 等 Ming 簽核（簽核前不跑任何 DDL）**
**依據**：`A1_售後_HTML巡檢結果.md` + 真庫欄位實查（execute_sql 確認以下全部「目前不存在」需新建）
**規則**：§5 安全邊界 + COA 規則（先 proposal 後 DDL）。請回「G-1 全 Go / 逐項 Go / 要改」。

> 一次把售後 6 個工作包要動的 schema 集中提案，避免散彈。**demo 資料一律 `brand_id='indian'`。所有新表沿用既有品牌 RLS `user_has_brand(brand_id)`。**

---

## 摘要表

| # | 變更 | 服務工作包 | 性質 | 風險 |
|---|---|---|---|---|
| 1 | `repair_orders.priority` 加欄 | B 工單核心 | 加欄 | 低 |
| 2 | `service_quotes` + `service_quote_lines` 新表 | A 套餐生態(04B) | 新表 | 低 |
| 3 | `vehicle_pending_items` 新表 | A/D 拒絕追加待處理 | 新表 | 低 |
| 4 | `customer_vehicles` 加下次保養 2 欄 | F 結帳 | 加欄 | 低 |
| 5 | `pickup_notification_schedules` 加 3 欄 | F 通知節點 | 加欄 | 低 |
| — | 簽名圖/委託取車/07B稽核 → 走既有 jsonb/business_rules | A/C/F | **不需 DDL** | — |

全部加法型、不改既有欄、不刪資料 → 風險低。

---

## 1 · `repair_orders.priority`（包B 工單優先級）
```sql
ALTER TABLE repair_orders
  ADD COLUMN priority text NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('urgent','normal','flexible'));
```
- 🔴緊急(urgent)/🟡一般(normal)/🟢彈性(flexible)。派工看板依此置頂排序、list 加 chip 欄。
- **6 態進度條**：不加欄，沿用既有 status + 在 detail 頁做 6 態視覺映射（待派工→施工中→追加待確認→竣工複檢→待結帳→已關閉）；保固主管授權記錄走 `repair_orders.metadata.warranty_auth{...}`。

## 2 · `service_quotes` + `service_quote_lines`（包A 04B 報價閉環）
```sql
CREATE TABLE service_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  vehicle_id uuid,                 -- 關聯人車檔
  pre_inspection_id uuid,          -- 來源預檢單（apply-to-inspection 回帶）
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('agreed','pending','rejected')),
  reject_reason text,
  total numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE service_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES service_quotes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('labor','part')),
  sku text, name text NOT NULL, qty numeric, lu numeric, unit_price numeric, subtotal numeric
);
ALTER TABLE service_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sq_brand ON service_quotes USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
ALTER TABLE service_quote_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY sql_brand ON service_quote_lines USING (
  EXISTS (SELECT 1 FROM service_quotes q WHERE q.id=quote_id AND user_has_brand(q.brand_id)));
```
- 04B 三結果：同意→status=agreed + 寫回 pre_inspection；暫存→pending；拒絕→rejected + 寫 `vehicle_pending_items`。

## 3 · `vehicle_pending_items`（包A/D 拒絕追加待處理）
```sql
CREATE TABLE vehicle_pending_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  vehicle_id uuid NOT NULL,
  source_quote_id uuid,            -- 來源報價（可空）
  item_desc text NOT NULL,
  reason text,                     -- 拒絕原因
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE vehicle_pending_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY vpi_brand ON vehicle_pending_items USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
```
- 下次預檢/回廠時依 vehicle_id 帶出，提醒 SA。

## 4 · `customer_vehicles` 下次保養（包F 結帳→CRM快篩）
```sql
ALTER TABLE customer_vehicles
  ADD COLUMN next_service_mileage int,
  ADD COLUMN next_service_date date;
```
- 結帳關單依里程算（+6000km）→ 寫此 2 欄 → CRM01B「保養到期快篩」讀此。
- **必須 typed 欄**（CRM 報表要 WHERE/排序，metadata 無法快篩）。

## 5 · `pickup_notification_schedules` 5 節點（包F 通知節點管理）
```sql
ALTER TABLE pickup_notification_schedules
  ADD COLUMN node_kind text DEFAULT 'ro_completed'
    CHECK (node_kind IN ('start_repair','safety_addon','general_addon','awaiting_parts','ro_completed')),
  ADD COLUMN policy text NOT NULL DEFAULT 'sa_decide'
    CHECK (policy IN ('sa_decide','mandatory','off')),
  ADD COLUMN forced boolean NOT NULL DEFAULT false;
```
- 節點2(safety_addon) 預設 forced=true + policy=mandatory（不可關）。helper 加 upsert 5 節點。

---

## 不需 DDL（走既有 jsonb / business_rules）
- **電子簽名圖**：base64 存 `pre_inspections.metadata.sig_*` / `ro_checkouts.customer_signature`(jsonb)。元件用既有 `src/components/signature-canvas.tsx`，**不裝套件**。
- **委託取車授權**：`ro_checkouts.metadata.pickup_auth{取車人,末4碼,授權方式,委託簽名base64}`。
- **07B 費率稽核日誌**：`business_rules` rule_kind='service_package_audit'（比照 group-pricing audit），免新表。
- **三色庫存**：讀既有 `stock_thresholds.safety_stock`（已存在）join，免 DDL。

---

## 簽核請求
| 項 | 我要做 | 等你回 |
|---|---|---|
| 1-5 | 上述 ALTER/CREATE（一次 apply_migration） | 「G-1 全 Go」或逐項 |
| 先行 | **07B 核心（CRUD on 既有表，零 DDL）我先開工不等簽核** | 同意我先做 07B？ |

> 回「G-1 全 Go」我就 apply migration 後依序做包B/A/F；07B 不含 DDL，我先開工。
