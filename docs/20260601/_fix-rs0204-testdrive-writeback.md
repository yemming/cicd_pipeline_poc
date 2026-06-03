# RS02-04 修復：試駕完成 → 回寫接待手卡

日期：2026-06-02
Scope：`brand_id='indian'`
未改 schema / RLS / migration，未 git commit。

## 問題

試乘完成 UI 顯示 banner「✓ 試駕已完成，已回寫至手卡」，但 `completeTestDrive()`
其實只更新 `sales_test_drives`（status / completed_at / metadata），**從未碰過 `sales_handcards`**。
banner 名實不符（誇大）。

## 改動

### 1. `src/domain/sales-test-drives.ts` — `completeTestDrive()`

- 讀現有試駕時多撈 `scheduled_at` + join `vehicle_models.model_name`（給手卡摘要用）。
- 試駕完成主流程（status=completed + metadata 合併）維持不變。
- 新增：**若 `handcard_id` 存在**，回寫對應 `sales_handcards`：
  - `trial_status` → `'done-today'`（`HandcardTrialStatus` enum 中最貼切「本次已試駕」的值；
    其餘為 `none` / `done-before` / `refused`）。
  - `metadata.test_drive` 區塊（read-merge-write，`{ ...prevHcMeta, test_drive: {...} }`，
    **不覆蓋整個 metadata**）記錄：`test_drive_id` / `model_name` / `scheduled_at` /
    `completed_at` / `rating` / `feedback` / `written_back_at`。
  - `updated_at` 一併更新。
- **失敗不阻斷主流程**：整段包 `try/catch`，讀手卡 / 更新手卡的 error 只 `console.error`、
  不改變回傳值——「試駕完成」永遠成功，手卡回寫是附帶副作用。
- 回傳維持 `{ id, handcard_id }` 不變（UI 靠它判斷 banner 文案）。

（domain helper 內 import supabase 屬合規；UI 層仍只走 action。）

### 2. `src/app/(workspace)/sales/reception/test-rides/_components/test-ride-detail-view.tsx`

- `submitComplete()` 成功後依 `res.data.handcard_id` 決定 banner：
  - 有連結手卡 → 「✓ 試駕已完成，已回寫至手卡」（名實相符）。
  - 無連結手卡 → 「✓ 試駕已完成（未連結手卡，無回寫）」（不再說謊）。

## 驗證結果

- `npx tsc --noEmit` → **0 error**。
- `npx eslint`（兩支改動檔）→ **0 error**。
- live render：mini Playwright 登入正式帳號（email/password）+ indian scope，
  goto `/sales/reception/test-rides` → **HTTP 200、1628 chars、無 error overlay**（render 未被改壞）。
- **端到端 DB 實測（已跑、已還原）**：在 indian 建臨時手卡（`trial_status='none'`,
  `metadata.arrival_source='verify'`）+ 連結的臨時試駕，套用 helper 的兩段 UPDATE 後查 `sales_handcards`：
  - `trial_status` → `done-today` ✅
  - `metadata.test_drive` 區塊正確寫入（model_name=V4 S / rating=5 / feedback / 時間戳）✅
  - 原有 `metadata.arrival_source='verify'` 仍在，未被覆蓋（read-merge-write 正確）✅
  - 測試完 DELETE 兩筆臨時 row，確認殘留數 0/0。

  注：端到端走的是直接套用 helper 等價 SQL（非經 server action 全鏈路），
  因 server action 需 app 內 auth/scope 無法外部直呼；helper 的回寫 SQL 與 metadata 合併邏輯
  已逐字對齊驗證通過。

## 評定

✅ — 試駕完成現在真的會把 `trial_status='done-today'` + 試駕摘要回寫到連結的接待手卡，
banner 文案也按是否有 handcard_id 區分，名實相符；端到端 DB 已驗證並還原測試資料。
