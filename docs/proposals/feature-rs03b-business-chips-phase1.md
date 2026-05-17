# RS03B 中古車庫存看板 — 三組業務 chip（BDN #13）

**日期**：2026-05-16
**範圍**：`src/app/(workspace)/sales/showroom/used-cars/_components/usedcar-inventory-board.tsx`
**目標**：庫存卡片加三組業務 chip — 動保塗銷、年審狀態、衍生業務推薦。

## 1. 結構分析

現況：
- Board 是 client component，資料源 `getUsedCarInventory()` → 靜態 `USED_CAR_INVENTORY_UNITS` 常數（11 筆 Ducati demo）。
- `UsedCarUnit` 已有 id / model / year / km / grade / status / daysInStock / vin / note / margin / cost / price / color。
- 沒有 DB 表（`used_car_inventory_units` 還沒落地）。
- 卡片渲染在 `CardGrid` 內、`<article>` 從 `colorHex` 漸層圖到「評估 / 報價」兩按鈕；目前 status chip 在右上、grade badge 在左上、margin chip 在價格下方。

## 2. 架構提案

### 資料來源（不開新 DB 欄位、走 typed-property + 靜態 demo）

維持 POC 紀律：本頁無 DB → 直接在 `UsedCarUnit` type 加 **optional** 業務欄位（不是 metadata jsonb，因為這檔是 TS const 不是 DB row）：

```ts
export type UsedCarUnit = {
  // 既有...
  // ── 新增（皆 optional，sentinel 由 UI fallback）──
  lienCleared?: boolean;                 // 動保塗銷：true=已清償 / false=未清償 / undefined=未知（不渲染）
  inspectionDueDate?: string;            // ISO date '2026-09-15' — 下次年審到期日
  recommendedServices?: BusinessTag[];   // 衍生業務 0..3 個
};

export type BusinessTag = "保險" | "配件升級" | "Track Day";
```

未來 DB 落地時：對應到 `used_car_inventory_units.lien_cleared` (bool) / `inspection_due_date` (date) / `metadata->>'recommended_services'` (jsonb array)。helper 不動、UI 不動。

### Chip 計算規則

| Chip | 條件 | 顯示 | 樣式 token |
|---|---|---|---|
| 動保塗銷 | `lienCleared === true` | 已清償 | `bg-[#EAF3DE] text-[#3B6D11]` |
|  | `lienCleared === false` | 未清償 | `bg-[#FDECEA] text-[#CC0000]` |
|  | `undefined` | 不渲染 | — |
| 年審 | `inspectionDueDate` 在 120 天內 | 4 個月內驗車 | `bg-[#FDF3E3] text-[#854F0B]` |
|  | `inspectionDueDate` 超過 120 天 | 正常 | `bg-[#F2F2F2] text-[#6B6A68]` |
|  | `undefined` | 不渲染 | — |
| 衍生業務 | `recommendedServices` 每個 tag | 保險 / 配件升級 / Track Day | `bg-[#EAF4FB] text-[#185FA5]` |

所有 chip 統一 `inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap`。

### 卡片版面

在 `note` 與按鈕列之間插入一個 chip 區塊 `<div className="flex flex-wrap gap-1 mb-2">`，順序：動保 → 年審 → 衍生業務（可多）。

ListView 因為已經一堆 column 不再加 chip 欄（避免擠壓），只在 CardGrid 加。如果使用者切到列表模式仍能看到 status / margin / 在庫天，業務 chip 是「銷售業務在卡片視角推銷時看的」。

### Demo 資料

11 筆 `USED_CAR_INVENTORY_UNITS` 內全部補上：
- 約半數 `lienCleared: true`、其餘 `false`（讓兩種狀態都能看到）
- 約 1/3 `inspectionDueDate` 在 120 天內、其餘較遠
- 約 2/3 配 1–3 個 `recommendedServices`、其餘空（讓「沒有業務推薦」case 也驗到）

### Brand SQL UPDATE

本頁無 DB → 不需要 SQL UPDATE，全部在 constants 檔展示。記錄在驗證階段。

## 3. 自動拍板項目（依任務指示）

✓ 沒有 DB 欄位 → 走常數檔 optional 屬性（等同 metadata 概念）
✓ 120 days 為「4 個月內驗車」閾值
✓ 推薦業務在 demo data 寫死、admin 編輯介面待後續輪次

## 4. 落地步驟

1. `sales-usedcar-inventory.constants.ts`：擴 `UsedCarUnit` type + 新增 `BusinessTag` type、補 11 筆 demo data 的三個欄位
2. `usedcar-inventory-board.tsx`：
   - 新增 helper `lienChip(u)` / `inspectionChip(u)` / `businessChips(u)`
   - 在 CardGrid 卡片內 note 與按鈕間插入 chip 列
3. Playwright headless verify：登入 → /sales/showroom/used-cars → 截圖三組 chip 都渲染

## 5. 驗證 checklist

- [ ] tsc / eslint 0 errors
- [ ] audit `@/lib/supabase` 在 (workspace)/components 內 0 hit
- [ ] Playwright 截圖在 /tmp/bdn13-*.png
- [ ] 至少能看到「已清償」「未清償」「4 個月內驗車」「正常」「保險」「配件升級」「Track Day」7 種 chip 字樣
