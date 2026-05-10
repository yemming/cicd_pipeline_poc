-- ┌──────────────────────────────────────────────────────────────────
-- │ journal_entries：分錄表頭（draft / posted / reversed）
-- └──────────────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entry_no TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  reversed_by_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  netsuite_journal_id TEXT,
  netsuite_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (tenant_id, entry_no)
);

CREATE INDEX idx_journal_entries_tenant_status ON journal_entries(tenant_id, status);
CREATE INDEX idx_journal_entries_entry_date ON journal_entries(entry_date);

-- ┌──────────────────────────────────────────────────────────────────
-- │ journal_entry_lines：分錄行
-- │   每行帶 coa_id（chart_of_accounts） + dimensions (jsonb {DIM_CODE: value})
-- │   debit/credit 互斥（一行只能借或貸，不能同時）
-- └──────────────────────────────────────────────────────────────────
CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  coa_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  debit NUMERIC(20,4) NOT NULL DEFAULT 0,
  credit NUMERIC(20,4) NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)),
  UNIQUE (entry_id, line_no)
);

CREATE INDEX idx_journal_entry_lines_coa ON journal_entry_lines(coa_id);
CREATE INDEX idx_journal_entry_lines_entry ON journal_entry_lines(entry_id);

-- ┌──────────────────────────────────────────────────────────────────
-- │ Posting Validator：在 status 從 draft 變 posted 時做完整交叉檢查
-- │   1) 借貸平衡 SUM(debit) = SUM(credit)
-- │   2) 至少有一行 + total > 0
-- │   3) 所有 line.coa_id 對應的 chart_of_accounts.is_postable = TRUE
-- │   4) 所有 line.coa_id 的 required_dimensions 在 line.dimensions 都出現
-- └──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_journal_entry_posting() RETURNS TRIGGER AS $$
DECLARE
  total_debit NUMERIC;
  total_credit NUMERIC;
  line_count INT;
  bad_lines TEXT;
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status != 'posted') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
      INTO total_debit, total_credit, line_count
      FROM journal_entry_lines WHERE entry_id = NEW.id;

    IF line_count = 0 THEN
      RAISE EXCEPTION 'Journal entry % has no lines', NEW.entry_no;
    END IF;

    IF total_debit != total_credit THEN
      RAISE EXCEPTION 'Journal entry % unbalanced: debit=%, credit=%',
        NEW.entry_no, total_debit, total_credit;
    END IF;

    IF total_debit = 0 THEN
      RAISE EXCEPTION 'Journal entry % has zero amount', NEW.entry_no;
    END IF;

    SELECT string_agg(jel.line_no::text, ',' ORDER BY jel.line_no) INTO bad_lines
      FROM journal_entry_lines jel
      JOIN chart_of_accounts coa ON coa.id = jel.coa_id
      WHERE jel.entry_id = NEW.id AND NOT coa.is_postable;

    IF bad_lines IS NOT NULL THEN
      RAISE EXCEPTION 'Journal entry % lines [%] use non-postable accounts (must be L5_DETAIL)',
        NEW.entry_no, bad_lines;
    END IF;

    SELECT string_agg(format('line %s missing %s', jel.line_no, rd.dim), '; ')
      INTO bad_lines
      FROM journal_entry_lines jel
      JOIN chart_of_accounts coa ON coa.id = jel.coa_id
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(coa.required_dimensions, '[]'::jsonb)) AS rd(dim)
      WHERE jel.entry_id = NEW.id
        AND NOT (jel.dimensions ? rd.dim);

    IF bad_lines IS NOT NULL THEN
      RAISE EXCEPTION 'Journal entry % missing required dimensions: %',
        NEW.entry_no, bad_lines;
    END IF;

    NEW.posted_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_entries_validate_posting
  BEFORE INSERT OR UPDATE OF status ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION validate_journal_entry_posting();

CREATE OR REPLACE FUNCTION journal_entries_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION journal_entries_set_updated_at();

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entries_service_role ON journal_entries
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY journal_entry_lines_service_role ON journal_entry_lines
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE journal_entries IS '會計分錄表頭（draft 階段可編輯，posted 後鎖定，reversed 用反向沖銷）';
COMMENT ON TABLE journal_entry_lines IS '會計分錄行：每行 coa_id + debit/credit + dimensions jsonb（維度值）';
COMMENT ON FUNCTION validate_journal_entry_posting IS '交叉邏輯認證：借貸平衡 + 入帳科目限 L5 + 必填維度檢查';
