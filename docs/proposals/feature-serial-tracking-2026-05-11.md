---
feature: 序列號 / 批號追蹤設定（Phase 2）
slug: serial-tracking
date: 2026-05-11
stage: 架構提案（待 Ming 拍板）
source: src/app/(workspace)/parts/setup/serial（既有 Phase 3.5 placeholder）
target_route: /parts/setup/serial
---

# 提案：序列號 / 批號追蹤設定（Phase 2）

## 1. 結構摘要

設定頁（Settings Page，兩張卡片並排，**不是** List + Detail 雙頁）：

- **左卡（追蹤規則設定）**：雙 brand × A/B/C 三類 = 6 筆 `business_rules` (rule_kind=`serial_tracking`) — 開放編輯 `required` / `by_category` / `label` / `description`，「儲存」整張一次寫
- **右卡（序列號查詢）**：輸入 serial_no → 顯示 (a) 目前狀態（warehouse / status / qty / last_movement_at）+ (b) 異動軌跡（從 `source_receipt_line_id` / `source_transfer_line_id` 反查）

整個 Phase 2 **零新表、零 schema 變更** — `stock_items` 已有 `serial_no` / `batch_no` / `source_*_line_id`，`business_rules` 已有 6 筆 seed。只擴 domain helper + UI。

## 2. Schema（不變更）

| 物件 | 動作 | 說明 |
|---|---|---|
| `business_rules` rule_kind=`serial_tracking` | 重用 | 雙 brand × 3 class 共 6 筆已 seed |
| `stock_items.serial_no` / `batch_no` | 重用 | 既有 nullable text |
| `stock_items.source_receipt_line_id` / `source_transfer_line_id` | 重用 | 反查軌跡 |
| `items.serial_tracking_required` / `batch_tracking_required` / `control_type` | **不連動** | 規則只是宣告層、不在儲存規則時 mass-update items（見 §9 Q1） |

### 欄位分類（typed vs jsonb）

`business_rules.config` 內保留現有 jsonb shape：

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `item_class` (A/B/C) | jsonb config | 規則自描述、非外鍵 |
| `required` boolean | jsonb config | 規則設定值 |
| `by_category` boolean | jsonb config | B 類用、依品類個別啟用 |
| `label` / `description` | jsonb config | 顯示文字、隨時可改 |
| `tone` | jsonb config | UI 顯示色票（red/amber/neutral） |
| `is_active` / `sort_order` | typed | 既有欄位 |

## 3. Domain Helper 規劃

### 3.1 擴 `src/domain/rules.ts`（左卡儲存）

```ts
export type SerialTrackingRuleInput = {
  id: string;                       // 既有 row，**不允許新增 / 刪除**（A/B/C 三類固定）
  config: SerialTrackingConfig;     // 整個 jsonb 蓋寫
  sort_order?: number;
};

export async function saveSerialTrackingRules(
  inputs: SerialTrackingRuleInput[],
): Promise<Result<{ saved: number }>>;
```

設計取捨：**只允許 UPDATE 既有 6 筆，不允許 INSERT / DELETE** — A/B/C 三類是 domain enum、不該由 UI 增刪。儲存時逐筆 update（跟 `count-rules` 同 pattern）。

### 3.2 擴 `src/domain/stock.ts`（右卡查詢）

```ts
export type SerialTraceEvent = {
  event_time: string;
  event_type: 'receipt' | 'transfer_out' | 'transfer_in' | 'adjust' | 'issue';
  doc_no: string | null;
  doc_kind: string;
  warehouse_name: string | null;
  status_after: string;
  qty: number;
};

export type SerialTraceResult = {
  found: true;
  serial_no: string;
  item: { id: string; code: string; name: string };
  current: {
    warehouse_id: string | null;
    warehouse_name: string | null;
    status: string;
    qty: number;
    last_movement_at: string;
  };
  history: SerialTraceEvent[];
} | { found: false; serial_no: string };

export async function querySerialNo(serialNo: string): Promise<SerialTraceResult>;
```

**Phase 2 軌跡簡化策略**（見 §9 Q2）：先用 `stock_items` 本身的 row 查當前狀態 + `source_receipt_line_id` / `source_transfer_line_id` 反查「最後一次從哪張單來」。完整時序 ledger 留 Phase 3 開 `stock_movements` 表。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 儲存追蹤規則 | revalidatePath `/parts/setup/serial` | 確定 |
| 儲存追蹤規則 | **連動更新 `items.serial_tracking_required`** | [需確認] §9 Q1 |
| 儲存追蹤規則 | 寫 audit log / 推 LINE | [需確認] §9 Q4（POC 預設不做） |
| 查詢序列號 | 唯讀、無副作用 | 確定 |

## 5. 頁面骨架（不變動結構，把 placeholder 換成可用元件）

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 序列號追蹤設定 | `/parts/setup/serial` | Setting Page（兩 card） | 參考 `parts/setup/count-rules/_components/count-rules-board.tsx`（同樣 Setting + 一次性 save） |

頁面內元件：

- `serial-board.tsx`（既有，改寫）— `"use client"` + `useTransition`、左卡 form state + 右卡查詢 state、Banner、儲存中鎖
- `serial-trace-panel.tsx`（**新**）— 右卡查詢結果區，輸入框 → 查詢 → 顯示 trace card（找不到 / 找到一筆 / 找到多筆同 serial 的處理）

## 6. nav_nodes（不動）

`/parts/setup/serial` 已是 react_route、雙 brand 都已建立、sidebar 入口已通。**不需要新增 nav_nodes**。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | `src/app/(workspace)/parts/setup/serial/page.tsx`（加 lookups + canEdit prop） |
| 改寫 | `src/app/(workspace)/parts/setup/serial/_components/serial-board.tsx`（從 readonly 改成 form + 查詢交互） |
| 新增 | `src/app/(workspace)/parts/setup/serial/_components/serial-trace-panel.tsx`（右卡查詢） |
| 擴充 | `src/domain/rules.ts`（加 `saveSerialTrackingRules`） |
| 擴充 | `src/domain/stock.ts`（加 `querySerialNo` + 反查 receipt/transfer line） |

## 8. Verification（落地完手測）

1. `/parts/setup/serial` 載入 200、左卡 3 row 顯示正確 label/description/checkbox 狀態
2. 改 B 類 `by_category` checkbox + 改 label 文字 → 按「儲存」→ banner 成功 → reload 後值持久化
3. A 類 `required` checkbox 預設 disabled（鎖死、見 §9 Q3）
4. 右卡輸入 `V4-PIST-001`（DB seed 有）→ 顯示 item 名稱 + 當前 warehouse + status=issued + last_movement_at + history 含 receipt 來源單
5. 右卡輸入不存在的 serial → 顯示 `found: false` 友善提示
6. 右卡空字串 → 「請輸入序列號」inline error、不打 server
7. 沒 `PARTS_SERIAL_RULE_EDIT` 權限的 user → 左卡儲存按鈕 disabled、右卡仍可查（VIEW 權限放）
8. `npx tsc --noEmit` + `npx eslint <touched>` 0 errors
9. Chrome MCP 跑 step 1-6 一次（screenshot 為證）

## 9. 開放問題（Stage 3 拍板）

### Q1. 儲存規則時要不要連動更新 `items.serial_tracking_required`？

**背景**：規則只是宣告「A 類強制、B 類部分品類、C 類不追蹤」，但 `items.serial_tracking_required` 才是入庫流程實際參考的 boolean。兩層分離有 drift 風險。

- **選項 A（推薦）**：不連動，POC 階段規則只當顯示層 / 文件層，items 自己維護（item detail page 編輯）。簡單、不會 batch update 千筆 row。
- **選項 B**：儲存規則時 mass-update items — A 類全 `true`、C 類全 `false`、B 類保持原值（by_category 邏輯）。一致性強但 batch 寫入大。

### Q2. 軌跡資料來源 — 即時拼還是開 ledger 表？

- **選項 A（推薦）**：Phase 2 用 `stock_items` row + `source_receipt_line_id` / `source_transfer_line_id` 反查最後幾筆來源單，**不開新表**。簡化但只能看「從哪來」、不能看完整 in/out 順序。
- **選項 B**：開 `stock_movements` 表，未來所有入庫/調撥/出庫 trigger 寫一筆。乾淨但 Phase 2 範圍會爆炸（要改既有 receipt / transfer flow）。
- **選項 C**：先回傳「目前狀態」單一卡片，history 留空白、Phase 3 再補。最保守。

### Q3. A 類 `required` checkbox 鎖死還是可改？

- **選項 A（推薦）**：A 類 disabled、不能解除 `required`（domain enum 概念、強制執行）。B/C 可改。
- **選項 B**：全部可改（admin 自由度高）。

### Q4. 規則修改要不要寫 audit log / 推 LINE？

- **選項 A（推薦）**：POC 不做、跟 `count-rules` 一致。
- **選項 B**：寫 audit log（新表）。
- **選項 C**：推 LINE 給管理員（用既有 notifications hub）。
