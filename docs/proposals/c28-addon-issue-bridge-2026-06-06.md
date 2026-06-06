# C-28 增項→備料→出庫閉環 — 架構缺口與提案（2026-06-06）

> 觸發：v3.0 §九 C-28（校準標 partial）。原 handoff 指引「在 issues.ts 掃 reservations 接 consume()」。
> 深查後發現：這不是「最後一哩接線」，而是一個**跨表橋接的架構決策**，需 Ming 拍板才動工。

## 現況事實（已查證）

| 環節 | 落點 | 狀態 |
|---|---|---|
| 增項決策 agreed | `repair_order_addons` → `repair_order_lines`（`tech-workstation.ts addAddon`）| ✅ |
| 庫存預留 | `inventory_reservations`（`source_type='repair_order_addon'`, `ro_id=repair_orders.id`）| ✅ |
| 缺料標待料 | `repair_orders.metadata.waiting_parts` + `parts_workorder_loop_entries`（hook #4）| ✅ |
| 補貨入庫解待料 | `releaseWaitingForItem`（C-29, commit b18b94e）| ✅ |
| **實體出庫扣帳 + consume 預留** | **無**（缺口）| ❌ |

## 為什麼不能照原指引直接做

1. **兩張表無 FK 橋接**：出庫流程（`issues.ts` / `stock_issues`）以 **`work_orders`**（欄位 `ro_no`）為核心；增項預留以 **`repair_orders`**（欄位 `ro_code`）為核心。兩表各自編號、**無任何連結欄位**。在 `issues.ts` 掃 `repair_order_addon` 預留時，**無法判斷哪些預留屬於正在出庫的 work_order**。
2. **實扣點未定**：`decideAddon` 註解寫「庫存實扣交給領料模組」，但領料模組（`pickForWorkOrder`）只認 `work_orders`，不認 aftersales `repair_orders` 的 addon。aftersales RO 的 addon 零件目前**根本沒有實體出庫的入口**。
3. **無可測對象**：目前 `inventory_reservations` 的 `repair_order_addon` 預留 = 0 active（10 cancelled）。

## 提案（三選一，建議 A）

### 方案 A（建議）：在 RO 結帳關單 consume，by `repair_orders.id`
- 在 `ro-checkout-actions.ts completeAction`（結案 by `repair_order_id`）的 `after()` 內：
  1. 撈該 RO 所有 `inventory_reservations`（`source_type='repair_order_addon'`, `status='active'`）
  2. 逐筆對應扣 `stock_items`（FIFO，沿用 `issues.ts` persistPick 的扣帳邏輯）+ 認列 COGS_ON_ISSUE
  3. `reservations.consume()`（active→consumed）
- **優點**：完全 by `ro_id`，不需碰 work_orders 橋接；結帳是「客戶付錢取車、零件確定消耗」的自然實扣點。
- **缺點**：`completeAction` 設的是 `已結案`（目前 0 筆走過此路徑，canonical 關單是 `已關單`）→ 需先確認 aftersales RO 實際走哪條關單。

### 方案 B：給 aftersales RO 一個獨立「領料/出庫」action
- 不依賴結帳，技師可在 RO 上對 addon 零件按「出庫」→ 扣 stock + consume 預留。
- **優點**：與結帳解耦、時點更貼維修現場。**缺點**：要新增 UI + action，工較大。

### 方案 C：建 work_orders ↔ repair_orders 橋接欄位
- 在其中一表加 FK，讓現有 `issues.ts` 出庫流程能順帶 consume addon 預留。
- **缺點**：兩個工單體系本就獨立（aftersales vs 一般維修），硬接 FK 是更大的架構轉向，不建議。

## 等待 Ming 拍板
1. aftersales RO 實際的關單動作走哪個 status（`已關單` via `updateRepairOrderStatusAction`？還是結帳 `已結案` via `completeAction`？）→ 決定方案 A 的掛載點。
2. 採 A / B / C 哪案。

確認後即可落地（預估方案 A ~1.5h，含扣帳 + consume + COGS + demo 驗證）。
