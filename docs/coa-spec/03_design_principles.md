# DealerOS Chart of Accounts — Design Principles

> **Audience**: Engineers, AI agents, integrators consuming this COA spec.
> **Purpose**: Encode the *why* behind the structure so downstream implementations don't break the design.
> **Version**: 2.0 | **Date**: 2026-05

---

## 0. TL;DR for AI Agents

If you are an AI agent extending this spec (building tables, writing migrations,
generating SuiteQL, designing ETL):

- **DO NOT** flatten the 5-layer hierarchy. The depth is load-bearing.
- **DO NOT** modify L1-L3 codes. They are anchored to MOEA (Taiwan Ministry of Economic Affairs) and changing them breaks compliance + NetSuite mapping.
- **DO** treat `moea_code` as the universal anchor for any cross-system mapping.
- **DO** enforce `is_postable=TRUE` only on `level=L5_DETAIL`.
- **DO** preserve `dealer_category` enum strictly. AI benchmark queries depend on it.
- **DO** keep `tenant_id` isolation. This is multi-tenant SaaS, not single-org ERP.

---

## 1. The Core Insight

> **Every transaction in DealerOS posts to L5. Every report rolls up through L4 → L3 → L2 → L1.**

This is the entire design. Once a transaction is correctly posted to a leaf account,
**every report (BS, P&L, management dashboard, AI benchmark) is automatically derivable**.

This is not a "nice to have" feature — it is the system's load-bearing assumption.
Break it (e.g. by allowing posting to L4) and the entire reporting layer collapses.

---

## 2. Why 5 Layers? Why Not 4 or 6?

### Layer responsibilities

| Layer | Code Length | Owner | Purpose | Mutability |
|---|---|---|---|---|
| **L1 — 大類** | 1 digit | DealerOS | IFRS-aligned top categories | Frozen forever |
| **L2 — 中類** | 2 digits | DealerOS | Current/Non-current splits, Sales/Service splits | Frozen forever |
| **L3 — MOEA** | 4 digits | Taiwan MOEA | **Compliance anchor** — Taiwan 商業會計項目表 | Frozen unless MOEA revises |
| **L4 — 母科目** | 5 digits | DealerOS | Auto industry semantics (e.g. floor plan, warranty reserves) | DealerOS-managed |
| **L5 — 子科目** | 7 digits | Customer | Bank accounts, currencies, branches, vehicles | Customer-customizable |

### Why each layer is necessary

**L1-L2 (frozen)**: Every accountant in Taiwan understands these. Removing them breaks readability.

**L3 (MOEA anchor)**: This is the most important layer. Without it:
- Auditors won't sign your statements
- NetSuite mapping requires a translation table per customer
- Cross-tenant AI benchmarks become meaningless

**L4 (industry layer)**: This is where DealerOS earns its keep. Generic ERP only goes to L3. We add L4 so we can distinguish:
- 銀行存款 (general L3) → 車輛庫存融資專戶 (L4-specific)
- 應收帳款 (general L3) → 應收原廠保固理賠 (L4-specific)
- Without L4, AI cannot tell "service margin" from "vehicle margin" — the margin attribution problem.

**L5 (customer layer)**: The flexibility customers actually need. Banks, foreign currency accounts, branch petty cash — all of this varies per dealer. We let them expand here without polluting the upper layers.

### Why not 6 layers?

We considered adding "transaction sub-classification" as L6. We rejected it because:
- L5 already provides enough granularity for any reasonable analysis.
- Transaction-level detail belongs in `journal_entries` and `gl_dimensions`, not in COA.
- Each extra layer doubles UI complexity and onboarding friction.

---

## 3. The MOEA Anchor: Why It's the Killer Feature

Taiwan's MOEA publishes 商業會計項目表 — a 4-digit standard chart used by:
- Every Taiwanese accounting firm
- Every standard ERP localized for Taiwan (鼎新, 文中, 正航)
- NetSuite Taiwan localization (when properly configured)
- Tax authority (財政部) reporting

By making `moea_code` a **mandatory attribute on every L3-L5 account**, we get:

### 3.1 Free Compliance
Auditors map our COA to MOEA in 5 seconds, not 5 weeks.

### 3.2 Free NetSuite Integration
```
DealerOS L5 (1102107 銀行存款－外幣 USD)
    ↓ moea_code = '1102'
NetSuite Account (any account tagged with MOEA 1102)
```
The integration becomes **column matching**, not **schema translation**.

### 3.3 Free Cross-Tenant AI Benchmark
When 50 dealers use DealerOS, every "vehicle COGS" they record traces back to the same `moea_code = '5100'`. The AI doesn't need NLP to figure out which accounts mean the same thing — the integers tell it.

```sql
-- "What's the median vehicle margin for new car dealers?"
SELECT
  AVG(revenue / NULLIF(cogs, 0)) AS median_margin
FROM (
  SELECT tenant_id,
    SUM(amount) FILTER (WHERE moea_code = '4100' AND dealer_category = 'VEHICLE_SALES') AS revenue,
    SUM(amount) FILTER (WHERE moea_code = '5100' AND dealer_category = 'VEHICLE_SALES') AS cogs
  FROM journal_entries
  GROUP BY tenant_id
) t;
```

This query works **without per-tenant configuration** because of the MOEA anchor.

---

## 4. The `dealer_category` Enum: AI's Coordinate System

`dealer_category` exists because MOEA alone is not specific enough for industry analysis.

Example:
- MOEA `1180 應收帳款` is just "receivables"
- But for a dealer, it matters whether it's:
  - `VEHICLE_SALES` receivable (customer car payment)
  - `SERVICE` receivable (insurance company claim payment)
  - `PARTS` receivable (wholesale parts customer)

These have completely different aging behavior, collection strategies, and risk profiles.

### Rules for `dealer_category`

1. **Closed enum, never extend without product review.** Adding a new value invalidates AI training data.
2. **Strict per-account assignment.** No "mixed" or "auto-detect" allowed.
3. **`GENERAL` is for true cross-business accounts only** (e.g. office rent, manager salary). When in doubt, do NOT use GENERAL — pick the dominant category.

### The benchmark formula

```
Comparable accounts = Same moea_code + Same dealer_category
```

If you ever find yourself comparing accounts across different `dealer_category` values, **stop**. It's noise, not signal.

---

## 5. Strict Posting Rules

### 5.1 Only L5 is postable

```sql
CHECK (NOT is_postable OR level = 'L5_DETAIL')
```

This is enforced at the database level. **Do not bypass it via raw SQL.**

Why so strict?
- ERP horror story #1: Accountant posts to parent account, child accounts no longer sum correctly.
- ERP horror story #2: Migration from old ERP "smart-detects" parent accounts, breaks aggregation forever.
- ERP horror story #3: Custom report tool reads parent account balances, double-counts when children also have data.

Strict L5-only posting eliminates all three.

### 5.2 Locked accounts are immutable

```sql
CHECK (level IN ('L4_PARENT', 'L5_DETAIL') OR is_locked = TRUE)
```

L1-L3 are locked at insert time. Their names, codes, and structure cannot be modified by any application code, only by DBA via explicit migration.

### 5.3 Soft delete only

Accounts are never physically deleted. They are marked `is_active = FALSE`. Why?
- Historical journals reference accounts. Deleting breaks audit trail.
- "Reactivate the old account" is a common customer request.
- Tax authority can request 5-year-old transaction history.

---

## 6. Required Dimensions: The Quality Gatekeeper

Each account specifies `required_dimensions` — analytical breakdowns that **must** be filled when posting.

Example:
```json
{
  "account_code": "4100101",
  "name": "銷貨收入－新車（國產）",
  "required_dimensions": ["VEHICLE", "SALESPERSON", "STORE"]
}
```

Posting a JE to this account without VIN + salesperson + store **fails validation**.

### Why this matters for AI

Without required dimensions:
- "Sales by store" report = guessing
- "Salesperson commission accuracy" = manual reconciliation
- "Vehicle-level profitability" = impossible

With required dimensions:
- Every revenue line is automatically pre-classified
- AI doesn't need NLP, doesn't need rule extraction, just SQL `GROUP BY`
- Data quality is enforced **at the source**, not reconciled afterward

### Don't be too aggressive

`required_dimensions = []` is acceptable for:
- Office rent (don't need vehicle-level)
- Bank interest income (don't need salesperson)
- Tax expense (just one number)

Be specific where it matters, permissive where it doesn't.

---

## 7. AI Tags: The Forward-Compatible Hook

`ai_tags` is a JSONB field intentionally left semi-structured. Today it carries:

```json
{
  "kpi_role": "primary_revenue",
  "profit_attribution": "vehicle_margin",
  "benchmarkable": true
}
```

### Why JSONB instead of strict columns?

We don't yet know all the AI use cases. JSONB lets us add tags without schema migrations.

### Recommended tag conventions (so far)

| Key | Values | Used by |
|---|---|---|
| `kpi_role` | `primary_revenue`, `service_revenue`, `vehicle_cogs`, `floor_plan_debt` | Dashboard widgets |
| `profit_attribution` | `vehicle_margin`, `service_margin`, `parts_margin` | P&L breakdown |
| `benchmarkable` | `true`, `false` | Cross-tenant analysis |
| `regulatory_flag` | `withholding`, `vat_special`, `deferred_revenue` | Compliance scanners |

When adding a new tag, document it here.

---

## 8. NetSuite Integration: The Promised Path

The columns are reserved on day 1, even if not used:

```sql
netsuite_account_internal_id VARCHAR(50),
netsuite_account_number VARCHAR(50),
netsuite_synced_at TIMESTAMPTZ,
netsuite_sync_status VARCHAR(20)
```

### The integration playbook

1. **NetSuite side**: Customer's NetSuite has Taiwan localization with MOEA-aligned COA (most NetSuite Taiwan deployments do).
2. **Mapping run**: For each `chart_of_accounts` row where `is_postable = TRUE`:
   ```sql
   UPDATE chart_of_accounts coa
   SET netsuite_account_internal_id = ns.internal_id
   FROM netsuite_accounts ns
   WHERE ns.tenant_id = coa.tenant_id
     AND ns.moea_code = coa.moea_code
     AND ns.dealer_category_tag = coa.dealer_category;  -- if using custom segments
   ```
3. **Journal sync**: When DealerOS posts a JE, push to NetSuite with `netsuite_account_internal_id`.

That's it. No translation tables, no mapping UI, no consultant.

### Failure modes to handle

- `netsuite_sync_status = 'CONFLICT'`: NetSuite has an account at MOEA `1102` but no `dealer_category` tag. Resolution: ask customer to tag in NetSuite, or fall back to MOEA-only mapping.
- Customer-only L5 accounts (e.g. Bank XYZ unique to them): create matching NetSuite account on first post.

---

## 9. Multi-Tenant Isolation

This is a SaaS, not an on-premise ERP.

### Rules

1. **Every query through application code MUST set `app.current_tenant_id`** before touching `chart_of_accounts`.
2. **RLS policies enforce isolation at the database level.** Even if application logic forgets, the DB blocks cross-tenant reads.
3. **Background jobs** (e.g. AI benchmark) explicitly bypass RLS via service role, but **only access aggregated views** (`v_coa_industry_benchmark`), never raw tables.

### What's shared across tenants

- `coa_seed_accounts`: the 412-row template, no tenant_id needed.
- `gl_dimensions` system defaults: shared via `tenant_id = '00000000-...'` sentinel.
- Aggregated benchmark views: shared via `benchmark_enabled = TRUE` opt-in.

### What's NEVER shared

- Account balances
- Journal entries
- Customer lists
- Anything queryable by `tenant_id`

---

## 10. Versioning Strategy

The COA spec versions independently of customer deployments.

### v2.0 (current)
- 5-layer architecture
- 412 seed accounts
- MOEA 112 年版 alignment

### Migration philosophy
When v2.1 is released:
1. New accounts default to `is_active = FALSE` for existing tenants
2. Tenant admin sees a "new accounts available" notification
3. Tenant decides whether to opt-in
4. **Existing transactions never break** — old account codes remain valid

We **never** delete or rename existing seed accounts. Only mark deprecated and stop showing in new deployments.

---

## 11. Anti-Patterns to Avoid

### ❌ DON'T: Auto-create new L5 codes via business logic
"User created a new bank account → auto-generate L5 code 1102110"

This is tempting but wrong. L5 codes should be:
- Reviewed by accountant before creation
- Ideally aligned with internal naming conventions (1102 + branch suffix)
- Logged with audit trail

Build a UI for it, not silent automation.

### ❌ DON'T: Use account names for logic
"If `name_zh_tw LIKE '%試乘車%'` then..."

Names are display, codes are identity. Use `dealer_category = 'VEHICLE_INV'` and `account_code = '1210104'` for branching logic.

### ❌ DON'T: Make `dealer_category` user-editable in production
This breaks all historical AI benchmarks. If a customer wants reclassification, run it as a controlled migration with audit.

### ❌ DON'T: Skip the MOEA anchor "for now"
Every team that promised "we'll add MOEA later" ended up rewriting their COA from scratch. Just include it from day 1.

### ❌ DON'T: Trust users to enter codes manually
The 5-layer prefix structure is unforgiving. UI should always select-from-list, never free-text.

---

## 12. Reference Implementation Checklist

When extending this spec, check these:

- [ ] New account codes follow the 1/2/4/5/7-digit length rules
- [ ] `parent_code` correctly references the immediate parent
- [ ] `is_postable` is TRUE only for L5
- [ ] `is_locked` is TRUE for L1-L3
- [ ] `moea_code` is set for all L3+ accounts
- [ ] `normal_balance` matches MOEA convention (D/C)
- [ ] `dealer_category` is one of the 7 enum values, not free text
- [ ] `required_dimensions` matches actual transaction patterns
- [ ] `ai_tags` follows naming conventions in §7
- [ ] Tenant isolation is preserved (RLS enabled)

---

## 13. Files in this Spec

| File | Purpose | Audience |
|---|---|---|
| `01_schema_v2.sql` | Postgres DDL with constraints | DBA, backend |
| `02_seed_accounts.csv` | 412 seed accounts, machine-readable | DBA, AI agents |
| `03_design_principles.md` | This file | Everyone |
| `DealerOS_COA_v2_Master.xlsx` | Visual reference for accountants | Customer-facing, sales |

When in doubt, **this document wins**. Excel and CSV are derivatives.

---

*— End of design principles. Updates require product team review.*
