-- ============================================================================
-- Migration: add_tl_to_repair_orders_prefix_p1
-- Applied:   2026-06-16 (cloud schema_migrations version 20260616141106)
-- Round:     退料閉環 + TL 借用測試工單（Russell 6/16 第 4 批）
-- ----------------------------------------------------------------------------
-- 背景：
--   TL（Test & Loan，借用測試）工單以 repair_orders.prefix_p1 = 'TL' 表示。
--   原 repair_orders_prefix_p1_check 白名單不含 'TL'，TL 工單建立會被 23514 擋下。
--
-- 本 migration 補上版本記錄（原 ALTER 於 2026-06-16 直接套用到正式站，
-- 當時未進 codebase；2026-06-17 依工程規範補檔，內容與正式站完全一致）。
--
-- 冪等性：DROP + ADD 重建約束；重跑會先移除舊約束再加回，結果一致。
-- ============================================================================

ALTER TABLE repair_orders DROP CONSTRAINT repair_orders_prefix_p1_check;

ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_prefix_p1_check
  CHECK (prefix_p1 = ANY (ARRAY['MN'::text,'RP'::text,'WC'::text,'AC'::text,'OT'::text,'PD'::text,'TL'::text]));
