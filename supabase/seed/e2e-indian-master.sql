-- =============================================================================
-- E2E 基建 — Batch B1：Indian brand 主檔增量 seed
-- =============================================================================
-- 目的：把 Indian brand 的主檔（suppliers / items / customers / customer_vehicles）
--       增量 top-up 到 Phase 2 報表 / demo 所需量，給 ABC 分析、CRM 分群、
--       回訪保固等情境有足夠樣本。
--
-- 鐵律遵守：
--   1. 全部 brand_id='indian'（Ming 測試帳號 scope）；FK 全串 Indian row。
--   2. idempotent：穩定 code / vin key + ON CONFLICT DO NOTHING，重跑不重複。
--   3. 只增量 top-up，不 DELETE / 不 UPDATE 既有 row。
--   4. 不碰歷史交易（sales_orders / repair_orders / appointments / work_orders）— 那是 B2。
--
-- 服務項目說明：DealerOS 沒有獨立的「服務項目 / 工項主檔」表。
--   工項在 work_order_items 以 kind='labor' + labor_code + description 內嵌，
--   無可預先 seed 的主檔。本 seed 在既有 items 表用 category='工資服務'
--   建立 30 筆服務性質料號（control_type='C'、無實體庫存），作為工單可引用的
--   服務項目主檔。這不是造新表，只是用 items 既有欄位分類。
--
-- Unique keys（idempotent 依據）：
--   suppliers        (brand_id, code)
--   items            (brand_id, code)
--   customers        (brand_id, code)
--   customer_vehicles(brand_id, vin) WHERE vin IS NOT NULL
-- =============================================================================


-- =============================================================================
-- 1. SUPPLIERS  +13  (E2E-SUP-001 .. 013)
--    type 約束：oem | agent | consumable | services | other
--    supplier_type 約束：VEHICLE_DEALER | PARTS_SUPPLIER | LANDLORD | UTILITY |
--                        TAX_AUTHORITY | SERVICE_CONTRACTOR | EMPLOYEE_AGENT |
--                        INSURANCE_CO | BANK | OTHER
-- =============================================================================
INSERT INTO suppliers (brand_id, code, name, type, supplier_type, primary_contact, phone, email, address, tax_id, payment_terms_days, default_currency, is_active, metadata)
VALUES
  ('indian', 'E2E-SUP-001', '永信機車零件行',       'agent',      'PARTS_SUPPLIER',     '林永信', '02-2755-1101', 'sales@yongxin-parts.tw',  '台北市大安區復興南路一段101號', '12345601', 30, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-002', '宏達潤滑油料',         'consumable', 'PARTS_SUPPLIER',     '張宏達', '04-2326-1102', 'order@hongda-oil.tw',     '台中市西區台灣大道二段202號', '12345602', 45, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-003', '台灣固特異輪胎',       'agent',      'PARTS_SUPPLIER',     '陳國良', '07-2218-1103', 'tw@goodyear-moto.com',    '高雄市前金區中正四路303號',   '12345603', 30, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-004', 'Indian Motorcycle USA','oem',        'VEHICLE_DEALER',     'John Carter', '+1-651-555-1104', 'parts@indianmotorcycle.com', '2100 Hwy 55, Medina MN, USA', NULL, 60, 'USD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-005', '駿馬車業整車進口',     'agent',      'VEHICLE_DEALER',     '黃駿宇', '02-2700-1105', 'import@junma-moto.tw',    '台北市信義區松仁路50號',     '12345605', 45, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-006', '精工鈑金烤漆廠',       'services',   'SERVICE_CONTRACTOR', '吳精工', '03-3289-1106', 'service@jinggong-paint.tw','桃園市中壢區中央西路60號',   '12345606', 30, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-007', '全能板金維修',         'services',   'SERVICE_CONTRACTOR', '李全能', '04-2708-1107', 'fix@quanneng-body.tw',    '台中市南屯區公益路二段70號', '12345607', 30, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-008', '德昌電裝系統',         'agent',      'PARTS_SUPPLIER',     '蔡德昌', '02-2999-1108', 'sales@dechang-ele.tw',    '新北市新莊區思源路80號',     '12345608', 30, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-009', '富國產物保險',         'other',      'INSURANCE_CO',       '周富國', '02-2381-1109', 'moto@fuguo-ins.tw',       '台北市中正區衡陽路90號',     '12345609', 30, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-010', '長興橡膠製品',         'oem',        'PARTS_SUPPLIER',     '何長興', '06-2556-1110', 'rubber@changxing.tw',     '台南市北區成功路100號',      '12345610', 45, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-011', '名成精密機械',         'oem',        'PARTS_SUPPLIER',     '郭名成', '04-2533-1111', 'cnc@mingcheng-prec.tw',   '台中市北屯區文心路四段110號','12345611', 60, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-012', '雙北物流配送',         'services',   'SERVICE_CONTRACTOR', '楊雙北', '02-2266-1112', 'logistics@sb-express.tw', '新北市五股區五權路120號',    '12345612', 15, 'TWD', true, '{}'::jsonb),
  ('indian', 'E2E-SUP-013', '台灣電力公司',         'other',      'UTILITY',            '客服中心', '1911',       'service@taipower.com.tw', '台北市中正區羅斯福路三段130號','12345613', 30, 'TWD', true, '{}'::jsonb)
ON CONFLICT (brand_id, code) DO NOTHING;


-- =============================================================================
-- 2a. ITEMS — 服務項目  +30  (E2E-SVC-001 .. 030)
--    category='工資服務'、control_type='C'、無實體成本（standard_cost=0）
--    base_uom='式'（工項計次/計時），給工單 labor 引用
-- =============================================================================
WITH svc(n, name, price) AS (
  VALUES
    (1,  '定期保養工資 (一級)',        1200),
    (2,  '定期保養工資 (二級)',        2400),
    (3,  '定期保養工資 (三級)',        4800),
    (4,  '機油更換工資',               600),
    (5,  '機油+濾芯更換工資',          900),
    (6,  '煞車來令片更換工資',         800),
    (7,  '煞車油更換工資',             700),
    (8,  '輪胎更換工資 (單條)',        500),
    (9,  '輪胎平衡校正',               400),
    (10, '鏈條清潔潤滑',               350),
    (11, '鏈條張力調整',               300),
    (12, '齒盤更換工資',               1200),
    (13, '火星塞更換工資',             600),
    (14, '電瓶更換工資',               400),
    (15, '空濾清潔/更換工資',          500),
    (16, '冷卻液更換工資',             900),
    (17, '前叉保養工資',               3500),
    (18, '後避震調校',                 2800),
    (19, 'ECU 韌體更新',               1500),
    (20, '引擎異音檢修',               2400),
    (21, 'Desmo 汽門間隙校正',         8800),
    (22, '電系故障診斷',               1200),
    (23, '整車健檢 (60 項)',           1800),
    (24, '里程保固定檢',               1000),
    (25, '事故鈑金估價',               500),
    (26, '外觀拋光美容',               2200),
    (27, '車身鍍膜施工',               6800),
    (28, '冬季入庫保養',               1600),
    (29, '道路救援出勤費',             1500),
    (30, '到府取送車服務',             800)
)
INSERT INTO items (brand_id, code, name, category, control_type, base_uom, standard_cost, suggested_price, is_active, metadata)
SELECT
  'indian',
  'E2E-SVC-' || lpad(n::text, 3, '0'),
  name,
  '工資服務',
  'C',
  '式',
  0,
  price,
  true,
  jsonb_build_object('item_nature', 'service', 'billable_labor', true)
FROM svc
ON CONFLICT (brand_id, code) DO NOTHING;


-- =============================================================================
-- 2b. ITEMS — 零件  +168  (E2E-P-001 .. 168)
--    ABC 梯度（給 INV-07 ABC 分析有層次）：
--      A 類 ~12%  : 高單價（成本 15000~70000）→ 少數高價值
--      B 類 ~28%  : 中單價（成本 1500~8000）
--      C 類 ~60%  : 低單價（成本 100~1200）→ 多數低值
--    category 沿用既有中文分類，循環分配。
-- =============================================================================
WITH gen AS (
  SELECT
    g AS n,
    -- ABC 分級：每 100 筆中 12 A / 28 B / 60 C，用 mod 切
    CASE
      WHEN (g % 100) < 12 THEN 'A'
      WHEN (g % 100) < 40 THEN 'B'
      ELSE 'C'
    END AS ctype,
    (ARRAY['引擎零件','傳動系統','煞車系統','車身零件','電氣系統','耗材','懸吊系統','排氣系統'])[(g % 8) + 1] AS cat
  FROM generate_series(1, 168) g
),
priced AS (
  SELECT
    n, ctype, cat,
    CASE ctype
      -- A：高價值，成本隨 n 在區間內有梯度
      WHEN 'A' THEN 15000 + (n % 12) * 4800
      -- B：中價值
      WHEN 'B' THEN 1500 + (n % 28) * 230
      -- C：低價值
      ELSE 100 + (n % 60) * 18
    END AS cost
  FROM gen
)
INSERT INTO items (brand_id, code, name, category, control_type, base_uom, standard_cost, suggested_price, default_lead_time_days, warranty_months, is_active, metadata)
SELECT
  'indian',
  'E2E-P-' || lpad(n::text, 3, '0'),
  cat || ' 零件 #' || lpad(n::text, 3, '0') || ' (' || ctype || '類)',
  cat,
  ctype,
  CASE WHEN cat = '排氣系統' THEN '組' ELSE '個' END,
  cost,
  -- 建議售價 = 成本 * 毛利倍率（A 1.7x / B 1.85x / C 1.95x）
  round(cost * CASE ctype WHEN 'A' THEN 1.70 WHEN 'B' THEN 1.85 ELSE 1.95 END),
  CASE ctype WHEN 'A' THEN 21 WHEN 'B' THEN 14 ELSE 7 END,
  CASE WHEN ctype = 'A' THEN 12 ELSE NULL END,
  true,
  jsonb_build_object('item_nature', 'part', 'abc_grade', ctype)
FROM priced
ON CONFLICT (brand_id, code) DO NOTHING;


-- =============================================================================
-- 3. CUSTOMERS  +9  (E2E-C-001 .. 009)
--    type 約束（小寫）：individual | corporate
--    customer_type 約束（大寫）：INDIVIDUAL | CORPORATE | RELATED_PARTY |
--                                DEALER_DEMO | GOVERNMENT
--    habc_grade：H | A | B | C | NULL
--    follow_up_status：urgent | today | ok | none | NULL
--    aftersales_dormancy_status：active | dormant_60 | dormant_120 | dormant_180 | lost | NULL
--    → 造 CRM 分群多樣性（活躍 / 各級休眠 / 戰敗）
-- =============================================================================
INSERT INTO customers (brand_id, code, name, type, customer_type, phone, email, address, birthday,
                       habc_grade, follow_up_status, next_follow_up_date, aftersales_dormancy_status, aftersales_lost_reason, aftersales_lost_at,
                       payment_terms_days, is_active, metadata)
VALUES
  -- 活躍高價值 A 客
  ('indian', 'E2E-C-001', '蕭敬騰', 'individual', 'INDIVIDUAL', '0911-200-001', 'e2e001@example.tw', '台北市內湖區瑞光路11號',  '1987-03-30', 'A', 'ok',     CURRENT_DATE + 14, 'active',      NULL, NULL, 30, true, '{}'::jsonb),
  -- 緊急待跟進 A 客
  ('indian', 'E2E-C-002', '田馥甄', 'individual', 'INDIVIDUAL', '0911-200-002', 'e2e002@example.tw', '新北市板橋區文化路二段22號','1983-03-30', 'A', 'urgent', CURRENT_DATE + 1,  'active',      NULL, NULL, 30, true, '{}'::jsonb),
  -- 今日跟進 B 客
  ('indian', 'E2E-C-003', '盧廣仲', 'individual', 'INDIVIDUAL', '0911-200-003', 'e2e003@example.tw', '台中市西屯區市政路33號',   '1985-10-26', 'B', 'today',  CURRENT_DATE,      'active',      NULL, NULL, 30, true, '{}'::jsonb),
  -- 休眠 60 天 B 客
  ('indian', 'E2E-C-004', '徐若瑄', 'individual', 'INDIVIDUAL', '0911-200-004', 'e2e004@example.tw', '高雄市左營區博愛二路44號', '1975-03-02', 'B', NULL,     NULL,              'dormant_60',  NULL, NULL, 30, true, '{}'::jsonb),
  -- 休眠 120 天 C 客
  ('indian', 'E2E-C-005', '陳綺貞', 'individual', 'INDIVIDUAL', '0911-200-005', 'e2e005@example.tw', '台南市東區東門路55號',     '1975-06-06', 'C', NULL,     NULL,              'dormant_120', NULL, NULL, 30, true, '{}'::jsonb),
  -- 休眠 180 天 C 客
  ('indian', 'E2E-C-006', '林宥嘉', 'individual', 'INDIVIDUAL', '0911-200-006', 'e2e006@example.tw', '桃園市桃園區復興路66號',   '1987-07-18', 'C', NULL,     NULL,              'dormant_180', NULL, NULL, 30, true, '{}'::jsonb),
  -- 戰敗客戶（已流失）
  ('indian', 'E2E-C-007', '楊丞琳', 'individual', 'INDIVIDUAL', '0911-200-007', 'e2e007@example.tw', '新竹市東區光復路77號',     '1984-06-04', 'C', 'none',   NULL,              'lost',        '轉投競品 / 移居海外', now() - interval '90 days', 30, true, '{}'::jsonb),
  -- 法人車隊客戶 A
  ('indian', 'E2E-C-008', '極速重機車隊有限公司', 'corporate', 'CORPORATE', '02-8800-2008', 'fleet008@example.tw', '台北市南港區三重路88號', NULL, 'A', 'ok', CURRENT_DATE + 30, 'active', NULL, NULL, 45, true, '{}'::jsonb),
  -- 政府/車展示範客戶
  ('indian', 'E2E-C-009', '經濟部交通研習中心', 'corporate', 'GOVERNMENT', '02-2356-2009', 'gov009@example.tw', '台北市中正區忠孝東路一段99號', NULL, 'H', 'ok', CURRENT_DATE + 60, 'active', NULL, NULL, 60, true, '{}'::jsonb)
ON CONFLICT (brand_id, code) DO NOTHING;


-- =============================================================================
-- 4. CUSTOMER_VEHICLES  +50  (vin = E2EVIN00001 .. 00050)
--    customer_id  : 串既有 + 新 Indian customers（用 generate_series 循環分配）
--    model_id     : 串既有 Indian vehicle_models（循環）
--    acquired_from 約束：new | transfer | used | import | other
--    造里程 / 購入日 / 保固 / 下次保養多樣性（給回訪、保固到期、回廠案例）
-- =============================================================================
WITH ind_customers AS (
  SELECT id, row_number() OVER (ORDER BY created_at, code) - 1 AS rn, count(*) OVER () AS cnt
  FROM customers WHERE brand_id='indian'
),
ind_models AS (
  SELECT id, display_name, row_number() OVER (ORDER BY series, model_name) - 1 AS rn, count(*) OVER () AS cnt
  FROM vehicle_models WHERE brand_id='indian'
),
gen AS (
  SELECT g AS n FROM generate_series(1, 50) g
),
mapped AS (
  SELECT
    g.n,
    (SELECT id FROM ind_customers WHERE rn = g.n % (SELECT cnt FROM ind_customers LIMIT 1)) AS customer_id,
    (SELECT id FROM ind_models    WHERE rn = g.n % (SELECT cnt FROM ind_models LIMIT 1))    AS model_id,
    (SELECT display_name FROM ind_models WHERE rn = g.n % (SELECT cnt FROM ind_models LIMIT 1)) AS model_name
  FROM gen g
)
INSERT INTO customer_vehicles (brand_id, customer_id, model_id, vin, license_plate, color,
                               manufactured_year, acquired_from, purchase_date, purchase_amount,
                               current_mileage, last_service_date, last_service_mileage,
                               next_service_due_date, next_service_due_mileage,
                               warranty_until, insurance_company, insurance_until,
                               is_active, notes, metadata)
SELECT
  'indian',
  m.customer_id,
  m.model_id,
  'E2EVIN' || lpad(m.n::text, 5, '0'),
  -- 台灣重機車牌格式 ABC-NNNN
  chr(65 + (m.n % 26)) || chr(65 + ((m.n / 26) % 26)) || chr(65 + ((m.n / 7) % 26)) || '-' || lpad(((m.n * 137) % 10000)::text, 4, '0'),
  (ARRAY['火焰紅','曜石黑','珍珠白','賽道黃','軍綠','鈦灰','消光黑'])[(m.n % 7) + 1],
  2019 + (m.n % 6),                                   -- 製造年 2019~2024
  (ARRAY['new','new','new','used','transfer','import'])[(m.n % 6) + 1],
  (CURRENT_DATE - ((m.n % 6) * 200 + 30) * interval '1 day')::date,   -- 購入日：近期~3年前
  80000 + (m.n % 10) * 35000,                          -- 購入金額 8~12.5 萬範圍循環（重機級距）
  1500 + (m.n * 1234) % 48000,                         -- 目前里程 1500~49500
  (CURRENT_DATE - ((m.n % 8) * 25 + 10) * interval '1 day')::date,    -- 上次保養日
  1000 + (m.n * 900) % 40000,                          -- 上次保養里程
  (CURRENT_DATE + ((m.n % 5) * 30 - 30) * interval '1 day')::date,    -- 下次保養到期（含已逾期）
  6000 + (m.n * 900) % 45000,                          -- 下次保養里程門檻
  -- 保固到期：部分已過保、部分在保
  (CURRENT_DATE + ((m.n % 7) * 120 - 240) * interval '1 day')::date,
  (ARRAY['富國產物保險','國泰產險','新光產險','明台產險','和泰產險'])[(m.n % 5) + 1],
  (CURRENT_DATE + ((m.n % 12) * 30 - 60) * interval '1 day')::date,   -- 保險到期（含已過期）
  true,
  m.model_name || ' E2E 測試車 #' || m.n,
  jsonb_build_object('seed_source', 'e2e-b1')
FROM mapped m
ON CONFLICT (brand_id, vin) WHERE vin IS NOT NULL DO NOTHING;
