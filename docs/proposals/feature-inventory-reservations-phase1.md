# 提案：備件預留（inventory_reservations）新表（Phase 1 結構分析）

> 來源：第十一輪 E2E 測試腳本 CROSS 案例（CROSS-02 / CROSS-03 / SA-04）
> 日期：2026-05-24
> 階段：Phase 1（結構分析 → 架構提案 → 拍板點）— **僅產 proposal，不 apply migration、不建表、不寫 src/ code**
> 適用 brand：依現有售後 / 進銷存慣例 — 主要 Ducati；Indian 視拍板決定（demo 資料一律 `brand_id='indian'`）
> 姊妹頁（同模組脈絡）：
> - `docs/proposals/feature-aftersales-addons-phase1.md`（追加項目 RO addons）
> - `docs/proposals/feature-aftersales-addon-loop-phase1.md`（追加項目回圈）
> - `docs/proposals/feature-aftersales-management-phase1.md`（車間看板 / 派工）

---

## 0. 這張表要解的業務問題

第十一輪 E2E 的 CROSS（跨模組）案例需要一個**備件預留**機制，把「維修工單的追加項目所需零件」跟「進銷存的可用量 / 告警」串起來：

| 案例 | 業務描述 | 對 reservation 的需求 |
|---|---|---|
| **CROSS-02** | RO 追加項目（`repair_order_addons`）所需零件，客戶 agreed 後要對庫存**預留**（reserve），**不是立即出庫**；預留量要進**預警告警**判斷 | 建立 active 預留 → 可用量 = 在手 − 預留 → alert 自動反映 |
| **CROSS-03** | 零件**調撥到貨 / 補貨入庫**時，自動**解除**對應「待料工單」的預留 → 通知工單可施工 | 入庫事件 → release/consume 對應 reservation → 通知（接既有 work-order loop） |
| **SA-04** | SA 追加項目記錄 → 備件預留 | addon 確認 → 觸發 reserve |

### ⚠️ 名詞校正（探查實證，避免猜錯）

- **追加項目表 = `repair_order_addons`**（task 給的 `work_order_addons` **不存在於 DB**）。SA 工單主表 = `repair_orders`（B2-A 已確認）。`work_orders` 是另一套舊表（不同 schema，無 addon 子表），**本提案以 `repair_orders` + `repair_order_addons` 為準**。
- `repair_order_addons` 表**早已埋了 `reserved_at` + `reserved_movement_id` 兩欄**（指向 `stock_movements.id`），但 grep `src/domain` / `src/lib` **沒有任何實際寫入點**（只在 `database.types.ts` 型別出現）。代表「addon → 預留」這條 loop 是「schema 留洞、邏輯沒接」的狀態 — 本提案就是補這個洞。

---

## 1. Phase 1 結構分析 — 既有「可用量 / 預留」如何運作（探查實證）

### 1.1 可用量目前怎麼算 —— 已有 `v_stock_balances` view

可用量**已經由 `v_stock_balances` view 算好**，`parts-balance.ts` / `alerts.ts` 都吃這個 view，不是各自 query：

```sql
-- v_stock_balances 關鍵（從 pg_get_viewdef 撈出的真實定義）
qty_available  = Σ stock_items.qty FILTER (status='available')
qty_reserved   = Σ stock_items.qty FILTER (status='reserved')
qty_frozen     = Σ ... FILTER (status='frozen')
qty_in_transit = Σ ... FILTER (status='in_transit')
qty_total      = Σ ... FILTER (status NOT IN ('issued','disposed'))
-- group by brand_id, item_id, warehouse_id
```

**關鍵洞察**：可用量 ≠ 在手總量。`qty_available` 是「`status='available'` 那些批次的數量總和」。預留目前的實作方式是**把整個 `stock_item`（一個批次 row）的 `status` 從 `'available'` 改成 `'reserved'`** — 一改，這批的 qty 就**自動從 `qty_available` 移到 `qty_reserved`**。

### 1.2 告警公式已天然吃可用量（`parts-balance.ts`）

```ts
// computeAlertLevel(row) 的判斷順序（既有，未改）
if (qty_total <= 0)                            → "out_of_stock"
if (qty_available < safety_stock)              → "below_safety"
if (qty_available < reorder_point)             → "below_reorder"
if (qty_total > max_stock)                     → "over_max"
```

→ **alert 用的就是 `qty_available`，已天然排除 reserved**。所以「available = on_hand − Σ active reservations」這個語意，**view 層面其實已實現**（只要預留動作真的把那批 status 切成 reserved）。

### 1.3 既有預留設計的「兩個半成品」與其限制

| 既有機制 | 在哪 | 限制 → 為什麼需要新表 |
|---|---|---|
| `stock_items.status='reserved'` | 批次層 flag | **整批切換、無法 partial**。一個批次 5 顆，要預留 2 顆給工單、留 3 顆可賣 → 做不到（status 是整 row 的）。目前 DB 只有 **1 筆** `status='reserved'`，沒被認真用 |
| `stock_items.reserved_for_doc_type / reserved_for_doc_id` | 批次層 | 同上：只能記「這整批被哪張單預留」，1 批對 1 單，無法 1 批對多單 / partial |
| `repair_order_addons.reserved_at / reserved_movement_id` | addon 層 | 留了欄位但**無寫入邏輯**；且只能記「一個 movement」，無狀態機（active/released/consumed）、無解除追蹤 |

**結論**：現有設計只能做「整批、1 對 1」的粗粒度預留，撐不起 CROSS-02/03 要的「partial qty、多筆 active 預留、可解除、進告警」。**需要 `inventory_reservations` 獨立 ledger 表**，把「預留」變成一筆筆有狀態機、可累加、可解除的紀錄。

### 1.4 CROSS-03 的「待料工單通知」既有接點

`src/domain/parts-alert-work-order-loop.ts` + `alerts.ts` 已有完整的「缺料工單回圈」：`listWorkorderLoopEntries` / `resolveWorkorderLoopEntryAction` / `escalateWorkorderLoopEntryAction` / `setWorkorderLoopEntryStatusAction`。CROSS-03 的「入庫 → 解除預留 → 通知工單可施工」應**接到這條既有 loop**，不要另造通知系統。

---

## 2. Phase 2 架構提案

### 2.1 為什麼是「獨立 ledger 表」而非沿用 status flag

依架構原則（Typed Core + JSONB）+ 業務需求：
- 預留是**量化、可累加、有生命週期**的事件 → 該是一筆筆 row（ledger），不是一個 boolean/status flag。
- 一張 reservation 對應「某 item × 某 warehouse（或某 batch）預留 N 個給某 source」，狀態會流轉（active → consumed/released/cancelled）→ 典型 typed core 表 + 狀態機。
- 不走 `business_rules`：這是**交易性事實資料**（哪張單預留了多少），不是「規則參數」。`business_rules` 只放「預留 → 告警」的**階層 / 閾值規則**（見 §2.6）。

### 2.2 Schema 草案（typed core + metadata jsonb）

```sql
CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,                       -- RLS 邊界
  -- 預留標的（見 §拍板點 1：掛批次層 or 彙總層）
  item_id uuid NOT NULL REFERENCES items(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  stock_item_id uuid REFERENCES stock_items(id),-- nullable：彙總層預留時為 null；批次層預留時指定批次
  -- 預留量（partial，核心）
  reserved_qty numeric(14,3) NOT NULL CHECK (reserved_qty > 0),
  consumed_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (consumed_qty >= 0),
  -- 來源（多型，addon 為主、未來可擴 sales_order 等）
  source_type text NOT NULL CHECK (source_type IN ('repair_order_addon','repair_order','manual')),
  source_id uuid,                               -- repair_order_addons.id / repair_orders.id
  ro_id uuid REFERENCES repair_orders(id),      -- 冗餘存「哪張工單」，方便 listByWorkOrder 與 CROSS-03 通知（addon 也回得到 ro）
  -- 狀態機
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','consumed','released','cancelled')),
  -- 稽核
  reserved_by uuid REFERENCES auth.users(id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,                       -- release/consume/cancel 時填
  release_reason text,                           -- 'restock' / 'transfer_arrival' / 'cancelled_by_user' / 'issued'
  -- 變動中 / 純顯示丟 jsonb
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,   -- e.g. { note, source_addon_no, notified_loop_entry_id }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON inventory_reservations (brand_id, item_id, warehouse_id, status);
CREATE INDEX ON inventory_reservations (brand_id, source_type, source_id);
CREATE INDEX ON inventory_reservations (brand_id, ro_id, status);
```

#### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `item_id / warehouse_id / stock_item_id` | typed + FK | 可用量計算、join、RLS 都要 |
| `reserved_qty / consumed_qty` | typed | 可用量公式核心、會被聚合 SUM |
| `source_type / source_id / ro_id` | typed | 反查「這張工單預留了什麼」、CROSS-03 通知要 join |
| `status` | typed + CHECK | 狀態機核心，禁丟 jsonb |
| `reserved_by / reserved_at / released_at / release_reason` | typed | 稽核、報表 |
| `note / source_addon_no / notified_loop_entry_id` 等 | **metadata jsonb** | 單頁顯示 / 變動中，符合「形狀還在變丟 jsonb」 |

### 2.3 狀態機

```
                   reserve()
                      │
                      ▼
                 ┌─────────┐
                 │ active  │  ← 進可用量扣減（available -= reserved_qty）
                 └─────────┘
                  │   │   │
       consume()  │   │   │ cancel()  （客戶取消追加 / addon rejected）
   （領料出庫，     │   │   └──────────► cancelled  （不再扣可用量）
    issue 對應 RO）│   │
                  │   │ release()  （補貨/調撥到貨後自動解除待料、或手動釋放）
                  │   └──────────────► released   （不再扣可用量；通知工單可施工）
                  ▼
              consumed   （已實際出庫，不再扣可用量；改由 issued 批次反映）
```

| 轉移 | 觸發點（對應 CROSS） | 副作用 |
|---|---|---|
| `→ active` | **CROSS-02 / SA-04**：addon `customer_decision='agreed'` 且 `addon_type` 含 parts | 寫 reservation row、可用量即時 −reserved_qty、寫 addon.reserved_at |
| `active → consumed` | 領料出庫（RO 施工實際領料、stock issue） | reservation 標 consumed、出庫批次 status→issued |
| `active → released` | **CROSS-03**：調撥到貨 / 補貨入庫，缺料補齊 | reservation 標 released、可用量回補、**通知工單可施工**（接 work-order loop） |
| `active → cancelled` | 客戶取消追加 / addon 改 rejected / deferred | reservation 標 cancelled、可用量回補 |

> ⚠️ `released` vs `consumed` 的語意差異：`released` = 預留**沒被用掉**就解除（取消或補貨後 reorganize）；`consumed` = 預留**真的領料出庫了**。兩者都「不再扣可用量」，但帳上意義不同（報表 / audit 要分得開）。

### 2.4 可用量公式變更（只描述，不實作）

**目標公式**：`available = on_hand − Σ(active reservations)`

兩種落地路線（對應拍板點 1）：

| 路線 | 怎麼做 | 侵入性 |
|---|---|---|
| **A（推薦，低侵入）** | reservation 維持獨立 ledger，**不改 `v_stock_balances`**。新增 `v_stock_available`（或在 `parts-balance.ts` 的 helper 內做第二次 query 聚合 active reservations 後相減），alert helper 可選擇是否扣 | view 不動、回滾容易；alert 是否扣預留可由開關控制 |
| **B（侵入既有）** | 改 `v_stock_balances`，新增 `qty_reserved_soft = Σ active inventory_reservations`，並讓 `qty_available_net = qty_available − qty_reserved_soft`；`parts-balance.ts` 的 `computeAlertLevel` 改吃 `qty_available_net` | 一步到位、語意最乾淨；但動到全站都吃的 view + alert 邏輯，風險高 |

**影響的既有 helper / view（描述，不在本輪改）**：
- `v_stock_balances`（view）— 路線 B 才動
- `src/domain/parts-balance.ts` — `getInventoryBalanceWithAlerts` / `computeAlertLevel` / `BalanceRow.qty_reserved`
- `src/domain/alerts.ts` — threshold 判斷讀的可用量
- `src/domain/parts-alert-work-order-loop.ts` — CROSS-03 解除後的通知接點

### 2.5 Domain Helper API（proposed `src/domain/inventory-reservations.ts`）

UI 永遠走 helper、**禁止直連 supabase**（天條）。proposed 簽名：

```ts
// src/domain/inventory-reservations.ts
export type ReservationStatus = 'active' | 'consumed' | 'released' | 'cancelled';
export type ReservationSourceType = 'repair_order_addon' | 'repair_order' | 'manual';

export type ReservationRow = {
  id: string;
  item_id: string; item_code: string; item_name: string;
  warehouse_id: string; stock_item_id: string | null;
  reserved_qty: number; consumed_qty: number;
  source_type: ReservationSourceType; source_id: string | null; ro_id: string | null;
  status: ReservationStatus;
  reserved_by: string | null; reserved_at: string; released_at: string | null;
  release_reason: string | null;
};

// 建立預留（CROSS-02 / SA-04）：addon agreed → reserve
export async function reserve(input: {
  item_id: string; warehouse_id: string; stock_item_id?: string | null;
  qty: number; source_type: ReservationSourceType; source_id: string; ro_id?: string;
}): Promise<ActionResult<{ id: string }>>;

// 解除預留（CROSS-03：補貨到貨 / 取消）→ 回補可用量 + 通知工單
export async function release(
  reservationId: string,
  reason: 'restock' | 'transfer_arrival' | 'cancelled_by_user'
): Promise<ActionResult<{ id: string }>>;

// 消耗預留（領料出庫）
export async function consume(
  reservationId: string,
  consumedQty?: number   // 不給 = 全數消耗
): Promise<ActionResult<{ id: string }>>;

// 取消預留（addon rejected / deferred）
export async function cancel(reservationId: string): Promise<ActionResult<{ id: string }>>;

// 反查：某工單預留了哪些零件（detail 頁 / 待料看板用）
export async function listByWorkOrder(roId: string): Promise<ReservationRow[]>;

// 反查：某 item × warehouse 的 active 預留總量（可用量公式 / alert 用）
export async function getReservedQty(itemId: string, warehouseId: string): Promise<number>;

// 算淨可用量（available − active reservations）
export async function getAvailableQty(itemId: string, warehouseId: string): Promise<number>;

// CROSS-03 核心：某 item 入庫後，找出在等這個零件的 active 預留（待料工單）
export async function listActiveReservationsAwaiting(
  itemId: string, warehouseId: string
): Promise<ReservationRow[]>;
```

**內部實作策略**：`reserve` / `release` / `consume` 跨多表 + 有副作用（改 stock_items / 寫 addon.reserved_at / 通知 loop）→ **Day 1 就走 RPC 或 server action**，不要 client-side 連寫多表（會 race condition）。`list*` / `get*` 純讀可直連 supabase（helper 內部）。

### 2.6 業務規則 — 用既有 `business_rules`（不自帶）

「預留 → 告警」的**階層 / 閾值規則**走既有 `business_rules` 表（架構 §3：量化規則 / workflow → business_rules）：

```jsonc
// rule_kind='inventory_reservation_alert'，config 例：
{
  "deduct_from_available": true,        // 可用量是否扣 active 預留（對應路線 A 的開關）
  "alert_when_reserved_exceeds_pct": 80,// 預留量 > 在手 80% 時升級告警
  "auto_release_on_restock": true,      // 補貨到貨是否自動解除待料預留（CROSS-03）
  "notify_work_order_loop": true        // 解除後是否通知 work-order loop
}
```

reservation 表本身**不放規則欄位**，只放交易事實。規則統一走 `src/domain/rules.ts` 的 `getApplicableRule('inventory_reservation_alert', scope)`。

### 2.7 RLS — `ENABLE RLS` + 4 條 policy（照抄既有 `stock_items` / `business_rules` 慣例）

> memory 教訓：新表 migration **必帶 RLS**，否則 Ming Indian 帳號全空畫面。`user_has_brand(brand_id)` 函式已存在（探查確認）。

```sql
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_reservations_select" ON inventory_reservations
  FOR SELECT USING (user_has_brand(brand_id));

CREATE POLICY "inventory_reservations_insert" ON inventory_reservations
  FOR INSERT WITH CHECK (user_has_brand(brand_id));

CREATE POLICY "inventory_reservations_update" ON inventory_reservations
  FOR UPDATE USING (user_has_brand(brand_id))
  WITH CHECK (user_has_brand(brand_id));

CREATE POLICY "inventory_reservations_delete" ON inventory_reservations
  FOR DELETE USING (user_has_brand(brand_id));
```

（既有 `stock_items` policy 名為 `brand_scoped_*`、`business_rules` 為 `business_rules_*`；新表沿用「表名_動作」格式即可，4 條缺一不可。）

### 2.8 會計事件分析

**無 — 純庫存可用量管理**。預留本身不動帳（不產生資金 / 收入 / COGS 變動），只是「保留」。真正動帳的是後續的**領料出庫**（issue → COGS）與**入庫**（receipt → 存貨增加），那些已由既有 stock_movements / 領料 / 進貨流程接會計事件，**不在本表職責**。reservation 是「可用量的軟性鎖」，不是會計交易。

### 2.9 idempotent seed 註記（CROSS 案例 fixture — 本 task 不 seed）

CROSS-02/03 跑 E2E 需要幾筆 active 預留 fixture（落地階段才造，一律 `brand_id='indian'`）：
- 1-2 筆 `status='active'`、`source_type='repair_order_addon'`、接到既有 Indian 的 `repair_order_addons`（agreed + parts）+ 對應 Indian 的 `items` / `warehouses`。
- 1 筆「缺料待補」情境：reserved_qty > 該 item 當前 `qty_available` → 觸發 below_safety alert + 進 work-order loop，供 CROSS-03 補貨解除驗證。
- seed 必 idempotent（`ON CONFLICT` 或先 `DELETE WHERE metadata->>'seed_tag'='cross-fixture'` 再 insert）。

---

## 3. 落地後驗證（Phase 5 用，僅規劃）

1. **CROSS-02**：對某 Indian addon（agreed + parts）呼叫 `reserve()` → `inventory_reservations` 多一筆 active → `getAvailableQty` 比在手少了 reserved_qty → 該 item 若跌破 safety/reorder，alert 看板出現告警。
2. **CROSS-03**：對「缺料待補」的 item 補貨入庫 → `listActiveReservationsAwaiting` 找到待料預留 → `release(..., 'restock')` → 可用量回補 → work-order loop 通知該工單可施工。
3. **狀態機**：active → consume（領料）/ release（補貨）/ cancel（rejected）各驗一次，可用量正確回補 / 扣減。
4. **雙 brand RLS**：Ducati 帳號看不到 Indian 的 reservation（反之亦然）。
5. **天條**：`grep -rn "@/lib/supabase" src/app/(workspace) src/components` 對新頁 0 hit。
6. `npx tsc --noEmit` / `npx eslint <touched>` 0 errors。

---

## ⚠️ 等待 Ming 拍板

1. **可用量公式落地路線（侵入性權衡）** — 路線 **A**（reservation 獨立 ledger，新增 `v_stock_available` / helper 層相減，alert 是否扣預留用開關控制，**不動既有 `v_stock_balances`**，風險低、可回滾）vs 路線 **B**（直接改 `v_stock_balances` 加 `qty_available_net`、`computeAlertLevel` 改吃淨值，一步到位但動全站共用 view + alert 邏輯）？**Phase 1 傾向 A**。

2. **預留掛哪一層** — 掛**批次層**（`stock_item_id` 必填，預留鎖到特定批次，FIFO / 序號 / 效期可控但綁死批次）vs **彙總層**（`stock_item_id=null`，只記 item × warehouse 預留 N 個，靈活但無法指定批次）vs **兩者皆可**（`stock_item_id` nullable，依場景填）？**草案設計成 nullable（兩者皆可），預設彙總層**，請拍板。

3. **source 接哪張表** — 已確認追加項目表 = **`repair_order_addons`**（`work_order_addons` 不存在）、工單主表 = `repair_orders`。`source_type` 列舉是否就鎖 `('repair_order_addon','repair_order','manual')`，還是要預留 `sales_order` / `stock_transfer` 等未來來源？

4. **既有半成品欄位的處置** — `stock_items.status='reserved'` + `reserved_for_doc_type/id`、`repair_order_addons.reserved_at/reserved_movement_id` 這些**留洞沒接的舊欄位**：是 (a) 廢棄不用、reservation 全走新表；(b) 新表 reserve 時**同步回寫** `addon.reserved_at`（保持 addon 自身可顯示「已預留」）；還是 (c) batch-level 整批預留仍用 status flag、partial 預留才用新表（雙軌）？**草案傾向 (b)：新表為 SSOT、reserve 副作用回寫 addon.reserved_at 供顯示**。

5. **CROSS-03 解除後的通知接點** — 接既有 `parts-alert-work-order-loop.ts` 的 work-order loop（`resolveWorkorderLoopEntryAction` 等），還是直接推 LINE 通知 SA / 技師？**草案傾向接既有 loop**，避免另造通知。

6. **預留 → 告警規則放 `business_rules`（rule_kind='inventory_reservation_alert'）還是先寫死在 helper** — POC 階段是否值得開 business_rules row，還是先在 `inventory-reservations.ts` 內寫死 `deduct_from_available=true`、之後要可調再 promote 到 business_rules？

7. **Indian 是否同步建** — 售後 / 進銷存模組目前以 Ducati 為主，但 Ming 測試帳號 scope 是 Indian、CROSS fixture 要塞 Indian。表本身雙 brand RLS 一定做；**問的是 nav 入口 / UI 頁是否雙 brand 都上**（reservation 多半是被動資料，可能沒有獨立 UI 頁，只在庫存看板 / 工單詳情顯示）？
