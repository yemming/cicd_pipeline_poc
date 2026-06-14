# 售後修護模組 Bug 獵捕報告

**日期**：2026-06-13  
**執行方式**：自動化 bug hunter agent + fixer agent 雙 pass  
**commit（fixer）**：`94956c5`

---

## 一、Findings 總表

| # | Severity | Area | Issue | Evidence |
|---|----------|------|-------|----------|
| 1 | **real-bug** | CRM call-tasks 快速動作 | 「建立工單」按鈕 href 缺 `/parts` 前綴，點下去 404 | `call-tasks-board.tsx:347` href `/aftersales/repair-orders/new` |
| 2 | **real-bug** | 售後客戶詳情「開新工單」 | Link 指向 `/parts/aftersales/reception`（不存在），404 | `customer-detail-view.tsx:303` |
| 3 | **real-bug** | dev/crm-components sandbox | `/aftersales/repair-orders` 舊路由無 `/parts` 前綴，404 | `dev/crm-components/page.tsx:237` |
| 4 | **real-bug** | nav_nodes placeholder 路由（8 條） | indian brand 8 個 is_active=true nav_nodes 指向 `/placeholder/*`，無對應 page，全 404 | DB 查詢：PDI工單執行、中古車整備工單等 8 條 |
| 5 | **real-bug** | LINE 通知 actionUrl — notifyRepairOrderProgressAction | `APP_URL` fallback 是 `localhost:3000`；`.env.local` 尾有 `/` 造成雙斜線 URL | `repair-order-actions.ts:931` |
| 6 | **real-bug** | LINE 通知 actionUrl — feedback_ticket.created | 無三層 fallback，trailing slash 未 strip | `feedback-actions.ts:156` |
| 7 | **real-bug** | LINE 通知 actionUrl — CSI 問卷 dispatch | fallback 硬寫 `localhost:3001`（port 錯誤） | `survey-actions.ts:103` |
| 8 | **real-bug** | LINE 通知 actionUrl — 保固索賠催促 | trailing slash 未 strip | `ro-link-actions.ts:221` |
| 9 | **real-bug** | LINE 通知 actionUrl — 解待料通知 | trailing slash 未 strip | `receipts.ts:667` |
| 10 | **real-bug** | LINE 通知 actionUrl — 到港確認 | 純相對路徑無 `APP_URL` 前綴，LINE uri action 無法跳轉 | `vehicle-arrival-actions.ts:310` |
| 11 | **real-bug** | LINE 通知 url — CRM 推播送出 | url 硬寫死 prod origin，不受 `APP_URL` env 控制 | `push-campaigns-actions.ts:198` |
| 12 | **real-bug** | repair-order-detail-view 主管授權連結 | 無條件顯示「主管授權記錄 →」，無授權申請工單也出現，點進去空頁面 | `repair-order-detail-view.tsx:598-607`，comment 說「僅在有授權申請時顯示」但無條件包裹 |
| 13 | **real-bug** | final-inspection-actions.ts deleteAction 無 UI 入口 | `deleteAction` 已 export 但竣工複檢 UI 無任何刪除按鈕 | grep `deleteAction` 在 `final-inspections/` 目錄無命中 |
| 14 | **real-bug** | vehicle-pending-actions.ts resolveVehiclePendingItemAction 無 UI 入口 | 待處理項目只能新增，無法在前端標記解決 | grep `resolveVehiclePendingItemAction` 在 `src/app` 無命中 |
| 15 | **suspect** | repair-order-actions.ts appUrl fallback 不含 NEXT_PUBLIC_APP_URL | fallback 鏈與 `aftersales-approvals.ts` 不對等（已被 real-bug #5 修法涵蓋） | `repair-order-actions.ts:931` vs `aftersales-approvals.ts:238` |
| 16 | **suspect** | aftersales_followup.escalated 孤兒模板 | LINE/Google Chat 模板定義但全專案無任何 dispatch 呼叫，`followup-case-actions.ts` escalate 動作無推通知 | grep `aftersales_followup.escalated` 0 個 dispatch 命中 |
| 17 | **suspect** | PDI 工單 non-PD RO 導致白底 404 | 以普通 RO id 存取 `/parts/aftersales/workorders/pdi/{id}` 得 Next.js 原生 404 | `pdi/[id]/page.tsx:37 if (!data) notFound()` |
| 18 | **suspect** | nav_nodes 重複 is_active=false row | indian brand `/parts/aftersales/repair-orders/lines` 及 `/parts/aftersales/addons` 各有廢棄 false row 殘留 | SQL 查詢 4 rows（2 false + 2 true） |
| 19 | **nitpick** | global-search work_orders href | 搜尋命中連到列表頁而非個別工單詳情 | `global-search-registry.ts:263` |
| 20 | **nitpick** | revalidatePath 仍含舊路徑 | call-tasks/survey-templates/dormant-leads/sales-notifications 的 revalidatePath 仍用 `/aftersales/crm/*`（已遷至 `/crm/aftersales/*`） | 4 個 action 檔案 |
| 21 | **nitpick** | aftersales-approvals.ts 含 NEXT_PUBLIC_APP_URL fallback | server action 讀 client-side env 無意義，且與其他 dispatch 點不一致 | `aftersales-approvals.ts:238,444`；`cron/aftersales-approval-escalate/route.ts:88` |
| 22 | **nitpick** | /aftersales/management/approvals 舊書籤 404 | prod 確認 404，codebase 已無程式碼參照，但舊 LINE 歷史訊息若點仍 404 | Playwright prod 測試 HTTP 404 |
| 23 | **nitpick** | /parts/aftersales/dispatch 誤導 catch-all | 路由無 nav 入口，手輸 URL 被 `parts/[...slug]` catch-all 攔截顯示「庫存管理」空頁，非 404 | Playwright prod HTTP 200，body 含「inventory_2 庫存管理」 |
| 24 | **nitpick** | pre-inspections transfer demo 按鈕 disabled | 「確認開立 RO →」按鈕永遠 disabled，視覺上看起來功能壞掉 | `transfer-demo-view.tsx:180` |
| 25 | **nitpick** | pickup-notify-form 統計 placeholder | 「今日通知統計」三數字全顯示「—」，已在 production 暴露 | `pickup-notify-form.tsx:253-264` |
| 26 | **nitpick** | repair-order-lines-view 跨店庫存無調撥動作 | 查到有庫存但無法直接操作，要手動跳另一頁 | `repair-order-lines-view.tsx:752` |
| 27 | **nitpick** | customer-detail-view PickupTab 只讀 | 客戶頁無法直接發送取車通知 | `customer-detail-view.tsx:1003-1097` |
| 28 | **nitpick** | env-check-items 測試偵測假陽性 | 監控腳本用 `body.innerText` 讀不到 `<input value>` 誤報空白頁 | Playwright input.value 驗證 8 個 label 全有值 |

---

## 二、Fixer 修了什麼 / 略過什麼

### 已修（14 項 real-bug）

| # | 修法摘要 |
|---|---------|
| 1 | `call-tasks-board.tsx:347` href 補 `/parts` 前綴 → `/parts/aftersales/repair-orders/new` |
| 2 | `customer-detail-view.tsx:303` href 改為 `/parts/aftersales/repair-orders/new`（接受 `?customer=` 參數） |
| 3 | `dev/crm-components/page.tsx:237` `/aftersales/repair-orders` 補 `/parts` 前綴 |
| 4 | 新增 `src/app/(workspace)/placeholder/[...path]/page.tsx` catch-all，8 條 `/placeholder/*` nav_nodes 不再 404 |
| 5 | `repair-order-actions.ts:931` 改用 `(APP_URL ?? NEXT_PUBLIC_APP_URL ?? 'https://dealeros.zeabur.app').replace(/\/+$/, '')` |
| 6 | `feedback-actions.ts:156` 補三層 fallback + strip trailing slash |
| 7 | `survey-actions.ts:103` fallback 由 `localhost:3001` 改為 prod URL |
| 8 | `ro-link-actions.ts:221` 補 strip trailing slash |
| 9 | `receipts.ts:667` 補 strip trailing slash |
| 10 | `vehicle-arrival-actions.ts:310` 由純相對路徑改為 `APP_URL` 前綴絕對 URL |
| 11 | `push-campaigns-actions.ts:198` 硬寫死 prod URL 改用 `APP_URL` env |
| 12 | `repair-order-detail-view.tsx:599` 主管授權記錄 Link 加 `supervisorApproval?.required === true` 條件 |
| 13 | `final-inspections-board.tsx` 接入 `deleteAction`，草稿/退回狀態列加刪除按鈕及 confirm modal |
| 14 | `pre-inspections-board.tsx` 接入 `resolveVehiclePendingItemAction`，待處理項目旁加「標記已解決」按鈕（樂觀移除） |

全程 `tsc --noEmit` 0 errors、ESLint 0 errors。

### 略過（suspects 4 項 + nitpicks 10 項）

| # | 略過理由 |
|---|---------|
| 15（suspect） | 已被 real-bug #5 修法一併涵蓋 |
| 16（suspect） | 需業務確認「要不要推 escalated 通知」才能決定 dispatch 或刪模板，超出 bughunt scope |
| 17（suspect） | PD 型 RO 按鈕已有 `prefix_p1 === 'PD'` 條件保護，非 PD ID 需手輸才觸發，影響面極小 |
| 18（suspect） | 清理 DB 殘留 is_active=false row 不影響現有功能，非 bughunt scope |
| 19–28（nitpick） | 全部略過，屬 UX 改進 / cache 浪費 / feature gap，不是功能性 bug |

---

## 三、仍待人工確認的 Suspect

### S-1：aftersales_followup.escalated 孤兒通知模板

- **問題**：`src/lib/notifications/templates/aftersales-followup-escalated.ts` 定義了 LINE 模板，但 `followup-case-actions.ts` 的 `supervisorInterveneAction` 只做 DB update，無任何 `notifications.dispatch` 呼叫
- **決策點**：業務上「案件升級主管介入」是否需要推 LINE？  
  - 要推 → 在 `supervisorInterveneAction` 的 DB update 後加 `after(async () => notifications.dispatch({ code: 'aftersales_followup.escalated', ... }))`  
  - 不推 → 刪除孤兒模板，避免混淆

### S-2：PDI 工單非 PD 型 RO 返回原生 404

- **問題**：手輸非 PD 型 RO id 到 `/parts/aftersales/workorders/pdi/{id}` 得到 Next.js 白底 404，非友善錯誤頁
- **決策點**：是否需要在 `if (!data) notFound()` 前加業務判斷，區分「RO 存在但非 PD 型」vs「RO 不存在」，給前者顯示友善說明頁並附返回連結

### S-3：nav_nodes 廢棄 is_active=false 殘留 row

- **問題**：indian brand 有 2 個廢棄 nav row（href 指向已更名路由），is_active=false 不影響功能但累積讓維護難度增加
- **決策點**：可執行以下 SQL 清理（不影響功能，純維護）：
  ```sql
  DELETE FROM nav_nodes
  WHERE id IN (
    '<2b54c385-核對明細-lines>',
    '<68f13de5-追加項目記錄-addons>'
  );
  ```
  確認 id 後執行。

---

*fixer commit：`94956c5`*
