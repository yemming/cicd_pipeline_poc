-- 備件預留 ledger（Phase 1 落地 / 第十一輪 B3）
-- 路線 A：獨立 ledger，不動 v_stock_balances / parts-balance；可用量扣預留只在 helper 內算
CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,                              -- RLS 邊界；NOT NULL 無 default，逼呼叫端帶
  -- 預留標的
  item_id uuid NOT NULL REFERENCES items(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  stock_item_id uuid REFERENCES stock_items(id),       -- nullable：彙總層預留時為 null；批次層預留時指定批次
  -- 預留量（partial 核心）
  reserved_qty numeric(14,3) NOT NULL CHECK (reserved_qty > 0),
  consumed_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (consumed_qty >= 0),
  -- 來源（多型，addon 為主）
  source_type text NOT NULL CHECK (source_type IN ('repair_order_addon','repair_order','manual')),
  source_id uuid,                                      -- repair_order_addons.id / repair_orders.id
  ro_id uuid REFERENCES repair_orders(id),             -- 冗餘：哪張工單，方便 listByWorkOrder / CROSS-03 通知
  -- 狀態機
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','consumed','released','cancelled')),
  -- 稽核
  reserved_by uuid REFERENCES auth.users(id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_reason text,                                 -- restock / transfer_arrival / cancelled_by_user / issued
  -- 變動中 / 純顯示
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_reservations IS '備件預留 ledger（partial qty、狀態機 active/consumed/released/cancelled）；可用量 = on_hand − Σ active reservations，只在 domain helper 算，不污染 v_stock_balances（路線 A）';

-- index
CREATE INDEX idx_inv_resv_brand ON inventory_reservations (brand_id);
CREATE INDEX idx_inv_resv_ro ON inventory_reservations (brand_id, ro_id, status);
CREATE INDEX idx_inv_resv_status ON inventory_reservations (brand_id, status);
CREATE INDEX idx_inv_resv_source ON inventory_reservations (brand_id, source_type, source_id);
-- 可用量聚合熱路徑：(item,warehouse) 只看 active
CREATE INDEX idx_inv_resv_active_item_wh
  ON inventory_reservations (item_id, warehouse_id)
  WHERE status = 'active';

-- RLS（memory 教訓：新表必帶 4 條 policy，否則 Indian 帳號全空畫面）
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_reservations_select ON inventory_reservations
  FOR SELECT USING (user_has_brand(brand_id));

CREATE POLICY inventory_reservations_insert ON inventory_reservations
  FOR INSERT WITH CHECK (user_has_brand(brand_id));

CREATE POLICY inventory_reservations_update ON inventory_reservations
  FOR UPDATE USING (user_has_brand(brand_id))
  WITH CHECK (user_has_brand(brand_id));

CREATE POLICY inventory_reservations_delete ON inventory_reservations
  FOR DELETE USING (user_has_brand(brand_id));
