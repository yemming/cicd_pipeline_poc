-- =============================================================================
-- RLS DRAFT — 核心 5 表「人/角色級」隔離（海德生 B 型測試準備）
-- =============================================================================
-- 產生時間：2026-06-04  ·  by C2 subagent  ·  目標 Supabase：bykvtcptbirpxyqkfwfl
--
-- ⚠️⚠️⚠️  這是「草稿」，預設「未套用」。這個 Supabase 是服役中的 prod。  ⚠️⚠️⚠️
--   套用前必讀本檔頂部「套用前檢查清單」，逐項打勾後才在「明確的測試窗口」執行。
--   檔尾附完整「回滾 SQL」。
--
-- -----------------------------------------------------------------------------
-- 背景結論（subagent 調查，主 agent 請覆核）：
--
-- 1) App auth 路徑 = JWT-bound authenticated client（會吃 RLS）。
--    5 張表的 domain helper（sales-handcards / work-orders / customers /
--    sales-call-tasks / inventory-reservations）全部 import
--    `@/lib/supabase/server` 的 createClient（createServerClient + cookie JWT）。
--    沒有任何一支用 createServiceClient。→ 開 RLS 對這 5 表 *會* 真生效。
--    （側通道例外：ar-invoices.ts / surveys.ts 用 service client 讀 customers —
--      那是內部財務/問卷流程，會繞過 RLS，B 測時不受影響、也不該被隔離。）
--
-- 2) RLS 其實「已經開」了，但現有 policy 只做 **品牌/法人租戶隔離**
--    （user_has_brand / user_has_subsidiary），**沒有人/角色級隔離**。
--    B 測要的「業務員只看自己客戶」「技師只看自己工單」「SA 不看銷售 CRM」
--    現有 policy 一律「同 brand 全看得到」→ 隔離是假的。本草稿補的就是這層。
--
-- 3) 角色來源 = user_assignments(user_id, role_id, scope_type='brand', scope_id)。
--    8 個 e2e persona 已有 role_id：rs_manager / sales_lead / crm_agent /
--    service_advisor / technician / aftersales_lead / warehouse / stock_lead。
--    DB 裡「沒有」可在 RLS 內解析角色/門店的 helper function（只有 has_brand/subsidiary）
--    → 本草稿先建 SECURITY DEFINER helper（current_user_has_role 等）。
--
-- 4) 兩個硬阻斷（B 測前主 agent / Ming 必須先補資料，否則隔離「看起來壞掉」）：
--    (a) work_orders.lead_technician_id / advisor_id FK → employees.id（不是 auth.users）。
--        技師隔離要 auth.uid() → employees.user_id → employees.id。
--        但 persona 目前「沒有 employees row、user_id 沒接」。
--        → 必須先把 persona 接到 employees（見檔尾「資料前置」§F1）。
--    (b) 現有 5 表的 seed 資料「沒有任何一筆」owner 欄位指向 persona user_id。
--        就算 RLS 完美，persona 也會「全空」而非「只看自己」。
--        → B 測前要塞 fixture：每個 persona 名下幾筆 + 別人名下幾筆（見 §F2）。
-- =============================================================================


-- =============================================================================
-- 套用前檢查清單（套用者逐項確認）
-- =============================================================================
-- [ ] 0. 已在「測試窗口」（非營業尖峰），且已通知會用到這 5 表的人。
-- [ ] 1. 已覆核「結論 §1」：app 確實走 JWT client（grep 確認 5 helper 無 service client）。
--          grep -rn "createServiceClient" src/domain/{sales-handcards,work-orders,customers,sales-call-tasks,inventory-reservations}.ts  → 應 0 hit
-- [ ] 2. 已決定「並存 vs 取代」：本草稿的 person/role policy 是 **PERMISSIVE**，會跟
--          現有 brand/subsidiary policy 用 **OR** 合併（PostgreSQL 多條 permissive policy = OR）。
--          ⚠️ 這代表：只要現有 brand policy 還在，persona 仍會看到「同 brand 全部」，
--          人級隔離 **不會生效**。要讓隔離生效，必須二選一：
--            (A) 先 DROP 掉該表現有的 *_select / *_update 等 brand-only policy（檔尾附 DROP），
--                再套本草稿（本草稿的 policy 內已自帶 brand 條件，安全）；或
--            (B) 把現有 brand policy 改成 RESTRICTIVE（AS RESTRICTIVE）。
--          → B 測建議走 (A)，最直觀。檔尾「§取代模式」附完整 DROP+CREATE。
-- [ ] 3. 已先在 staging / branch 套過一次、用 8 persona 跑過讀寫，確認沒把 app 打空。
-- [ ] 4. 已補完 §F1（persona ↔ employees 綁定）與 §F2（fixture 資料），否則 persona 全空。
-- [ ] 5. 手邊備好檔尾「回滾 SQL」，出事可一鍵還原。
-- =============================================================================


-- =============================================================================
-- PART 1 · SECURITY DEFINER Helper Functions（RLS 內解析角色 / 門店 / 員工）
-- =============================================================================
-- 這些是「新增」function，不動既有行為，先建好讓 policy 引用。
-- SECURITY DEFINER + search_path 固定，避免 RLS 遞迴與 search_path 注入。

-- 1a) 目前使用者在「指定 brand」是否具備某角色（讀 user_assignments）
CREATE OR REPLACE FUNCTION public.current_user_has_role(p_role text, p_brand text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_assignments ua
    WHERE ua.user_id = (SELECT auth.uid())
      AND ua.role_id = p_role
      AND ua.scope_type = 'brand'
      AND ua.scope_id = p_brand
      AND (ua.expires_at IS NULL OR ua.expires_at > now())
  );
$$;

-- 1b) 目前使用者在「指定 brand」是否具備任一管理/全覽角色
--     （集團主管 / brand admin / app_admin → 全看）
CREATE OR REPLACE FUNCTION public.current_user_is_overseer(p_brand text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- app_admins（email allowlist；yemming.yu 等）
    EXISTS (
      SELECT 1 FROM public.app_admins a
      JOIN auth.users u ON u.email = a.email
      WHERE u.id = (SELECT auth.uid())
    )
    -- profile_brands.role = 'admin'（brand 層管理者）
    OR EXISTS (
      SELECT 1 FROM public.profile_brands pb
      WHERE pb.user_id = (SELECT auth.uid())
        AND pb.brand_id = p_brand
        AND pb.role = 'admin'
    )
    -- 集團主管 / 店長等「全覽」角色（依交接清單，集團主管全看）
    OR EXISTS (
      SELECT 1 FROM public.user_assignments ua
      WHERE ua.user_id = (SELECT auth.uid())
        AND ua.role_id IN ('group_admin','group_manager','rs_manager','aftersales_lead','stock_lead')
        AND ua.scope_type = 'brand'
        AND ua.scope_id = p_brand
        AND (ua.expires_at IS NULL OR ua.expires_at > now())
    );
$$;
-- ⚠️ 角色語意決策點（Ming）：rs_manager/aftersales_lead/stock_lead 是否算「全覽」？
--    交接清單：店長只看本店、集團主管全部。這裡先把主管類放進 overseer（看全 brand），
--    若要「主管只看本店」需要門店維度（見 1c + §門店隔離備註）。

-- 1c) 目前使用者的 employee.id（work_orders 的 advisor_id/lead_technician_id 是 employees.id）
--     技師/顧問隔離要靠這支把 auth.uid() 轉成 employees.id
CREATE OR REPLACE FUNCTION public.current_user_employee_ids(p_brand text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id FROM public.employees e
  WHERE e.user_id = (SELECT auth.uid())
    AND e.brand_id = p_brand;
$$;

-- 1d) 目前使用者可管轄的「門店 org_id」集合（給「店長只看本店」「倉管看本店倉」用）
--     來源：organizations.manager_user_id（店長綁定）。
--     ⚠️ 一般員工的「所屬門店」目前 DB 沒建模（無 user↔store membership 表）。
--        本函式現階段只認「店長 = organizations.manager_user_id」。
--        若 B 測要做「業務員只看本店客戶」需要先補 user↔store 對映（見 §門店隔離備註）。
CREATE OR REPLACE FUNCTION public.current_user_store_org_ids(p_brand text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.id FROM public.organizations o
  WHERE o.brand_id = p_brand
    AND o.manager_user_id = (SELECT auth.uid());
$$;


-- =============================================================================
-- PART 2 · 5 表的「人/角色級」隔離 POLICY（PERMISSIVE，預設與既有 brand policy OR 合併）
-- =============================================================================
-- ⚠️ 預設模式：本段只「新增」person/role policy，不 DROP 既有 brand policy。
--    因 PostgreSQL permissive policy 取 OR，所以「光套這段」隔離不生效（見檢查清單 §2）。
--    要隔離真生效 → 改用檔尾「§取代模式（B 測建議）」：先 DROP brand-only policy 再套。
--    下面每條 policy 內已自帶 user_has_brand(brand_id)，DROP 掉 brand-only 後仍安全。


-- ── 2.1 customers — 業務員(sales_lead) 只看 assigned_rs_user_id=自己；SA 看 assigned_sa；主管全看 ──
--   隔離欄位：assigned_rs_user_id（業務員RS）/ assigned_sa_user_id（服務顧問）/ created_by（建立者）
CREATE POLICY core5_customers_person_select ON public.customers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)                       -- 主管/集團/admin 全看
      OR assigned_rs_user_id = (SELECT auth.uid())             -- 業務員看自己的客戶
      OR assigned_sa_user_id = (SELECT auth.uid())             -- 服務顧問看自己的客戶
      OR created_by          = (SELECT auth.uid())             -- 建立者保底看得到
    )
  );
-- 寫入：限同 brand 且（主管 / 指派給自己 / 自己建）
CREATE POLICY core5_customers_person_insert ON public.customers
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_customers_person_update ON public.customers
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR assigned_rs_user_id = (SELECT auth.uid())
      OR assigned_sa_user_id = (SELECT auth.uid())
      OR created_by          = (SELECT auth.uid())
    )
  )
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_customers_person_delete ON public.customers
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ( user_has_brand(brand_id) AND current_user_is_overseer(brand_id) );  -- 只有主管能刪


-- ── 2.2 sales_handcards — 業務員只看 assigned_rs_user_id=自己；SA 不該看銷售 CRM ──
--   隔離欄位：assigned_rs_user_id / created_by。
--   「SA 不看銷售 CRM-A」= service_advisor 角色不在可見集合内（policy 不放 SA 條件即達成）。
CREATE POLICY core5_handcards_person_select ON public.sales_handcards
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR assigned_rs_user_id = (SELECT auth.uid())
      OR created_by          = (SELECT auth.uid())
    )
  );
CREATE POLICY core5_handcards_person_insert ON public.sales_handcards
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ( user_has_brand(brand_id) AND current_user_has_role('sales_lead', brand_id) OR current_user_is_overseer(brand_id) );
CREATE POLICY core5_handcards_person_update ON public.sales_handcards
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR assigned_rs_user_id = (SELECT auth.uid())
      OR created_by          = (SELECT auth.uid())
    )
  )
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_handcards_person_delete ON public.sales_handcards
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ( user_has_brand(brand_id) AND current_user_is_overseer(brand_id) );


-- ── 2.3 work_orders — 技師只看 lead_technician_id=自己的 employee.id；advisor 看自己；主管全看 ──
--   隔離欄位：lead_technician_id / advisor_id（皆 FK employees.id）/ created_by（auth.uid）。
--   ⚠️ 依賴 §F1：persona 必須有 employees row 且 user_id 已接，否則 current_user_employee_ids 空 → 全空。
CREATE POLICY core5_work_orders_person_select ON public.work_orders
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR lead_technician_id IN (SELECT public.current_user_employee_ids(brand_id))  -- 技師看自己被指派的工單
      OR advisor_id         IN (SELECT public.current_user_employee_ids(brand_id))  -- SA/服務顧問看自己的工單
      OR created_by         = (SELECT auth.uid())
    )
  );
CREATE POLICY core5_work_orders_person_insert ON public.work_orders
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_work_orders_person_update ON public.work_orders
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR lead_technician_id IN (SELECT public.current_user_employee_ids(brand_id))
      OR advisor_id         IN (SELECT public.current_user_employee_ids(brand_id))
      OR created_by         = (SELECT auth.uid())
    )
  )
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_work_orders_person_delete ON public.work_orders
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ( user_has_brand(brand_id) AND current_user_is_overseer(brand_id) );


-- ── 2.4 call_tasks — CRM 專員只看 assignee_id=自己；主管全看 ──
--   隔離欄位：assignee_id（uuid → auth.users）/ created_by。
--   ⚠️ call_tasks 現有 policy roles 是 {public} 不是 {authenticated}（見現況表）。
--      取代模式 DROP 時要對 public role 的舊 policy 一起 DROP。
CREATE POLICY core5_call_tasks_person_select ON public.call_tasks
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR assignee_id = (SELECT auth.uid())     -- 專員看派給自己的任務
      OR created_by  = (SELECT auth.uid())
    )
  );
CREATE POLICY core5_call_tasks_person_insert ON public.call_tasks
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_call_tasks_person_update ON public.call_tasks
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR assignee_id = (SELECT auth.uid())
      OR created_by  = (SELECT auth.uid())
    )
  )
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_call_tasks_person_delete ON public.call_tasks
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ( user_has_brand(brand_id) AND current_user_is_overseer(brand_id) );


-- ── 2.5 inventory_reservations — 倉管/庫存主管看本 brand 庫存（無個人 owner 隔離）──
--   隔離欄位：brand_id（租戶）+ 角色 gate（warehouse / stock_lead / overseer 可見）。
--   交接清單：「倉管看庫存」= 角色級，不是個人級。其他角色（業務/技師）預設看不到庫存預留。
--   ⚠️ inventory_reservations 無 person owner（只有 reserved_by 但語意是「誰預留」非「歸屬」）。
--      若要做「本店倉才看得到」需 warehouses.org_id ↔ current_user_store_org_ids（見註解）。
CREATE POLICY core5_inventory_reservations_role_select ON public.inventory_reservations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR current_user_has_role('warehouse', brand_id)
      OR current_user_has_role('stock_lead', brand_id)
      -- 可選的門店維度（預設註解掉，需要再開）：
      -- OR warehouse_id IN (
      --   SELECT w.id FROM public.warehouses w
      --   WHERE w.org_id IN (SELECT public.current_user_store_org_ids(brand_id))
      -- )
    )
  );
CREATE POLICY core5_inventory_reservations_role_insert ON public.inventory_reservations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR current_user_has_role('warehouse', brand_id)
      OR current_user_has_role('stock_lead', brand_id)
    )
  );
CREATE POLICY core5_inventory_reservations_role_update ON public.inventory_reservations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    user_has_brand(brand_id) AND (
      current_user_is_overseer(brand_id)
      OR current_user_has_role('warehouse', brand_id)
      OR current_user_has_role('stock_lead', brand_id)
    )
  )
  WITH CHECK ( user_has_brand(brand_id) );
CREATE POLICY core5_inventory_reservations_role_delete ON public.inventory_reservations
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ( user_has_brand(brand_id) AND (current_user_is_overseer(brand_id) OR current_user_has_role('stock_lead', brand_id)) );


-- =============================================================================
-- §取代模式（B 測建議）— 先 DROP 既有 brand-only policy 再套上面 PART 2
-- =============================================================================
-- ⚠️ 只有 DROP 掉「同 brand 全看」的舊 policy，PART 2 的人級隔離才會生效（檢查清單 §2）。
--    執行順序：先跑 PART 1（helper）→ 跑下面 DROP →（重）跑 PART 2 的 CREATE POLICY。
--    DROP 是可逆的：回滾段會把舊 policy 原樣重建。
--
-- DROP TABLE customers 的 brand+subsidiary 舊 policy：
--   DROP POLICY IF EXISTS brand_scoped_select      ON public.customers;
--   DROP POLICY IF EXISTS brand_scoped_insert      ON public.customers;
--   DROP POLICY IF EXISTS brand_scoped_update      ON public.customers;
--   DROP POLICY IF EXISTS brand_scoped_delete      ON public.customers;
--   DROP POLICY IF EXISTS subsidiary_scoped_select ON public.customers;
--   DROP POLICY IF EXISTS subsidiary_scoped_insert ON public.customers;
--   DROP POLICY IF EXISTS subsidiary_scoped_update ON public.customers;
--   DROP POLICY IF EXISTS subsidiary_scoped_delete ON public.customers;
-- DROP sales_handcards 舊 policy：
--   DROP POLICY IF EXISTS brand_scoped_select ON public.sales_handcards;
--   DROP POLICY IF EXISTS brand_scoped_insert ON public.sales_handcards;
--   DROP POLICY IF EXISTS brand_scoped_update ON public.sales_handcards;
--   DROP POLICY IF EXISTS brand_scoped_delete ON public.sales_handcards;
-- DROP work_orders 舊 policy（brand + subsidiary）：
--   DROP POLICY IF EXISTS brand_scoped_select      ON public.work_orders;
--   DROP POLICY IF EXISTS brand_scoped_insert      ON public.work_orders;
--   DROP POLICY IF EXISTS brand_scoped_update      ON public.work_orders;
--   DROP POLICY IF EXISTS brand_scoped_delete      ON public.work_orders;
--   DROP POLICY IF EXISTS subsidiary_scoped_select ON public.work_orders;
--   DROP POLICY IF EXISTS subsidiary_scoped_insert ON public.work_orders;
--   DROP POLICY IF EXISTS subsidiary_scoped_update ON public.work_orders;
--   DROP POLICY IF EXISTS subsidiary_scoped_delete ON public.work_orders;
-- DROP call_tasks 舊 policy（⚠️ 舊的 roles=public）：
--   DROP POLICY IF EXISTS brand_scoped_select ON public.call_tasks;
--   DROP POLICY IF EXISTS brand_scoped_insert ON public.call_tasks;
--   DROP POLICY IF EXISTS brand_scoped_update ON public.call_tasks;
--   DROP POLICY IF EXISTS brand_scoped_delete ON public.call_tasks;
-- DROP inventory_reservations 舊 policy（⚠️ 舊的 roles=public）：
--   DROP POLICY IF EXISTS inventory_reservations_select ON public.inventory_reservations;
--   DROP POLICY IF EXISTS inventory_reservations_insert ON public.inventory_reservations;
--   DROP POLICY IF EXISTS inventory_reservations_update ON public.inventory_reservations;
--   DROP POLICY IF EXISTS inventory_reservations_delete ON public.inventory_reservations;
--
-- （故意註解掉，避免「複製整檔貼上」就把 prod 隔離行為改掉。要走取代模式請手動解除註解。）


-- =============================================================================
-- §F · B 測資料前置（必做，否則 persona 全空 → 誤判功能壞掉）
-- =============================================================================
-- §F1 · persona ↔ employees 綁定（技師/顧問隔離的硬前置）
--   work_orders.lead_technician_id / advisor_id 是 employees.id。
--   要讓 e2e-tech 看到工單，得有一個 employees row：brand_id='indian'、user_id=該 persona、
--   然後 work_orders.lead_technician_id 指向這個 employee.id。
--   作法二選一：
--     (a) 既有 Indian 員工接上 persona user_id（推薦，沿用現成員工/工單）：
--         UPDATE public.employees
--           SET user_id = (SELECT id FROM auth.users WHERE email='e2e-tech@dealeros.test')
--         WHERE id = '<某個 Indian 技師 employee.id>';
--         -- 同理 advisor → e2e-sa@dealeros.test
--     (b) 新建 employees row 綁 persona（若不想動現成員工）。
--
-- §F2 · fixture 歸屬（讓「只看自己 vs 看不到別人」兩側都有資料）
--   每個要驗的 persona，名下塞幾筆、別人名下也塞幾筆：
--     -- 業務員（e2e-sales_lead）名下 2 筆客戶 + 別的業務名下 2 筆
--     UPDATE public.customers SET assigned_rs_user_id =
--       (SELECT id FROM auth.users WHERE email='e2e-sales_lead@dealeros.test')
--       WHERE brand_id='indian' AND id IN ('<cust1>','<cust2>');
--     -- 手卡同理（assigned_rs_user_id）
--     -- call_tasks 派給 e2e-crm_agent（assignee_id）
--     UPDATE public.call_tasks SET assignee_id =
--       (SELECT id FROM auth.users WHERE email='e2e-crm_agent@dealeros.test')
--       WHERE brand_id='indian' AND id IN ('<task1>','<task2>');
--     -- work_orders 的 lead_technician_id 指向 §F1 綁好的 employee.id
--   ⚠️ 全部塞 brand_id='indian'（CLAUDE.md 開發測試資料規範）。


-- =============================================================================
-- §門店隔離備註（「店長/業務員只看本店」目前 DB 缺建模 — 需 Ming 決策）
-- =============================================================================
--  · 店長：可用 organizations.manager_user_id（current_user_store_org_ids 已支援）。
--  · 一般員工的「所屬門店」：DB 無 user↔store membership 表。
--    customers / call_tasks / work_orders 也沒有直接的 store/org_id 欄位
--    （sales_handcards 有 organization_id；work_orders 走 customer→? 無直接 store）。
--    → 若 B 測「業務員只看本店客戶」是必測項，需先補：
--        (1) user↔store 對映表（或 employees.org/dept 對映），且
--        (2) customers/call_tasks 補 store/org_id 欄位（或經 assigned_rs 員工的門店推導）。
--    這是 schema 擴充，屬大事，未納入本草稿，列為 Ming 決策項。


-- =============================================================================
-- 回滾 SQL（一鍵還原到「套用本草稿之前」）
-- =============================================================================
-- R1) 移除本草稿新增的所有 policy
-- DROP POLICY IF EXISTS core5_customers_person_select  ON public.customers;
-- DROP POLICY IF EXISTS core5_customers_person_insert  ON public.customers;
-- DROP POLICY IF EXISTS core5_customers_person_update  ON public.customers;
-- DROP POLICY IF EXISTS core5_customers_person_delete  ON public.customers;
-- DROP POLICY IF EXISTS core5_handcards_person_select  ON public.sales_handcards;
-- DROP POLICY IF EXISTS core5_handcards_person_insert  ON public.sales_handcards;
-- DROP POLICY IF EXISTS core5_handcards_person_update  ON public.sales_handcards;
-- DROP POLICY IF EXISTS core5_handcards_person_delete  ON public.sales_handcards;
-- DROP POLICY IF EXISTS core5_work_orders_person_select ON public.work_orders;
-- DROP POLICY IF EXISTS core5_work_orders_person_insert ON public.work_orders;
-- DROP POLICY IF EXISTS core5_work_orders_person_update ON public.work_orders;
-- DROP POLICY IF EXISTS core5_work_orders_person_delete ON public.work_orders;
-- DROP POLICY IF EXISTS core5_call_tasks_person_select  ON public.call_tasks;
-- DROP POLICY IF EXISTS core5_call_tasks_person_insert  ON public.call_tasks;
-- DROP POLICY IF EXISTS core5_call_tasks_person_update  ON public.call_tasks;
-- DROP POLICY IF EXISTS core5_call_tasks_person_delete  ON public.call_tasks;
-- DROP POLICY IF EXISTS core5_inventory_reservations_role_select ON public.inventory_reservations;
-- DROP POLICY IF EXISTS core5_inventory_reservations_role_insert ON public.inventory_reservations;
-- DROP POLICY IF EXISTS core5_inventory_reservations_role_update ON public.inventory_reservations;
-- DROP POLICY IF EXISTS core5_inventory_reservations_role_delete ON public.inventory_reservations;
--
-- R2) 移除本草稿新增的 helper functions
-- DROP FUNCTION IF EXISTS public.current_user_has_role(text, text);
-- DROP FUNCTION IF EXISTS public.current_user_is_overseer(text);
-- DROP FUNCTION IF EXISTS public.current_user_employee_ids(text);
-- DROP FUNCTION IF EXISTS public.current_user_store_org_ids(text);
--
-- R3) 若曾走「§取代模式」DROP 過舊 brand/subsidiary policy，要原樣重建：
--   customers（brand，roles=authenticated）：
--     CREATE POLICY brand_scoped_select ON public.customers AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_insert ON public.customers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_update ON public.customers AS PERMISSIVE FOR UPDATE TO authenticated USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_delete ON public.customers AS PERMISSIVE FOR DELETE TO authenticated USING (user_has_brand(brand_id));
--   customers（subsidiary，roles=authenticated）：
--     CREATE POLICY subsidiary_scoped_select ON public.customers AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_subsidiary(subsidiary_id));
--     CREATE POLICY subsidiary_scoped_insert ON public.customers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_subsidiary(subsidiary_id));
--     CREATE POLICY subsidiary_scoped_update ON public.customers AS PERMISSIVE FOR UPDATE TO authenticated USING (user_has_subsidiary(subsidiary_id)) WITH CHECK (user_has_subsidiary(subsidiary_id));
--     CREATE POLICY subsidiary_scoped_delete ON public.customers AS PERMISSIVE FOR DELETE TO authenticated USING (user_has_subsidiary(subsidiary_id));
--   sales_handcards（brand，roles=public）：
--     CREATE POLICY brand_scoped_select ON public.sales_handcards AS PERMISSIVE FOR SELECT TO public USING (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_insert ON public.sales_handcards AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_update ON public.sales_handcards AS PERMISSIVE FOR UPDATE TO public USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_delete ON public.sales_handcards AS PERMISSIVE FOR DELETE TO public USING (user_has_brand(brand_id));
--   work_orders（brand，roles=public）：
--     CREATE POLICY brand_scoped_select ON public.work_orders AS PERMISSIVE FOR SELECT TO public USING (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_insert ON public.work_orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_update ON public.work_orders AS PERMISSIVE FOR UPDATE TO public USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_delete ON public.work_orders AS PERMISSIVE FOR DELETE TO public USING (user_has_brand(brand_id));
--   work_orders（subsidiary，roles=authenticated）：
--     CREATE POLICY subsidiary_scoped_select ON public.work_orders AS PERMISSIVE FOR SELECT TO authenticated USING (user_has_subsidiary(subsidiary_id));
--     CREATE POLICY subsidiary_scoped_insert ON public.work_orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_has_subsidiary(subsidiary_id));
--     CREATE POLICY subsidiary_scoped_update ON public.work_orders AS PERMISSIVE FOR UPDATE TO authenticated USING (user_has_subsidiary(subsidiary_id)) WITH CHECK (user_has_subsidiary(subsidiary_id));
--     CREATE POLICY subsidiary_scoped_delete ON public.work_orders AS PERMISSIVE FOR DELETE TO authenticated USING (user_has_subsidiary(subsidiary_id));
--   call_tasks（brand，roles=public）：
--     CREATE POLICY brand_scoped_select ON public.call_tasks AS PERMISSIVE FOR SELECT TO public USING (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_insert ON public.call_tasks AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_update ON public.call_tasks AS PERMISSIVE FOR UPDATE TO public USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY brand_scoped_delete ON public.call_tasks AS PERMISSIVE FOR DELETE TO public USING (user_has_brand(brand_id));
--   inventory_reservations（brand，roles=public）：
--     CREATE POLICY inventory_reservations_select ON public.inventory_reservations AS PERMISSIVE FOR SELECT TO public USING (user_has_brand(brand_id));
--     CREATE POLICY inventory_reservations_insert ON public.inventory_reservations AS PERMISSIVE FOR INSERT TO public WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY inventory_reservations_update ON public.inventory_reservations AS PERMISSIVE FOR UPDATE TO public USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
--     CREATE POLICY inventory_reservations_delete ON public.inventory_reservations AS PERMISSIVE FOR DELETE TO public USING (user_has_brand(brand_id));
--
-- R4) 注意：本草稿「沒有」對任何表跑 ENABLE ROW LEVEL SECURITY（5 表早已 enabled），
--     所以回滾「不需要」DISABLE RLS（DISABLE 反而會放開既有 brand 隔離，別做）。
-- =============================================================================
