# supabase/migrations — DB 變更版本控制規範

命名沿用 Supabase CLI 慣例：`<version>_<name>.sql`，`version` 為 `YYYYMMDDHHMMSS`（UTC），
與 cloud `supabase_migrations.schema_migrations` 的 version 對齊。正式站為 Supabase Cloud
`bykvtcptbirpxyqkfwfl`。

## 規範（MANDATORY，2026-06-17 起重申）

> **所有涉及流程控制、行為稽核、資料結構的 DB 變更，一律要有 migration 檔進版控。**

- DDL（CREATE / ALTER / DROP — TABLE・COLUMN・CONSTRAINT・POLICY・FUNCTION・TRIGGER…）
  落地時，**同一輪 commit 內**必須補上對應 `.sql` 檔。
- 套用方式：透過 Supabase MCP `apply_migration`（會同步寫入 cloud `schema_migrations`）
  或 `supabase db push`；兩者皆會留 version 記錄。
- 檔案內容必須與正式站實際套用的 SQL 一致，可核對：
  ```sql
  SELECT array_to_string(statements, E'\n')
  FROM supabase_migrations.schema_migrations WHERE version = '<v>';
  ```
- **禁止**：直接在正式站改 schema 卻不補 migration 檔（無法回溯、稽核、重現）。
  > 2026-06-17 Russell 補充要求項目二即針對此：`repair_orders_prefix_p1_check` 的
  > TL 白名單變更原直接套正式站、未進 codebase，現已補檔
  > （`20260616141106_add_tl_to_repair_orders_prefix_p1.sql`）。

## 歷史 migration 來源（單一事實來源）

本專案早期（~2026-04 ～ 2026-06）部分 schema 以 MCP `apply_migration` 直接套用到 cloud，
**完整 version 記錄保存在 cloud `schema_migrations` 表**；本目錄收錄逐輪補上的檔案，
歷史落差可隨時用官方路徑補齊：

```bash
supabase link --project-ref bykvtcptbirpxyqkfwfl
supabase db pull        # 把 cloud 全量 migration 歷史寫成本地 timestamp_*.sql
```

完整清單（任何時候）：

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

## 2026-06-16 ～ 06-17 退料閉環 + TL 工單 這一輪的 migration

| 檔案 | 說明 |
|------|------|
| `20260616120000_aftersales_payments.sql` | 售後收款表 |
| `20260616123000_employees_manager_flags.sql` | employees 主管 / 跨部門旗標 |
| `20260616132008_create_parts_return_requests.sql` | 退料閉環核心表（售後 / TL 退料待倉管確認） |
| `20260616141106_add_tl_to_repair_orders_prefix_p1.sql` | repair_orders prefix 白名單加入 `TL`（6/17 補檔） |
| `20260617033103_tl_bridge_work_orders_customer_id_nullable.sql` | 放寬 work_orders.customer_id NOT NULL（TL 橋接 repair-pick 領料需求） |
