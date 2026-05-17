# Feature Proposal — RS06 中古車評估鑑價：OCR VIN / 引擎號一致性驗證提示

> Phase 1 結構分析（BDN #12 第三輪 · 2026-05-16）

## 1. 目標

在 `/usedcar/evaluation` 的「📋 基本資料 & 證件掃描」tab 加入：
- 對「行照（OCR 模擬）」識別出的 VIN / 引擎號與基本資料區手填的 VIN / 引擎號做**純前端字串比對**
- 不一致 → 緊貼證件掃描段下方顯示 amber banner「⚠️ 行照上 VIN 與證件掃描不符，請核對」
- 任一邊空值 → 不提示（避免雜訊）
- 一致 → 不顯示 banner（保持乾淨）

OCR 後端真接通在後續輪次；目前在 demo 階段，每個證件掃描格子可選擇性點「[Demo: 自動填入]」按鈕灌入假 VIN / 引擎號做演示。

## 2. 現況解析

| 元素 | 位置 | 備註 |
|------|------|------|
| 基本資料 VIN input | `page.tsx:583-590` | state `vin` / `setVin` |
| 基本資料引擎號 input | `page.tsx:591-598` | state `engineNo` / `setEngineNo` |
| 證件掃描 8 格 | `page.tsx:725-758` | `SCAN_DOCS` 含 id=0 行照、id=6 VIN 特寫 |
| 證件掃描狀態 | `scanned[]`, `scanDates{}` | 無 OCR 結果欄位 |
| 操作說明 banner | `page.tsx:694-697` | 既有 amber 提示 |

目前掃描格按下只 toggle 已掃描狀態 + 日期，**沒有 OCR 結果概念**。

## 3. 改動範圍（最小化）

- ✅ 新增 state：`ocrVin` (行照 OCR 出來的 VIN)、`ocrEngineNo`（行照 OCR 出來的引擎號）
- ✅ 新增 demo 觸發：在「行照正本」(id=0) 與「VIN 車身號碼特寫」(id=6) 的 button 上掛右下角小 chip「Demo OCR」，按下灌入假值
- ✅ 新增 useMemo 比對函式：normalize(s) = `s.toUpperCase().replace(/[\s\-_]/g, '')`
- ✅ 新增 banner（amber, `bg-[#FDF3E3] text-[#854F0B] border-[#F0C97E]`）緊貼證件掃描 grid 下方、跨欄
- ❌ 不動既有 8 格 UI / `doScan` 邏輯 / 其他 tab
- ❌ 不接真 OCR API
- ❌ 不動 schema、不存 DB

## 4. 比對演算法（Phase 3 自動拍板）

```ts
const normalize = (s: string) => s.toUpperCase().replace(/[\s\-_]/g, "");
const vinMismatch = vin && ocrVin && normalize(vin) !== normalize(ocrVin);
const engineMismatch = engineNo && ocrEngineNo && normalize(engineNo) !== normalize(ocrEngineNo);
```

只有「兩邊都填 + normalize 後不等」才標 mismatch。空值/部分空都安靜。

## 5. Banner 樣式（拍板）

緊貼 `掃描存檔 grid` 下方、過戶前必要查詢上方。`mt-3 px-3.5 py-2.5 rounded-md border` + amber token；title `⚠️ 行照識別結果與基本資料不一致` + 兩行 detail（VIN / 引擎號各一行，顯示「行照 OCR：X」與「基本資料：Y」）。

兩個欄位獨立判斷 → banner 內可能只列其中一行。

## 6. 驗證

- typecheck / eslint / audit 0
- Playwright headless 三場景：
  - A: 兩邊一致 → 沒 banner
  - B: 不一致 → banner 出現
  - C: 清空一邊 → banner 消失
