-- ============================================================================
-- Notification Hub (IM) v1.0 — Supabase schema snapshot
--
-- 這份檔案是「目前跑在 Supabase 的 schema 快照」，供 audit / 重建環境 / code review 用。
-- 真正的遷移透過 MCP（mcp__plugin_supabase_supabase__apply_migration）寫入，
-- migration 名稱：
--   1. notification_hub_v1_schema
--   2. notification_hub_v1_rls_policies
--
-- 規格來源：Notion「[DealerOS] Notification Hub — IM 通知模組開發規格書 (v1.0)」§4
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 通路註冊表
-- ----------------------------------------------------------------------------
CREATE TABLE notification_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,      -- 'line' | 'google-chat'
  display_name  TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4.2 推播目標（群組 / 使用者 / webhook）
-- ----------------------------------------------------------------------------
CREATE TABLE notification_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL,              -- 'group' | 'user' | 'webhook'
  target_ref    TEXT NOT NULL,              -- LINE groupId / userId / Google Chat webhook URL
  display_name  TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, target_ref)
);

-- ----------------------------------------------------------------------------
-- 4.3 訂閱（事件 → 目標）
-- ----------------------------------------------------------------------------
CREATE TABLE notification_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code    TEXT NOT NULL,              -- 例 'work_order.created'
  target_id     UUID NOT NULL REFERENCES notification_targets(id) ON DELETE CASCADE,
  template_code TEXT,                        -- 指定模板；null 則用預設（code registry）
  filter_rules  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 例 { dealer_id: 'xxx' }
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_event ON notification_subscriptions(event_code, is_active);

-- ----------------------------------------------------------------------------
-- 4.4 模板（DB 覆寫 code-registered 預設）
-- ----------------------------------------------------------------------------
CREATE TABLE notification_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,       -- 'work-order-created.line.default'
  event_code    TEXT NOT NULL,
  channel_code  TEXT NOT NULL,
  format        TEXT NOT NULL,              -- 'text' | 'flex' | 'card'
  body          JSONB NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tpl_event_channel ON notification_templates(event_code, channel_code, is_active);

-- ----------------------------------------------------------------------------
-- 4.5 送達記錄（audit trail）
-- ----------------------------------------------------------------------------
CREATE TABLE notification_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code      TEXT NOT NULL,
  event_payload   JSONB NOT NULL,
  subscription_id UUID REFERENCES notification_subscriptions(id) ON DELETE SET NULL,
  channel_code    TEXT NOT NULL,
  target_ref      TEXT NOT NULL,
  template_code   TEXT,
  status          TEXT NOT NULL,            -- 'pending' | 'sent' | 'failed' | 'retrying'
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  rendered_body   JSONB,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deliveries_event  ON notification_deliveries(event_code, created_at DESC);
CREATE INDEX idx_deliveries_status ON notification_deliveries(status, created_at DESC);

-- ----------------------------------------------------------------------------
-- updated_at 觸發器
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notification_channels_updated_at
  BEFORE UPDATE ON notification_channels
  FOR EACH ROW EXECUTE FUNCTION set_notification_updated_at();
CREATE TRIGGER trg_notification_targets_updated_at
  BEFORE UPDATE ON notification_targets
  FOR EACH ROW EXECUTE FUNCTION set_notification_updated_at();
CREATE TRIGGER trg_notification_subscriptions_updated_at
  BEFORE UPDATE ON notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_notification_updated_at();
CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_notification_updated_at();
CREATE TRIGGER trg_notification_deliveries_updated_at
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_notification_updated_at();

-- ----------------------------------------------------------------------------
-- RLS policies（MVP：authenticated 全開；admin 檢查在 server action 層）
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'notification_channels',
      'notification_targets',
      'notification_subscriptions',
      'notification_templates',
      'notification_deliveries'
    ])
  LOOP
    EXECUTE format($fmt$
      CREATE POLICY "authenticated_all" ON %I
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
    $fmt$, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Seed（Phase 1 建好即種）
-- ----------------------------------------------------------------------------
INSERT INTO notification_channels (code, display_name) VALUES
  ('line',        'LINE'),
  ('google-chat', 'Google Chat')
ON CONFLICT (code) DO NOTHING;

-- Yemming 個人 LINE（Phase 0 webhook log 取得）
INSERT INTO notification_targets (channel_id, target_type, target_ref, display_name, metadata)
SELECT c.id, 'user', 'U744ed506a956ae6a8f8f9cac31b46979', 'Yemming（個人 LINE）',
       jsonb_build_object('note', 'Phase 0 webhook log 抓取')
FROM notification_channels c WHERE c.code = 'line'
ON CONFLICT (channel_id, target_ref) DO NOTHING;
