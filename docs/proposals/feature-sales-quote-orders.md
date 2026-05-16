# 提案：銷售報價單與成交訂單（RS04 v1）

> 來源：`docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS04_賞車報價與成交訂單_v1.html`
> 日期：2026-05-16
> 階段：架構提案（A13 工序，Ming 已授權「用最推薦預設、不要問」）

## 1. 結構摘要

RS04 v1 把「賞車報價 → 成交合約」一路接起來，原 HTML 用單頁三 tab 呈現：

- Tab 0：賞車報價單（新車 / 中古車兩種模式，**報價單格式共用**，成交後依車種產生對應合約書）
- Tab 1：新車訂購合約書（買受人 / 車輛 / 付款 / 特殊約定 / 簽名）
- Tab 2：中古車買賣切結合約書（買賣雙方 / 車輛資料 / 成交價過戶 / 現況切結 / 簽名）

本專案有兩個 route 要分擔這份規格：`/sales/quote` 與 `/sales/orders`。**最簡單做法**：

| Route | 對應規格 Tab | 工作 |
|---|---|---|
| `/sales/quote` | Tab 0 | 單頁報價單；右上 CTA「成交 → 建立合約書」push 到 `/sales/orders?type=new\|used` |
| `/sales/orders` | Tab 1 + Tab 2 | 4 步驟 step bar + 內部 sub-tab 切換新車/中古車合約書 |

## 2. Schema 草案

**本階段不接 DB、不動 schema**。所有資料用 mock + `useState`。

跨 route state 走兩條：

- `URL query string`：`/sales/orders?type=new` / `?type=used` 決定 orders 頁預設展示哪一份合約書
- `localStorage`（key = `sales-quote-snapshot:v1`）：報價單送出時寫入 `{ customerName, customerPhone, quoteNo, vehicleKind, model, totalAmount, expiresAt }`，orders 頁讀來在 step bar 上方顯示「來自報價單 Q-XXX」摘要 + 「← 返回報價單」連結

不需要 React Context，兩頁都是 `"use client"` + 各自 `useEffect` 同步 localStorage 就夠。

## 3. Domain Helper

**不建** — POC 階段 mock data，UI 直接 hardcode 車款 / 價格 / 客戶；沒有任何寫入 DB 的動作（送 LINE / PDF 匯出 / 儲存草稿都用 toast mock）。

未來接 DB 時的 helper 路徑預留：

```
src/domain/sales-quotes.ts
  - listQuotes(filter)
  - getQuoteById(id)
  - createQuote(input)
  - convertToOrder(quoteId, contractKind)
```

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 送出報價單 | toast「報價單已傳送 LINE 給客戶」（mock）| mock-only |
| 匯出 PDF | toast「報價單已匯出 PDF」（mock）| mock-only |
| 「成交 → 建立合約書」 | router.push `/sales/orders?type=...` + 寫 localStorage snapshot | 確定 |
| 「合約確認，進入交車作業」 | router.push `/sales/delivery`（既有頁） | 確定 |

## 5. 會計事件分析

無 — RS04 v1 是 mock-only UI/UX 落地，**不產生資金流 / 庫存變動 / GL 分錄**。
真正接 DB 後（未來 Phase），「成交建立訂單」會觸發 `VEHICLE_DEPOSIT_RECEIVED`（訂金沖 AR）+ 「交車」觸發 `VEHICLE_FINAL_PAYMENT`（尾款 + 出庫），那是 RS05 / RS06 的會計事件，不是本 A13 工序的範圍。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 賞車報價單 | `/sales/quote` | 單頁 Form | A11 testdrive `page.tsx`（SectionCard / Field / Grid / inputCls）|
| 成交訂單合約 | `/sales/orders` | Step bar + sub-tab | 同上、step bar 仿 A11 testdrive step bar |

兩頁共用 helper 元件：`SectionCard` / `Field` / `Grid` / `SecTitle` / `inputCls` / `btnPrimary|btnTeal|btnGhost|btnRed` —— **直接從 testdrive 拷貝同檔**，避免跨檔耦合。

### `/sales/quote` 結構

```
┌ Page Header（標題 + sprint chip「銷售 · RS04-v1-quote」+ 報價單號）
├ ClientBar（深藍橫條：客戶 / 報價單號 / 負責 RS / 有效期）
├ VehicleSwitch（🆕 新車報價 / 🔄 中古車報價）
│   └─ 中古車模式下展開：VIN / 里程 / 出廠年份 / 認證等級 panel
├ SectionCard「車款選擇」
│   └─ 6 張 car-card grid（Panigale V4 / Streetfighter / Monster SP …）
├ SectionCard「報價明細」
│   └─ 表格：類別 (車輛/贈品/配件/保險/辦牌/優惠) × 項目 / 備註 / 定價 / 報價（可編輯 input）/ 移除
│   └─ Toolbar：[＋ 新增項目]（modal）/ [📄 匯出]
├ TotalBar（深藍卡：車輛定價 / 附加費用 / 優惠折讓 / 客戶實付總額）
│   └─ 動作：[📲 傳送客戶] / [成交 → 建立合約書（紅）]
└ Toast / AddItemModal
```

### `/sales/orders` 結構

```
┌ Page Header（標題 + sprint chip「銷售 · RS04-v1-orders」+ 合約編號）
├ QuoteSnapshotBanner（讀 localStorage：來自報價單 Q-XXX · 客戶 · 車款 · 總額）
├ StepBar（4 步驟：① 報價完成 ✓ → ② 訂購合約（當前）→ ③ 客戶簽名 → ④ 交車作業）
├ ContractSubTabs（📋 新車訂購合約書 / 📜 中古車買賣切結合約書）
│   └─ 依 URL `?type=new|used` 預設選哪個；點 tab 切換 + 改 URL
├ NewCarContractPane（當 type=new）
│   ├ SectionCard「DUCATI 新車訂購合約書 PO-XXX」
│   │   ├ 一、買受人資料（4 fields + 戶籍地址全寬）
│   │   ├ 二、車輛資料（車款 readonly / 顏色 / VIN / 引擎號碼）
│   │   ├ 三、付款方式（4 顆 pay-card：現金 / 刷卡 / 銀行貸款 / 分期）+ 訂金 / 交車日
│   │   ├ 四、特殊約定（textarea + 法條 block）
│   │   └ 簽名 3 欄（買受人 / RS / 經銷商授權代表）
│   └─ 動作：[← 返回報價單] / [✅ 合約確認，進入交車作業]
├ UsedCarContractPane（當 type=used）
│   ├ DisclaimerBox「中古車買賣重要告知（黃底）」
│   ├ SectionCard「大型重型機車買賣切結合約書 UA-XXX」
│   │   ├ 一、買賣雙方（甲方 readonly / 乙方 + 身分證 / 電話 / 地址）
│   │   ├ 二、車輛資料（廠牌車款 / 出廠年份 / 車牌 / 排氣量 / VIN / 引擎號碼 / 里程 / 認證等級）
│   │   ├ 三、成交價格與過戶（成交價 / 訂金 / 尾款交付 / 過戶辦理）
│   │   └ 四、車輛現況與買受人切結（textarea + 紅底切結聲明）
│   └─ 動作：[← 返回報價單] / [✅ 合約確認，安排過戶與交車]
└ Toast
```

## 7. nav_nodes

**不動** — `/sales/quote` 與 `/sales/orders` 兩個入口在 sidebar 已存在（既有 `static_html` 模式），本工序只升級兩個 page.tsx 內容、不改 nav_nodes（task 指令明文「不動 nav_nodes」）。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | `src/app/(workspace)/sales/quote/page.tsx` |
| 改寫 | `src/app/(workspace)/sales/orders/page.tsx` |
| 新增 | `scripts/verify-sales-quote-orders.mjs` |
| 不動 | `src/app/(workspace)/sales/testdrive/page.tsx`（既有「立即開立報價單」按鈕已連 `/sales/quote`）|
| 不動 | `src/app/(workspace)/sales/sc-app/page.tsx`（既有 closing 流程已連 quote）|

## 9. Verification

1. `/sales/quote` status=200、sprint chip = `銷售 · RS04-v1-quote`
2. `/sales/orders` status=200、sprint chip = `銷售 · RS04-v1-orders`
3. quote 頁切換新車 ↔ 中古車：中古車 panel 展開 / 收合
4. quote 頁點車款卡片：選中狀態切換正確
5. quote 頁編輯報價 input：總額（客戶實付）動態更新
6. quote 頁刪除一行明細：總額對應扣掉
7. quote 頁「新增項目」modal：填名稱 + 報價 → 新行落入表格
8. quote 頁「成交 → 建立合約書」：router.push 到 `/sales/orders?type=new`，URL 帶上參數
9. orders 頁讀 URL `?type=used` → 自動切到中古車合約書 sub-tab
10. orders 頁讀 localStorage snapshot：顯示「來自報價單 Q-XXX」摘要
11. orders 頁切換新車 / 中古車 sub-tab：對應 pane 顯示 + URL 更新
12. orders 頁「合約確認」按鈕：router.push `/sales/delivery`
13. tsc / eslint 0
14. `grep -rn "@/lib/supabase" src/app/\(workspace\)/sales/quote src/app/\(workspace\)/sales/orders` = 0 hit

## 10. 開放問題

Ming 已授權「用最推薦預設、不要問」—— 全部用以下預設：

- ✅ mock-only、不接 DB
- ✅ 兩 route 共用 helper 元件、各自拷貝同檔（不抽 shared module，避免本工序就引入跨檔耦合）
- ✅ 跨 route state 用 URL + localStorage（不開 Context）
- ✅ 客戶/車款/價格用 hardcode demo（Panigale V4 / Streetfighter V4 等 6 款）
- ✅ Indian brand 不影響 — 本頁不撈 DB、無 brand scope 問題
- ✅ Sprint chip 用 `銷售 · RS04-v1-quote` / `銷售 · RS04-v1-orders`，不放 ★ 點
