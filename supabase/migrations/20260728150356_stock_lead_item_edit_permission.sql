-- stock_lead（庫存主管）補 master.item.edit（idempotent）
--
-- 根因：20260524181306_e2e_role_accounts_rbac.sql 只給 stock_lead master.item.view，
-- 但 stock_lead 已擁有同層級的其他「edit」權限（master.supplier.edit、
-- master.supplier_pricing.edit、master.replenishment_policy.edit、
-- parts.item.create/update/archive），唯獨缺 master.item.edit ——
-- 而 /parts/setup/items 頁（含料件 CRUD + 原廠 Price Book 匯入）的 server actions
-- 全部用 requirePermission(PERMISSIONS.ITEM_EDIT = 'master.item.edit') 把關
-- （見 src/lib/parts-setup/item-actions.ts），導致庫存主管角色實際上無法操作
-- Price Book 匯入，與其職掌不符。
--
-- 只補 stock_lead（庫存主管，料件主檔的業務owner）。其餘 7 個 e2e persona
-- （warehouse/aftersales_lead/sa/tech/crm_agent/rs_manager/sales_lead）
-- 職掌上本就不涉及料件主檔編輯，維持現狀不補。

INSERT INTO role_permissions (role_id, permission_code)
SELECT 'stock_lead', code FROM permissions WHERE code IN (
  'master.item.edit'
) ON CONFLICT DO NOTHING;
