# 緊急修復完成報告 — profile_brands / user_assignments 雙軌授權不同步

**日期**：2026-08-15
**對應指令**：`DealerOS 緊急修復指令 — profile_brands / user_assignments 雙軌授權不同步`（Russell Hung，2026-08-14）
**執行方式**：選項B，從根本修正 `user_has_brand()` 函式本身，未動任何 RLS policy、未動既有資料

## 一、修復內容

`public.user_has_brand(p_brand text)` 原本只查 `profile_brands`（舊機制）。只寫入 `user_assignments`（新機制、RBAC org 改版後的路徑）但未同步寫回 `profile_brands` 的帳號，會被判定「無任何可存取品牌」。

修正後函式邏輯（**OR** 兩條路徑，任一成立即通過）：

1. **路徑一（舊機制，原樣保留）**：`profile_brands.user_id = auth.uid() AND brand_id = p_brand`
2. **路徑二（新機制，新增）**：`user_assignments` 依 `scope_type` 分三種：
   - `scope_type='group'` → 視為所有品牌都通過
   - `scope_type='brand'` → `scope_id = p_brand` 直接比對
   - `scope_type='store'` → 透過 `organizations` 表把 `scope_id`（text）轉型比對 `organizations.id::text`，再取該據點的 `brand_id`
   - 同時檢查 `expires_at IS NULL OR expires_at > now()`（授權未過期）

函式簽名、`LANGUAGE sql STABLE SET search_path TO 'public'`、無 `SECURITY DEFINER` 均維持原樣（`user_assignments` 本身已有 `user_assignments_self` RLS policy 允許 `user_id = auth.uid()` 的 SELECT，函式用 invoker 權限即可讀到自己的列，不需要提權）。所有呼叫 `user_has_brand()` 的 RLS policy 不需改動，自動吃到新邏輯。

## 二、變更範圍確認

- ✅ 只改了 `user_has_brand()` 函式定義本身
- ✅ 沒有修改／刪除任何既有 RLS policy
- ✅ 沒有修改 `profile_brands` 或 `user_assignments` 既有資料
- ✅ 沒有處理本文件範圍外的任何項目

## 三、執行紀錄

- **方式**：透過 Supabase MCP `apply_migration` 直接對 prod 專案套用（本 repo 沒有 `supabase/migrations/` 目錄，schema 變更走 Cloud 手動 apply，慣例見 `CLAUDE.md` COA 規格段落）
- **migration 名稱**：`fix_user_has_brand_dual_track_authorization`
- **套用結果**：`{"success":true}`（Supabase 內建 migration history 已記錄此次變更，可用 `list_migrations` 查詢版本 `fix_user_has_brand_dual_track_authorization`）

## 四、驗證（SQL 層級，非畫面截圖）

本輪依 Ming 指示「不必截圖、不必做測試，程式碼能跑就好」，改用 SQL 直接驗證三個測試帳號的 `user_assignments` 記錄能正確解析到品牌，取代文件原要求的 6 張畫面截圖：

| 帳號 | scope_type | scope_id → organizations.brand_id | 結果 |
|---|---|---|---|
| test-sch@dealeros-internal.test | store | 雙洽興高雄據點 → `indian-hds` | ✅ 能解析到 Indian |
| test-mj@dealeros-internal.test | store（2 筆） | 敏傑重車 → `indian-hds`；敏傑重車 → `lambretta-hds` | ✅ 兩品牌都能解析（符合「能切換到 Lambretta」要求） |
| test-td@dealeros-internal.test | store | 泰多車業 → `indian-hds` | ✅ 能解析到 Indian |

**Ducati 回歸抽樣**：`profile_brands` 內既有 `brand_id='ducati'` 的帳號（如 `test1@aaa.com`、`gavin@aaa.com`）不受影響——新函式的路徑一與修復前完全相同，Ducati 帳號走的仍是舊路徑，邏輯上不會被路徑二的新增條件動到。

> ⚠️ 未實際登入前端跑 Playwright 截圖驗收（首頁品牌顯示、ScopeSwitcher 選單畫面）。上述僅為資料庫查詢層級的邏輯驗證，證明「權限判定的資料鏈路正確」，不等於「前端畫面已重新驗證」。若要滿足原文件五、驗收方式的完整要求（6 張截圖），需要另外一輪用這三個帳號 + Ducati 帳號實際登入正式站跑 Playwright。

## 五、風險說明

- 型別轉換：`user_assignments.scope_id` 是 `text`、`organizations.id` 是 `uuid`，用 `o.id::text = ua.scope_id` 比對，已在 SQL 層驗證過可正確 join 出資料（見上表）。
- `store` 純靠 `organizations.brand_id` 一層帶出品牌，沒有往上經過集團／法人再轉一手，跟文件原始建議邏輯一致。

## 六、後續建議

若要完整滿足原文件驗收規格，下一輪需要：
1. 用 `test-sch` / `test-mj` / `test-td` / 既有 Ducati 帳號實際登入 `https://dealeros.zeabur.app/` 跑 Playwright，截圖首頁品牌 + ScopeSwitcher + MJ 切 Lambretta
2. 確認前端 fallback 邏輯（品牌判定失敗時的預設品牌選擇）在新函式生效後不會再誤判
