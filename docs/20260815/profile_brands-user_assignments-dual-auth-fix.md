# 緊急修復完成報告 — profile_brands / user_assignments 雙軌授權不同步

**日期**：2026-08-15（初版修復）／2026-08-16（Playwright 截圖驗收 + 修掉過程中發現的遞迴 regression）
**對應指令**：`DealerOS 緊急修復指令 — profile_brands / user_assignments 雙軌授權不同步`（Russell Hung，2026-08-14）
**執行方式**：選項B，從根本修正 `user_has_brand()` 函式本身，未動任何 RLS policy、未動既有資料
**目前狀態**：`test-mj` / `test-td` / 既有 Ducati 帳號三項截圖驗收通過；`test-sch` 卡在跟本次修復無關的資料問題（見 §6.3），待另外確認

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

## 六、後續補做（2026-08-16 追加）

8/15 只做到 SQL 層驗證，8/16 補跑 Playwright 對正式站 `https://dealeros.zeabur.app/` 實際登入 + 截圖，過程中發現並修掉一個**我方修復本身引入的 P0 regression**，記錄如下。

### 6.1 發現的新 bug：`user_has_brand()` 遞迴炸 `organizations` 表

8/15 版函式的「路徑二 / store 分支」為了把 `scope_id` 轉成 `brand_id`，內部查了一次 `organizations` 表：

```sql
(ua.scope_type = 'store' AND EXISTS (
  SELECT 1 FROM public.organizations o
  WHERE o.id::text = ua.scope_id AND o.brand_id = p_brand
))
```

但 `organizations` 表自己的 RLS SELECT policy 也是用 `user_has_brand(brand_id)` 守門。結果任何持有 `scope_type='store'` 的 `user_assignments` 帳號，只要查詢 `organizations` 表（幾乎所有頁面的下拉選單、scope 解析都會查這張表），就會觸發：

```
查 organizations → 觸發 RLS → 呼叫 user_has_brand() → store 分支又查 organizations → 再次觸發 RLS → ……（無限遞迴）
```

實測直接打爆：`stack depth limit exceeded`（Postgres error code 54001）。這條路徑在 8/15 當下**沒有在驗證裡跑到**（SQL 驗證只測了 `user_has_brand()` 本身回傳 true/false，沒有透過真正的 RLS session 去查 `organizations`），是這次用 Playwright 跑真實登入才浮出來的。

**修法**：比照 repo 裡既有的同類 helper `user_has_subsidiary()` 的既定寫法，把 `user_has_brand()` 改成 `SECURITY DEFINER`。函式 owner 是 `postgres`、`rolbypassrls=true`，`SECURITY DEFINER` 執行時內部查 `organizations` 會直接跳過 RLS，不再觸發 `organizations` 自己的 policy，遞迴就此打斷。migration：`fix_user_has_brand_recursion_security_definer`。

修復前後直接對 `organizations` 表下查詢驗證（用 test-sch 的 session）：

| 階段 | 結果 |
|---|---|
| 只套 8/15 版（無 SECURITY DEFINER） | `stack depth limit exceeded` |
| 套用 `SECURITY DEFINER` 後 | 正確回傳 `{"id":"...","brand_id":"indian-hds","name":"雙洽興高雄據點"}` |

⚠️ 這代表 8/15 ~ 8/16 這段時間內，**任何既有的 store-scope `user_assignments` 帳號**（不只三個測試帳號，任何角色只要是 store 層級授權）查 `organizations` 表都會噴錯，是比原始 bug 影響面更廣的 regression。已在同一天內修掉，但記錄下來是因為往後任何要改 `user_has_brand()` 或類似 helper function 的人都要注意：**helper function 內部查的表，如果那張表自己的 RLS 又呼叫同一個 helper，一定要 SECURITY DEFINER，否則遞迴**。

### 6.2 Playwright 截圖驗收結果

用 `scripts/verify-user-has-brand-fix-20260816.mjs` 對正式站實際登入 4 個帳號，截圖存在 `docs/20260815/screenshots/`：

| 帳號 | 結果 | 截圖 |
|---|---|---|
| test-sch@dealeros-internal.test | ❌ 仍 fallback 到 Ducati，但**原因跟本次修復無關** —— 詳見 6.3 | `1-test-sch-home.png` |
| test-mj@dealeros-internal.test | ✅ 首頁正確顯示「Indian Motorcycle（海德生總代理）」 | `3-test-mj-home.png` |
| test-mj@dealeros-internal.test | ✅ ScopeSwitcher 選單正確列出 Indian + Lambretta 兩個品牌 | `3b-test-mj-switcher.png` |
| test-mj@dealeros-internal.test | ✅ 切換到 Lambretta 後首頁正確顯示「Lambretta（海德生總代理）」，sidebar branding 也跟著換 | `4-test-mj-lambretta.png` |
| test-td@dealeros-internal.test | ✅ 首頁正確顯示「Indian Motorcycle（海德生總代理）」 | `5-test-td-home.png` |
| yemming.yu@gmail.com（Ducati 回歸測試，`profile_brands` 同時有 indian(admin)+ducati(member) 兩筆） | ✅ 預設落在 Ducati Taipei（admin 帳號、`brands` 表第一筆是 ducati）、切換 Ducati 選項後畫面正常、無任何錯誤，個人化問候「早安，Ming You」正常渲染 | `6-ducati-regression-home.png` |

test-mj / test-td / Ducati 回歸三項全過，證明本次雙軌授權修復（含 6.1 的遞迴修正）在真實登入流程下是有效的。

### 6.3 test-sch 仍看到 Ducati 的原因：跟這次修復無關的資料問題

深查後發現：test-sch 的 `user_assignments` 指向的據點「雙洽興高雄據點」（`organizations.id = cccdf3b2-9d00-40cc-8514-4b73786fe75c`）**`is_active = false`**。前端算「使用者可存取哪些品牌」的邏輯（`src/lib/scope/active-scope.ts` 的 `getAccessibleScopes()`）在撈 `organizations` 時多帶了 `.eq("is_active", true)` 過濾，所以即使 RLS 都放行了，這張店本身被標記停用，仍會被這層業務邏輯濾掉，導致 test-sch 的可存取品牌清單是空的、退回 env 預設值 `ducati`。

這是**測試資料本身的問題**（該筆 org 被標記停用，不確定是刻意如此還是資料建置時的疏漏），跟 `user_has_brand()` 的修復邏輯無關 —— 已用 SQL 直接驗證：`user_has_brand()` 本身、`user_assignments` 查詢、`organizations` RLS 讀取，三層在 test-sch 身上全部正確運作，唯獨最後這層 `is_active` 業務過濾把它擋下來。

依原文件規則②「不得順手處理任何本文件範圍外的項目」，**沒有**擅自把這筆 `organizations.is_active` 翻回 `true`。若要讓 test-sch 也能正常登入看到 Indian，需要 Ming／Russell 確認「雙洽興高雄據點」這筆組織資料本來就該是啟用狀態，再另外處理。

### 6.4 驗證腳本

`scripts/verify-user-has-brand-fix-20260816.mjs`（Playwright，headless，跑正式站）— 之後要重驗這條授權路徑可以直接重跑，會覆蓋 `docs/20260815/screenshots/` 底下同名截圖。
