# Milestone v5 — 資料層連通示範 + 售後全流程 + POS 真接 ECPay

**日期**：2026-05-03
**版本標籤**：v5（Demo Data Layer + Aftersales Suite + POS Live Payments）
**前一里程碑**：v4 — 新功能開發區 + Ducati 售後完整工單套件（commit `995a670`）

---

## 一句話摘要

把 Russell 提供的 Excel 七張表抽成 14 個正規化 entity + 記憶體 store，
讓 Demo Dashboard 能跨「銷售漏斗 / PI 預檢 / RO 維修 / 增項回收（dropoff）」即時連動；
同時把售後全流程（PI → PDI → 工單 → 竣工複檢 → 增項管理）和手卡第 4 段結案頁補齊，
POS 模組從 mock 升級為真打 ECPay AIO/Invoice/Logistics 三大 API。

---

## 為什麼這版重要

過去三版（v2 ~ v4）的 demo 都是**逐頁孤島**：每頁是 Stitch faithful clone，
資料各自寫死在 component 裡，點擊 → 跳頁 → 進入下一個 mock，
**沒有任何跨頁的資料一致性**。

Russell 在 0428 給的 Excel 把整個經銷商業務串起來（從進廠到交車到回廠），
這版的核心目標就是把那份 Excel 翻譯成 schema，讓 demo 可以證明：

> 「同一筆客戶，從漏斗（lead）→ 諮詢卡 → 試駕 → 成交 → 進廠保養 → PI 預檢發現異常
> → 增項提案 → 客戶 D3/D10 回應 → 回廠成 RO → 竣工複檢 → 通知取車」
> 全程都是同一個 entity graph 在動，不是 7 個獨立 demo。

這是接 Supabase 的前置；schema 對齊後，把 reducer 換成 server action 就能上真資料庫。

---

## 變更內容

### 1. 資料層（src/lib/dealer-demo/）

從 Russell 的 Excel 七張表抽出來的 **normalized entity** + **client-side store**：

| 檔案 | 內容 |
|------|------|
| `schema.ts` | 14 個 entity：Employee / Customer / Vehicle / Lead / FunnelStat / RepairOrder / PIFinding / DropoffCase / 等。snake_case 欄位、id/created_at/updated_at — 設計成可以直接搬進 Supabase。 |
| `seed.ts` | 從 Russell 七張表抽出來的 demo 資料（員工、車款、客戶、漏斗、進廠 RO、PI findings、dropoff case），全部用 2026-04-28 為「今天」基準。 |
| `store.tsx` | React Context + useReducer 模擬資料庫；提供 `useDealerDB / useDropoffCases / useFunnelStats / usePIWithDetails` 等 hook；`reset()` 一鍵清回 seed。 |

**設計原則**：UI hook 的 signature 設計成跟未來 Supabase server action 同形，
之後接 DB 時只要把 reducer 內的 mutation 換成 server action 即可，**頁面不用改**。

### 2. 售後服務全流程頁面（src/app/(workspace)/service/）

5 個新頁 + 1 個 layout：

| 路徑 | 頁面 | 對應 Russell 流程 |
|------|------|------------------|
| `/service/pi/page.tsx` | 接待預檢（SA 環檢 + 技師診斷 + 安全等級分類） | 進廠 → 拆三層責任（SA / Tech / 客戶決策） |
| `/service/pdi/page.tsx` | PDI 新車交車前作業 | 交車前 124 點檢核 |
| `/service/dropoff/page.tsx` | 增項管理（D3 / D10 客戶聯絡追蹤） | 客戶當下不接受 → D3 電話追蹤 → D10 二次追蹤 → 回收成 RO 或標 lost |
| `/service/inspection/page.tsx` | 竣工複檢（QA 雙人簽核） | RO 完工前的把關 |
| `/service/workorders/page.tsx`（重大改寫，+808 行） | 維修工單詳情（多 tab + 多卡片區塊） | 工單核心畫面 |
| `/service/layout.tsx` | 售後 group 共用 layout（包 service-demo Provider） | — |

Service 模組另起 `src/lib/service-demo/context.tsx` 管理 SA/Tech/Customer-decision 三邊狀態，
跟 dealer-demo 並存：dealer-demo 是「資料庫快照」，service-demo 是「單張 RO 編輯中的 UI state」。

### 3. 手卡第 4 段：結案記錄

`src/app/(workspace)/sales/card/record/page.tsx`（新增）+ 既有三段（counter / consultant / closing）的微調，
組成完整 4 步驟動線：**前台登記 → 需求諮詢 → 試駕成交 → 結案記錄**。

新元件：
- `src/components/card-step-bar.tsx` — 4 步驟進度條，可點擊跳轉
- `src/components/signature-canvas.tsx` — 客戶簽名 canvas（mouse + touch 雙支援）

### 4. 銷售漏斗 Faithful Clone 升級

`/sales/funnel` 從 Stitch inline 升級為手寫 React，新增 **三視角切換**：
- **Reception（前台視角）** — 全店漏斗 + 各銷售貢獻
- **Manager（主管視角）** — 銷售排行 + 異常告警
- **Personal（個人視角）** — 我的客戶 / 我的待辦

支援 4 種日期範圍（今日 / 本週 / 本月 / 上月），mock 資料內建轉換率計算。

### 5. POS 模組：mock → 真接 ECPay

POS 從 v3 的 mock 升級為**真打綠界 API**（測試環境），三大模組：

| 路徑 | 功能 |
|------|------|
| `src/lib/pos/ecpay-aio.ts` | 全方位金流（信用卡 / ATM / 超商 / WebATM）— CMV-SHA256 |
| `src/lib/pos/ecpay-invoice.ts` | B2C 電子發票 — AES-JSON |
| `src/lib/pos/ecpay-logistics.ts` | 超商取貨物流 |
| `src/lib/pos/actions.ts` | `completeSale` server action — 一筆成交三件事原子完成（金流 → 發票 → 物流） |
| `src/app/api/pos/payment/{create,return,checkout/[tradeNo],status/[tradeNo]}` | 金流 callback / 重導 / 查詢 |
| `src/app/api/pos/logistics/{create,notify}` | 物流建單 / 狀態通知 |
| `src/components/pos/payment-wizard.tsx`（+525 行） | Wizard UI 改寫：useTransition pending state、QR code 顯示（react-qr-code）、loading 鎖 UI 符合 CLAUDE.md 規範 |

### 6. 模組註冊表（src/lib/modules.ts）

售後模組 pages 從 5 個擴增到 9 個（依 Russell 流程順序排列）：
預約看板 → 接待預檢 → PDI → 維修工單 → 技師派工 → 竣工複檢 → 增項管理 → 配件庫存 → 保固管理。

新功能開發區置頂加入 **Demo Dashboard（資料層連通）**，作為對 Russell 展示資料一致性的 entry point。

### 7. 文件（docs/）

| 檔案 | 用途 |
|------|------|
| `Ducati_Demo動線可行性評估_0428.md` | 給 Russell 的回函：AI 能不能做、走完全程還差什麼 |
| `EventStorming_facilitator稿_v1.md` | Ming 主持、Russell 出席的 2 小時 Event Storming workshop 流程稿 |
| `工作進度存檔0428_完整版.md` | 跨 session 的完整進度快照 |

---

## 檔案影響範圍

```
新增（25 files）
├── docs/
│   ├── Ducati_Demo動線可行性評估_0428.md
│   ├── EventStorming_facilitator稿_v1.md
│   └── 工作進度存檔0428_完整版.md
├── src/app/(workspace)/
│   ├── dev/demo-dashboard/page.tsx
│   ├── sales/card/record/page.tsx
│   └── service/
│       ├── layout.tsx
│       ├── dropoff/page.tsx
│       ├── inspection/page.tsx
│       ├── pdi/page.tsx
│       └── pi/page.tsx
├── src/app/api/pos/
│   ├── payment/{create,return,checkout/[tradeNo],status/[tradeNo]}/route.ts
│   └── logistics/{create,notify}/route.ts
├── src/components/
│   ├── card-step-bar.tsx
│   └── signature-canvas.tsx
└── src/lib/
    ├── dealer-demo/{schema.ts, seed.ts, store.tsx}
    ├── service-demo/context.tsx
    └── pos/{actions.ts, ecpay-aio.ts, ecpay-invoice.ts, ecpay-logistics.ts}

修改（8 files, +1781 / -219）
├── src/app/(workspace)/
│   ├── pos/page.tsx                       (+11 / -0)
│   ├── sales/card/{closing,consultant,counter}/page.tsx  （改用 CardStepBar）
│   ├── sales/funnel/page.tsx              (+443 / inline → faithful clone)
│   └── service/workorders/page.tsx        (+808 / 大改寫)
├── src/components/pos/payment-wizard.tsx  (+525 / 接真 ECPay)
└── src/lib/modules.ts                     (+23 / 售後 5 新頁 + Demo Dashboard)
```

---

## 已知未完成 / 下一步

1. **dealer-demo 的 store 還沒接 Supabase** — 目前是純 client-side useReducer，重新整理會回到 seed
2. **ECPay 是測試環境** — MerchantID 用的是綠界公開測試帳號，上線前要換 production 金鑰 + IP 白名單
3. **service/layout.tsx 包了 service-demo Provider，但 service-demo 跟 dealer-demo 還沒整合** — RO 編輯完不會回寫 dealer-demo 的 RepairOrder
4. **Faithful clone 進度**：售前 funnel 完成；維修工單擴充但還不算完整 clone；接待預檢 / PDI / 竣工複檢 / 增項管理是新建頁，沒有 Stitch 對應稿

下個迭代優先序：
- (a) 把 dealer-demo store 改成 Supabase server action（同 hook signature，頁面不改）
- (b) Event Storming workshop 跟 Russell 對齊 bounded context，再凍 schema baseline
- (c) `/service/appointments` 預約看板 faithful clone（目前還是 Stitch inline）
