# Workflow 編排規範（spec-to-feature × 部署後驗證）

> 這份文件定兩件事：
> 1. spec-to-feature 哪些階段可以用 Workflow 平行撒 agent、哪些必須序列。
> 2. **驗證一律走「push → 自動部署 → 打部署後環境跑 Playwright」，不在開發機起 `next dev`。**
>
> 兩條鐵律：
> - **「讀 / 分析 / 靜態檢查」可平行；「碰 DB / `.next` / 瀏覽器」必序列。**
> - **開發機不跑 `next dev` 做驗證**——app 跑在部署端（Zeabur），Playwright 打部署後的 URL。
>
> 違反的後果是真的會炸（OOM、cloud migration race、`.next` 污染把新 route 蓋成 placeholder），不是理論潔癖。每條規則都有對應踩坑記憶。

---

## 0. 為什麼這樣編排

### 0.1 為什麼不在開發機跑 dev server 做驗證

過去的流程是：**同一臺開發機** ① 寫 code → ② 起 `next dev` → ③ 同機開 Playwright 打 localhost。結果這臺機器三不五時當機。

根因不是 Chromium 一個人——是 **`next dev`（常駐、每條 route 進來就 JIT 編譯、記憶體只升不降）和 Playwright Chromium 同時搶記憶體**。

修法：**把測試機跟開發機分開**。app 不在開發機跑，改由 push 觸發 Zeabur 自動部署、跑在部署端；Playwright 只當「客戶端」打部署後的 URL。開發機從此**只做寫 code + 靜態檢查 + 一次性 build + 開瀏覽器當 client**，不再背一個常駐 dev server。順帶好處：**push→部署這條本來就要做，驗證時剛好確認部署有沒有成功。**

### 0.2 平行會炸的共享資源

| 共享資源 | 多 agent 同時碰的後果 | 來源記憶 |
|---|---|---|
| **`.next` build 產物** | 平行 build 互相污染、新巢狀 route 被 catch-all 蓋成 placeholder | `next_build_pollutes_dev_catchall` |
| **Cloud Supabase schema**（migration） | apply-once 的 DDL 被重複 apply / race，雲端無法回滾 | `feedback_rls_migration_sop` |
| **同一 working tree 的檔案** | 多 agent 同時改同檔 → 互蓋 | Workflow `isolation:'worktree'` 存在的理由 |
| **單一部署後測試環境**（E2E） | 平行寫入流程互相污染資料、撞單號、Playwright client 仍吃開發機記憶體 | `feedback_sub_agent_resource_discipline` |

所以編排不是「能平行就平行」，而是**按資源分相：純讀相放開撒、碰共享資源相鎖成序列或隔離；驗證一律打部署端**。

---

## 1. 五階段 × 並行性對照表（spec-to-feature）

| 階段 | 動作 | 並行性 | Workflow primitive | 理由 |
|---|---|---|---|---|
| **1 結構分析** | 讀 HTML / 截圖 / nav_node，抽 entity/action/kpi | ✅ **可平行**（一頁一 agent） | `parallel()` / `pipeline` stage 1 | 純讀、無共享狀態 |
| **2 架構提案** | 寫 `feature-{slug}.md` | ✅ **可平行**（各寫不同檔名） | `parallel()` | 各 agent 寫不同 `.md`，無衝突 |
| **3 拍板** | Ming 用 AskUserQuestion 選 typed/jsonb、副作用、權限、命名 | ❌ **人類閘門** | **不在 workflow 內**——workflow 在此結束，回主迴圈問 Ming | Workflow 不能等人類決策；這是兩段式分界 |
| **4 落地（程式）** | 建 domain helper、頁面、改 import、tsc/eslint | ⚠️ **可平行但需 worktree 隔離** | `pipeline` + `isolation:'worktree'` | 多 agent 改不同檔可平行，同 tree 會互蓋 |
| **4 落地（DB migration）** | `apply_migration` 建表 + RLS + type gen | ❌ **必序列、單一 agent** | 單一序列步驟，**永不 fan-out** | Cloud Supabase apply-once，平行 = race |
| **5 驗證（靜態 + build）** | tsc / eslint / `grep @/lib/supabase` 天條 audit / 本地 `npm run build` | ✅ **可平行（靜態檢查）** | `parallel()` | 純讀靜態檢查互不干擾；build 是一次性、不常駐 |
| **5 驗證（E2E）** | **push → 部署 → 打部署後 URL 跑 Playwright** | ❌ **嚴格序列：一流程一頁面** | 序列 `for` / `pipeline` 並行度=1 | 單一測試環境 + Playwright client 仍吃記憶體；**Ming 親定一流程一頁面** |

---

## 2. 兩段式編排（人類拍板把流程切兩半）

階段 3 是人類閘門，**一條 spec-to-feature 不可能用「一個 workflow 從頭跑到尾」**。正確形狀是兩段 workflow 中間夾一個 Ming：

```
┌─────────────── WF-A：分析+提案（全平行、純讀+寫 md）───────────────┐
│  phase('分析')  parallel(pages.map → agent 跑 Stage 1))            │
│  phase('提案')  parallel(analyses.map → agent 寫 feature-{slug}.md))│
└────────────────────────────────────────────────────────────────────┘
                              ↓ workflow 結束、回主迴圈
                    ★ Ming 用 AskUserQuestion 拍板（階段 3）★
                              ↓ 拍板結果當 args 餵下一段
┌──────────── WF-B：落地 → 部署 → 部署後驗證 ──────────────────────────┐
│  phase('migration')  單一 agent 序列 apply_migration（never fan-out） │
│  phase('落地')        pipeline(pages, isolation:'worktree' 平行建頁)  │
│  phase('靜態驗證')    parallel(天條 grep + tsc + eslint) + 一次性 build │
│  phase('部署')        commit+push → 單一 agent 輪詢 zeabur 部署狀態     │
│  phase('E2E')         序列 for：一頁一頁打【部署後 URL】（並行度=1）     │
└──────────────────────────────────────────────────────────────────────┘
```

拍板永遠發生在主迴圈、不在 workflow 內（Workflow 是確定性腳本、無法中途暫停等人選選項）。

---

## 3. 部署後驗證模型（Deploy-then-Test）— 取代本地 dev server

> **這是驗證流程的唯一正式做法。spec-to-feature 階段 5 的 E2E、以及任何「跑起來看對不對」的需求，都走這條，不再 `npm run dev` 起本地伺服器點 localhost。**

### 3.1 六步循環

```
1. 寫 code + 自審（開發機）
2. commit + push（開發機 → GitHub）
3. Zeabur 自動部署（部署端）
4. 部署失敗 → 抓部署 log → 修 → 回 2
5. 部署成功 → Playwright 打【部署後 URL】跑驗證（序列、一流程一頁面）
6. 驗證失敗 → 修 → 回 1；全綠 → 收工
```

### 3.2 每步細節

**Step 1 — 寫 code + 自審（開發機，本地關卡拉高）**

因為不能再靠「本地快速點一點」抓 bug，push 前的靜態關卡要更嚴（這些都是一次性、不常駐、不會 OOM）：
- `npx tsc --noEmit` = 0 errors
- `npx eslint <touched>` = 0 errors
- 跑天條 + DataGrid 靜態稽核（`dealeros-conformance-audit` workflow / `grep -rn "@/lib/supabase" "src/app/(workspace)" src/components`）
- **本地 `npm run build` 過一次**（先 `rm -rf .next`）——build 抓得到 tsc 抓不到的 `server-only` 被 client value-import 之類 Turbopack 錯（`reference_server_only_client_import_trap`）。本地先 build 過，省一次失敗的部署來回。build 是一次性程序、跑完就退，不跟 Chromium 並存，**不會** OOM；OOM 的是常駐的 `next dev`。
- 讀過自己的 diff

**Step 2 — commit + push**

- 分支策略見 §3.4（待 Ming 拍板部署目標）。
- commit message 照專案慣例；push 後 Zeabur 監看到 GitHub 變更自動觸發部署。

**Step 3 + 4 — 輪詢部署狀態、失敗抓 log**

- VPS 已裝 zeabur CLI + 登入、context 設好（`reference_zeabur_cli`）。
- 輪詢：`zeabur deployment list`（看最新一筆狀態 BUILDING / RUNNING / FAILED）。
- 部署是 **external state、harness 追不到**——用 `Monitor` until-loop 或 `ScheduleWakeup` 輪詢，cadence 抓部署實際耗時（build 多在分鐘級，60–270s 一次、別 busy-loop）。
- 失敗 → `zeabur` 抓 build / runtime log → 本地對症修 → 回 Step 2 重 push。**deploy 綠之前不進 E2E。**

**Step 5 — Playwright 打部署後 URL（序列）**

- `PLAYWRIGHT_BASE_URL` / test config 指向**部署後的 URL**，不是 localhost。
- ⚠️ **storageState 要對部署網域重產**：既有 `tests/e2e/.auth/*.json` 是 localhost 網域的 cookie，**換網域作廢**——對部署後 URL 重跑登入產新 storageState（`reference_e2e_test_accounts` 的 `--refresh`，但 base URL 換成部署端）。
- 仍**嚴格序列**：一個流程跑完、Chromium 關掉，再跑下一個（§4）。
- 寫入流程仍是 gate（`feedback_e2e_write_flows`）：實走確認 DB 落地（RLS / 欄位 / action 寫入錯，tsc/build 抓不到）。

**Step 6 — 失敗回修、全綠收工**

- 主 agent 跑 workflow、把 step 1/3-5 交給 sub-agent；開發機全程不背常駐 dev server。

### 3.3 部署端資料安全（MANDATORY）

部署後環境是**共享 / 可能就是正式**，E2E 寫入會留資料：
- 測試資料一律 `brand_id='indian'`（`feedback_demo_data_indian_brand`）。
- **測完清乾淨**（沿用過往 e2e SOP：建臨時資料 → 驗 → 刪還原）。
- 部署端**禁止破壞性操作**（DROP / 大量 DELETE 非自己造的資料）。
- 若打的是正式環境，避免不可逆動作；最佳解是有獨立 staging / preview（見 §3.4）。

### 3.4 部署 / 測試目標：直接打正式（2026-05-29 拍板）

`main` 一 push 自動部署到 **`DealerOS-Production`（正式）**，E2E 就打這個正式 URL。

**理由**：現在還在開發階段，正式庫沒有真客戶資料，不值得為隔離另開環境。將來真的分出沙盒 / 正式再議（屆時改回 staging / branch-preview 模型）。

**因此 push = 直接上正式，自審關卡（§3.2 Step 1）不能省**，而且：
- 測試資料一律 `brand_id='indian'`、**測完清乾淨**（建臨時資料 → 驗 → 刪還原）。
- **禁止破壞性操作**（DROP / 大量 DELETE 非自己造的資料）。
- 不做不可逆動作。

---

## 4. 序列鐵律（碰共享資源的相，違反會炸）

### 4.1 E2E：一個流程一個頁面，並行度永遠 = 1

> Ming 親定。`feedback_sub_agent_resource_discipline`：Playwright 動態探測禁止多 sub-agent 並行。

- E2E 階段**禁用** `parallel()` 撒多個 Playwright agent。
- 用序列 `for` 迴圈，或 `pipeline` 但同時只有一個 Playwright agent 在跑。
- 理由有二：① 打**單一**部署後測試環境，平行寫入會互相污染、撞單號；② Playwright Chromium client 仍跑在開發機、仍吃記憶體。

### 4.2 DB migration：單一 agent 序列，永不 fan-out

- Cloud Supabase apply-once，平行 apply 會 race / 重複建表，雲端無法乾淨回滾。
- migration 是 WF-B 第一個、單一、序列步驟。
- 新表必帶 RLS 4 條 `user_has_brand` policy（`feedback_rls_migration_sop`）——漏了 Ming 的 Indian 帳號全空畫面。

### 4.3 `.next` 污染：本地 build / 平行建頁要隔離

> `next_build_pollutes_dev_catchall`：build 後 `.next` 污染，新巢狀 route 被 catch-all 蓋成 placeholder。

- 本地 build 前先 `rm -rf .next`。
- 落地階段多 agent 平行建頁 → 必 `isolation:'worktree'`，各自 build 不互污染；worktree 記得 `ln -sf <main>/.env.local .env.local`。

### 4.4 同檔寫入：worktree 或拆到不重疊檔案

- 平行落地前提是每個 agent 改的檔不重疊；一頁一 worktree 最乾淨。
- 共享檔（`src/lib/modules.ts`、`database.types.ts`、`transactions.ts` 的 `TX_TYPES`）收斂到單一序列步驟。

---

## 5. 可平行鐵律（純讀相，放心撒）

- **結構分析（Stage 1）**：一頁一 agent 讀 HTML / nav_node / 截圖，回結構化 entity/action/kpi。
- **靜態稽核**：天條 `grep @/lib/supabase`、Design Pattern token 漂移、DataGrid vs 手刻 table、RLS policy 存在性——一檔一 agent，回結構化 findings。
- **提案撰寫**：一功能一 agent 寫不同檔名的 `.md`。
- **對抗式驗證**：對每個疑似違規開 N 個 skeptic agent 從不同 lens 判（真 list view 還是合法豁免）——grep 做不到、agent 才做得到。

平行度受 Workflow 內建 ~16 上限自動節流——但前提是這些 agent 都**不碰 §4 的共享資源、不打部署端**。

---

## 6. 落地檢查清單（寫任何 spec-to-feature workflow 腳本前對一遍）

- [ ] 這個 phase 會不會起本地 `next dev`？→ **不准**，驗證走 deploy-then-test 打部署端。
- [ ] E2E 有沒有平行？→ 鎖並行度=1。
- [ ] 有沒有碰 cloud migration？→ 單一序列 agent，never fan-out。
- [ ] 平行 agent 會不會跑 build / 改同檔？→ `isolation:'worktree'` + `rm -rf .next`。
- [ ] 流程裡有沒有人類決策點（拍板）？→ workflow 在此切段，回主迴圈 AskUserQuestion。
- [ ] 部署失敗的分支有沒有 handle？→ 抓 `zeabur` log → 修 → 重 push，綠了才進 E2E。
- [ ] E2E 打的是部署後 URL 嗎？storageState 對部署網域重產了嗎？
- [ ] 寫入測試資料 `brand_id='indian'` + 測完清乾淨了嗎？部署端有沒有誤做破壞性操作？
- [ ] 有沒有 silent cap？（top-N、抽樣、跳過）→ 用 `log()` 講清楚漏了什麼。

---

## 7. 速查：primitive 選擇

| 你要做的事 | 用哪個 | 並行度 |
|---|---|---|
| N 頁結構分析 | `parallel(pages.map(p => () => agent(...)))` | 自動 ~16 |
| 分析→提案 流水線 | `pipeline(pages, analyzeStage, proposeStage)` | 自動 ~16 |
| 平行建頁（會改檔/build） | `pipeline(pages, p => agent(..., {isolation:'worktree'}))` | 自動 ~16，各自隔離 |
| DB migration | 單一 `await agent(...)`，不包進 parallel/pipeline | 1 |
| 輪詢 Zeabur 部署 | 單一 agent + `Monitor`/`ScheduleWakeup` until-loop 跑 `zeabur deployment list` | 1 |
| E2E 多頁驗證（打部署後 URL） | 序列 `for (const p of pages) { await agent(...) }` | **1（鐵律）** |
| 靜態稽核多檔 | `parallel(files.map(f => () => agent(...)))` | 自動 ~16 |
| 殺假陽性 | 對每個 finding `parallel([lens1, lens2, lens3].map(...))` | 自動 ~16 |
