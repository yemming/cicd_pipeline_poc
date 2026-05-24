-- E2E test persona RBAC: 5 new roles + grants (idempotent)
-- 只 grant permissions 表實際存在的 code（FK-safe via SELECT-from-permissions）

-- 1) 5 new roles
INSERT INTO roles (id, name, description, is_system) VALUES
  ('rs_manager',      '銷售主管',   'E2E persona: 銷售主管，管理 leads / 保險 / KPI / 員工檢視', false),
  ('sales_lead',      '銷售人員',   'E2E persona: 銷售人員，經營 leads / 保險檢視 / 客戶車輛', false),
  ('crm_agent',       '客服專員',   'E2E persona: 客服專員，客戶經營 / leads / 預約檢視', false),
  ('aftersales_lead', '售後主管',   'E2E persona: 售後主管，全 service 流程 + 領料 + 舊件', false),
  ('stock_lead',      '庫存主管',   'E2E persona: 庫存主管，倉管 + 採購聯集權限', false)
ON CONFLICT (id) DO NOTHING;

-- 2) rs_manager grants
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'rs_manager', code FROM permissions WHERE code IN (
  'sales.lead.view','sales.lead.edit',
  'sales.insurance.view','sales.insurance.edit',
  'master.customer.view','master.customer.edit',
  'master.vehicle.view','master.vehicle.edit',
  'master.employee.view','master.employee.edit',
  'master.org.view',
  'service.appointment.view'
) ON CONFLICT DO NOTHING;

-- 3) sales_lead grants
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'sales_lead', code FROM permissions WHERE code IN (
  'sales.lead.view','sales.lead.edit',
  'sales.insurance.view',
  'master.customer.view','master.customer.edit',
  'master.vehicle.view',
  'master.org.view',
  'service.appointment.view'
) ON CONFLICT DO NOTHING;

-- 4) crm_agent grants
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'crm_agent', code FROM permissions WHERE code IN (
  'master.customer.view','master.customer.edit',
  'sales.lead.view','sales.lead.edit',
  'master.vehicle.view',
  'service.appointment.view'
) ON CONFLICT DO NOTHING;

-- 5) aftersales_lead grants (全 service.* + 領料 + 舊件 + 客戶車輛檢視)
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'aftersales_lead', code FROM permissions WHERE code IN (
  'service.appointment.view','service.appointment.edit',
  'service.pi.execute','service.pdi.execute',
  'service.inspection.view','service.inspection.edit',
  'service.ro.approve','service.ro.close','service.ro.create','service.ro.dispatch','service.ro.view',
  'service.warranty.submit','service.warranty.view',
  'service.aftersales_permission.view','service.aftersales_permission.edit',
  'parts.issue.view','parts.issue.create',
  'parts.usedpart.ops',
  'master.customer.view','master.vehicle.view'
) ON CONFLICT DO NOTHING;

-- 6) stock_lead grants = warehouse ∪ purchaser 聯集 + master.item.view + master.warehouse.view
INSERT INTO role_permissions (role_id, permission_code)
SELECT DISTINCT 'stock_lead', permission_code
FROM role_permissions
WHERE role_id IN ('warehouse','purchaser')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT 'stock_lead', code FROM permissions WHERE code IN (
  'master.item.view','master.warehouse.view'
) ON CONFLICT DO NOTHING;

-- 7) reuse role 補 grant (idempotent)
-- service_advisor 缺: ro.approve, inspection.view/edit, pdi.execute
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'service_advisor', code FROM permissions WHERE code IN (
  'service.ro.approve',
  'service.inspection.view','service.inspection.edit',
  'service.pdi.execute'
) ON CONFLICT DO NOTHING;

-- technician 缺: inspection.view/edit, parts.issue.view (已有 ro.view/pi/pdi/issue.create)
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'technician', code FROM permissions WHERE code IN (
  'service.inspection.view','service.inspection.edit',
  'parts.issue.view'
) ON CONFLICT DO NOTHING;
