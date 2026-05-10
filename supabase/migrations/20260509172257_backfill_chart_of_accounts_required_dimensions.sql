-- 依 dimension-integration-research §5 規則 batch UPDATE chart_of_accounts.required_dimensions
-- 範圍：L5_DETAIL（221 筆 postable 帳戶）
WITH combined AS (
  SELECT
    id,
    '["SUBSIDIARY", "STORE"]'::jsonb
    || CASE WHEN l1_category::text = 'REVENUE' THEN '["BRAND", "DEPT"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN dealer_category::text IN ('VEHICLE_SALES','VEHICLE_INV')
            THEN '["VEHICLE","MODEL","MODEL_YEAR","SALESPERSON"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN dealer_category::text = 'SERVICE'
            THEN '["RO","TECHNICIAN","VEHICLE"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN dealer_category::text = 'PARTS'
            THEN '["PART_SKU","WAREHOUSE"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN dealer_category::text = 'INSURANCE'
            THEN '["INSURER","CONTRACT"]'::jsonb ELSE '[]'::jsonb END
    || CASE WHEN substring(account_code::text, 1, 4) IN ('1101','1102')
            THEN '["BANK"]'::jsonb ELSE '[]'::jsonb END
    || COALESCE(required_dimensions, '[]'::jsonb)
    AS dims
  FROM chart_of_accounts
  WHERE level = 'L5_DETAIL'
)
UPDATE chart_of_accounts coa
SET required_dimensions = (
  SELECT jsonb_agg(DISTINCT elem) FROM jsonb_array_elements_text(c.dims) elem
)
FROM combined c
WHERE coa.id = c.id;
