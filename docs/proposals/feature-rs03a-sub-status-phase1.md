# RS03A 新車庫存看板 — 進貨 sub-status chip（BDN #18）

**日期**：2026-05-16
**範圍**：`src/app/(workspace)/sales/showroom/new-cars/_components/newcar-inventory-board.tsx`、`src/domain/sales-newcar-inventory.constants.ts`
**目標**：庫存卡片加進貨 sub-status chip（在庫 / 在途 / 預估到貨 / 已配車），讓銷售第一眼能看出「這台車現在到底在哪裡、被誰預定」。

## 1. 結構分析

- Board 是 client component，資料源 `getNewCarInventory()` → 靜態 `NEW_CAR_INVENTORY_UNITS`（16 筆 Ducati demo）。
- `NewCarUnit` 已有 id / model / status（"現車可售" | "已保留" | "訂車中" | "已售出"）/ vin / arrived / days / note。
- 現況 status chip 已有，但 spec status（業務狀態）跟 sub-status（物流狀態）是不同切面：例如「現車可售」可能還在「在途」，「已保留」也可能尚未到貨。
- 沒有 DB（`new_car_inventory_units` 未落地）。

## 2. 架構提案

### 資料來源（typed optional，不開 jsonb）

未來轉 DB 時這幾個欄位都是 typed column（會被 query / index），所以直接擴 `NewCarUnit`：

```ts
export type NewCarSubStatusKind = "in_stock" | "in_transit" | "eta" | "assigned";

export type NewCarSubStatus =
  | { kind: "in_stock" }                          // 在庫
  | { kind: "in_transit" }                        // 在途（無確切 ETA）
  | { kind: "eta"; etaDate: string }              // 預估到貨 YYYY-MM-DD
  | { kind: "assigned"; rsName: string };         // 已配車（RS 名）

export type NewCarUnit = {
  // 既有...
  subStatus?: NewCarSubStatus;                     // 缺值 → fallback 推導（見下）
};
```

未來 DB 落地對映：`new_car_inventory_units.transit_status`(text) + `eta_date`(date) + `assigned_rs_id`(uuid join staff)。Helper 把 row 組裝成 discriminated union 給 UI，UI 不動。

### Sub-status 推導優先序

讀 `subStatus` 顯式值優先；缺值時用既有欄位 fallback：

```ts
function deriveSubStatus(u: NewCarUnit): NewCarSubStatus {
  if (u.subStatus) return u.subStatus;
  // fallback：status='訂車中' 且 arrived 帶「預計」→ in_transit（spec 沒給 ETA date，純文字標 fallback 用）
  if (u.status === "訂車中") return { kind: "in_transit" };
  // 其餘有 VIN 視為在庫
  return { kind: "in_stock" };
}
```

### Chip 樣式

| kind | 文字 | 樣式 token |
|---|---|---|
| `in_stock` | 在庫 | `bg-[#EAF3DE] text-[#3B6D11]` |
| `in_transit` | 在途 | `bg-[#EAF4FB] text-[#185FA5]` |
| `eta` | 預估到貨 YYYY-MM-DD | `bg-[#FDF3E3] text-[#854F0B]` |
| `assigned` | 已配車（{rsName}） | `bg-[#EEE5F7] text-[#5B2D8C]` |

統一 `inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap`。

### 渲染位置

- **CardGrid**：在現有 status chip 下方加一行（卡片內容區頂端、`u.model` 上方右側、用 absolute 不適合擠，所以放在卡片內容區開頭，與 model 同列右側）。具體：把 sub-status chip 放在卡片下半部「在庫天數」旁，作為新一行 KV 之上的 chip row。
- **ListView**：新增一欄「進貨」介於「狀態」與「操作」之間。

### Demo 資料補強

擴 16 筆中的代表性樣本：
- 1 筆 `assigned`（已配車給 RS 王志強）
- 2 筆 `eta`（預估到貨 2026-06-15 / 2026-07-01）
- 2 筆 `in_transit`（無 ETA）
- 其餘走 fallback in_stock

## 3. 落地檔案

- `src/domain/sales-newcar-inventory.constants.ts`：加 type `NewCarSubStatusKind` / `NewCarSubStatus`、`NewCarUnit.subStatus?`、補 demo
- `src/app/(workspace)/sales/showroom/new-cars/_components/newcar-inventory-board.tsx`：
  - 加 `SUB_STATUS_CHIP` map + `deriveSubStatus()` + `renderSubStatusChip()`
  - CardGrid 卡片內加 chip row
  - ListView 加「進貨」欄

## 4. 不做

- 不開 DB schema
- 不抽公用 chip 元件（inline render）
- 不改現有 status chip / KPI / 篩選器
