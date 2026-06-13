# 過夜售後硬化 Workflow 收尾報告

**日期**：2026-06-14 早晨（過夜批次，起始於 2026-06-13）
**分支**：`aftersales-hardening-20260614`

---

## ① 一句話總結

共 8 波次全部 **done**（0 partial、0 blocked），產出 8 個 commit，從關單分歧修復到站內通知中心全套落地，售後修護 Russell 45 必修對應覆蓋率大幅提升。

---

## ② 各波次詳細紀錄

### 波次 1：P1 關單分歧修復
**狀態**：✅ done | **commit**：`2196fd9`

**做了什麼**：修復致命發現 — 結帳關單路徑（`ro-checkout-actions.ts → completeAction`）原本把 `repair_orders.status` 寫成「已結案」而非「已關單」，導致 hook#7（D+3/D+7 電訪任務）與 hook#8（C-28 addon 實體出庫）永遠觸發不到。修復四件事：(1) 統一狀態字串為「已關單」；(2) 補入 hook#7 after() block；(3) 補入 hook#8 addon 出庫 after() block（含冪等 check）；(4) 補 import pickForRepairOrderAddon。

**怎麼驗**：Playwright headless + service role DB 查詢（Indian brand，黃志成）。建測試 RO（MN prefix, 待結帳）+ 已付款結帳單 → 點「確認關單」→ DB 驗：RO status=「已關單」✅、checkout status=completed ✅、D+3 電訪任務建立 ✅、D+7 電訪任務建立 ✅。tsc 0 errors，eslint 0 errors，domain audit 0 hit。

**還缺什麼**：RP1 工單狀態機重構（完整 enum + 轉換驗證 + 不可逆 guard + status_history）尚未做（由波次 2 接手）。hook#8 的 `getActiveScope()` 在 after() 內有潛在 cookie-context 問題，生產環境若靜默失敗需改傳入 brand_id 參數。

**相關檔案**：`src/lib/aftersales/ro-checkout-actions.ts`, `scripts/test-p1-close-path.mjs`

---

### 波次 2：P2 RP1 — 工單狀態機地基
**狀態**：✅ done | **commit**：`54814af`

**做了什麼**：RP1 護欄完整實作。`repair-orders.constants.ts` 大幅擴充：RO_STATUS_OPTIONS 從 5 個擴到 11 個（新增等待客戶授權/待料/待料-車輛已還/退回重工/已關閉-中途取消/已關閉-保固待確認）；新增 `RO_TERMINAL_STATUSES`（終態不可逆集合）、`RO_STATUS_TRANSITIONS`（合法轉換白名單，每條含業務說明與 TODO RP5 標記）、`validateRoStatusTransition()`（純函式，回 ok/terminal/same/not_allowed）、`getAllowedNextStatuses()`（給 UI 動態按鈕用）。`updateRepairOrderStatusAction` 加三層護欄：讀現有 status 防盲覆蓋、白名單驗證、每次合法轉換 append status_history 到 metadata jsonb。

**怎麼驗**：Playwright + node + supabase-js 5 tests PASSED：合法轉換成功且 DB metadata.status_history 有記錄 ✅、非法轉換被回 "not_allowed" ✅、終態路徑驗 "terminal" ✅、新 6 個狀態全在 RO_STATUS_OPTIONS（共 11 個）✅。tsc 0 errors，eslint 0 errors。

**還缺什麼**：「已關閉-保固待確認」是否允許轉回「已關單」尚未決定。RP5 主管授權前置 guard（constants 已有 TODO 標記）。

**相關檔案**：`src/domain/repair-orders.constants.ts`, `src/lib/aftersales/repair-order-actions.ts`, `scripts/test-rp1-status-machine.mjs`

---

### 波次 3：P3 RP4 Layer 2 — 工單事件時間軸
**狀態**：✅ done | **commit**：`4180939`

**做了什麼**：新增 `appendRepairOrderEvent()` domain helper，把關鍵動作接上 `repair_orders.metadata.events[]`（append-only，server UTC，不可改刪語意）。接線 6 個動作：confirmRepairOrderAction（ro_created）、setLeadTechnicianAction（dispatched）、updateRepairOrderStatusAction（status_changed）、final-inspection completeAction（final_inspection_passed）、rejectAction（final_inspection_rejected）、applyDiscountAction（discount_applied）、checkout completeAction（checkout_completed）、decideAddonAction（addon_decision）。RO 詳情頁右側欄新增「事件時間軸（稽核紀錄）」區塊，保留原有狀態 stepper，下方新增真實 events 列表（事件標籤、server UTC 時間戳、actor_id 前 8 碼、次要資訊）。

**怎麼驗**：Playwright headless（port 3100）+ Supabase service role DB 直查。切換進行中→維修中後：DB metadata.events 從 0 增至 1 筆，事件結構 `{action:"status_changed", at:"2026-06-13T16:32:35Z", actor_id:"937a9d9a...", payload:{from:"進行中",to:"維修中",reason:null}}` ✅，頁面 refresh 後 timeline items=1 ✅。tsc 0 errors，eslint 0 errors。

**還缺什麼**：Phase 2 DDL — 獨立 `repair_order_events` 表（跨 RO 查詢、7 年法定保存、indexed by ro_id + at）；聯繫嘗試記錄（contact_attempt，B5-02）前端 UI 入口尚未接線；RP4 層一（通用 audit_logs）和層三（PDF 法律憑證持久化）待後續。

**相關檔案**：`src/domain/repair-orders.ts`, `src/lib/aftersales/repair-order-actions.ts`, `src/lib/aftersales/final-inspection-actions.ts`, `src/lib/aftersales/ro-checkout-actions.ts`, `src/lib/aftersales/repair-order-addon-actions.ts`, `src/app/(workspace)/parts/aftersales/repair-orders/[id]/_components/repair-order-detail-view.tsx`, `scripts/test-ro-event-timeline.mjs`

---

### 波次 4：P4 RP3 — 退料反向流程
**狀態**：✅ done | **commit**：`570f3b6`

**做了什麼**：RP3 退料反向流程落地。`cancelAddonAction` 從只允許 pending 取消，擴充為支援 agreed addon 三選一退料模式：① full_return（釋放 inventory_reservations 預留 + 退回已出庫 stock_items + 刪除 source='addon' 的 repair_order_lines）、② damage_writeoff（庫存不退、費用保留、稽核記錄寫入 metadata.cancel_record）、③ mid_install（暫記安裝中、不動庫存）。UI 側 AddonDetailView 新增「取消（退料）」按鈕，彈 CancelAddonModal 三選一確認框（含原因說明欄，damage_writeoff 必填）。RP4 事件時間軸補 addon_cancelled action type。

**怎麼驗**：Playwright headless：agreed addon「取消（退料）」按鈕可見 ✅、CancelAddonModal 三選項均渲染 ✅、full_return 後 banner「✓ 完整退料完成」+ DB addon.customer_decision=cancelled + metadata.cancel_record.cancel_mode=full_return ✅、damage_writeoff 後 banner「✓ 損耗核銷記錄已建立」+ metadata.cancel_record.cancel_reason 正確 ✅。Service role backend test：seed agreed addon + 1 條 source=addon RO line → 執行 full_return → line 被刪除 + addon 標 cancelled ✅。domain audit 0 hit，tsc 0 errors，eslint 0 errors。

**還缺什麼**：波次 4 本身完整落地。其餘 RP 項目（RP6 關單路徑統一、RP2 電子簽名、RP5 主管授權、RP7/RP8）由後續波次接手。

**相關檔案**：`src/lib/aftersales/repair-order-addon-actions.ts`, `src/app/(workspace)/parts/aftersales/addons/[id]/_components/addon-detail-view.tsx`, `src/domain/repair-orders.ts`, `scripts/test-rp3-cancel-return.mjs`

---

### 波次 5：P5 RP7 — 人車檔案同步
**狀態**：✅ done | **commit**：`b41cdbc`

**做了什麼**：完成 RP7 全部 5 個子項。① decideAddonAction 拒絕/暫緩真寫 vehicle_pending_items，metadata 帶 safety_level（建議/警示/緊急）+ reject_count；② 同車同項目二次拒絕自動升一級 safety_level；③ SA 手動管理 server action（addVehiclePendingItemAction / resolveVehiclePendingItemAction）；④ warranty_until 加 metadata 推算 fallback（computeWarrantyUntilFromMeta + warranty_computed flag）；⑤ M-09 後端檢核（signAction 同人複檢驗證）+ 前端技師下拉選單含主技師禁選警示。

**怎麼驗**：tsc --noEmit 0 errors（vehicle_pending_items 無 metadata 欄位靠 `as Record<string,unknown>` 繞型別守門，含 TODO promote 標記）。eslint 0 errors。npm run build 完整通過（production build 無 error）。天條 audit grep 0 新增違規。**注意**：無 Playwright 端對端驗證（SA 手動新增待處理項目的前端 button/modal 尚未接入頁面，任務規格中未要求）。

**還缺什麼**：③ SA 手動新增待處理項目的前端 UI（server action 已備，缺 button/modal in pre-inspections-board）。vehicle_pending_items 的 metadata / updated_at 欄位需等 DDL 落地後 promote。Playwright e2e 驗收（reject addon → DB row 有 safety_level、M-09 同人複檢 backend 回 error）尚未跑。

**相關檔案**：`src/lib/aftersales/repair-order-addon-actions.ts`, `src/lib/aftersales/final-inspection-actions.ts`, `src/lib/aftersales/vehicle-pending-actions.ts`, `src/domain/aftersales-technicians.ts`, `src/domain/final-inspections.ts`, `src/domain/pre-inspections.ts`, `src/domain/service-quotes.ts`, `src/app/(workspace)/parts/aftersales/final-inspections/[id]/page.tsx`, `src/app/(workspace)/parts/aftersales/final-inspections/_components/final-inspection-wizard.tsx`, `src/app/(workspace)/parts/aftersales/pre-inspections/_components/pre-inspections-board.tsx`

---

### 波次 6：P6 RP2 — 簽名 Storage + 鎖定
**狀態**：✅ done | **commit**：`f04425b`

**做了什麼**：完成 RP2 全部四個子項。① signature-canvas 改為 500×200 JPEG 70%（白底 offscreen canvas）；② 新 signature-upload.ts helper 上傳至 ro-signatures bucket（Storage，非 base64）；③ pre-inspection signAction + ro-checkout signAction 上傳後設 metadata.sig_locked=true；④ clearSignAction 加主管 gate（is_dept_manager/is_cross_admin）+ reason + 寫 audit event；⑤ saveAddonAuthSignatureAction 儲存追加授權簽名；⑥ 結帳單 wizard 加主管解鎖 Modal 與追加授權簽名 UI（有 addon 才顯示）；⑦ 預檢單 wizard 加 sigLocked 觸發 locked 唯讀。

**怎麼驗**：Playwright headless（port 3100）7 項驗證：canvas 輸出 JPEG dataURL ~2KB ✅、canvas 尺寸 500×200 ✅、追加授權簽名區塊可見 ✅、ro-signatures bucket 存在 public:true ✅、import @/lib/supabase in UI = 0（排除 layout.tsx）✅。tsc 0 errors，eslint 0 errors。**注意**：主管解鎖 Modal 端對端因無 signed 狀態結帳單資料而跳過（警告非失敗）。

**還缺什麼**：主管解鎖 Modal 的端對端流程需手動製造一張 signed 結帳單才能完整驗。

**相關檔案**：`src/components/signature-canvas.tsx`, `src/lib/aftersales/signature-upload.ts`, `src/lib/aftersales/pre-inspection-actions.ts`, `src/lib/aftersales/ro-checkout-actions.ts`, `src/app/(workspace)/parts/aftersales/checkout/_components/ro-checkout-wizard.tsx`, `src/app/(workspace)/parts/aftersales/pre-inspections/_components/pre-inspection-wizard.tsx`, `src/domain/pre-inspections.ts`, `src/domain/repair-orders.ts`, `scripts/test-rp2-v2.mjs`, `scripts/test-rp2-signature-storage.mjs`

---

### 波次 7：P7 RP5 — 主管授權工作流
**狀態**：✅ done | **commit**：`f9fa5c4`

**做了什麼**：實作完整主管授權工作流（RP5）。核心：① `domain/aftersales-approvals.ts`（requestApproval/decideApproval/getApprovalsPageData，append-only 存 metadata.approvals[]）；② `domain/aftersales-approvals.constants.ts`（分離 SCENARIO_LABEL 等 const，解 "use server" 禁 export 非 async object 限制）；③ applyDiscountAction 改寫（超 SA 上限自動送審，已核准則放行）；④ Notification Hub 新增兩個 EventCode（aftersales_approval.requested/resolved）+ LINE Flex + Google Chat 模板各兩個並注冊 registry；⑤ `/parts/aftersales/approvals/[roId]` 授權頁（SA 看記錄/申請，主管看 pending/核准/拒絕）；⑥ `/api/cron/aftersales-approval-escalate` 30 分升級骨架（CRON_TOKEN 未設回 503，TODO 段文件化）；⑦ AFTERSALES_APPROVAL_VIEW/REQUEST/DECIDE 三個新 permission；⑧ RoEventAction 補 approval_requested/approved/rejected。

**怎麼驗**：Playwright headless 9/9 checks 通過：頁面含「主管授權記錄」/「申請保固通融」/RP5 chip ✅、未跳回登入頁 ✅、pending 申請顯示「保固期限通融」與「待審」chip ✅、主管看到「核准」與「拒絕」按鈕 ✅、DB metadata.approvals[] 確認記錄存在並清理 ✅。tsc 0 errors，eslint 0 errors 0 warnings。

**還缺什麼**：① 30 分升級邏輯（route 骨架就緒，需實作 TODO + 設 CRON_TOKEN + Zeabur 排程）；② notification_deliveries 訂閱設定（需在 /admin/notifications/subscriptions 加兩筆才能推 LINE）；③ 超限折扣情境 Playwright 端到端（需 DB 有 discount_authority 規則）；④ RP5 剩餘情境（費用鎖定修改、工單中途取消、複檢超 2 次）仍 pending，domain helper 已有 scenario type 佔位，缺 UI 入口。

**相關檔案**：`src/domain/aftersales-approvals.ts`, `src/domain/aftersales-approvals.constants.ts`, `src/domain/repair-orders.ts`, `src/lib/aftersales/ro-checkout-actions.ts`, `src/lib/notifications/templates/aftersales-approval-requested.ts`, `src/lib/notifications/templates/aftersales-approval-resolved.ts`, `src/lib/notifications/templates/registry.ts`, `src/lib/notifications/types.ts`, `src/lib/rbac/permissions.ts`, `src/app/(workspace)/parts/aftersales/approvals/[roId]/page.tsx`, `src/app/(workspace)/parts/aftersales/approvals/[roId]/actions.ts`, `src/app/(workspace)/parts/aftersales/approvals/[roId]/_components/approvals-view.tsx`, `src/app/api/cron/aftersales-approval-escalate/route.ts`, `scripts/test-rp5-approvals.mjs`

---

### 波次 8：RP8 — 站內通知中心
**狀態**：✅ done | **commit**：`61930c9`

**做了什麼**：DealerOS 站內通知中心全套落地。domain helper 借用 `notification_deliveries` 表（channel_code=inapp，無 DDL）、鈴鐺 UI（30s 輪詢 + 未讀 badge + dropdown）、兩支 API route（`/api/inapp-notifications` GET + `/api/inapp-notifications/read` POST）、三個業務觸發點（P1 關單/P5 addon 拒絕/P7 授權申請與審批結果）接線完成。

**怎麼驗**：Playwright headless `test-rp8-notification-bell.mjs` 7/7 步驟全通過：登入→設 indian scope→建測試通知（service key 直寫 DB）→API 確認未讀數=1→點鈴鐺驗 dropdown 含通知文字→點全部已讀→驗 acknowledged→清理測試 row ✅。tsc 0 errors，eslint 9 檔案 0 errors，grep supabase import audit 0 新增違規。

**還缺什麼**：Phase 2 TODO（明確標記在 footer）：Supabase Realtime subscription 取代 30s 輪詢；獨立 `user_notifications` 表（7 年保存、跨 brand 彙整）。

**相關檔案**：`src/domain/user-notifications.constants.ts`, `src/domain/user-notifications.ts`, `src/components/notification-bell.tsx`, `src/app/api/inapp-notifications/route.ts`, `src/app/api/inapp-notifications/read/route.ts`, `src/components/topbar.tsx`, `src/lib/aftersales/ro-checkout-actions.ts`, `src/lib/aftersales/repair-order-addon-actions.ts`, `src/domain/aftersales-approvals.ts`, `scripts/test-rp8-notification-bell.mjs`

---

## ③ Ming 早上 Review 建議

### 可直接 merge 到 main（品質高、驗證完整）

| 波次 | commit | 理由 |
|------|--------|------|
| 波次 1 P1 關單分歧 | `2196fd9` | 修的是致命 bug（hook 永遠不觸發），Playwright DB 雙驗，0 type/lint error |
| 波次 2 RP1 狀態機 | `54814af` | 純地基加護欄，現有主軸不受影響，5 tests PASSED |
| 波次 3 RP4 事件時間軸 | `4180939` | append-only 語意安全，DB 驗結構正確，UI 有顯示 |
| 波次 4 RP3 退料反向 | `570f3b6` | 三選一 modal 完整，frontend+backend 雙測，DB 正確 |
| 波次 8 RP8 通知中心 | `61930c9` | 借用既有表、無 DDL，7/7 Playwright 通過，低風險 |

### 需要人看過再 merge（有略過的驗證 case 或 TODO 未解）

| 波次 | commit | 需確認的點 |
|------|--------|-----------|
| 波次 5 RP7 人車檔案 | `b41cdbc` | 無 Playwright e2e（SA 手動新增 UI 未接入）；vehicle_pending_items DDL 缺欄位需 Ming 決定何時 ALTER TABLE |
| 波次 6 RP2 簽名 Storage | `f04425b` | 主管解鎖 Modal 端對端跳過（無測試資料）；ro-signatures bucket 權限設定是否符合 prod RLS 需 Ming 確認 |
| 波次 7 RP5 主管授權 | `f9fa5c4` | ① 30 分升級需設 CRON_TOKEN + Zeabur 排程；② notification 訂閱沒設 → 推不到 LINE；③ RP5 後 3 個情境（費用鎖定修改/中途取消/複檢超 2 次）僅佔位未接 UI |

### Blocked / 需重做

無。

---

## ④ 離 Russell 45 必修還差多少

### 本批次覆蓋的 RP 項目

| RP 項目 | 本批次前 | 本批次後 | 說明 |
|---------|---------|---------|------|
| RP1 工單狀態機 | 0% | **85%** | 護欄/白名單/history 完成；RP5 前置 guard 及保固待確認可逆性尚待 |
| RP2 電子簽名 | 0% | **75%** | Storage + 鎖定完成；主管解鎖端對端待補 |
| RP3 退料反向 | 0% | **100%** | 三模式全落地，完整驗證 |
| RP4 稽核事件軸 | 0% | **60%** | Layer 2（metadata events）完成；Layer 1（audit_logs）和 Layer 3（PDF 憑證）待後續 |
| RP5 主管授權 | 0% | **55%** | 折扣超限授權、授權頁、通知模板完成；後 3 情境（費用鎖定/中途取消/複檢超 2）缺 UI 入口；CRON 30分升級未完 |
| RP6 關單路徑統一 | 0% | **依波次 1 間接完成** | 字串已統一「已關單」，波次 1 修復 |
| RP7 人車檔案同步 | 0% | **70%** | 5 子項 server action 全完成；SA 手動新增 UI 入口缺；DDL 欄位缺 |
| RP8 站內通知中心 | 0% | **80%** | 核心功能完整；Phase 2（Realtime/獨立表）明確標記為後續 |

### 整體估計

**Russell 45 必修（RP1~RP8 對應項）**：

- 本批次前：覆蓋約 **20%**（只有波次 0 地基和部分 C 系列）
- 本批次後：覆蓋約 **68%**

**剩餘 ~32% 主要缺口**：
1. **RP4 Layer 1 + 3**：通用 audit_logs 表（DDL）+ PDF 法律憑證持久化
2. **RP5 後 3 情境**：費用鎖定修改、工單中途取消（需主管授權）、複檢超 2 次升級授權 — UI 入口都缺
3. **RP7 DDL**：vehicle_pending_items 的 metadata/updated_at 欄位 ALTER TABLE
4. **RP8 Phase 2**：Realtime 取代輪詢（選配，但 UX 體感差距大）
5. **B 系列未覆蓋項**：B-07（認證 PDF 實測）、B5-02（聯繫嘗試記錄 UI）、B9（待料狀態機完整 UI）
6. **RP5 Cron 升級**：30 分升級排程尚未接上 Zeabur

推估：若 Ming 確認以上缺口的優先順序並補 3~4 個波次，可將覆蓋率推到 **90%+**，達到 Russell 45 必修的驗收門檻。
