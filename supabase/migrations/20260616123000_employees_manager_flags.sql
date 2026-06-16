-- 修復 schema drift：employees.is_dept_manager / is_cross_admin 欄位遺失
-- my-todos / aftersales-approvals / cron escalate 直接 select/eq 這兩欄，
-- 但欄位從未在 prod 建立 → "column employees.is_dept_manager does not exist"，
-- 打掛 /api/my-todos(每頁 60s 輪詢)與主管通知/升級流程。
-- 語意對齊 src/lib/rbac/department.ts：is_dept_manager=role_codes 含主管角色；is_cross_admin=email 命中 app_admins。
-- 已透過 Supabase MCP apply_migration 套用到 Cloud（2026-06-16）。
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_dept_manager boolean NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_cross_admin boolean NOT NULL DEFAULT false;

UPDATE employees SET is_dept_manager = (
  role_codes && ARRAY[
    'rs_manager','aftersales_lead','workshop_manager','parts_manager',
    'sales_manager','service_manager','store_manager','manager','owner'
  ]::text[]
);

UPDATE employees e SET is_cross_admin = true
WHERE EXISTS (SELECT 1 FROM app_admins a WHERE lower(a.email::text) = lower(e.email));
