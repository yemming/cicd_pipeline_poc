-- 修補四：售後結帳收款獨立記錄表（前台→中台數據通路）
-- 注意：`payments` 表名已被會計 AP（廠商付款）模組佔用，故售後收款用 aftersales_payments。
-- 適配 DealerOS 實際 schema：brand_id 為 text、store_id 為 organizations uuid、
-- 無 stores/brands/users 表，故 store_id/created_by 不加 FK（與既有 RO 表慣例一致）。
-- 已透過 Supabase MCP apply_migration 套用到 Cloud（2026-06-16）。
CREATE TABLE IF NOT EXISTS aftersales_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ro_id uuid NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  ro_number text NOT NULL,
  prefix_p1 text NOT NULL,
  checkout_id uuid REFERENCES ro_checkouts(id) ON DELETE SET NULL,
  subtotal_labor numeric(12,2),
  subtotal_parts numeric(12,2),
  subtotal_misc numeric(12,2),
  discount_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL,
  payment_reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  store_id uuid,
  brand_id text NOT NULL,
  external_invoice_no text,
  gl_posted boolean DEFAULT false,
  gl_posted_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_aftersales_payments_checkout_id
  ON aftersales_payments(checkout_id) WHERE checkout_id IS NOT NULL;

ALTER TABLE aftersales_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY aftersales_payments_select ON aftersales_payments FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY aftersales_payments_insert ON aftersales_payments FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY aftersales_payments_update ON aftersales_payments FOR UPDATE USING (user_has_brand(brand_id));
CREATE POLICY aftersales_payments_delete ON aftersales_payments FOR DELETE USING (user_has_brand(brand_id));

CREATE INDEX IF NOT EXISTS idx_aftersales_payments_ro_id ON aftersales_payments(ro_id);
CREATE INDEX IF NOT EXISTS idx_aftersales_payments_prefix_p1 ON aftersales_payments(prefix_p1);
CREATE INDEX IF NOT EXISTS idx_aftersales_payments_paid_at ON aftersales_payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_aftersales_payments_store_id ON aftersales_payments(store_id);
CREATE INDEX IF NOT EXISTS idx_aftersales_payments_brand_id ON aftersales_payments(brand_id);
