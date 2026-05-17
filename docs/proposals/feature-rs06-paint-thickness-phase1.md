# BDN #10 — RS06 漆膜厚度量化三態 chip

## 結構分析

### 現況（pre-BDN10）
- 檔案：`src/app/(workspace)/usedcar/evaluation/page.tsx`（1926 行單檔 wizard）
- 漆膜段：line 904-972「漆面量化記錄（漆膜測厚儀）」SectionCard
- 已有：
  - `PAINT_ZONES` 11 個測量點（前土除 / 前叉儀表 / 左右整流罩 / 油箱 / 尾段 / 排氣管護蓋）
  - μm 數值輸入欄（`paintUm` state）
  - 三態按鈕 ✓⚠✗（`paintState` state, 0/1/2）
  - `setPaintUmValue` 已有自動套狀態邏輯，但**門檻錯**：≤150 / ≤200 / >200（=legacy 原廠漆-補漆-重噴）
- 缺：**沒有可讀文字 chip**（「正常 / 注意 / 補漆」），目前只有 ✓⚠✗ 符號

### BDN #10 規格門檻（覆寫 legacy）
| μm 區間 | chip 文字 | 色票 |
|---|---|---|
| ≤ 80 | 正常 | `bg-[#EAF3DE] text-[#3B6D11]`（綠） |
| 80 < x ≤ 120 | 注意 | `bg-[#FDF3E3] text-[#854F0B]`（黃） |
| > 120 | 補漆 | `bg-[#FDECEA] text-[#CC0000]`（紅） |

## 架構提案

### 改動點（最小 diff）
1. **`setPaintUmValue` 門檻改 80 / 120**（line 461-463）— 0 對應 ≤80、1 對應 80-120、2 對應 >120
2. **SectionCard subtitle 改字**（line 908）— 從「原廠漆 80–150 μm · 補漆 150–200 μm · 重噴 ＞200 μm」改為「≤80μm 正常 · 80-120μm 注意 · >120μm 補漆」（subtitle 描述新門檻）
3. **「μm 說明」toast 文案同步改**（line 914）
4. **在 row layout 新增 chip 欄**：grid 從 `[1fr_72px_84px_1fr]` 改為 `[1fr_72px_84px_64px_1fr]`，插入「自動 chip」欄位於 ✓⚠✗ 按鈕後、備註前。chip 文字 = `["正常","注意","補漆"][paintState[idx]]`、無 μm 值或 state undefined 時顯示空 placeholder
5. **inline 渲染，不抽元件**（依任務指示）

### 不改的部分
- `PAINT_ZONES` 11 點清單照舊（spec 沒明列、現有 11 點合理涵蓋車體各部位）
- `paintState` / `paintUm` state shape 不變
- ✓⚠✗ 三態按鈕保留（user 可手動覆寫自動判定）
- 其他 RS06 tab、損傷點、骨架、機械、定價段一律不動

### State 流（單向）
```
user 輸入 μm → setPaintUmValue → 寫 paintUm + 自動套 paintState (依新門檻)
                                          ↓
                                  render chip（讀 paintState[idx]）
user 點 ✓⚠✗ → setPaintZone → 覆寫 paintState（手動 override）
```

## Phase 3 自動拍板
- 測量點數量：**11**（沿用現有 `PAINT_ZONES`）
- state 存哪：**React.useState**（沿用 `paintUm` / `paintState`）
- chip 是否抽元件：**inline**（依指示）
- 門檻採 BDN 規格（80/120）覆寫 legacy（150/200）— subtitle 同步改字避免誤導
