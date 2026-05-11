# Purchase Replenishment — Domain Helper 遷移提案

**日期**：2026-05-11
**範圍**：`/parts/purchase/replenishment`（§4.2 日常補貨計畫）
**性質**：純遷移、無功能變更、無 schema 變更

## 背景

CLAUDE.md §資料存取架構 規定 UI 只能透過 `@/domain/*` helper 讀寫資料庫，不准直接 import `@/lib/supabase` 或繞著 `@/lib/parts/*-actions` 走。本頁的舊 server actions 還在 `src/lib/parts/replenishment-actions.ts`，這次把它一檔整搬到 `src/domain/replenishment.ts`，跟同輪剛建好的 `domain/dictionaries.ts` 對齊。

## 動機

- 排除 UI ↔ 舊 server actions 直連、收歸到 domain layer 單一入口
- 未來需要切換實作（RPC ↔ 直連 ↔ 跨表事務）時 UI 不動
- 跟 §4.2 後續演進（webhook trigger 自動補貨、跨倉 transfer 整合）保留乾淨接點

## Scope

### A. 新增 `src/domain/replenishment.ts`
- `runReplenishment(input)` — 呼叫 supabase RPC `calculate_replenishment`
- `ignoreReplenishmentLines(lineIds)`
- `updateSuggestedQty(lineId, newQty)`
- `convertLinesToPRs(input)`
- 型別：`RunReplenishmentResult` / `LineActionResult` / `ConvertResult`

實作 1:1 從舊檔搬，無邏輯改動。`"use server"` directive 保留、權限檢查保留、`revalidatePath` 保留。

### B. UI import path 切換
- `src/app/(workspace)/parts/purchase/replenishment/_components/replenishment-board.tsx` L12
  - 原：`from "@/lib/parts/replenishment-actions"`
  - 改：`from "@/domain/replenishment"`
- `page.tsx` 沒 import 舊 actions（純 server data fetching），不需動

### C. 刪除舊檔
- 確認全 repo `grep -rn "lib/parts/replenishment-actions"` 只有上述一筆 import → 改完即刪
- 刪除 `src/lib/parts/replenishment-actions.ts`

## 不做

- ❌ 不改 UI 結構 / filter / table / 一鍵建單流程
- ❌ 不動 supabase RPC `calculate_replenishment` 或任何 DB schema
- ❌ 不動 requisitions（另一個 agent 在處理）
- ❌ 不開 worktree、不 commit

## 風險

極低。純檔案位置遷移，函式簽章與內部實作完全一致。型別由 board 端 import 即可，TypeScript 編譯會把問題即時抓出。

## 驗證

- `npx tsc --noEmit` → 0 errors
- `npx eslint "src/app/(workspace)/parts/purchase/replenishment" src/domain/replenishment.ts` → 0 errors
- 手測（由 Ming 統一執行）：執行補貨計算、忽略建議、調整建議量、一鍵建立 PR

## 跟 `domain/dictionaries.ts` 寫法是否一致

- ✅ `"use server"` directive
- ✅ Header comment 標明取代來源 + 提案路徑
- ✅ 同樣 import 順序：next/cache → supabase → rbac → permissions → scope
- ✅ 不 export 非 async value（沒有任何常數 / 物件被 export）
- ⚠️ 沒有像 dictionaries 那樣拆 `Result<T>` 共用型別 — replenishment 三組 action 各自的成功 payload 形狀差太多（`runId/lines/amount` vs 純 ok vs `createdPRs[]`），抽共用 generic 反而增加噪音，維持原檔的個別 `*Result` discriminated union。
