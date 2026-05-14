# 提案：報價簽訂（RS04 賞車報價與成交訂單）— Stitch 6583d22b 落地

> 來源：Stitch URL `http://43.153.159.135:3000/n/6583d22b-dccd-4ee2-88a4-368c1a7f6883`
> nav_node：Indian `6583d22b-dccd-4ee2-88a4-368c1a7f6883`（static_html，html_storage_path=`indian/6583d22b-...body.html`）
> 日期：2026-05-14
> 階段：架構提案（自決拍板）
> 批次：銷售模組導覽 12/14

## 1. 結構摘要

RS04 賞車報價與成交訂單—**重型工作流頁面**。3 個主 tab：

1. **賞車報價單**：客戶帶（客戶 / 報價單號 / RS / 有效期）→ 新車/中古車切換 → 車款選擇（6 款 grid 卡）→ 報價明細表（車輛本體 / 贈品 / 選配 / 保險 / 辦牌 / 優惠 6 段）→ 總計列 → 送客戶 / 成交 CTA
2. **新車訂購合約書（PO）**：買受人資料、車輛資料、付款方式（4 種）、訂金、特殊約定、買賣雙方簽名欄
3. **中古車買賣切結合約書（UA）**：買賣雙方、車輛資料（含 VIN/引擎號/里程）、成交價 + 過戶辦理、車輛現況切結

整頁 inline `<script>` 自我封裝，client-side state。**非** List View / Page View design pattern 範疇。

## 2. 路由與架構決策

### 現況盤點

| brand | nav_node id | page_kind | href | 渲染來源 |
|---|---|---|---|---|
| indian | `6583d22b-dccd-4ee2-88a4-368c1a7f6883` | **static_html** | NULL | iframe `indian/6583d22b-...body.html` |
| - | （無對應 Ducati 節點） | - | - | - |

且既有 `/sales/quote` route 目前指向舊 stitch `f2f2139ca6274ad9bb4fa4d9ec0fb775`（標題「接待報價單」，被 `src/app/(workspace)/sales/sc-app/page.tsx` 引用）。

### 決策（自決拍板）

採方案 **A：升級 `/sales/quote` 指向 v2 HTML、Indian static_html 切 react_route**。

1. 把 v2 HTML 寫進 `public/stitch/6583d22b-dccd-4ee2-88a4-368c1a7f6883.body.html`
2. 改 `src/app/(workspace)/sales/quote/page.tsx` 改載 `6583d22b-...`、title 改「報價簽訂」、breadcrumb 改「銷售管理 › 報價簽訂」
3. UPDATE Indian static_html 節點 `6583d22b...` → `page_kind='react_route'`、`href='/sales/quote'`、`html_storage_path` 留歷史檔
4. Ducati 不動（沒有對應節點，本批次 scope 只處理 Indian）
5. 保留舊 `public/stitch/f2f2139ca6274ad9bb4fa4d9ec0fb775.body.html` 不刪（`sc-app/page.tsx` 還在 reference，避免 collateral damage）

**為什麼不全 React 化**：3 tab + 6 卡車款選擇 + 6 段報價明細表 + 兩種合約書 + 簽名/列印 PDF + 計價邏輯。schema 大概要 `quotations` + `quotation_items` + `sales_contracts` + `contract_signatures` 至少 4 張表，且要整合 customers / customer_vehicles / inventory_items / sales_orders / 會計事件（訂金收款 → AR）。本批次目標是「14 張導覽性置入」、不適合在這張單把規模放大。先讓設計稿可預覽、入口正確，下次衝刺再做正式 design pattern 化。

## 3. Domain Helper 規劃

**無**。純 Stitch HTML 渲染、無 DB 讀寫、不接 supabase。

未來做完整 React 化時才會建：
- `src/domain/sales-quote.ts` — `listQuotations` / `getQuotationById` / `createQuotation` / `addQuotationItem` / `convertQuotationToContract` 等
- `src/domain/sales-contract.ts` — `createContract` / `signContract` / `exportContractPdf` 等

## 4. 副作用清單

無（本次無 DB / 無業務 action）。

## 5. 會計事件分析（MANDATORY）

**本功能無會計事件** — Stitch 預覽頁、不寫入任何業務資料。

未來完整 React 化、`quotations` / `sales_contracts` 成立 + 業務動作「成交簽約」、「收訂金」時才會產生：
- 🆕 `VEHICLE_DEPOSIT_RECEIPT`（收訂金）— 借「銀行/現金」/ 貸「預收訂金（負債）」
- 🆕 `VEHICLE_SALE_BOOKING`（成交開立合約）— 借「應收帳款」/ 貸「車輛銷貨收入」+ 沖「預收訂金」
- 🆕 `VEHICLE_FINAL_PAYMENT`（交車尾款）— 對應「交車流程」(#13)，本張不負責

本批次不在 scope。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 報價簽訂 | `/sales/quote` | StitchInline 渲染 | 沿用 `<StitchInline>` |

## 7. nav_nodes 動作

```sql
-- Indian static_html → react_route，併到 /sales/quote
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/quote'
 WHERE id = '6583d22b-dccd-4ee2-88a4-368c1a7f6883';
-- html_storage_path 保留當歷史檔
```

Ducati 無對應節點，本次不新增（本批次 scope 只負責 Indian 14 張節點）。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `public/stitch/6583d22b-dccd-4ee2-88a4-368c1a7f6883.body.html`（v2 HTML） |
| 修改 | `src/app/(workspace)/sales/quote/page.tsx`（screenId / title / breadcrumb） |
| DB UPDATE | `nav_nodes` 1 row（Indian static_html → react_route） |

## 9. Verification

1. tsc / eslint 0 errors
2. `grep -rn "@/lib/supabase" src/app/(workspace)/sales/quote` = 0 hit
3. Indian sidebar 看到「報價簽訂」chip 從 HTML 變 REACT
4. 點「報價簽訂」進到 `/sales/quote`、看到 v2 頁面（3 tabs / 6 車款卡 / 報價明細表 / 兩種合約書）
5. 切 3 個 tab 都能正常顯示、客戶切換新車↔中古車能切、車款卡 hover 換色
6. Playwright CLI 截圖 OK

## 10. 開放問題

無 — 全部用最預設最佳建議自決：
- 路徑：沿用 `/sales/quote`（既有 react route 升級，不開新路徑）
- v2 取代 v1 在 `/sales/quote`：是
- 全 React 化：否（規模太大、不在 14 張批次 scope）
- 留舊 `f2f2139ca6...` HTML 檔：是（`sc-app` 還引用）
- Ducati 對應節點：不新增（無父節點 placement）
