-- =====================================================================
-- DealerOS Chart of Accounts Schema v2.0
-- Architecture: 5-Layer Parent-Child Hierarchy
-- Compliance Anchor: Taiwan MOEA 商業會計項目表 (112 年版)
-- Future Integration: NetSuite OneWorld Taiwan
-- AI-Ready: Cross-tenant benchmark via dealer_category + moea_code
-- =====================================================================

-- ============================================
-- ENUM 定義（值域穩定 → AI 訓練資料一致）
-- ============================================

-- L1 大類（鎖死）
CREATE TYPE coa_l1_category AS ENUM (
  'ASSET',           -- 1 資產
  'LIABILITY',       -- 2 負債
  'EQUITY',          -- 3 權益
  'REVENUE',         -- 4 營業收入
  'COGS',            -- 5 營業成本
  'EXPENSE',         -- 6 營業費用
  'NON_OPERATING',   -- 7 營業外
  'TAX'              -- 8 所得稅
);

-- 業態分類（DealerOS AI benchmark 維度）
CREATE TYPE dealer_category AS ENUM (
  'GENERAL',         -- 通用
  'VEHICLE_SALES',   -- 整車銷售相關
  'VEHICLE_INV',     -- 車輛存貨相關
  'SERVICE',         -- 維修保養
  'PARTS',           -- 零件配件
  'INSURANCE',       -- 保險代理
  'FINANCE'          -- 分期/融資仲介
);

-- 稅務屬性
CREATE TYPE tax_treatment AS ENUM (
  'NORMAL',          -- 一般
  'VAT_OUTPUT',      -- 銷項 5%
  'VAT_INPUT',       -- 進項 5%
  'EXEMPT',          -- 免稅（保費代收）
  'WITHHOLDING',     -- 扣繳（介紹費/代收規費）
  'DEFERRED',        -- 遞延（IFRS 15 履約義務）
  'ZERO_RATED'       -- 零稅率（外銷）
);

-- 科目層級（明確化編碼結構）
CREATE TYPE coa_level AS ENUM (
  'L1_CATEGORY',     -- 大類（1 位編碼）       e.g. 1
  'L2_SUBCATEGORY',  -- 中類（2 位編碼）       e.g. 11
  'L3_MOEA',         -- 經濟部標準（4 位編碼） e.g. 1102
  'L4_PARENT',       -- 母科目（5 位編碼）     e.g. 11021
  'L5_DETAIL'        -- 子科目（7 位編碼）     e.g. 1102107
);

-- ============================================
-- 主表：chart_of_accounts
-- ============================================
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,                     -- multi-tenant 隔離

  -- ★ 編碼結構（5 層）
  account_code VARCHAR(7) NOT NULL,            -- 主編碼（1, 11, 1102, 11021, 1102107）
  parent_code VARCHAR(7),                      -- 父科目編碼（外鍵語意）
  parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  level coa_level NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 1 AND 5),

  -- 編碼分段（讓 SQL aggregation 不需切字串）
  l1_code CHAR(1) NOT NULL,                    -- 1, 2, 3 ...
  l2_code CHAR(2) NOT NULL,                    -- 11, 12 ...
  l3_code CHAR(4),                             -- 1101, 1102 ... (L1/L2 為 NULL)
  l4_code CHAR(5),                             -- 11011, 11021 ...
  l5_code CHAR(7),                             -- 1101101, 1102107 ...

  -- 名稱
  name_zh_tw VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  display_indent_name VARCHAR(120),            -- 預先處理好的縮排名稱（report 用）

  -- 分類維度（AI 與報表的命脈）
  l1_category coa_l1_category NOT NULL,
  dealer_category dealer_category NOT NULL DEFAULT 'GENERAL',
  tax_treatment tax_treatment NOT NULL DEFAULT 'NORMAL',

  -- ★ 合規錨點：MOEA 經濟部標準碼
  moea_code CHAR(4) NOT NULL,                  -- L3 4 位碼，永遠對應商業會計項目表
  moea_name_zh VARCHAR(100) NOT NULL,          -- 經濟部標準名（不可改）

  -- ★ NetSuite 整合預留（未來填入）
  netsuite_account_internal_id VARCHAR(50),
  netsuite_account_number VARCHAR(50),
  netsuite_synced_at TIMESTAMPTZ,
  netsuite_sync_status VARCHAR(20),            -- 'PENDING', 'SYNCED', 'CONFLICT'

  -- 入帳控制（嚴格規則）
  is_postable BOOLEAN NOT NULL DEFAULT FALSE,  -- ★ 只有 L5 葉節點才可入帳
  normal_balance CHAR(1) NOT NULL CHECK (normal_balance IN ('D', 'C')),

  -- 啟用狀態
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,    -- L1-L3 鎖死不可修改
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,  -- DealerOS 出廠科目

  -- 維度需求（強制必填的分析維度）
  required_dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 範例：["VEHICLE", "SALESPERSON", "STORE"]

  -- AI / Analytics 標籤
  ai_tags JSONB DEFAULT '{}'::jsonb,
  -- 範例：{"profit_attribution": "vehicle_margin", "kpi_role": "primary_revenue"}

  benchmark_enabled BOOLEAN DEFAULT FALSE,     -- 跨公司 benchmark 開關

  -- 描述
  description TEXT,
  posting_example TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,

  -- 審計
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,

  -- ★ 約束（編碼一致性）
  UNIQUE (tenant_id, account_code),

  -- L1: 1 位 = l1_code
  CONSTRAINT chk_l1_format CHECK (
    level != 'L1_CATEGORY' OR (LENGTH(account_code) = 1 AND account_code = l1_code)
  ),
  -- L2: 2 位且開頭為 l1
  CONSTRAINT chk_l2_format CHECK (
    level != 'L2_SUBCATEGORY' OR (LENGTH(account_code) = 2 AND account_code = l2_code AND l2_code LIKE l1_code || '%')
  ),
  -- L3: 4 位且開頭為 l2
  CONSTRAINT chk_l3_format CHECK (
    level != 'L3_MOEA' OR (LENGTH(account_code) = 4 AND account_code = l3_code AND l3_code LIKE l2_code || '%' AND moea_code = account_code)
  ),
  -- L4: 5 位且開頭為 l3
  CONSTRAINT chk_l4_format CHECK (
    level != 'L4_PARENT' OR (LENGTH(account_code) = 5 AND account_code = l4_code AND l4_code LIKE l3_code || '%')
  ),
  -- L5: 7 位且開頭為 l4
  CONSTRAINT chk_l5_format CHECK (
    level != 'L5_DETAIL' OR (LENGTH(account_code) = 7 AND account_code = l5_code AND l5_code LIKE l4_code || '%')
  ),
  -- 入帳規則：只有 L5 才能 is_postable=TRUE
  CONSTRAINT chk_postable_only_l5 CHECK (
    NOT is_postable OR level = 'L5_DETAIL'
  ),
  -- 鎖定規則：L1-L3 必須 is_locked
  CONSTRAINT chk_lock_l1_to_l3 CHECK (
    level IN ('L4_PARENT', 'L5_DETAIL') OR is_locked = TRUE
  )
);

-- ============================================
-- 索引（AI / Reporting 查詢效能）
-- ============================================
CREATE INDEX idx_coa_tenant ON chart_of_accounts(tenant_id) WHERE is_active = TRUE;
CREATE INDEX idx_coa_postable ON chart_of_accounts(tenant_id, account_code) WHERE is_postable = TRUE AND is_active = TRUE;
CREATE INDEX idx_coa_l1 ON chart_of_accounts(tenant_id, l1_category) WHERE is_active = TRUE;
CREATE INDEX idx_coa_l2 ON chart_of_accounts(tenant_id, l2_code) WHERE is_active = TRUE;
CREATE INDEX idx_coa_l3 ON chart_of_accounts(tenant_id, l3_code) WHERE is_active = TRUE;
CREATE INDEX idx_coa_l4 ON chart_of_accounts(tenant_id, l4_code) WHERE is_active = TRUE;
CREATE INDEX idx_coa_dealer_cat ON chart_of_accounts(tenant_id, dealer_category) WHERE is_active = TRUE;

-- 跨 tenant 比較用（AI benchmark）
CREATE INDEX idx_coa_moea_global ON chart_of_accounts(moea_code) WHERE benchmark_enabled = TRUE;

-- NetSuite 整合
CREATE INDEX idx_coa_netsuite ON chart_of_accounts(netsuite_account_internal_id)
  WHERE netsuite_account_internal_id IS NOT NULL;

-- 父子關係查詢
CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_id);
CREATE INDEX idx_coa_parent_code ON chart_of_accounts(tenant_id, parent_code);

-- 維度查詢
CREATE INDEX idx_coa_dimensions ON chart_of_accounts USING GIN (required_dimensions);
CREATE INDEX idx_coa_ai_tags ON chart_of_accounts USING GIN (ai_tags);

-- ============================================
-- 系統種子表：DealerOS 出廠 412 個標準科目
-- 客戶 onboarding 時，依 template_pack 從這裡複製
-- ============================================
CREATE TABLE coa_seed_accounts (
  id SERIAL PRIMARY KEY,
  template_packs TEXT[] NOT NULL,              -- ['NEW_CAR', 'MIXED', ...] 多 Pack 共用
  account_code VARCHAR(7) NOT NULL,
  parent_code VARCHAR(7),
  level coa_level NOT NULL,
  depth SMALLINT NOT NULL,

  l1_code CHAR(1) NOT NULL,
  l2_code CHAR(2) NOT NULL,
  l3_code CHAR(4),
  l4_code CHAR(5),
  l5_code CHAR(7),

  name_zh_tw VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),

  l1_category coa_l1_category NOT NULL,
  dealer_category dealer_category NOT NULL,
  tax_treatment tax_treatment NOT NULL,

  moea_code CHAR(4) NOT NULL,
  moea_name_zh VARCHAR(100) NOT NULL,

  is_postable BOOLEAN NOT NULL DEFAULT FALSE,
  normal_balance CHAR(1) NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,

  required_dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_tags JSONB DEFAULT '{}'::jsonb,

  description TEXT,
  posting_example TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,

  version VARCHAR(20) NOT NULL DEFAULT '2.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (account_code, version)
);

CREATE INDEX idx_seed_packs ON coa_seed_accounts USING GIN (template_packs);

-- ============================================
-- GL 維度主表（COA 的「鏡頭」，AI 切片用）
-- ============================================
CREATE TABLE gl_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  dimension_code VARCHAR(20) NOT NULL,         -- 'STORE', 'VEHICLE', 'VIN', 'SALESPERSON' ...
  dimension_name VARCHAR(50) NOT NULL,
  reference_table VARCHAR(50),                 -- 對應實體表（如 'vehicles'）
  is_required_globally BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, dimension_code)
);

-- DealerOS 預設維度（出廠就有）
INSERT INTO gl_dimensions (tenant_id, dimension_code, dimension_name, reference_table) VALUES
  ('00000000-0000-0000-0000-000000000000', 'STORE',       '門市/分店',  'stores'),
  ('00000000-0000-0000-0000-000000000000', 'VEHICLE',     '車輛',       'vehicles'),
  ('00000000-0000-0000-0000-000000000000', 'VIN',         '車輛識別碼', 'vehicles'),
  ('00000000-0000-0000-0000-000000000000', 'SALESPERSON', '業務員',     'employees'),
  ('00000000-0000-0000-0000-000000000000', 'TECHNICIAN',  '技師',       'employees'),
  ('00000000-0000-0000-0000-000000000000', 'CUSTOMER',    '客戶',       'customers'),
  ('00000000-0000-0000-0000-000000000000', 'VENDOR',      '供應商',     'vendors'),
  ('00000000-0000-0000-0000-000000000000', 'RO',          '工單',       'repair_orders'),
  ('00000000-0000-0000-0000-000000000000', 'PART_SKU',    '零件料號',   'parts'),
  ('00000000-0000-0000-0000-000000000000', 'CAMPAIGN',    '行銷活動',   'campaigns'),
  ('00000000-0000-0000-0000-000000000000', 'CONTRACT',    '合約',       'contracts'),
  ('00000000-0000-0000-0000-000000000000', 'BANK',        '銀行帳號',   'bank_accounts'),
  ('00000000-0000-0000-0000-000000000000', 'INSURER',     '保險公司',   'insurers'),
  ('00000000-0000-0000-0000-000000000000', 'DEALER',      '原廠/總代理','dealers'),
  ('00000000-0000-0000-0000-000000000000', 'DEPT',        '部門',       'departments'),
  ('00000000-0000-0000-0000-000000000000', 'EMPLOYEE',    '員工',       'employees');
ON CONFLICT DO NOTHING;

-- ============================================
-- 通用報表 Views
-- ============================================

-- View 1：依 MOEA 標準呈現（資產負債表/損益表用）
CREATE OR REPLACE VIEW v_coa_moea_rollup AS
SELECT
  tenant_id,
  moea_code,
  moea_name_zh,
  l1_category,
  COUNT(*) FILTER (WHERE is_postable AND is_active) AS active_postable_accounts,
  COUNT(*) FILTER (WHERE is_active) AS total_active_accounts
FROM chart_of_accounts
GROUP BY tenant_id, moea_code, moea_name_zh, l1_category;

-- View 2：依母科目彙總（管理報表用）
CREATE OR REPLACE VIEW v_coa_l4_rollup AS
SELECT
  tenant_id,
  l4_code,
  (SELECT name_zh_tw FROM chart_of_accounts c2
   WHERE c2.tenant_id = c1.tenant_id AND c2.account_code = c1.l4_code) AS l4_name,
  dealer_category,
  COUNT(*) AS child_count
FROM chart_of_accounts c1
WHERE level = 'L5_DETAIL' AND is_active = TRUE
GROUP BY tenant_id, l4_code, dealer_category;

-- View 3：跨公司 Benchmark（DealerOS AI moat）
CREATE OR REPLACE VIEW v_coa_industry_benchmark AS
SELECT
  moea_code,
  moea_name_zh,
  dealer_category,
  COUNT(DISTINCT tenant_id) AS tenant_usage_count,
  COUNT(*) AS total_account_instances
FROM chart_of_accounts
WHERE benchmark_enabled = TRUE AND is_active = TRUE
GROUP BY moea_code, moea_name_zh, dealer_category;

-- ============================================
-- Trigger：updated_at 自動維護
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coa_updated_at
  BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Trigger：自動填 display_indent_name（縮排）
-- ============================================
CREATE OR REPLACE FUNCTION set_indent_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.display_indent_name := REPEAT('    ', NEW.depth - 1) || NEW.name_zh_tw;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coa_indent_name
  BEFORE INSERT OR UPDATE OF name_zh_tw, depth ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION set_indent_name();

-- ============================================
-- RLS：multi-tenant 隔離
-- ============================================
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY coa_tenant_isolation ON chart_of_accounts
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY dim_tenant_isolation ON gl_dimensions
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- ============================================
-- 註解（給 AI 看的元資訊）
-- ============================================
COMMENT ON TABLE chart_of_accounts IS
  'DealerOS 5-layer Chart of Accounts. L1-L3 anchored to Taiwan MOEA standard, L4-L5 customizable.';

COMMENT ON COLUMN chart_of_accounts.moea_code IS
  'MOEA 4-digit code from 商業會計項目表 (112 年版). This is the anchor for NetSuite mapping and cross-tenant AI benchmark.';

COMMENT ON COLUMN chart_of_accounts.is_postable IS
  'Only L5_DETAIL accounts are postable. L1-L4 are aggregation nodes. Enforced by chk_postable_only_l5 constraint.';

COMMENT ON COLUMN chart_of_accounts.dealer_category IS
  'Auto industry classification. Critical for AI cross-tenant benchmarks: same moea_code + same dealer_category = directly comparable.';
