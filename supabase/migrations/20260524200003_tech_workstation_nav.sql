-- ════════════════════════════════════════════════════════════
-- C4a · nav_nodes /tech 雙 brand（掛在「車間管理」群組底下置頂）
--   Indian 車間管理 parent = a80598d6-f62f-4c33-a431-3014570341dd
--   Ducati 車間管理 parent = af14b32b-2da4-4679-9ae0-914bf66ce36b
-- ════════════════════════════════════════════════════════════

-- 把兩 brand 車間管理底下既有 level=3 節點 sort_order 全 +1，騰出 0 給技師工作台
UPDATE nav_nodes SET sort_order = sort_order + 1
WHERE parent_id IN (
  'a80598d6-f62f-4c33-a431-3014570341dd',  -- indian 車間管理
  'af14b32b-2da4-4679-9ae0-914bf66ce36b'   -- ducati 車間管理
) AND level = 3;

INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('indian', 'a80598d6-f62f-4c33-a431-3014570341dd', 3, 0, '技師工作台', 'engineering', '/tech', 'react_route', true, false),
  ('ducati', 'af14b32b-2da4-4679-9ae0-914bf66ce36b', 3, 0, '技師工作台', 'engineering', '/tech', 'react_route', true, false);
