# DealerOS 導航缺口對照表（Indian）

**產出日期**：2026-05-28
**比對基準**：`src/app/(workspace)` 全部 287 條可導航 leaf route（已排除 `[id]` 動態頁與 `/new` 建立頁） ⇄ Supabase `nav_nodes`（Indian brand 全部 href）
**判定方式**：每條 route 由腳本掃描 page.tsx + `_components`，依特徵分級 —— `StitchInline/dangerouslySetInnerHTML`＝C 殼、`mock-/demo-banner`＝B 假料、`@/domain` 或 `@/lib/<業務>`＝A 真 DB、`redirect()`＝別名。

---

## 一、核心結論

側邊欄是讀 `nav_nodes` 這張表渲染的（天條：DB 是 single source of truth），**不是**掃 route 自動生成。所以「程式寫好、能跑、有真資料」≠「側欄點得到」。一條頁面要在側欄出現，必須 `nav_nodes` 有登記、`is_active=true`、且**父鏈每一層都 active**。

把 287 條 route 全比一輪，分三種狀態：

| 狀態 | 意義 | route 數 |
|---|---|---|
| ✅ 已登記 + active | 側欄正常顯示 | 約 150 |
| 🔴 已登記但 `is_active=false` | 寫好了卻在側欄隱藏 | 79 |
| ⚫ `nav_nodes` 完全沒登記 | 側欄無入口 | 50 |

**最關鍵的發現是「交車服務」**：整個 level-1 模組 + 6 頁都接真 DB（`deliveries` 表 31 筆真資料）、程式完工，卻整條 `is_active=false` 被關掉 → 側欄完全看不到。**本次已處理**（見 §四）。其餘隱藏頁多數是「關得對」（Stitch 殼 / mock / 舊頁），少數同樣是「做完卻被誤關」，列在 §二. A。

---

## 二、🔴 已登記但 is_active=false（寫好了、側欄隱藏中）

### A. 做完、接真 DB、卻被關 —— 已處理

> ⚠️ **兩種病要分清楚**：交車服務是「乾淨案例」（模組還在、無 active 替身、只是開關被關，一翻就回來）。通知後台 / 訂單中心 / 中古潛客則**掛在已退役的舊模組樹**（中古交易 / 簽核管理 / 銷售管理，`is_active=false` 且 `active_children=0`）底下，**不能直接翻父開關**（會把整棵殭屍樹含 Stitch 殼兄弟一起拉回側欄），必須 **re-home 搬到 active 模組**再開。

| 路由 | 名稱 | 分級 | 本次處理 |
|---|---|---|---|
| `/delivery/*`（6 頁） | 交車服務模組 | A 真 DB | ✅ **已開**（Indian 7 節點翻 true，模組原位即可） |
| `/admin/notifications`（+4 子頁） | 通知中樞後台 | A 真 DB | ✅ **已 re-home + 開**：搬到 active「組織與權限」群，保留 admin-only |
| `/sales/orders` | 訂單中心 | A 真 DB（123 筆） | ✅ **已 re-home + 開**：搬到 active「展廳接待」，緊接報價簽訂 |
| `/usedcar/prospects` | 中古車潛客跟進 | A 真 DB | ✅ **已 re-home + 開**：搬到 active「展廳接待」 |
| `/usedcar/stock` | 中古車庫存 | A 真 DB | ❌ **不開**：active `/sales/showroom/used-cars` 已是「中古車庫存」，純重複 |
| `/admin/approvals/order` | 訂單簽核 | A 真 DB | ⏸ 暫不動：連同簽核模組整體規劃再開（家族其餘是殼） |
| `/admin/approvals/tradein` | 收車簽核 | A 真 DB | ⏸ 同上 |

### B. Stitch 殼 / mock 假料 —— 沒做完，留著關是對的

| 路由群 | 名稱 | 分級 |
|---|---|---|
| `/admin/approval-flow`、`/admin/approvals`、`/admin/approvals/{discount,history,refund,transfer}` | 簽核流程 / 我的簽核 / 折扣·簽核歷史·退款·調車簽核 | C 殼 |
| `/group/{briefing,dashboard,dashboard-mobile,group-overview,reports,sales-target}` | 集團管理 6 頁 | C 殼 |
| `/csi/referrals` | 再購 / 轉介紹 | C 殼 |
| `/sales/customers`、`/sales/leads`、`/sales/reception/records` | 客戶中心 / 線索 / 接待記錄 | C 殼 |
| `/settings/org`、`/settings/staff` | 組織架構 / 人員管理 | C 殼 |
| `/usedcar/auction` | 拍賣管理 | C 殼 |
| `/settings/{api,data-io,dictionary,general,models,notifications,roles,serial}` | 系統設定 8 頁 | B mock |
| `/usedcar/{finance-report,followup-analysis,lead-analysis,open-rate,ops-data,sales-dashboard}` | 中古車分析儀表板 6 頁 | B mock |
| `/pos`、`/pos/{ledger,products,settings}` | POS 收銀 4 頁 | B mock |
| `/usedcar/sale` | 中古車銷售 | B mock |
| `/dev/{aftersales-kit,demo-dashboard,preflight-ro-v1,preflight-sa-v2}` | 新功能開發區 | B/D dev |

### C. 舊頁／已被取代／趣味工具 —— 建議維持關（或清掉 nav）

| 路由群 | 名稱 | 性質 |
|---|---|---|
| `/sales/{accessories,finance,models,sc-app,testdrive,funnel}` | 精品·金融·車型·顧問App·試駕排程·漏斗 | 舊銷售頁，多已被 `/sales/manager/*`＋`/sales/reception/*` 取代 |
| `/sales/card/{closing,consultant,counter}`、`/sales/settings/handcard-params`、`/sales/customers/tags` | 舊版三階段手卡 / 手卡參數 / 客戶標籤 | 被 `/sales/reception/handcard` wizard 取代 |
| `/sales/showroom` | 展廳看板 | 被 `/sales/showroom/new-cars` 取代 |
| `/tools/{calendar,daily-cost,delivery-timing,license-fengshui,rider-weather,rival-smash,wpm}` | 農民曆 / 計算機 / 擇日 / 風水 / 氣象 / 競品 / 打字 | 趣味·決策小工具 |
| `/d2c/home` | 消費者官網首頁 | 刻意獨立於後台側欄 |
| `/csi/surveys` | CSI 滿意度 | 實為 redirect → `/crm/sales/survey-templates` |

---

## 三、⚫ nav_nodes 完全沒登記（側欄無入口）

### A. 真頁面缺入口 —— 建議補 nav 或確認是否走他途

| 路由 | 名稱 | 分級 | 備註 |
|---|---|---|---|
| `/admin/master-data/item-lead-times` | 品項前置天數主檔 | A 真 DB | **真缺入口**，建議補登記到 List 主檔 |
| `/admin/master-data/replenishment-policies` | 補貨政策主檔 | A 真 DB | **真缺入口**，建議補登記 |
| `/admin/global-search/registry` | 全站搜尋註冊 | A 真 DB | 可能應掛在後台設定 tab |
| `/admin/admins` | App Admin 名單 | A 真 DB | 可能應掛在後台設定 tab |
| `/admin/org/brands`、`/admin/org/stores` | 品牌 / 門店主檔 | A 真 DB | 可能是 `/admin/org/groups` 頁內 tab |
| `/parts/aftersales/customers` | 售後客戶 | A 真 DB | 確認是否已被 `/crm/*` 取代 |
| `/me/profile` | 個人設定 | A 真 DB | 走右上頭像選單，不必上側欄 |
| `/dashboard` | 營運總覽儀表板 | A 真 DB | 走 logo / 首頁，不必當側欄 leaf |

### B. wizard / 子頁 —— 從父列表進入，不需 nav

`/sales/reception/test-rides/wizard`、`/usedcar/evaluations/wizard`、`/sales/card/record`

### C. redirect 別名 —— 正常，不用動（共約 27 條）

`/admin/org`→groups、`/feedback`→tickets、`/csi/surveys`→survey-templates、
`/service` 與 `/service/*`（13 條）→ `/parts/aftersales/*`、
`/aftersales/crm/*`（6 條）→ `/crm/aftersales/*`、
`/sales/crm` 與 `/sales/crm/*`（7 條）→ `/crm/sales/*`

### D. sandbox / dev / 模組首頁 gallery —— 正常不上 nav

`/admin/{charts-sandbox,design-tokens,form-sandbox,visualization-sandbox}`、`/dev/crm-components`、`/crm`、`/sales`（模組導覽首頁，走 Module Rail 進入）

---

## 四、本次已執行的變更（Indian brand）

### 4.1 交車服務 —— 原位翻開關（乾淨案例）

把「交車服務」模組（level-1）+ 6 頁的 `is_active` 翻成 `true`：交車儀式 `/delivery/ceremony`、PDI 檢查表 `/delivery/pdi`、PDI 配件安裝 `/delivery/pdi-accessories`、交車確認上下 `/delivery/confirm-1|2`、保固條款簽署 `/delivery/warranty-sign`。

> Ducati 的「交車服務」本來就全部 active，未動。

### 4.2 通知後台 / 訂單中心 / 中古潛客 —— re-home 後開（搬出殭屍樹）

不翻退役舊樹的父開關，改把葉節點搬到 active 模組底下再 `is_active=true`：

| 節點 | 原父（退役樹） | 搬到（active） | 位置 | admin-only |
|---|---|---|---|---|
| 通知中樞後台（通知儀表板 + 訂閱管理 + 通路與目標 + 模板檢視 + 送達記錄，5 頁） | 簽核管理 › 通知中心 | **組織與權限**（navigation/rbac/org 同組） | sort 8–12 | 是 |
| 訂單中心 `/sales/orders` | 銷售管理 › 銷售管理 | **銷售接待 › 展廳接待** | sort 6（報價簽訂後） | 否 |
| 中古潛客跟進 `/usedcar/prospects` | 中古交易 › 交易流程 | **銷售接待 › 展廳接待** | sort 7 | 否 |

**未開**：`/usedcar/stock`（與 active `/sales/showroom/used-cars` 重複）、`/admin/approvals/{order,tradein}`（待簽核模組整體規劃）。

> 退役舊模組樹（中古交易 / 簽核管理 / 銷售管理 / 維修管理 / 銷售模組 等 level-1，及其下空殼節點）維持 `is_active=false`，不影響側欄。
> 備註：「組織與權限」admin 群目前掛在「庫存管理」模組下（既有結構），故通知後台也落在該格；如需移位調 `parent_id` 即可。

---

## 五、交車服務溯源 —— 它是哪一輪做的？

查 git 史，交車服務**從來沒有「自己一輪」**，這正是 nav 開關被漏掉的根因：

| commit | 日期 | 事件 |
|---|---|---|
| `e1b2c48` | 2026-04-14 | Ducati pivot —— `/delivery/*` 6 頁**首次出現**，當時是 Stitch Inline 殼 |
| `2366760` | 2026-05-17 | **round-4+5**「CRM v2 + 全站 schema/CRUD 補齊」—— 6 頁的 `_components/*-view.tsx` 接上 `@/lib/delivery/delivery-actions` + `deliveries` 表，**升級成接真 DB 可運行**（殼→A 級就在這一波） |

**第一性原理解讀**：交車服務不是某一輪的主角，是**夾帶在「全站 schema/CRUD 補齊」掃過去順手完成的**。因為沒有專屬卡片 / 專屬驗收，收尾時沒人記得回頭把 `nav_nodes.is_active` 翻開 —— 程式做完了，但「上架」這一步被漏掉。對照之下 Ducati 同模組是開的，所以這是 Indian 單邊的收尾遺漏，不是功能沒做。
