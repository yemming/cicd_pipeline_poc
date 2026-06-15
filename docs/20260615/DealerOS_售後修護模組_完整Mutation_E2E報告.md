# DealerOS 售後修護模組 — 完整 Mutation E2E（在正式站真跑閉環）

**日期：2026-06-15　｜　正式站：https://dealeros.zeabur.app（Indian brand）**
**方式：真實業務帳號 UI 驅動 + 每步 Supabase DB 驗證，會在正式站建立真實測試單據**

---

## 結論先講

硬跑「walk-in → 開單 → … → 關單」的完整閉環，**揪出並修掉 2 個非破壞性驗證完全抓不到的真 bug**，並以真實 DB 寫入逐步驗證了閉環前半段（walk-in → PI → RO → 待結帳 → 結帳單建立）。這就是堅持跑真 mutation 的價值——畫面都正常、build 也過，但流程一接起來就斷。

---

## 🐛 揪到的 2 個真 bug（都已修 + 部署）

### Bug 1：售後兩張預約表 handoff 斷掉（commit 129ea36 + FK migration）
- `appointments`（180 筆）= 售後預約看板 / walk-in / 161 預檢按鈕在用的活表
- `service_appointments`（3 筆）= master-data 殘表（被 accounting/search/master-data 用）
- 預檢「從預約建立」端（`createFromAppointmentAction` + `listAppointmentCandidates`）**讀錯表**（讀殘表）→ 收不到任何真預約 → walk-in 建好預約後預檢看不到它，handoff 整段斷。
- 更深一層：`pre_inspections.appointment_id` 的 FK 也指向 `service_appointments`，insert 直接撞 FK。
- **修法**：兩函式改讀 `appointments` + 欄位映射；FK repoint 到 `appointments`（0 筆既有 PI 帶 appointment_id，零風險）。

### Bug 2：預檢轉 RO 初始狀態違反 check 約束（commit 7bd0a51）
- `transferToRoAction` 寫死 `status='未開始'`，但 `repair_orders_status_check` 只允許 `進行中/維修中/待結帳/已關單/已取消` → PI 轉 RO 的 insert 被約束擋下。
- **修法**：初始狀態改合法的「進行中」。

> 兩個 bug 都在 walk-in→工單路徑上（161 的 🔴 高功能），且都是「畫面正常、實際寫入才炸」型，非破壞性 UI 驗證 100% 抓不到。

---

## ✅ 逐步驗證（真實 DB 寫入，全程 Indian、車主 陳大明 / RDB-1101 / Indian Scout Bobber）

| Stage | 動作 | 落地記錄 | DB 驗證 |
|---|---|---|---|
| S1 | walk-in 查車牌→建立臨時進廠 | `appointments` 44770c3c（source=walk-in、已到廠、今日） | ✅ |
| S2 | 從預約建立預檢單 | `pre_inspections` PI-260615-001（appointment_id 連到 S1） | ✅ |
| S3a | 車主雙簽（SA+車主 canvas） | PI status=signed、metadata.sig_sa/sig_customer | ✅ |
| S3b | 轉入正式工單 RO | `repair_orders` WC-WR-260615-001（進行中、pre_inspection_id+appointment_id 全連） + PI→transferred | ✅ |
| S4 | RO 狀態推進 進行中→維修中→待結帳 | RO status=待結帳 | ✅ |
| S5 | 從工單建立結帳 | `ro_checkouts` b5bcefbe（in_progress、連到 RO） | ✅ |

RO 詳情頁「上下游串接」可見：來源預約 `appointment 44770c3c` ｜ 來源預檢單 `b6b5848a` —— 整條鏈在 UI 上串起來了。

截圖：`docs/20260615/flow-evidence/M1_*`（walk-in found / PI wizard / 簽名 / RO 詳情 / 待結帳 / 結帳）。

---

## ⏸ 閉環最後一哩：需要「可計費維修明細」才能關單

結帳 Step1「確認費用」按鈕的啟用條件是 `lines.length > 0`——**RO 必須有實際維修明細（工資/零件）才能收款關單**。本次 walk-in PI 沒填報價工項、也還沒跑技師施工/追加，所以 RO 沒有 line，結帳停在 Step1。

這不是 bug，是業務正確性：**閉環不是純狀態跳轉，得有實際維修工作才有東西可結**。要走完到「已關單」，需要再跑：
- 派工 → 技師接單施工（維修中）→ 追加項目（車主同意→寫入 line）→ 技師完工 → 竣工複檢 → 結帳 4 步（確認費用→車主二簽→收款→關單）

這些是標準下游（161 輪已驗證各互動「有接真實寫入」），但每站需多輪 UI 驅動。

---

## 建議

閉環**前半段（最新、最容易出 bug 的 walk-in→PI→RO 段）已用真實寫入證明可跑，並修掉 2 個真 bug**。後半段（派工→施工→追加→複檢→結帳關單）是標準下游，要不要再花幾輪把它真跑到「已關單」由 Ming 決定。

**測試殘留**：本輪在正式站 Indian 建立了 1 條測試鏈（appointment/PI/RO/checkout，車主陳大明）。如需清掉可一併處理。

---

*DealerOS 機密文件　｜　Partner AI Agent　｜　2026-06-15*
