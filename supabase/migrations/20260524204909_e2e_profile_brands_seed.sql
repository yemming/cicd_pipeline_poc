-- E2E 前置硬化（第十一輪 Phase 2）：補 8 個 e2e persona 的 profile_brands。
--
-- 背景：RLS 的 user_has_brand(text) 讀的是 profile_brands（user_id = auth.uid() AND brand_id），
-- 而非 user_assignments（後者只管 RBAC scope）。A3 的 scripts/e2e-login-all-roles.mjs 只塞了
-- user_assignments，沒塞 profile_brands → 所有 RLS-gated 表對 8 個 e2e persona 全空。
-- 這支 migration 把 brand 歸屬固化進 DB，避免重建帳號 / 重產 storageState 後再次踩雷。
--
-- 全 Indian brand（Ming 測試帳號 scope = indian）。role 用 schema 預設 'member'
-- （profile_brands_role_check 只允許 'member' | 'admin'）。
-- PK 是 (user_id, brand_id) → ON CONFLICT DO NOTHING 保證 idempotent、可安全重跑
-- （RS agent 已手動 INSERT 過，這裡不會重複）。
-- 用 email join auth.users 動態取 user_id，不 hardcode uuid。

INSERT INTO public.profile_brands (user_id, brand_id, role)
SELECT u.id, 'indian', 'member'
FROM auth.users u
WHERE u.email IN (
  'e2e-rs_manager@dealeros.test',
  'e2e-sales_lead@dealeros.test',
  'e2e-crm_agent@dealeros.test',
  'e2e-sa@dealeros.test',
  'e2e-tech@dealeros.test',
  'e2e-aftersales_lead@dealeros.test',
  'e2e-warehouse@dealeros.test',
  'e2e-stock_lead@dealeros.test'
)
ON CONFLICT (user_id, brand_id) DO NOTHING;
