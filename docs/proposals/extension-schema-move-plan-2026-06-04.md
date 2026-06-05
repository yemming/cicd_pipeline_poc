# 計畫書：把 citext / pg_trgm / vector 搬出 public schema

> **狀態：計畫 / 待 Ming review，未執行。** 目標 Supabase = `bykvtcptbirpxyqkfwfl`（prod）。
> 對應 advisor lint：`extension_in_public`（3 條 WARN）。Ming 2026-06-04 指示「排計畫搬」。

## 1. 為什麼要搬

Supabase advisor 建議擴充不要裝在 `public`：① 跟業務物件混在同一 namespace、② 擴充的 function 會被 PostgREST 當 RPC 暴露（也是 secdef_executable lint 的一部分來源）、③ 升級擴充時動到 public 較危險。把它們搬到專屬 `extensions` schema 是 Supabase 慣例。

## 2. 現況盤點（已查 prod）

| 項目 | 數量 | 說明 |
|---|---|---|
| `citext` 欄位 | 1 | 影響面極小 |
| `vector` 欄位 | 1 | RAG 用（rag_chunks.embedding 之類）|
| trgm 索引（gin/gist_trgm）| 1 | global_search_index 模糊搜尋 |
| vector 索引（hnsw/ivfflat）| 1 | RAG 相似度搜尋 |
| **DB search_path** | — | **已是 `"$user", public, extensions`** ✅ |

**好消息**：`extensions` schema 已在 DB search_path 上 → 搬過去後，未 qualified 的 type/operator 仍解析得到（一般情境不會壞）。blast radius 只有 4 個物件。

## 3. ⚠️ 關鍵交互雷（必處理）

本輪 RLS hardening 的 `p4b` migration 把 36 個專案 function 釘成 `SET search_path = public`。其中 **`match_rag_chunks` 用 vector 運算子（`<=>` / `<->`）**。一旦 vector 搬到 `extensions`，這支 function 的 function-local search_path 只有 `public`、**找不到 vector 運算子 → RAG 搜尋會壞**。

→ 搬遷時**必須同步**把用到擴充運算子的 function 改成 `SET search_path = public, extensions`。目前已知只有 `match_rag_chunks`；執行前用下面 SQL 再掃一次確認沒有遺漏（含 trgm `%`、citext 比較）。

```sql
-- 掃出 body 用到擴充運算子/函式、且 search_path 只釘了 public 的專案 function
SELECT p.proname, p.proconfig
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
  AND p.proconfig::text LIKE '%search_path=public%'
  AND (pg_get_functiondef(p.oid) ~* '(<=>|<->|<#>|similarity\(|%\s|::citext)');
```

## 4. 執行步驟（建議在 worktree / 低峰窗口）

```sql
-- 0) 確保 extensions schema 存在（Supabase 通常已建）
CREATE SCHEMA IF NOT EXISTS extensions;

-- 1) 搬三個擴充
ALTER EXTENSION citext  SET SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION vector  SET SCHEMA extensions;

-- 2) 修用到擴充運算子的 function 的 search_path（依 §3 掃描結果，至少 match_rag_chunks）
ALTER FUNCTION public.match_rag_chunks(vector, text, text[], text, text, integer)
  SET search_path = public, extensions;

-- 3)（可選）把 extensions 從 anon/authenticated 的 API 暴露移除，順帶清掉部分 secdef_executable lint
--    REVOKE USAGE ON SCHEMA extensions FROM anon, authenticated;  -- ⚠️ 先確認沒有 RLS/函式依賴才收
```

## 5. 驗證（執行後必跑）

1. **RAG 搜尋**：打一次 `match_rag_chunks`（chatbot 問答），確認有回 chunk、不報 operator 不存在。
2. **模糊搜尋**：global_search_index 的 trgm 搜尋（⌘K command palette / 全站搜尋）打中文關鍵字，確認有結果。
3. **citext 比較**：找那 1 個 citext 欄位的查詢頁，確認大小寫不敏感比較正常。
4. `npx tsc --noEmit` + 部署後 smoke。
5. 重跑 `get_advisors(security)`：`extension_in_public` 應 3→0，且**無新 ERROR**。

## 6. Rollback

```sql
ALTER EXTENSION citext  SET SCHEMA public;
ALTER EXTENSION pg_trgm SET SCHEMA public;
ALTER EXTENSION vector  SET SCHEMA public;
ALTER FUNCTION public.match_rag_chunks(vector, text, text[], text, text, integer) SET search_path = public;
```

## 6.5 De-risk 調查結果（2026-06-05，已查 prod，未動 DDL）

- ✅ **Baseline**：移動前三運算子都正常 — `'A'::citext='a'::citext`=true、`similarity('dealeros','dealerps')`=0.5、`'[1,2,3]'::vector<->'[1,2,4]'`=1.0。
- ✅ **受影響的釘死 function 只有 `match_rag_chunks`**（§3 掃描確認），執行時依 §4 step 2 補 `public, extensions` 即可。
- ⚠️ **唯一風險未決點 = PostgREST search_path**：`anon`/`authenticated` role **層沒設 search_path**（只有 statement_timeout），靠 DB 預設（`"$user", public, extensions`，含 extensions）+ PostgREST `db-extra-search-path`。**PostgREST 的 extra-search-path 從 SQL 讀不到**。
  - 若它含 `extensions`（Supabase 預設值就是 `public, extensions`）→ 搬遷安全。
  - 若不含 → 搬完 app 用未 qualified 的 trgm `%` / vector `<=>` 會解析失敗，**全站搜尋 + RAG 靜默壞**。
- **因此本條不在 prod 盲搬。** 安全做法二選一：
  1. **Supabase branch 測**：開 branch、搬、跑 §5 驗證（含真打一次 ⌘K 全站搜尋 + chatbot RAG）、綠了再 merge。
  2. **先確認 PostgREST 設定**：到 Supabase Dashboard → Settings → API（或 Project config）確認 `extra search path` 含 `extensions`，含就可直接照 §4 搬。

## 7. 建議

- blast radius 小（4 物件）+ search_path 已含 extensions → **技術上低風險**，但會動到 RAG / 全站搜尋這兩個「看起來沒壞才知道有壞」的功能，**務必跑 §5 驗證**。
- 屬 WARN（非 ERROR、非資料外洩）→ 不急。可跟「mat view leak 修補部署」「business RPC 進一步收 anon」併成一個「DB 安全收尾」批次，一起 commit + 部署 + 驗證，省 round-trip。
- 不建議單獨為這條跑一次部署。
