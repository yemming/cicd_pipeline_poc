-- A1) 加 vehicle_type ENUM
CREATE TYPE vehicle_type AS ENUM ('motorcycle', 'car', 'ev');

-- A2) 表 rename
ALTER TABLE motorcycle_models RENAME TO vehicle_models;
ALTER TABLE item_motorcycle_compatibility RENAME TO item_vehicle_compatibility;

-- A3) 欄位 rename（item_vehicle_compatibility + warranty_claims）
ALTER TABLE item_vehicle_compatibility RENAME COLUMN motorcycle_model_id TO vehicle_model_id;
ALTER TABLE warranty_claims RENAME COLUMN motorcycle_model_id TO vehicle_model_id;

-- A4) 加新欄位 vehicle_type + engine_kw
ALTER TABLE vehicle_models ADD COLUMN vehicle_type vehicle_type NOT NULL DEFAULT 'motorcycle';
ALTER TABLE vehicle_models ADD COLUMN engine_kw INTEGER NULL;

-- A5) template_packs array 重新命名（array_replace 是 Postgres in-place 操作）
UPDATE coa_seed_accounts SET template_packs = array_replace(template_packs, 'NEW_CAR', 'NEW_VEHICLE') WHERE 'NEW_CAR' = ANY(template_packs);
UPDATE coa_seed_accounts SET template_packs = array_replace(template_packs, 'USED_CAR', 'USED_VEHICLE') WHERE 'USED_CAR' = ANY(template_packs);

-- A6) gl_dimensions description 字串中含 motorcycle_models 改 vehicle_models
UPDATE gl_dimensions SET description = REPLACE(description, 'motorcycle_models', 'vehicle_models') WHERE description LIKE '%motorcycle_models%';

-- A7) Cosmetic: FK constraint name rename（功能不影響、純可讀性）
ALTER TABLE item_vehicle_compatibility RENAME CONSTRAINT item_motorcycle_compatibility_motorcycle_model_id_fkey TO item_vehicle_compatibility_vehicle_model_id_fkey;
ALTER TABLE warranty_claims RENAME CONSTRAINT warranty_claims_motorcycle_model_id_fkey TO warranty_claims_vehicle_model_id_fkey;
