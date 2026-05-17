# RS03B 中古車庫存看板 — 低毛利警示（BDN #19）

## 目標

毛利率 ≤5% 的中古車庫存單位整行 / 整卡視覺警示，避免 sales 不小心把虧本車當作正常 deal 報。

## 規格決議

| 項目 | 決策 | 依據 |
|------|------|------|
| 閾值 | margin rate ≤ 5% | BDN #19 明確 |
| Card 視圖 | 整卡 `bg-[#FEF7E6]`（淺 amber） | 規格 |
| List 視圖 | 整行 `<tr>` `bg-[#FEF7E6]` | 規格（卡片 / 列表雙視圖都要） |
| 警示 chip | `bg-[#FDECEA] text-[#CC0000]` 「⚠️ 低毛利」、放在毛利欄位旁 | 規格 |
| null / 未填毛利 | 不警示 | 規格（避免雜訊） |
| 公式 | reuse 既有 `marginRate(margin, price)`、price <= 0 回 0 但不視為低毛利 | 已存在 |

## 落地點

`src/app/(workspace)/sales/showroom/used-cars/_components/usedcar-inventory-board.tsx`

新增 helper：

```ts
function isLowMargin(margin: number, price: number): boolean {
  if (price <= 0) return false;  // 未填價無法判定、不警示
  const rate = (margin / price) * 100;
  return rate <= 5;
}
```

### CardGrid

```tsx
const lowMargin = isLowMargin(u.margin, u.price);
<article
  className={
    "bg-white border border-[#EEECE6] rounded-lg overflow-hidden hover:border-[#85B7EB] hover:shadow-md transition cursor-pointer " +
    (lowMargin ? "bg-[#FEF7E6]" : "")
  }
>
```

毛利 chip 旁邊加：

```tsx
{lowMargin && (
  <span className="ml-1 text-[10.5px] px-1.5 py-0.5 rounded font-semibold bg-[#FDECEA] text-[#CC0000]"
        data-testid={`chip-low-margin-${u.id}`}>
    ⚠️ 低毛利
  </span>
)}
```

### ListView

```tsx
<tr className={
  "hover:bg-[#FAFAF8] border-b border-[#F4F3F0] last:border-b-0 " +
  (lowMargin ? "bg-[#FEF7E6]" : "")
}>
```

毛利欄位內：rate chip 旁邊加上同樣的 `⚠️` chip。

## Demo 資料補充

在 `src/domain/sales-usedcar-inventory.constants.ts` 加 2 筆 ≤5% 毛利：

- U012: Scrambler Icon, cost 295000, price 308000, margin 12000 → 3.9%（低毛利）
- U013: Monster 937, cost 380000, price 392000, margin 15000 → 3.8%（低毛利）

並更新 KPI `available` 從 6 → 8（兩筆都是「在庫可售」）。

## 驗證

- tsc / eslint 0 errors
- audit grep `@/lib/supabase` in workspace = 0
- Playwright headless：登入 → /sales/showroom/used-cars → 切 card / list 模式 → 各截一張
- 確認 U012/U013 卡片 amber 底色、紅 chip「⚠️ 低毛利」顯示
- 確認 U001 等正常車仍是白底、無警示 chip

## 不影響

- BDN #13 的 LienChip / InspectionChip / BusinessChips 完全不動
- 既有 `marginChipClass` 顏色分級不動（< 8% 仍紅色 chip）
- schema 不動、server action 不動
