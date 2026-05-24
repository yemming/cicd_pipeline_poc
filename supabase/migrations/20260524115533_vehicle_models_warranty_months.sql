-- Hook #3（交車→保固）：車型主檔保固月數
-- 穩定欄位、報表 / 保固計算會用 → typed column（非 metadata jsonb）
-- POC：統一 default 24 個月（proposal 拍板點 2，Ming 拍板用 vehicle_models 新欄 + 合理 default）
ALTER TABLE public.vehicle_models
  ADD COLUMN IF NOT EXISTS warranty_months integer NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.vehicle_models.warranty_months IS
  '保固月數；交車（sales_orders fulfilled）時用來算 customer_vehicles.warranty_until。POC 統一預設 24，未來可依車型調整。';
