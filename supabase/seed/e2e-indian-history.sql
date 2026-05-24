-- =====================================================================
-- E2E Indian 歷史資料 seed（第十一輪 E2E 基建）
-- 全部 brand_id='indian'。只增量、不動既有 row。Idempotent（ON CONFLICT / NOT EXISTS）。
-- 各 Batch 寫各自區塊，不互相覆蓋。
-- =====================================================================


-- =====================================================================
-- ===== B2-A: 銷售 + 維修歷史 =====
-- 餵 RS-03（業績報表，sales_orders）+ SA-09 證據鏈（repair_orders 工單明細 + 技師工時）。
--
-- 近 3 個月窗口：2026-02-24 ~ 2026-05-24（今天 2026-05-24）。
--
-- 工單表選擇（🚩）：repair_orders（單頭）+ repair_order_lines（明細）。
--   依據：SA 模組詳情/接待視角頁（src/domain/repair-orders.ts、ro-checkouts.ts、
--   final-inspections.ts、pickup-notifications.ts、aftersales-staff.ts）全 from repair_orders；
--   repair_orders 才有 sa_id(→employees) / lead_technician_id(→aftersales_technicians) /
--   lines_total / closed_at，是「成交+結帳+人效產值」事實表。
--   work_orders 是車間執行/進廠歷史視角（appointments / customer-base / dormant 用），
--   本 batch 不碰（明細工時/產值證據鏈在 repair_orders 這側）。
--   注意：SA-09 人效統計頁（aftersales-technicians.ts getTechnicianEfficiencySummary）
--   實際讀的是 aftersales_technicians 主表「當前快照」欄位（sold_minutes 等），不 join 工單；
--   工單歷史是「證據鏈」：把已關工單掛到 6 位技師(T1-T6)身上，讓「點技師→看他關過哪些單」
--   這條 drill-down 有料；產值/工時梯度同時寫進工單明細 labor_units + amount。
--
-- 已交車判定：sales_orders 無 'delivered' status，reportable = status IN ('signed','fulfilled')
--   （見 src/domain/sales-report.ts REPORT_STATUSES）。本 batch 已交車 = status='fulfilled'
--   （fulfilled_at 已填 = 完成交車）。RS-03 用 signed_at 做時間窗 filter，故 signed_at 必填且落窗口內。
-- 工單已關判定：status='已關單'（中文，repair_orders default '進行中'）。
-- =====================================================================


-- ---------------------------------------------------------------------
-- B2-A.1 · 銷售訂單（sales_orders）：68 筆 fulfilled（已交車），跨 3 個月
--   新車 48（contract_type='new' + vehicle_model_id）／中古 20（contract_type='used' + vehicle_model_name='中古-…'）
--   業務員 round-robin 4 名（梯度分布）；本月(2026-05) 約 18 筆給 RS-03 本月彙整
-- ---------------------------------------------------------------------
WITH
-- 新車車型池（編號 0..N-1）
models AS (
  SELECT id, display_name, series,
         (row_number() OVER (ORDER BY display_name) - 1) AS idx,
         count(*) OVER () AS cnt
  FROM vehicle_models WHERE brand_id='indian' AND is_active IS NOT FALSE
),
-- Indian 有車的客戶（端到端證據鏈用）：編號池
custs AS (
  SELECT c.id AS customer_id, c.name AS customer_name,
         (row_number() OVER (ORDER BY c.code) - 1) AS idx,
         count(*) OVER () AS cnt
  FROM customers c WHERE c.brand_id='indian'
),
-- 業務員名單（rs_name 是 text，直接寫死 4 名 Indian 業務）
reps AS (
  SELECT * FROM (VALUES (0,'魏呈宇'),(1,'陳曉芸'),(2,'王志強'),(3,'黃淑芬')) AS r(idx, nm)
),
-- 中古車型字串池
usedmodels AS (
  SELECT * FROM (VALUES
    (0,'中古-Monster 2021'),(1,'中古-Panigale V2 2020'),(2,'中古-Multistrada V4 2022'),
    (3,'中古-Streetfighter V2 2021'),(4,'中古-DesertX 2023'),(5,'中古-Hypermotard 950 2019')
  ) AS u(idx, nm)
),
seq AS (SELECT generate_series(1, 68) AS n)
INSERT INTO sales_orders (
  brand_id, order_no, contract_type, status,
  customer_id, customer_name, rs_name,
  vehicle_model_id, vehicle_model_name, used_brand_model, used_year,
  total_amount, deal_price, down_payment,
  signed_at, fulfilled_at, delivery_date, metadata, created_at
)
SELECT
  'indian',
  'E2E-SO-' || lpad(seq.n::text, 3, '0'),
  CASE WHEN seq.n % 10 < 3 THEN 'used' ELSE 'new' END,       -- ~30% 中古
  'fulfilled',
  cu.customer_id,
  cu.customer_name,
  rp.nm,
  -- 新車掛 model_id；中古留 null（靠 vehicle_model_name 在 RS-03 車型分組獨立成條）
  CASE WHEN seq.n % 10 < 3 THEN NULL ELSE md.id END,
  CASE WHEN seq.n % 10 < 3 THEN um.nm ELSE md.display_name END,
  CASE WHEN seq.n % 10 < 3 THEN um.nm ELSE NULL END,
  CASE WHEN seq.n % 10 < 3 THEN (2018 + (seq.n % 6))::text ELSE NULL END,
  -- 金額：新車 45萬~95萬梯度、中古 28萬~55萬
  CASE WHEN seq.n % 10 < 3 THEN 280000 + (seq.n % 6) * 45000 ELSE 450000 + (seq.n % 11) * 45000 END,
  CASE WHEN seq.n % 10 < 3 THEN 280000 + (seq.n % 6) * 45000 ELSE 450000 + (seq.n % 11) * 45000 END,
  CASE WHEN seq.n % 10 < 3 THEN 50000 ELSE 100000 END,
  -- signed_at：跨 2026-02-24 ~ 2026-05-23 均勻分布（RS-03 用 signed_at 做時間窗）
  --   n=1..68 → 偏移 0..88 天，從 2026-02-24 起算
  ('2026-02-24'::timestamptz + ((seq.n - 1) * 88.0 / 67)::int * interval '1 day' + interval '10 hour'),
  -- fulfilled_at = 已交車（signed 後 3~10 天）
  ('2026-02-24'::timestamptz + ((seq.n - 1) * 88.0 / 67)::int * interval '1 day' + interval '10 hour' + ((3 + seq.n % 8)) * interval '1 day'),
  ('2026-02-24'::date + ((seq.n - 1) * 88.0 / 67)::int + (3 + seq.n % 8)),
  jsonb_build_object(
    'e2e_seed', true,
    'batch', 'B2-A',
    'lines', jsonb_build_array(
      jsonb_build_object('label', '整車', 'qty', 1,
        'amount', CASE WHEN seq.n % 10 < 3 THEN 280000 + (seq.n % 6) * 45000 ELSE 450000 + (seq.n % 11) * 45000 END)
    )
  ),
  ('2026-02-24'::timestamptz + ((seq.n - 1) * 88.0 / 67)::int * interval '1 day')
FROM seq
JOIN custs cu       ON cu.idx = (seq.n - 1) % cu.cnt
JOIN reps rp        ON rp.idx = (seq.n - 1) % 4
JOIN models md      ON md.idx = (seq.n - 1) % md.cnt
JOIN usedmodels um  ON um.idx = (seq.n - 1) % 6
ON CONFLICT (brand_id, order_no) DO NOTHING;


-- ---------------------------------------------------------------------
-- B2-A.2 · 維修工單（repair_orders）：126 筆 '已關單'，跨 3 個月
--   lead_technician_id round-robin T1-T6（梯度：靠每技師掛不同單量 + 工時，明細在 .3）
--   sa_id round-robin 售後接待（魏呈宇/陳曉芸/廠長王志強）
--   customer_id/vehicle_id 配 Indian 有車客戶
--   穩定 code：E2E-RO-NNN；prefix 固定 MN/WR（受 prefix_p1/p2 check 約束）、sequence_no=全域 n（避免同日撞 unique）
-- ---------------------------------------------------------------------
WITH
techs AS (   -- 6 位 Indian 技師
  SELECT id,
         (row_number() OVER (ORDER BY code) - 1) AS idx,
         count(*) OVER () AS cnt
  FROM aftersales_technicians WHERE brand_id='indian' AND is_active IS NOT FALSE
),
sas AS (     -- 售後接待 / 廠長（employees）
  SELECT id,
         (row_number() OVER (ORDER BY emp_code) - 1) AS idx,
         count(*) OVER () AS cnt
  FROM employees WHERE brand_id='indian'
    AND (position IN ('售後接待','維修廠長') OR emp_code IN ('SA-002','SA-003','I-EMP-001'))
),
-- Indian 有車的客戶+車（給 RO customer_id + vehicle_id 一致配對）
custveh AS (
  SELECT cv.id AS vehicle_id, cv.customer_id,
         (row_number() OVER (ORDER BY cv.id) - 1) AS idx,
         count(*) OVER () AS cnt
  FROM customer_vehicles cv
  WHERE cv.brand_id='indian' AND cv.customer_id IS NOT NULL
),
seq AS (SELECT generate_series(1, 126) AS n)
INSERT INTO repair_orders (
  brand_id, ro_code, prefix_p1, prefix_p2, issue_date, sequence_no,
  customer_id, vehicle_id, sa_id, lead_technician_id,
  status, opened_at, closed_at, mileage_in,
  estimated_labor_units, lines_subtotal, lines_total, metadata, created_at
)
SELECT
  'indian',
  'E2E-RO-' || lpad(seq.n::text, 3, '0'),
  'MN', 'WR',   -- prefix 受 check 約束：p1∈{MN,RP,WC,AC,OT} p2∈{CP,WR,FR}
  ('2026-02-24'::date + ((seq.n - 1) * 88.0 / 125)::int),
  9000 + seq.n,   -- 全域唯一 sequence_no（避開既有 + 同日撞 unique）
  cv.customer_id,
  cv.vehicle_id,
  sa.id,
  tc.id,
  '已關單',
  ('2026-02-24'::timestamptz + ((seq.n - 1) * 88.0 / 125)::int * interval '1 day' + interval '9 hour'),
  ('2026-02-24'::timestamptz + ((seq.n - 1) * 88.0 / 125)::int * interval '1 day' + interval '9 hour' + ((4 + seq.n % 6)) * interval '1 hour'),
  5000 + (seq.n % 40) * 800,
  -- 工時 estimate（梯度，跟 lead tech idx 掛勾）：1.0 ~ 5.5 工時
  (1.0 + (seq.n % 10) * 0.5)::numeric,
  NULL, NULL,   -- lines_subtotal / lines_total 在 .3 lines 插完後 UPDATE 回填
  jsonb_build_object('e2e_seed', true, 'batch', 'B2-A'),
  ('2026-02-24'::timestamptz + ((seq.n - 1) * 88.0 / 125)::int * interval '1 day')
FROM seq
JOIN techs tc    ON tc.idx = (seq.n - 1) % tc.cnt
JOIN sas sa      ON sa.idx = (seq.n - 1) % sa.cnt
JOIN custveh cv  ON cv.idx = (seq.n - 1) % cv.cnt
ON CONFLICT (brand_id, ro_code) DO NOTHING;


-- ---------------------------------------------------------------------
-- B2-A.3 · 維修工單明細（repair_order_lines）：每單 1 labor + 1 part（≥2 行）
--   labor → E2E-SVC 工資料號（labor_units = 工時，餵 SA-09 工時/產值梯度）
--   part  → E2E-P 零件料號
--   idempotent：WHERE NOT EXISTS（同 RO + line_no 已存在就跳）。只對 E2E-RO 本 batch 工單。
-- ---------------------------------------------------------------------

-- labor 行（line_no=1）
WITH
svc AS (
  SELECT id, code, name, suggested_price,
         (row_number() OVER (ORDER BY code) - 1) AS idx,
         count(*) OVER () AS cnt
  FROM items WHERE brand_id='indian' AND code LIKE 'E2E-SVC-%'
),
ros AS (
  SELECT ro.id, ro.estimated_labor_units,
         (row_number() OVER (ORDER BY ro.ro_code) - 1) AS idx
  FROM repair_orders ro
  WHERE ro.brand_id='indian' AND ro.ro_code LIKE 'E2E-RO-%'
)
INSERT INTO repair_order_lines (
  repair_order_id, brand_id, line_no, kind,
  labor_name, labor_units, item_id, part_code, part_name,
  qty, unit_price, amount, is_warranty, source, metadata
)
SELECT
  ros.id, 'indian', 1, 'labor',
  sv.name, ros.estimated_labor_units, sv.id, sv.code, sv.name,
  NULL, sv.suggested_price, (ros.estimated_labor_units * sv.suggested_price),
  false, 'initial', jsonb_build_object('e2e_seed', true)
FROM ros
JOIN svc sv ON sv.idx = ros.idx % sv.cnt
WHERE NOT EXISTS (
  SELECT 1 FROM repair_order_lines l WHERE l.repair_order_id = ros.id AND l.line_no = 1
);

-- part 行（line_no=2）
WITH
prt AS (
  SELECT id, code, name, suggested_price,
         (row_number() OVER (ORDER BY code) - 1) AS idx,
         count(*) OVER () AS cnt
  FROM items WHERE brand_id='indian' AND code LIKE 'E2E-P-%'
),
ros AS (
  SELECT ro.id,
         (row_number() OVER (ORDER BY ro.ro_code) - 1) AS idx
  FROM repair_orders ro
  WHERE ro.brand_id='indian' AND ro.ro_code LIKE 'E2E-RO-%'
)
INSERT INTO repair_order_lines (
  repair_order_id, brand_id, line_no, kind,
  labor_name, labor_units, item_id, part_code, part_name,
  qty, unit_price, amount, is_warranty, source, metadata
)
SELECT
  ros.id, 'indian', 2, 'part',
  NULL, NULL, pt.id, pt.code, pt.name,
  (1 + ros.idx % 3)::numeric,                          -- 數量 1~3
  pt.suggested_price,
  ((1 + ros.idx % 3) * pt.suggested_price),
  (ros.idx % 7 = 0),                                    -- 約 1/7 保固
  'initial', jsonb_build_object('e2e_seed', true)
FROM ros
JOIN prt pt ON pt.idx = ros.idx % pt.cnt
WHERE NOT EXISTS (
  SELECT 1 FROM repair_order_lines l WHERE l.repair_order_id = ros.id AND l.line_no = 2
);


-- ---------------------------------------------------------------------
-- B2-A.4 · 回填 repair_orders.lines_subtotal / lines_total（產值，餵 aftersales-staff KPI）
--   只更新本 batch 的 E2E-RO 工單（不動既有 row）
-- ---------------------------------------------------------------------
UPDATE repair_orders ro
SET lines_subtotal = agg.s,
    lines_total     = round(agg.s * 1.05)   -- 含 5% 稅
FROM (
  SELECT repair_order_id, sum(amount) AS s
  FROM repair_order_lines
  GROUP BY repair_order_id
) agg
WHERE ro.id = agg.repair_order_id
  AND ro.brand_id='indian'
  AND ro.ro_code LIKE 'E2E-RO-%'
  AND ro.lines_total IS NULL;   -- idempotent：已回填過就不重算

-- ===== B2-A 區塊結束 =====


-- =====================================================================
-- ===== B2-B: 進銷存 + NPS + 人效快照 =====
--   Indian, 2026-02-24 ~ 2026-05-24（近 3 個月）
--   餵 INV-07（v_inventory_turnover / v_stale_inventory / v_stock_balances）
--      CRM-04/05（nps_responses 核對）、SA-09（aftersales_technicians 快照）
--   全 idempotent：seed_key 命名空間 'b2b-' + NOT EXISTS / ON CONFLICT (brand_id, gi_no)
--
--   ⚠️ 視圖讀法（pg_get_viewdef 確認）：
--     v_inventory_turnover：outflow 來自 stock_issue_lines JOIN stock_issues
--         (status='completed' AND posted_at >= now()-1y)；balance 來自 stock_items。
--         abc_class = items.control_type。turnover = qty_out_12m / qty_on_hand。
--     v_stale_inventory：純讀 stock_items (status='available' AND qty>0)，
--         靠 last_movement_at 判呆滯（>90d mild / >180d severe / >365d critical）。
--     v_stock_balances：純讀 stock_items，按 status 分群在手量。
--     → stock_movements 是流水帳，3 個 INV-07 視圖都不直接讀它；周轉/呆滯靠
--        stock_items + stock_issues。stock_movements 仍 seed ≥400 筆供流水帳頁。
-- =====================================================================

-- ---------------------------------------------------------------------
-- Task 1.1 · stock_items 在手批次（餵 v_stock_balances / turnover.balance / stale）
--   每個 E2E-P item 在主零件倉 WH-001 建一筆 available 批次。ABC 梯度：
--     A(23) → 高在手 + last_movement 近期(now-3~15d)  → 高周轉
--     B(56) → 中在手 + last_movement now-30~55d        → 中周轉
--     C 活躍(前半) → 小量 + last_movement now-40~80d
--     C 呆滯(後半 ~44 個) → 有量 + now-100~120d(mild) / 一批 now-195~214d(severe)
-- ---------------------------------------------------------------------
WITH ranked AS (
  SELECT i.id AS item_id, i.code, i.control_type, i.standard_cost,
         row_number() OVER (PARTITION BY i.control_type ORDER BY i.code) AS rn,
         count(*)     OVER (PARTITION BY i.control_type)                  AS cnt
  FROM items i
  WHERE i.brand_id='indian' AND i.code LIKE 'E2E-P-%'
)
INSERT INTO stock_items
  (brand_id, item_id, warehouse_id, qty, status, unit_cost, last_movement_at, external_source, metadata)
SELECT 'indian', r.item_id,
       '6e9f3fdf-454e-43ac-b7ef-a22c13b4bc57'::uuid,   -- WH-001 主零件倉
       CASE r.control_type
         WHEN 'A' THEN (8 + (r.rn % 8))
         WHEN 'B' THEN (5 + (r.rn % 10))
         ELSE (3 + (r.rn % 12))
       END::numeric,
       'available',
       r.standard_cost,
       CASE
         WHEN r.control_type='A' THEN now() - ((3 + (r.rn % 13))    || ' days')::interval
         WHEN r.control_type='B' THEN now() - ((30 + (r.rn % 26))   || ' days')::interval
         WHEN r.control_type='C' AND r.rn <= (r.cnt/2) THEN now() - ((40 + (r.rn % 41)) || ' days')::interval
         WHEN r.control_type='C' AND r.rn >  (r.cnt/2) AND (r.rn % 4 = 0) THEN now() - ((195 + (r.rn % 20)) || ' days')::interval
         ELSE now() - ((100 + (r.rn % 21)) || ' days')::interval
       END,
       'seed_e2e',
       jsonb_build_object('seed_key', 'b2b-stk-' || r.code, 'e2e_seed', true, 'abc', r.control_type)
FROM ranked r
WHERE NOT EXISTS (
  SELECT 1 FROM stock_items s
  WHERE s.brand_id='indian' AND s.metadata->>'seed_key' = 'b2b-stk-' || r.code
);

-- ---------------------------------------------------------------------
-- Task 1.2 · stock_issues 出庫單頭（餵 turnover.outflow；status='completed' + posted_at 近1年）
--   每個 item 展開成 N 張 issue：A=5 / B=2 / C活躍=1 / C呆滯=0（呆滯品故意不出庫）
-- ---------------------------------------------------------------------
WITH ranked AS (
  SELECT i.id AS item_id, i.code, i.control_type, i.standard_cost, i.base_uom,
         row_number() OVER (PARTITION BY i.control_type ORDER BY i.code) AS rn,
         count(*)     OVER (PARTITION BY i.control_type)                  AS cnt
  FROM items i
  WHERE i.brand_id='indian' AND i.code LIKE 'E2E-P-%'
),
plan AS (
  SELECT *,
    CASE control_type
      WHEN 'A' THEN 5
      WHEN 'B' THEN 2
      WHEN 'C' THEN CASE WHEN rn <= (cnt/2) THEN 1 ELSE 0 END
    END AS n_issues
  FROM ranked
),
expanded AS (
  SELECT p.*, gs.seq
  FROM plan p
  JOIN LATERAL generate_series(1, p.n_issues) gs(seq) ON true
  WHERE p.n_issues > 0
)
INSERT INTO stock_issues
  (brand_id, gi_no, type, warehouse_id, issue_date, status,
   qty_issued_total, amount_total, posted_at, external_source, metadata)
SELECT 'indian',
       'E2E-GI-' || e.code || '-' || e.seq,
       'ro_picking',
       '6e9f3fdf-454e-43ac-b7ef-a22c13b4bc57'::uuid,
       (now() - (((e.seq * 17 + e.rn * 3) % 88) || ' days')::interval)::date,
       'completed',
       CASE e.control_type WHEN 'A' THEN (2 + e.seq % 4) WHEN 'B' THEN (1 + e.seq % 3) ELSE 1 END::numeric,
       0,
       (now() - (((e.seq * 17 + e.rn * 3) % 88) || ' days')::interval),
       'seed_e2e',
       jsonb_build_object('seed_key', 'b2b-gi-' || e.code || '-' || e.seq, 'e2e_seed', true)
FROM expanded e
ON CONFLICT (brand_id, gi_no) DO NOTHING;

-- Task 1.3 · stock_issue_lines（每張 issue 一行；qty_issued = 周轉率分子）
INSERT INTO stock_issue_lines
  (brand_id, gi_id, line_no, item_id, qty_issued, uom, unit_cost, unit_price, line_amount, metadata)
SELECT 'indian', gi.id, 1, it.id, gi.qty_issued_total, it.base_uom,
       it.standard_cost, round(it.standard_cost * 1.35),
       round(it.standard_cost * 1.35 * gi.qty_issued_total),
       jsonb_build_object('seed_key', 'b2b-gil-' || gi.gi_no, 'e2e_seed', true)
FROM stock_issues gi
JOIN items it ON it.brand_id='indian'
  AND it.code = substring(gi.gi_no from 'E2E-GI-(E2E-P-[0-9]+)-')
WHERE gi.brand_id='indian' AND gi.gi_no LIKE 'E2E-GI-%'
  AND NOT EXISTS (SELECT 1 FROM stock_issue_lines l WHERE l.gi_id = gi.id AND l.line_no = 1);

UPDATE stock_issues gi
SET amount_total = l.line_amount, qty_issued_total = l.qty_issued
FROM stock_issue_lines l
WHERE l.gi_id = gi.id AND l.line_no = 1
  AND gi.brand_id='indian' AND gi.gi_no LIKE 'E2E-GI-%' AND gi.amount_total = 0;

-- ---------------------------------------------------------------------
-- Task 1.4 · stock_movements 流水帳（≥400；視圖不讀此表，純供流水帳頁）
-- ---------------------------------------------------------------------
-- (a) OUT：每筆 issue line 一筆 reason='issue'
INSERT INTO stock_movements
  (brand_id, item_id, warehouse_id, direction, qty, reason, source_table, source_id, created_at, metadata)
SELECT 'indian', l.item_id, gi.warehouse_id, 'out', l.qty_issued, 'issue',
       'stock_issues', gi.id, gi.posted_at,
       jsonb_build_object('seed_key', 'b2b-mv-out-' || gi.gi_no, 'e2e_seed', true)
FROM stock_issues gi
JOIN stock_issue_lines l ON l.gi_id = gi.id AND l.line_no = 1
WHERE gi.brand_id='indian' AND gi.gi_no LIKE 'E2E-GI-%'
  AND NOT EXISTS (SELECT 1 FROM stock_movements m
    WHERE m.brand_id='indian' AND m.metadata->>'seed_key' = 'b2b-mv-out-' || gi.gi_no);

-- (b) IN：每筆在手批次一筆 reason='receipt'（入庫日 = 批次 last_movement - 5d）
INSERT INTO stock_movements
  (brand_id, item_id, warehouse_id, direction, qty, reason, source_table, source_id, created_at, metadata)
SELECT 'indian', s.item_id, s.warehouse_id, 'in', s.qty, 'receipt',
       'stock_items', s.id, (s.last_movement_at - interval '5 days'),
       jsonb_build_object('seed_key', 'b2b-mv-in-' || (s.metadata->>'seed_key'), 'e2e_seed', true)
FROM stock_items s
WHERE s.brand_id='indian' AND s.metadata->>'seed_key' LIKE 'b2b-stk-%'
  AND NOT EXISTS (SELECT 1 FROM stock_movements m
    WHERE m.brand_id='indian' AND m.metadata->>'seed_key' = 'b2b-mv-in-' || (s.metadata->>'seed_key'));

-- (c) 調撥（WH-001 → WH-CONS，A 類前 12 個）
INSERT INTO stock_movements
  (brand_id, item_id, warehouse_id, direction, qty, reason, source_table, source_id, created_at, metadata)
SELECT 'indian', t.item_id, t.wh, t.dir, 2::numeric, 'transfer', 'manual', NULL,
       (now() - ((20 + t.rn) || ' days')::interval),
       jsonb_build_object('seed_key', 'b2b-mv-tr-' || t.code || '-' || t.dir, 'e2e_seed', true)
FROM (
  SELECT i.id AS item_id, i.code, row_number() OVER (ORDER BY i.code) AS rn, w.wh, w.dir
  FROM items i
  CROSS JOIN (VALUES ('6e9f3fdf-454e-43ac-b7ef-a22c13b4bc57'::uuid,'out'),
                     ('8153ad9e-956c-4ce6-8f03-3f2d856923b5'::uuid,'in')) w(wh,dir)
  WHERE i.brand_id='indian' AND i.control_type='A' AND i.code LIKE 'E2E-P-%'
) t
WHERE t.rn <= 24
  AND NOT EXISTS (SELECT 1 FROM stock_movements m
    WHERE m.brand_id='indian' AND m.metadata->>'seed_key' = 'b2b-mv-tr-' || t.code || '-' || t.dir);

-- (d) 調整（盤盈/盤虧，C 類前 16 個）
INSERT INTO stock_movements
  (brand_id, item_id, warehouse_id, direction, qty, reason, source_table, source_id, created_at, metadata)
SELECT 'indian', a.item_id, '6e9f3fdf-454e-43ac-b7ef-a22c13b4bc57'::uuid,
       CASE WHEN a.rn % 2 = 0 THEN 'in' ELSE 'out' END,
       1::numeric, 'adjustment', 'manual', NULL,
       (now() - ((10 + a.rn) || ' days')::interval),
       jsonb_build_object('seed_key', 'b2b-mv-adj-' || a.code, 'e2e_seed', true)
FROM (
  SELECT i.id AS item_id, i.code, row_number() OVER (ORDER BY i.code) AS rn
  FROM items i
  WHERE i.brand_id='indian' AND i.control_type='C' AND i.code LIKE 'E2E-P-%'
) a
WHERE a.rn <= 16
  AND NOT EXISTS (SELECT 1 FROM stock_movements m
    WHERE m.brand_id='indian' AND m.metadata->>'seed_key' = 'b2b-mv-adj-' || a.code);

-- ---------------------------------------------------------------------
-- Task 2 · NPS 核對（不補資料）
--   現況 Indian nps_responses = 142 筆，分群梯度完整、近3月分佈良好：
--     aftersales: promoter 43 / passive 36 / detractor 25（last90: 21/15/11）
--     sales     : promoter 18 / passive 12 / detractor 8 （last90: 15/9/3）
--   表結構：score smallint NOT NULL（每筆皆「已回收」，無 sent/responded 二分欄）；
--           category = promoter|passive|detractor，responded_at 為回收時間。
--   → 已 ≥50 有效回收 + 三群俱全 + 近3月分佈 → 達標，本 batch 不增量、不動既有 row。
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Task 3 · SA-09 人效快照（UPDATE aftersales_technicians 快照欄）
--   值由 B2-A 126 關單聚合推導：sold_minutes = Σlabor_units × 60（與 drill-down 一致）
--   effiency=sold/actual：T3 145% > T5 132% > T1 125% > T6 118% > T4 110% > T2 98%
--   （3 達標 125% 目標、3 未達；productivity/utilization 同步有梯度）
--   ⚠️ 例外：本 task 允許 UPDATE 既有 Indian 技師快照欄（快照本就會被覆寫）。
-- ---------------------------------------------------------------------
UPDATE aftersales_technicians t SET
  jobs_total        = v.jobs_total,
  jobs_done         = v.jobs_total,
  sold_minutes      = v.sold_minutes,
  actual_minutes    = v.actual_minutes,
  available_minutes = v.available_minutes,
  updated_at        = now()
FROM (VALUES
  ('T1', 21, 4290, 3432, 5200),
  ('T2', 21, 3720, 3796, 6327),
  ('T3', 21, 4350, 3000, 4167),
  ('T4', 21, 3780, 3436, 5543),
  ('T5', 21, 4410, 3341, 4773),
  ('T6', 21, 3840, 3254, 5085)
) v(code, jobs_total, sold_minutes, actual_minutes, available_minutes)
WHERE t.brand_id='indian' AND t.code = v.code;

-- ===== B2-B 區塊結束 =====
