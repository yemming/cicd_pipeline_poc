# Round-24 提案 — Design Pattern 稽核補齊（list-only → list + detail）

**日期**：2026-05-31
**觸發**：round-23 結案後，Ming 選定下一輪方向 = 「Design Pattern 稽核補齊」
**方法**：6 個 Explore sub-agent 並行掃 15 模組 + 主控用硬資料（board / detail-view / `[id]` / `new` 四份檔案清單）交叉比對。

---

## 稽核標準（CLAUDE.md 定義的「完整合規」）

一個**真 CRUD 業務列表頁**算合規，必須同時有：

1. **List**：`_components/{slug}-board.tsx`，表格用 `<DataGrid>`（非手刻 `<table>`）
2. **Detail**：`[id]/page.tsx` + `[id]/_components/{slug}-detail-view.tsx`，支援 view/edit/create 三 mode
3. **Create**：`new/page.tsx`（reuse detail-view 的 create mode）

> 範本：`parts/setup/items`、`admin/accounting/coa`、`admin/master-data/dimensions`、`admin/master-data/supplier-pricing`。

**不適用本 SOP（歸 D 類、不補）**：分析儀表板（集團 D3 圖表）、財報/報表（trial-balance / income-statement…）、歷史查詢頁（receipts-history、transfers-in-transit、balance）、search 頁、wizard 多步驟單據（採購單 / 工單 / 交車流程 / 試乘建檔）、純設定頁、placeholder / Stitch iframe。

---

## 全站合規度總覽

| 範圍 | 完整合規 (A) | 真缺 detail (B，該補) | 不適用 (D) |
|------|---|---|---|
| admin | ~15 | 7 | 多數報表/通知/RBAC |
| group | 0 | 2（pricing / promotions）| 18（D3 dashboard）|
| parts | ~22 | 4（B2 缺 detail-view 元件）| 其餘分析/歷史/設定 |
| sales | ~10 | 4 | wizard 單據 / Stitch |
| inventory/usedcar/delivery | ~2 | 1（prospects）| wizard / Stitch / demo |
| csi/feedback/einvoice/tools/pos | ~2 | 3（einvoice 子物件）| 工具 / 設定 / wizard |

> 註：sub-agent 原始報告把大量「分析 / 報表 / 歷史 / 設定」頁也算成 B（高報）。下面是主控用硬標準濾過的**真正該補清單**。

---

## ✅ 真正該補的 Type-B 清單（CRUD 業務實體、list-only、缺 [id] detail）

> ✅ **Batch 1 已完成上線（2026-05-31, commit `9e2891a`）** — 6 主檔全補完，正式站 E2E 48/48 全綠（含 groups 真寫入 create→delete + DB 驗 leftover=0）、LINE 已推上版摘要。

### Batch 1 — 組織與主檔核心（最乾淨、最貼 SOP 範本，建議優先）✅ 完成

| # | 路由 | 實體 | 現況 | 工作量 |
|---|------|------|------|--------|
| 1 | `admin/org/brands` | 品牌主檔 | board + modal CRUD，無 `[id]` / `new` | S |
| 2 | `admin/org/groups` | 集團/經銷商主檔 | 同上 | S |
| 3 | `admin/org/stores` | 門店主檔 | 同上 | S |
| 4 | `admin/master-data/customer-contacts` | 客戶聯絡人 | board + modal，無 `[id]` / `new` | M |
| 5 | `admin/master-data/item-lead-times` | 物料交期 | board + modal，無 `[id]` / `new` | M |
| 6 | `admin/master-data/employee-roles` | 員工角色 | board + modal，無 `[id]` / `new` | S |

### Batch 2 — 集團商務 CRUD（手刻 table + side panel → 改 DataGrid + detail page）

| # | 路由 | 實體 | 現況 | 工作量 |
|---|------|------|------|--------|
| 7 | `group/pricing` (GRP14) | 定價折扣政策 | 手刻 `<table>` + side panel，6 actions（含狀態機）| M |
| 8 | `group/promotions` (GRP13) | 促銷活動 | 手刻 `<table>` + side panel，7 actions（含狀態機）| M |

### Batch 3 — 業務側 list-only

| # | 路由 | 實體 | 現況 | 工作量 |
|---|------|------|------|--------|
| 9 | `sales/delivery` | 交車管理 | board，無 `[id]` | M |
| 10 | `sales/insurance` | 保險招攬 | board，無 `[id]` / `new` | M |
| 11 | `sales/inventory/transfers` | 整車庫存調撥 | board，無 `[id]` | M |
| 12 | `admin/accounting/netsuite-mapping` | GL↔NetSuite 維度對映 | board + modal，無 `[id]` | M |

### Batch 4 — B2 補件（已有 `[id]/page.tsx` 但缺 detail-view 元件，純拆元件，工作量小）

| # | 路由 | 現況 | 工作量 |
|---|------|------|--------|
| 13 | `parts/aftersales/checkout` | `[id]/page.tsx` inline，無 detail-view.tsx | S |
| 14 | `parts/aftersales/final-inspections` | 同上 | M |
| 15 | `parts/aftersales/followups` | 同上 | S |
| 16 | `parts/aftersales/pre-inspections` | 同上 | M |

---

## ❌ 明確不補（D 類，已驗證為例外）

- **集團 D3 dashboard**（GRP07-20 散佈圖/趨勢/雷達/四象限）：分析頁，無 CRUD。
- **財報**：trial-balance / income-statement / balance-sheet — 純讀。
- **歷史/運維查詢**：parts operations/{balance,receipts-history,transfers-in-transit}、purchase/replenishment、analytics/{abc,stale,turnover}。
- **search**：ro-search、global-search/registry。
- **wizard 單據**：採購單 / 工單 / 交車流程 / 試乘建檔 / 開立發票。
- **RBAC / permission matrix**：rbac、navigation/permissions（matrix UI 合理）。
- **POS / tools / Stitch iframe / demo 頁**。
- **einvoice 子物件**（allowances / voids / number-pools）：UX 上「併入主發票 detail sidebar」也合理，是否獨立 detail 屬設計取捨，非缺陷 → 暫不補。

---

## 待 Ming 拍板

1. **這輪做哪幾個 Batch？** 建議至少做 **Batch 1（6 個主檔，全 S/M、最貼範本、風險最低）**，一輪交付乾淨。
2. Batch 2（group pricing/promotions）涉及把手刻 table 改 DataGrid + 拆 detail，較重但價值高（含狀態機稽核），可併入或下一輪。
3. 每個補齊一律走 list + detail **雙交付**（含 view/edit/create 三 mode），照 SOP Step 1-8，最後 Deploy-then-Test + 跑 `notify-deploy.mjs` 推 LINE。

> ⚠️ 補齊不是新功能，是品質債清理 —— 一個人開發、簡單為先，建議**一次一個 Batch**、跑完驗證再下一個，不要 16 個一次全開。
