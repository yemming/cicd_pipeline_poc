# RLS Hardening 提案 — 2026-06-04

> **狀態：✅ P0+P1+P2+P3 已套用 prod（2026-06-04，Ming 拍板）。P4 hygiene 另開一輪。** 目標 Supabase = `bykvtcptbirpxyqkfwfl`。
>
> **套用紀錄（4 支 migration）**：
> - `rls_hardening_p0_read_leak` — final_inspections / pre_inspections / followup_cases / followup_events / sales_quotes：`USING(true)`→`user_has_brand(brand_id)`
> - `rls_hardening_p1_write_contamination` — repair_orders / repair_order_lines / used_car_inventory：INSERT `WITH CHECK(true)`→`user_has_brand(brand_id)`（SELECT 不動）
> - `rls_hardening_p2_receiving_discrepancies` — 補標準 brand CRUD（原 0 policy）
> - `rls_hardening_p3_notification_config_write` — notification_channels/templates：讀全開、寫收斂給 `is_app_admin()`
> - `rls_hardening_p4_security_invoker_views` — 3 個 ERROR 級 view（followup_stats_by_store / v_stock_balances / sales_funnel_metrics）`SET (security_invoker=on)`，堵跨 brand 讀取外洩
> - `rls_hardening_p4b_function_search_path` — 36 個專案自有 function 釘 `SET search_path = public`（DO block 排除擴充成員）
> - `rls_hardening_p4c_revoke_trigger_fn_execute` — 11 個純 trigger SECURITY DEFINER function 從 PUBLIC 收 EXECUTE
>
> **驗證**：
> - 官方 `get_advisors(security)`：`security_definer_view` **3 ERROR→0**、`rls_policy_always_true` **14→0**、`function_search_path_mutable` **36→0**、secdef_executable **62→40**（剩 A 類 RLS helper + C 類業務 RPC，皆需 authenticated EXECUTE）、`rls_enabled_no_policy` **4→3**（service-only 故意鎖死，§Q2 已結案）
> - **殘留 hygiene 待計畫下一輪**：secdef_executable 40（逐支驗 caller 才能收 anon）、4 bucket（先查 app `.list()`）、3 extension_in_public（侵入性高需拍板）、1 mat view、1 auth_leaked_password_protection（GoTrue 設定、SQL 改不了）。詳見 `.claude/HANDOFF.md` Next Steps。
> - 真 JWT（`scripts/rls-hardening-verify.mjs`，indian persona）：7 張表 + 2 個 view 全部「看到=indian 列數、ducati 可見=0」→ 跨 brand 隔離精準
>
> **§Q2 已結案**：accounting_periods / transaction_types 只走 service client（accounting posting/instantiate-engine）讀，JWT 不碰 → 0-policy 鎖死正確、**不補 policy**，與 app_admins 同類。
>
> **funnel 語意註記（待 Ming 確認，非 bug）**：`sales_funnel_metrics` 改 invoker 後會吃 core5 人級 RLS（sales_handcards 只看自己）→ overseer(rs_manager) 看全店 funnel(126)、非 overseer(sales_lead) 看自己貢獻(122)。跨 brand 不漏。若要 funnel 對所有人都顯示全店總數，需把 helper 改走 service client 或 SECURITY DEFINER 函式（帶 brand gate）。
>
> rollback SQL 見 §3（未動；§P4-view rollback 在末段）。

## 0. 任務重定義（重要）

Ming 指定「做全 197 表 RLS」。實測 prod 現況：

- **public schema 共 205 張表，RLS enabled = 205/205（100%）。沒有任何一張裸奔表。**
- 「全表開 RLS」這個字面任務**早就完成**（歷來開發 + 6/1 組織 RLS 試點累積）。

所以真正該做的不是「鋪 RLS」，而是 **RLS Hardening**：修掉 prod 既有、被「全表已開 RLS」這句話遮住的真破口。下面是 `get_advisors(security)` 權威 lint（128 條）篩出的、與資料隔離直接相關的項目。

---

## 1. 破口清單（依嚴重度）

### 🔴 P0 — 讀取外洩（登入者跨 brand／甚至 anon 讀全部）

| 表 | 問題 policy | cmd | 漏洞 |
|---|---|---|---|
| `final_inspections` | `final_inspections_select/insert/update/delete` | 全 CRUD | `roles=public`＋全 true → **連未登入 anon 都能讀寫所有 brand 的交車檢查** |
| `pre_inspections` | `pre_inspections_authenticated_all` | ALL | authenticated USING+CHECK true → 登入者讀寫全部 |
| `followup_cases` | `followup_cases_brand_read` + `followup_cases_brand_write` | SELECT + ALL | SELECT true → 跨 brand 讀全部售後追蹤 |
| `followup_events` | `followup_events_brand_read` + `followup_events_brand_write` | SELECT + ALL | 同上 |
| `sales_quotes` | `sales_quotes_select/insert/update/delete_policy` | SELECT/INS/UPD/DEL | SELECT true → 跨 brand 讀全部報價 |

### 🟠 P1 — 寫入污染（SELECT 已 scoped，但寫入側 true，可塞別 brand 資料）

| 表 | 問題 policy | cmd | 漏洞 |
|---|---|---|---|
| `repair_orders` | `repair_orders_insert` | INSERT | WITH CHECK true → 可建別 brand 工單（讀已 scoped）|
| `repair_order_lines` | `repair_order_lines_insert` | INSERT | 同上（明細）|
| `used_car_inventory` | `brand_scoped_insert` | INSERT | 命名叫 brand_scoped 但 CHECK 是 true → 可塞別 brand 中古車 |

### 🟡 P2 — RLS enabled 但 0 policy（對 JWT client 全鎖死）

| 表 | rows | 判讀 |
|---|---|---|
| `app_admins` | 2 | 敏感表，鎖死 = 對；app 應走 service client / `is_app_admin()`。**維持鎖死**，僅補註解 |
| `accounting_periods` | 17 | 全域會計期間參考表，前端若要讀需補唯讀 policy |
| `transaction_types` | 25 | 全域交易類型參考表，同上 |
| `receiving_discrepancies` | 0 | **有 brand_id 的業務表卻 0 policy = 潛在 bug**；補標準 brand CRUD policy |

### 🟡 P3 — 全域 config 表寫入全開（無 brand_id，ALL true）

| 表 | 問題 | 建議 |
|---|---|---|
| `notification_channels` | `authenticated_all` ALL true | 讀可維持全開（員工要讀通知設定），**寫入收斂給 admin/overseer** |
| `notification_templates` | `authenticated_all` ALL true | 同上 |

### 🔵 P4 — 非 RLS 但同屬資安 lint（hygiene，分開處理）

- **3× ERROR `security_definer_view`**：`followup_stats_by_store`、`v_stock_balances`、`sales_funnel_metrics` 用 SECURITY DEFINER 定義 → 繞過呼叫者 RLS。改 `security_invoker=on`（PG15+）。**ERROR 級，建議納入本輪**。
- 36× `function_search_path_mutable`：trigger/util function 沒固定 search_path。一條 `ALTER FUNCTION ... SET search_path=''` 批次補。低風險、高量。
- 4× `public_bucket_allows_listing`：storage bucket（brand-assets/entity-images/parts-images/user-avatars）的 anon SELECT 允許列目錄。改成只允許物件存取、不允許 list。
- 3× `extension_in_public`（citext/pg_trgm/vector）、1× `materialized_view_in_api`（sales_metrics_monthly）、1× `auth_leaked_password_protection` off。屬設定面，獨立小批處理。

---

## 2. 修補 SQL（DRAFT — 每段 rollback 在 §3）

> 共同前提：標準 scope 運算式 = `user_has_brand(brand_id)`（與全站姊妹 policy 一致，已覆核）。
> ⚠️ **套用前每張表先驗 domain helper 存取路徑**：若該表 app 是走 service client 讀（繞 RLS），收斂不影響；若走 JWT client，收斂後該帳號只看本 brand —— 須確認本 brand 有資料、不會把畫面打空（比照 core5 SOP，用真 JWT 打 PostgREST 驗）。

### P0-A · final_inspections（最糟：public + 全 CRUD true）
```sql
DROP POLICY IF EXISTS final_inspections_select ON public.final_inspections;
DROP POLICY IF EXISTS final_inspections_insert ON public.final_inspections;
DROP POLICY IF EXISTS final_inspections_update ON public.final_inspections;
DROP POLICY IF EXISTS final_inspections_delete ON public.final_inspections;
CREATE POLICY final_inspections_select ON public.final_inspections AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_brand(brand_id));
CREATE POLICY final_inspections_insert ON public.final_inspections AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_brand(brand_id));
CREATE POLICY final_inspections_update ON public.final_inspections AS PERMISSIVE FOR UPDATE TO authenticated USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY final_inspections_delete ON public.final_inspections AS PERMISSIVE FOR DELETE TO authenticated USING (user_has_brand(brand_id));
```

### P0-B · pre_inspections（保留 service_role policy，只改 authenticated）
```sql
DROP POLICY IF EXISTS pre_inspections_authenticated_all ON public.pre_inspections;
CREATE POLICY pre_inspections_select ON public.pre_inspections AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_brand(brand_id));
CREATE POLICY pre_inspections_insert ON public.pre_inspections AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_brand(brand_id));
CREATE POLICY pre_inspections_update ON public.pre_inspections AS PERMISSIVE FOR UPDATE TO authenticated USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY pre_inspections_delete ON public.pre_inspections AS PERMISSIVE FOR DELETE TO authenticated USING (user_has_brand(brand_id));
-- pre_inspections_service_role_all 不動（service 仍全權）
```

### P0-C · followup_cases / followup_events（讀寫都改 scoped）
```sql
DROP POLICY IF EXISTS followup_cases_brand_read  ON public.followup_cases;
DROP POLICY IF EXISTS followup_cases_brand_write ON public.followup_cases;
CREATE POLICY followup_cases_brand_read  ON public.followup_cases AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_brand(brand_id));
CREATE POLICY followup_cases_brand_write ON public.followup_cases AS PERMISSIVE FOR ALL TO authenticated USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
DROP POLICY IF EXISTS followup_events_brand_read  ON public.followup_events;
DROP POLICY IF EXISTS followup_events_brand_write ON public.followup_events;
CREATE POLICY followup_events_brand_read  ON public.followup_events AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_brand(brand_id));
CREATE POLICY followup_events_brand_write ON public.followup_events AS PERMISSIVE FOR ALL TO authenticated USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
```

### P0-D · sales_quotes
```sql
DROP POLICY IF EXISTS sales_quotes_select_policy ON public.sales_quotes;
DROP POLICY IF EXISTS sales_quotes_insert_policy ON public.sales_quotes;
DROP POLICY IF EXISTS sales_quotes_update_policy ON public.sales_quotes;
DROP POLICY IF EXISTS sales_quotes_delete_policy ON public.sales_quotes;
CREATE POLICY sales_quotes_select_policy ON public.sales_quotes AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_brand(brand_id));
CREATE POLICY sales_quotes_insert_policy ON public.sales_quotes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_brand(brand_id));
CREATE POLICY sales_quotes_update_policy ON public.sales_quotes AS PERMISSIVE FOR UPDATE TO authenticated USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY sales_quotes_delete_policy ON public.sales_quotes AS PERMISSIVE FOR DELETE TO authenticated USING (user_has_brand(brand_id));
```

### P1 · repair_orders / repair_order_lines / used_car_inventory（只補 INSERT 的 WITH CHECK）
```sql
DROP POLICY IF EXISTS repair_orders_insert ON public.repair_orders;
CREATE POLICY repair_orders_insert ON public.repair_orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_brand(brand_id));
DROP POLICY IF EXISTS repair_order_lines_insert ON public.repair_order_lines;
CREATE POLICY repair_order_lines_insert ON public.repair_order_lines AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_brand(brand_id));
DROP POLICY IF EXISTS brand_scoped_insert ON public.used_car_inventory;
CREATE POLICY brand_scoped_insert ON public.used_car_inventory AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_brand(brand_id));
```

### P2 · receiving_discrepancies（補標準 brand CRUD；其餘 3 張先不動，待 Ming 決策）
```sql
CREATE POLICY brand_scoped_select ON public.receiving_discrepancies AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_brand(brand_id));
CREATE POLICY brand_scoped_insert ON public.receiving_discrepancies AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_brand(brand_id));
CREATE POLICY brand_scoped_update ON public.receiving_discrepancies AS PERMISSIVE FOR UPDATE TO authenticated USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY brand_scoped_delete ON public.receiving_discrepancies AS PERMISSIVE FOR DELETE TO authenticated USING (user_has_brand(brand_id));
```

### P3 · notification_channels / templates（讀全開、寫收斂給 app_admin）
```sql
DROP POLICY IF EXISTS authenticated_all ON public.notification_channels;
CREATE POLICY notif_channels_read  ON public.notification_channels AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY notif_channels_write ON public.notification_channels AS PERMISSIVE FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
DROP POLICY IF EXISTS authenticated_all ON public.notification_templates;
CREATE POLICY notif_templates_read  ON public.notification_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY notif_templates_write ON public.notification_templates AS PERMISSIVE FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
-- ⚠️ 須先確認 is_app_admin() 存在且語意正確（lint 顯示此 function 存在）
```

### P4-view · 3 個 SECURITY DEFINER view 改 security_invoker
```sql
ALTER VIEW public.followup_stats_by_store SET (security_invoker = on);
ALTER VIEW public.v_stock_balances       SET (security_invoker = on);
ALTER VIEW public.sales_funnel_metrics   SET (security_invoker = on);
-- ⚠️ 改後 view 會吃「呼叫者」RLS：若原本靠 definer 權限跨表彙總，改完可能出現空值/少列 → 必須各打開頁面驗報表數字沒掉
```

---

## 3. Rollback（一鍵還原每段）

每段的 rollback = 把上面 DROP 掉的原 policy 原樣 `CREATE` 回 `true`。完整還原 SQL：

```sql
-- P0-A final_inspections（還原成 public + true）
DROP POLICY IF EXISTS final_inspections_select ON public.final_inspections; CREATE POLICY final_inspections_select ON public.final_inspections FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS final_inspections_insert ON public.final_inspections; CREATE POLICY final_inspections_insert ON public.final_inspections FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS final_inspections_update ON public.final_inspections; CREATE POLICY final_inspections_update ON public.final_inspections FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS final_inspections_delete ON public.final_inspections; CREATE POLICY final_inspections_delete ON public.final_inspections FOR DELETE TO public USING (true);
-- P0-B pre_inspections
DROP POLICY IF EXISTS pre_inspections_select ON public.pre_inspections; DROP POLICY IF EXISTS pre_inspections_insert ON public.pre_inspections; DROP POLICY IF EXISTS pre_inspections_update ON public.pre_inspections; DROP POLICY IF EXISTS pre_inspections_delete ON public.pre_inspections;
CREATE POLICY pre_inspections_authenticated_all ON public.pre_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- P0-C followup_cases/events
DROP POLICY IF EXISTS followup_cases_brand_read ON public.followup_cases; DROP POLICY IF EXISTS followup_cases_brand_write ON public.followup_cases;
CREATE POLICY followup_cases_brand_read ON public.followup_cases FOR SELECT TO authenticated USING (true); CREATE POLICY followup_cases_brand_write ON public.followup_cases FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS followup_events_brand_read ON public.followup_events; DROP POLICY IF EXISTS followup_events_brand_write ON public.followup_events;
CREATE POLICY followup_events_brand_read ON public.followup_events FOR SELECT TO authenticated USING (true); CREATE POLICY followup_events_brand_write ON public.followup_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- P0-D sales_quotes
DROP POLICY IF EXISTS sales_quotes_select_policy ON public.sales_quotes; CREATE POLICY sales_quotes_select_policy ON public.sales_quotes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sales_quotes_insert_policy ON public.sales_quotes; CREATE POLICY sales_quotes_insert_policy ON public.sales_quotes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS sales_quotes_update_policy ON public.sales_quotes; CREATE POLICY sales_quotes_update_policy ON public.sales_quotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sales_quotes_delete_policy ON public.sales_quotes; CREATE POLICY sales_quotes_delete_policy ON public.sales_quotes FOR DELETE TO authenticated USING (true);
-- P1
DROP POLICY IF EXISTS repair_orders_insert ON public.repair_orders; CREATE POLICY repair_orders_insert ON public.repair_orders FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS repair_order_lines_insert ON public.repair_order_lines; CREATE POLICY repair_order_lines_insert ON public.repair_order_lines FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS brand_scoped_insert ON public.used_car_inventory; CREATE POLICY brand_scoped_insert ON public.used_car_inventory FOR INSERT TO authenticated WITH CHECK (true);
-- P2 receiving_discrepancies（還原成 0 policy）
DROP POLICY IF EXISTS brand_scoped_select ON public.receiving_discrepancies; DROP POLICY IF EXISTS brand_scoped_insert ON public.receiving_discrepancies; DROP POLICY IF EXISTS brand_scoped_update ON public.receiving_discrepancies; DROP POLICY IF EXISTS brand_scoped_delete ON public.receiving_discrepancies;
-- P3 notification_*
DROP POLICY IF EXISTS notif_channels_read ON public.notification_channels; DROP POLICY IF EXISTS notif_channels_write ON public.notification_channels; CREATE POLICY authenticated_all ON public.notification_channels FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS notif_templates_read ON public.notification_templates; DROP POLICY IF EXISTS notif_templates_write ON public.notification_templates; CREATE POLICY authenticated_all ON public.notification_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- P4 views
ALTER VIEW public.followup_stats_by_store SET (security_invoker = off);
ALTER VIEW public.v_stock_balances       SET (security_invoker = off);
ALTER VIEW public.sales_funnel_metrics   SET (security_invoker = off);
```

---

## 4. 套用順序與驗證 SOP

1. **先驗存取路徑**（每張 P0/P1 表）：`grep` domain helper 確認走 JWT 還是 service client；JWT 的表收斂後須確認 indian brand 有資料。
2. **逐 Phase apply_migration**（一個 migration 一個 Phase，方便獨立 rollback）。
3. **每 Phase 後**：`get_advisors(security)` 重跑，確認該批 lint 歸零、無新 lint。
4. **真 JWT 驗隔離**（比照 core5 SOP）：用 8 persona access_token 打 `/rest/v1/<table>?Range:0-0&Prefer:count=exact`，確認跨 brand 看不到別人。
5. **頁面 smoke**（P4 view 必做）：交車檢查 / 售後追蹤 / 報價 / 中古車 / 庫存報表頁打開看資料沒掉。
6. 全綠 → `notify-deploy`（本輪純 DB 異動、無 code，LINE 摘要走 curated）。

## 5. 決策點（待 Ming）

- **Q1 範圍**：只修 P0（讀取外洩）？還是 P0+P1+P2+P3+P4 一次到位？
- **Q2 P2 三張參考表**（accounting_periods/transaction_types/app_admins）：app_admins 維持鎖死；另兩張全域參考表要不要補「authenticated 唯讀」policy？需確認前端是否直接讀。
- **Q3 P4 hygiene**（36 function search_path / 4 bucket / extension / mat view）：本輪納入還是另開一輪？
