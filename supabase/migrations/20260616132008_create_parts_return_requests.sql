-- ============================================================================
-- Migration: create_parts_return_requests
-- Applied:   2026-06-16 (cloud schema_migrations version 20260616132008)
-- Round:     退料閉環 + TL 借用測試工單（Russell 6/16 第 4 批）
-- ----------------------------------------------------------------------------
-- 退料閉環核心表：售後 / TL 退料待倉管確認記錄。
-- 補檔以納入版本控制（內容與正式站 schema_migrations 完全一致）。
-- ============================================================================

-- 退料閉環核心表：售後/TL 退料待倉管確認記錄
CREATE TABLE IF NOT EXISTS parts_return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_type TEXT NOT NULL CHECK (source_type IN (
    'addon_cancel',   -- 追加項目整筆取消
    'addon_partial',  -- 追加項目部分取消（明細行層）
    'ro_cancel',      -- 整張工單取消
    'tech_unused',    -- 技師用不到主動退料
    'tl_return'       -- 借用測試工單歸還
  )),

  source_ro_id UUID REFERENCES repair_orders(id) ON DELETE SET NULL,
  source_addon_id UUID,
  source_line_id UUID,

  item_id UUID,
  part_name TEXT NOT NULL,
  part_code TEXT,
  qty_requested NUMERIC(14,3) NOT NULL,
  qty_confirmed NUMERIC(14,3),

  return_type TEXT NOT NULL DEFAULT 'full_return' CHECK (return_type IN (
    'full_return',     -- 完整退料，庫存回補
    'damage_writeoff'  -- 損耗核銷，庫存不回補
  )),

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- 待倉管確認
    'confirmed',  -- 已確認收到
    'overdue'     -- 逾期未確認（系統自動標記）
  )),

  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  return_reason TEXT,

  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  warehouse_note TEXT,

  due_by TIMESTAMPTZ NOT NULL,
  overdue_notified_at TIMESTAMPTZ,

  -- 差額處理（倉管確認數量 < 申請數量時）：建立 writeoff 的關聯
  shortfall_writeoff_id UUID,

  metadata JSONB DEFAULT '{}'::jsonb,

  brand_id TEXT NOT NULL,
  store_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prr_brand_status_idx ON parts_return_requests (brand_id, status);
CREATE INDEX IF NOT EXISTS prr_source_ro_idx ON parts_return_requests (source_ro_id);
CREATE INDEX IF NOT EXISTS prr_due_by_idx ON parts_return_requests (due_by) WHERE status = 'pending';

ALTER TABLE parts_return_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY prr_select ON parts_return_requests FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY prr_insert ON parts_return_requests FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY prr_update ON parts_return_requests FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY prr_delete ON parts_return_requests FOR DELETE USING (user_has_brand(brand_id));
