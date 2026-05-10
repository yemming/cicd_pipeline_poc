# supabase/migrations baseline

## 現況（2026-05-10）

Supabase Cloud 上累積 **76 個 migration**，全部透過 supabase MCP `apply_migration` 直接打 Cloud（沒走 file → push 流程）。

完整 history 用：
```bash
supabase migration list
# 或 SQL：SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

## 本目錄收錄哪些檔案

- 只收 **2026-05-10 session** 動的 5 個 migration（cleanup Indian dummy / vehicle rename / GL column 重接 / required_dimensions backfill）
- 之前 71 個 migration 留在 cloud `supabase_migrations.schema_migrations` 表

## 建立完整 baseline 的建議

下次有空時，在本地 run：
```bash
# 1. 確保 supabase CLI 已 link 到 project
supabase link --project-ref bykvtcptbirpxyqkfwfl

# 2. 一次拉所有 cloud migration 到 local
supabase db pull

# 這會把 71 個 historical migration 寫成 supabase/migrations/ 下的 timestamp_*.sql 檔
# 之後 schema 改動就可走 file → supabase db push 流程
```

## 為什麼不直接把 76 個全 dump 進來

- supabase MCP `execute_sql` 一次只能 query 部分 row（result token 限制）
- 自動分批 dump 容易跟 supabase CLI 自己 pull 出來的 timestamp/檔名格式不一致 → 之後 push 時會踩 migration ordering bug
- 用 `supabase db pull` 是 supabase 官方支援的 baseline 路徑，最安全

## 注意事項

- 所有 schema 變動目前仍走 supabase MCP `apply_migration` 直接 cloud（`docs/proposals/dimension-integration-research-2026-05-10.md` §7 Phase 2 待規劃）
- 完成 `supabase db pull` 後可考慮切換 file-based 流程
