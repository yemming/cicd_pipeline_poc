# feature: deploy-log（上版紀錄頁）— Phase 1 結構分析

> spec-to-feature 階段 1。slug=`deploy-log`。觸發來源：Ming 要把 LINE「已上版」卡片的「前往查看」導到一個能回看每次上版的開發紀錄頁。

## 1. 頁面類型
**list / timeline**（唯讀時間軸）。每筆=一次上版（version + 更新摘要 + 時間 + commit 數）。無 CRUD（資料由部署流程自動寫入）。

## 2. 資料實體
名詞 → 候選 table `deploy_logs`：
| 欄位 | 型別 | 來源 | 說明 |
|------|------|------|------|
| id | uuid pk | gen_random_uuid() | |
| version | text | payload.version | commit short sha（如 0bae0bc） |
| summary | text | payload.summary | 本輪更新摘要（每行一筆 commit 標題） |
| change_count | int | payload.changeCount | 本輪 commit 數 |
| deployed_at | timestamptz | payload.deployedAt（Asia/Taipei 字串）→ 存 UTC | 上版時間 |
| url | text | payload.url | 部署 URL |
| created_at | timestamptz default now() | | 寫入時間（落地時序，備援排序） |

## 3. 互動
- 唯讀。列表倒序（最新在上）。
- 之後可加：篩選日期、點開看完整 commit list。Phase 1 先純列表。

## 4. 既有可複用（grep 結果，禁止重造）
- **資料寫入點已存在**：`src/app/api/deploy/released/route.ts` 收 payload 後只 `notifications.dispatch()`，**沒落地** → 在這裡加一筆 insert 即可，不另開 endpoint。
- **supabase client**：`@/lib/supabase/server`（server component）、`@/lib/supabase/service`（service-role，route 寫入用）。
- **頁面慣例**：server component `page.tsx` → 呼叫 `@/domain/xxx` helper → 傳給 board/client 元件（參 sales/funnel）。
- **domain helper 慣例**：`"use server"` 開頭，內部自己 import supabase（天條只禁 UI 直連），檔放 `src/domain/`。
- **LINE 卡片連結**：`src/lib/notifications/templates/deploy-released.ts` 的「前往查看」按鈕 url ← 目前指 payload.url(首頁)。

## 5. 資料來源策略
**純真實落地**（非 seed、非即時算）。每次部署成功 → released route 寫一筆。歷史資料無法回填（過去上版沒存），從這次起累積。
> git log 即時撈方案已否決：正式站容器無 git 工作目錄，跑不了 git log。
