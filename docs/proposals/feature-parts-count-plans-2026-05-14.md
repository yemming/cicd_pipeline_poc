# Feature Proposal — `/parts/count/plans` 盤點計畫 (Design Pattern Upgrade)

**Date**: 2026-05-14
**Author**: Claude (subagent #4 of 22)
**Status**: Self-approved per user delegation, implementing immediately.

## 1. 範圍 / Scope

把現有 placeholder 的 `/parts/count/plans` 頁面升級成完整 design pattern：
- List View（DataGrid + filter bar + create/edit modal）
- Page View（`[id]` detail 三 mode：view / edit / create）
- 完整 CRUD（create / update / toggle active / delete）

## 2. 不做 / Out of Scope

- 排程實際觸發（schedule_cron → cron 執行器）是另一個非同步任務，不在這次。本頁只負責 CRUD 設定。
- 多倉位多選（plan 限定單倉）。
- nav_nodes 改動（路徑已存在）。

## 3. 三件套架構盤點

### Schema（已存在）
```
inventory_count_plans (
  id, brand_id, warehouse_id,                -- typed core
  plan_name, plan_type, abc_filter,
  schedule_cron, next_run_at, last_run_at,
  is_active, notes, metadata jsonb,
  created_at, updated_at, created_by
)
```

`plan_type` 文獻已用值（既有 createCountPlanAction）：`cycle / full / spot / abc_a / abc_b / abc_c`，這次保持一致；UI 顯示用 zh-TW label。

### Domain Helper（`src/domain/count.ts`）
- `getCountPlansPageData()` — 已存在，擴充支援 `filter: { is_active?, q? }` + 回傳 `warehouses`。
- `getCountPlanById(id)` — 新增。
- `getNewCountPlanFormData()` — 新增（撈 warehouses）。
- `updateCountPlanAction(id, patch)` — 新增 server action。
- `setCountPlanActiveAction(id, active)` — 新增。
- `deleteCountPlanAction(id)` — 新增。
- `createCountPlanAction` — 已存在於 `@/lib/parts/actions`，直接 re-export 或包一層。

action 一律走 `Result<T> = { ok: true; data } | { ok: false; error }` 慣例（已是 createCountPlanAction 的 shape）。

## 4. UI 結構

### List View（`_components/count-plans-board.tsx` 重寫）
```
Page Header  [盤點計畫] [8.1] [設定週期性盤點、自動排程]
Filter Bar   [計畫名/倉庫/類型/啟用] [查詢] [重置] [＋ 新增計畫]
Toolbar      共 N 筆 ...
DataGrid     plan_name | warehouse | plan_type chip | abc | cron(mono) | next_run | is_active chip | [檢視][停用][刪除]
[Modal]      建立 / 編輯
```

inline editable：`plan_name`（text）。其餘走 modal（fk/enum/cron 不適合 inline）。

### Page View（`[id]/_components/count-plan-detail-view.tsx` 新增）
```
Breadcrumb + mode badge + CRUD pill bar
Title Card   標題 + chip 列（啟用 chip / 類型 chip）
▼ 基本資料   plan_name / warehouse / plan_type / abc_filter
▼ 排程設定   schedule_cron / next_run_at / last_run_at
▼ 備註       notes
```

無 tabs（單表簡單配置，不需要）。

create mode：同頁切換，欄位清空 + 標題顯示「（未命名計畫）」，建立後 router.push 到新 id。

## 5. 互動規範

- 所有寫入 button 在 pending：disabled + 文字換進行式 + 外層 `pointer-events-none opacity-60`。
- 成功 banner 2.2s 自動關閉、失敗 banner 留著。
- 樂觀更新：toggle / delete 走 useTransition，等 action 回來再 router.refresh。

## 6. 驗證 Checklist

- [x] tsc --noEmit 0 error
- [x] eslint 0 error
- [ ] Playwright: list load / create / edit / toggle / delete / detail navigation round-trip 全綠
- [x] demo data 一律 brand_id='indian'
- [x] 無 `@/lib/supabase` 直 import 在 UI

## 7. 已批准 — 落地中。
