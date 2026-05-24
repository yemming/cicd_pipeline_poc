-- ════════════════════════════════════════════════════════════
-- C4a · Tech 技師工作台 schema 基礎建設
-- 1) labor_time_sessions 新表（工時計：start→pause 一 row、續跑開新 row）
-- 2) repair_order_lines 加 done / done_at / done_by
-- 3) aftersales_technicians 加 user_id（FK→auth.users）
-- ════════════════════════════════════════════════════════════

-- ── 1. labor_time_sessions ──
CREATE TABLE IF NOT EXISTS labor_time_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  repair_order_id uuid NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  repair_order_line_id uuid REFERENCES repair_order_lines(id) ON DELETE SET NULL,  -- null = 整張單層級計時
  technician_id uuid NOT NULL REFERENCES aftersales_technicians(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,                 -- null = 計時中（active）
  status text NOT NULL DEFAULT 'active',  -- active | paused | ended
  duration_seconds integer GENERATED ALWAYS AS
     (CASE WHEN ended_at IS NULL THEN NULL
           ELSE GREATEST(0, EXTRACT(EPOCH FROM (ended_at - started_at))::int) END) STORED,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT labor_time_sessions_status_check CHECK (status IN ('active','paused','ended'))
);

CREATE INDEX IF NOT EXISTS labor_time_sessions_brand_ro_idx
  ON labor_time_sessions (brand_id, repair_order_id);
CREATE INDEX IF NOT EXISTS labor_time_sessions_tech_started_idx
  ON labor_time_sessions (technician_id, started_at);

-- 同一技師同時只能有一個 active 計時（跨單也擋，避免一人同時計兩單）
CREATE UNIQUE INDEX IF NOT EXISTS one_active_timer_per_technician
  ON labor_time_sessions (technician_id)
  WHERE ended_at IS NULL;

-- RLS（brand-aware，照抄 repair_orders 寫法：select/update/delete 用 user_has_brand，insert with check true）
ALTER TABLE labor_time_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "labor_time_sessions_select" ON labor_time_sessions
  FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY "labor_time_sessions_insert" ON labor_time_sessions
  FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "labor_time_sessions_update" ON labor_time_sessions
  FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "labor_time_sessions_delete" ON labor_time_sessions
  FOR DELETE USING (user_has_brand(brand_id));

-- ── 2. repair_order_lines 加 3 欄（工項完成標記）──
ALTER TABLE repair_order_lines
  ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES aftersales_technicians(id);

-- ── 3. aftersales_technicians 加 user_id（接登入帳號）──
ALTER TABLE aftersales_technicians
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS aftersales_technicians_user_id_idx
  ON aftersales_technicians (user_id) WHERE user_id IS NOT NULL;

-- ── 接 e2e-tech 帳號到 Indian T1 技師（陳建明）──
UPDATE aftersales_technicians
SET user_id = (SELECT id FROM auth.users WHERE email = 'e2e-tech@dealeros.test')
WHERE id = '5151ec08-fdff-440d-85c8-92f2bf129fb7';
