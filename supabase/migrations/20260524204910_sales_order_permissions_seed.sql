-- E2E 前置硬化（第十一輪 Phase 2）：固化 sales.order.* permissions catalog + grants。
--
-- 背景：src/lib/rbac/permissions.ts 早已定義 SALES_ORDER_VIEW/EDIT/CANCEL/APPROVE
-- （= sales.order.view/edit/cancel/approve），整個 /sales 模組（orders / quote /
-- test-drives / manager / delivery / showroom）的 server-side gate 都靠
-- SALES_ORDER_VIEW（看）/ SALES_ORDER_EDIT（寫）。但 DB permissions 表原本沒有這 4 個 code，
-- 連 manager / owner（靠 role_permissions 表的一般 role、非 isAdmin bypass）都漏 grant。
-- RS agent 已手動補 catalog + grant rs_manager→view，這支 migration 固化並補完 grants。
--
-- 全部 ON CONFLICT idempotent、可安全重跑。

-- 1) permissions catalog（4 筆）。label / category 對齊既有 sales.* 慣例。
INSERT INTO public.permissions (code, label, module, category) VALUES
  ('sales.order.view',    '銷售訂單 - 檢視', 'sales', '銷售'),
  ('sales.order.edit',    '銷售訂單 - 編輯', 'sales', '銷售'),
  ('sales.order.cancel',  '銷售訂單 - 取消', 'sales', '銷售'),
  ('sales.order.approve', '銷售訂單 - 審核', 'sales', '銷售')
ON CONFLICT (code) DO NOTHING;

-- 2) role_permissions grants。
--    跑 sales 的 e2e persona：rs_manager / sales_lead → view + edit
--    （頁面 gate 只用 view/edit；cancel/approve 留給管理層）。
--    manager / owner 是靠表的業務管理 role（非 isAdmin），補齊 sales.order 全 4 權，
--    修正因 catalog 之前不存在而漏掉的 grant。
INSERT INTO public.role_permissions (role_id, permission_code) VALUES
  ('rs_manager', 'sales.order.view'),
  ('rs_manager', 'sales.order.edit'),
  ('sales_lead', 'sales.order.view'),
  ('sales_lead', 'sales.order.edit'),
  ('manager',    'sales.order.view'),
  ('manager',    'sales.order.edit'),
  ('manager',    'sales.order.cancel'),
  ('manager',    'sales.order.approve'),
  ('owner',      'sales.order.view'),
  ('owner',      'sales.order.edit'),
  ('owner',      'sales.order.cancel'),
  ('owner',      'sales.order.approve')
ON CONFLICT (role_id, permission_code) DO NOTHING;
