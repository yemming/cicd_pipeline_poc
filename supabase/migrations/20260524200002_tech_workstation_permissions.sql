-- ════════════════════════════════════════════════════════════
-- C4a · Tech 技師工作台 permission code + grant
-- ════════════════════════════════════════════════════════════

INSERT INTO permissions (code, label, module) VALUES
  ('service.ro.accept',     '工單接單',   'service'),
  ('service.ro.execute',    '施工執行',   'service'),
  ('service.addon.propose', '追加項目提報', 'service')
ON CONFLICT (code) DO NOTHING;

-- grant 給 technician（執行者）+ aftersales_lead / manager / owner（主管要看得到）
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.role_id, p.code
FROM (VALUES ('technician'),('aftersales_lead'),('manager'),('owner')) AS r(role_id)
CROSS JOIN (VALUES ('service.ro.accept'),('service.ro.execute'),('service.addon.propose')) AS p(code)
ON CONFLICT DO NOTHING;
