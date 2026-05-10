import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export type CoaRow = {
  id: string;
  tenant_id: string;
  account_code: string;
  parent_code: string | null;
  parent_id: string | null;
  level:
    | "L1_CATEGORY"
    | "L2_SUBCATEGORY"
    | "L3_MOEA"
    | "L4_PARENT"
    | "L5_DETAIL";
  depth: number;
  l1_code: string;
  l2_code: string;
  l3_code: string | null;
  l4_code: string | null;
  l5_code: string | null;
  name_zh_tw: string;
  name_en: string | null;
  display_indent_name: string | null;
  l1_category:
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "REVENUE"
    | "COGS"
    | "EXPENSE"
    | "NON_OPERATING"
    | "TAX";
  dealer_category:
    | "GENERAL"
    | "VEHICLE_SALES"
    | "VEHICLE_INV"
    | "SERVICE"
    | "PARTS"
    | "INSURANCE"
    | "FINANCE";
  tax_treatment:
    | "NORMAL"
    | "VAT_OUTPUT"
    | "VAT_INPUT"
    | "EXEMPT"
    | "WITHHOLDING"
    | "DEFERRED"
    | "ZERO_RATED";
  moea_code: string | null;
  moea_name_zh: string | null;
  is_postable: boolean;
  normal_balance: "D" | "C";
  is_active: boolean;
  is_locked: boolean;
  is_system_default: boolean;
  required_dimensions: string[];
  ai_tags: Record<string, unknown>;
  benchmark_enabled: boolean;
  description: string | null;
  display_order: number;
  netsuite_account_internal_id: string | null;
  netsuite_account_number: string | null;
  netsuite_sync_status: string | null;
};

export type DimensionRow = {
  id: string;
  tenant_id: string;
  dimension_code: string;
  dimension_name: string;
  description: string | null;
  reference_table: string | null;
  reference_value_column: string | null;
  is_required_globally: boolean;
  is_active: boolean;
  is_system_default: boolean;
  display_order: number;
  netsuite_segment_type: string | null;
  netsuite_segment_script_id: string | null;
};

export type MappingRow = {
  id: string;
  tenant_id: string;
  dealeros_dim: string;
  dealeros_id: string;
  netsuite_internal_id: string;
  netsuite_external_id: string | null;
  netsuite_segment_type: string | null;
  netsuite_segment_script_id: string | null;
  synced_at: string;
  sync_status: string;
  sync_notes: string | null;
};

const SENTINEL_TENANT = "00000000-0000-0000-0000-000000000000";

export async function getDefaultTenantUuid(): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("groups")
    .select("tenant_uuid")
    .eq("id", "default")
    .single();
  if (error || !data) throw new Error(`default group 找不到 tenant_uuid: ${error?.message}`);
  return data.tenant_uuid as string;
}

export type CoaFilters = {
  q?: string;
  l1?: string;        // 'ASSET' | ...
  dealer?: string;    // 'GENERAL' | 'VEHICLE_SALES' | ...
  level?: string;     // 'L5_DETAIL' | ...
  postable?: string;  // 'all' | 'yes' | 'no'
  status?: string;    // 'all' | 'active' | 'inactive'
};

export async function listChartOfAccounts(filters: CoaFilters = {}): Promise<{
  rows: CoaRow[];
  totalCount: number;
}> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  let q = sb
    .from("chart_of_accounts")
    .select(
      "id, tenant_id, account_code, parent_code, parent_id, level, depth, l1_code, l2_code, l3_code, l4_code, l5_code, name_zh_tw, name_en, display_indent_name, l1_category, dealer_category, tax_treatment, moea_code, moea_name_zh, is_postable, normal_balance, is_active, is_locked, is_system_default, required_dimensions, ai_tags, benchmark_enabled, description, display_order, netsuite_account_internal_id, netsuite_account_number, netsuite_sync_status",
    )
    .eq("tenant_id", tenant);

  if (filters.l1 && filters.l1 !== "all") q = q.eq("l1_category", filters.l1);
  if (filters.dealer && filters.dealer !== "all") q = q.eq("dealer_category", filters.dealer);
  if (filters.level && filters.level !== "all") q = q.eq("level", filters.level);
  if (filters.postable === "yes") q = q.eq("is_postable", true);
  if (filters.postable === "no") q = q.eq("is_postable", false);
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q?.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`account_code.ilike.%${t}%,name_zh_tw.ilike.%${t}%,moea_name_zh.ilike.%${t}%`);
  }

  const [listRes, countRes] = await Promise.all([
    q.order("account_code").limit(2000),
    sb
      .from("chart_of_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant),
  ]);
  if (listRes.error) throw new Error(`coa: ${listRes.error.message}`);

  return {
    rows: (listRes.data ?? []) as unknown as CoaRow[],
    totalCount: countRes.count ?? 0,
  };
}

export type DimensionFilters = {
  q?: string;
  scope?: string;     // 'all' | 'system' | 'tenant'
  segment?: string;   // 'all' | 'native' | 'custom'
  status?: string;    // 'all' | 'active' | 'inactive'
};

export async function listGlDimensions(filters: DimensionFilters = {}): Promise<{
  rows: DimensionRow[];
  totalCount: number;
}> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  let q = sb
    .from("gl_dimensions")
    .select(
      "id, tenant_id, dimension_code, dimension_name, description, reference_table, reference_value_column, is_required_globally, is_active, is_system_default, display_order, netsuite_segment_type, netsuite_segment_script_id",
    )
    .in("tenant_id", [tenant, SENTINEL_TENANT]);

  if (filters.scope === "system") q = q.eq("tenant_id", SENTINEL_TENANT);
  if (filters.scope === "tenant") q = q.eq("tenant_id", tenant);
  if (filters.segment === "native") q = q.eq("netsuite_segment_type", "native");
  if (filters.segment === "custom") q = q.eq("netsuite_segment_type", "custom");
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q?.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(
      `dimension_code.ilike.%${t}%,dimension_name.ilike.%${t}%,reference_table.ilike.%${t}%`,
    );
  }

  const { data, error } = await q.order("display_order").order("dimension_code");
  if (error) throw new Error(`gl_dimensions: ${error.message}`);

  return {
    rows: (data ?? []) as unknown as DimensionRow[],
    totalCount: data?.length ?? 0,
  };
}

export async function listNetsuiteMappings(filters: { dim?: string } = {}): Promise<{
  rows: MappingRow[];
  totalCount: number;
}> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  let q = sb
    .from("netsuite_dim_mapping")
    .select(
      "id, tenant_id, dealeros_dim, dealeros_id, netsuite_internal_id, netsuite_external_id, netsuite_segment_type, netsuite_segment_script_id, synced_at, sync_status, sync_notes",
    )
    .eq("tenant_id", tenant);

  if (filters.dim && filters.dim !== "all") q = q.eq("dealeros_dim", filters.dim);

  const { data, error } = await q.order("dealeros_dim").order("dealeros_id");
  if (error) throw new Error(`netsuite_dim_mapping: ${error.message}`);

  return {
    rows: (data ?? []) as unknown as MappingRow[],
    totalCount: data?.length ?? 0,
  };
}

// ============================================================
// Journal Entries
// ============================================================

export type EntryStatus = "draft" | "posted" | "reversed";

export type JournalEntryRow = {
  id: string;
  tenant_id: string;
  entry_no: string;
  entry_date: string;
  description: string | null;
  status: EntryStatus;
  posted_at: string | null;
  posted_by: string | null;
  reversed_by_entry_id: string | null;
  netsuite_journal_id: string | null;
  netsuite_synced_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // 加總（用 view-side aggregate 簡化）
  line_count?: number;
  total_amount?: number;
};

export type JournalEntryLineRow = {
  id: string;
  entry_id: string;
  line_no: number;
  coa_id: string;
  debit: number;
  credit: number;
  dimensions: Record<string, string | number>;
  description: string | null;
  // joined coa
  coa_account_code?: string;
  coa_name_zh_tw?: string;
  coa_required_dimensions?: string[];
  coa_normal_balance?: "D" | "C";
};

export type JournalEntryFilters = {
  q?: string;
  status?: string;        // 'all' | 'draft' | 'posted' | 'reversed'
  date_from?: string;
  date_to?: string;
};

export async function listJournalEntries(
  filters: JournalEntryFilters = {},
): Promise<{ rows: JournalEntryRow[]; totalCount: number }> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  let q = sb
    .from("journal_entries")
    .select(
      "id, tenant_id, entry_no, entry_date, description, status, posted_at, posted_by, reversed_by_entry_id, netsuite_journal_id, netsuite_synced_at, created_at, updated_at, created_by",
    )
    .eq("tenant_id", tenant);

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.date_from) q = q.gte("entry_date", filters.date_from);
  if (filters.date_to) q = q.lte("entry_date", filters.date_to);
  if (filters.q?.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`entry_no.ilike.%${t}%,description.ilike.%${t}%`);
  }

  const [listRes, countRes] = await Promise.all([
    q.order("entry_date", { ascending: false }).order("entry_no", { ascending: false }).limit(500),
    sb
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant),
  ]);
  if (listRes.error) throw new Error(`journal_entries: ${listRes.error.message}`);

  const rows = (listRes.data ?? []) as unknown as JournalEntryRow[];

  // 加 line_count + total_amount aggregate
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: agg } = await sb
      .from("journal_entry_lines")
      .select("entry_id, debit")
      .in("entry_id", ids);
    const sumMap = new Map<string, { count: number; total: number }>();
    for (const a of agg ?? []) {
      const cur = sumMap.get(a.entry_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(a.debit) || 0;
      sumMap.set(a.entry_id, cur);
    }
    for (const r of rows) {
      const s = sumMap.get(r.id);
      r.line_count = s?.count ?? 0;
      r.total_amount = s?.total ?? 0;
    }
  }

  return { rows, totalCount: countRes.count ?? 0 };
}

export async function getJournalEntryById(id: string): Promise<{
  entry: JournalEntryRow | null;
  lines: JournalEntryLineRow[];
}> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  const { data: entry, error: entryErr } = await sb
    .from("journal_entries")
    .select(
      "id, tenant_id, entry_no, entry_date, description, status, posted_at, posted_by, reversed_by_entry_id, netsuite_journal_id, netsuite_synced_at, created_at, updated_at, created_by",
    )
    .eq("id", id)
    .eq("tenant_id", tenant)
    .maybeSingle();
  if (entryErr) throw new Error(`journal_entry: ${entryErr.message}`);
  if (!entry) return { entry: null, lines: [] };

  const { data: lines, error: linesErr } = await sb
    .from("journal_entry_lines")
    .select(
      "id, entry_id, line_no, coa_id, debit, credit, dimensions, description, chart_of_accounts!inner(account_code, name_zh_tw, required_dimensions, normal_balance)",
    )
    .eq("entry_id", id)
    .order("line_no");
  if (linesErr) throw new Error(`journal_entry_lines: ${linesErr.message}`);

  type LineWithCoa = Omit<JournalEntryLineRow, "coa_account_code" | "coa_name_zh_tw" | "coa_required_dimensions" | "coa_normal_balance"> & {
    chart_of_accounts: {
      account_code: string;
      name_zh_tw: string;
      required_dimensions: string[];
      normal_balance: "D" | "C";
    };
  };

  const flatLines: JournalEntryLineRow[] = (lines as unknown as LineWithCoa[] | null ?? []).map((l) => ({
    id: l.id,
    entry_id: l.entry_id,
    line_no: l.line_no,
    coa_id: l.coa_id,
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
    dimensions: (l.dimensions ?? {}) as Record<string, string | number>,
    description: l.description,
    coa_account_code: l.chart_of_accounts.account_code,
    coa_name_zh_tw: l.chart_of_accounts.name_zh_tw,
    coa_required_dimensions: l.chart_of_accounts.required_dimensions ?? [],
    coa_normal_balance: l.chart_of_accounts.normal_balance,
  }));

  // 一次撈 reversed_by 對應的 entry_no 給 detail page 顯示
  const e = entry as unknown as JournalEntryRow;

  return { entry: e, lines: flatLines };
}

// 給 line dropdown 用的可入帳科目簡表
export type PostableCoaOption = {
  id: string;
  account_code: string;
  name_zh_tw: string;
  l1_category: string;
  dealer_category: string;
  normal_balance: "D" | "C";
  required_dimensions: string[];
};

export async function listPostableCoaOptions(): Promise<PostableCoaOption[]> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  const { data, error } = await sb
    .from("chart_of_accounts")
    .select(
      "id, account_code, name_zh_tw, l1_category, dealer_category, normal_balance, required_dimensions",
    )
    .eq("tenant_id", tenant)
    .eq("is_postable", true)
    .eq("is_active", true)
    .order("account_code");
  if (error) throw new Error(`postable coa: ${error.message}`);
  return (data ?? []) as unknown as PostableCoaOption[];
}

// ============================================================
// 動態維度 lookup（Journal Entry line 編輯時用）
// 每個 dim_code 對應 list of {id_or_value, label}
// ============================================================

export type DimensionLookupOption = { value: string; label: string };
export type DimensionLookupMap = Record<string, DimensionLookupOption[]>;

/**
 * 一次撈所有 dim 的 lookup data。
 * 量都很小（<=61 筆），跨 brand 全撈，dropdown 顯示時加 [BRAND] 前綴讓 user 區分。
 *
 * 對應 gl_dimensions.reference_table 的實際表 + label 欄位。
 * reference_table=null 的 dim（CAMPAIGN/BANK/INSURER/DEALER）走純文字輸入，這裡不返回。
 */
export async function listDimensionLookups(): Promise<DimensionLookupMap> {
  const sb = createServiceClient();

  const [
    subsidiaries,
    organizations,
    brands,
    departments,
    employees,
    customers,
    suppliers,
    items,
    warehouses,
    workOrders,
    vehicleModels,
    serviceAppts,
    customerVehicles,
  ] = await Promise.all([
    sb.from("subsidiaries").select("id, legal_name, tax_id").order("legal_name"),
    sb.from("organizations").select("id, brand_id, level, code, name").order("brand_id").order("name"),
    sb.from("brands").select("id, name").order("id"),
    sb.from("departments").select("id, brand_id, code, name").order("brand_id").order("name"),
    sb.from("employees").select("id, brand_id, name").order("brand_id").order("name"),
    sb.from("customers").select("id, brand_id, code, name").order("brand_id").order("name"),
    sb.from("suppliers").select("id, brand_id, code, name").order("brand_id").order("name"),
    sb.from("items").select("id, brand_id, code, name").order("brand_id").order("code"),
    sb.from("warehouses").select("id, brand_id, code, name").order("brand_id").order("name"),
    sb.from("work_orders").select("id, brand_id, wo_no").order("created_at", { ascending: false }).limit(200),
    sb.from("vehicle_models").select("id, brand_id, model_name").order("brand_id").order("model_name"),
    sb.from("service_appointments").select("id, brand_id, appt_no").order("created_at", { ascending: false }).limit(200),
    sb.from("customer_vehicles").select("id, brand_id, vin").order("brand_id"),
  ]);

  const map: DimensionLookupMap = {};

  map.SUBSIDIARY = (subsidiaries.data ?? []).map((r) => ({
    value: r.id,
    label: `${r.legal_name}${r.tax_id ? ` (${r.tax_id})` : ""}`,
  }));

  // STORE = level 2 organizations（門市/分店）
  map.STORE = (organizations.data ?? [])
    .filter((r) => r.level === 2)
    .map((r) => ({
      value: r.id,
      label: `[${r.brand_id}] ${r.code ?? ""} ${r.name}`.trim(),
    }));
  // REGION = level 1 organizations
  map.REGION = (organizations.data ?? [])
    .filter((r) => r.level === 1)
    .map((r) => ({
      value: r.id,
      label: `[${r.brand_id}] ${r.code ?? ""} ${r.name}`.trim(),
    }));

  map.BRAND = (brands.data ?? []).map((r) => ({
    value: r.id,
    label: r.name,
  }));

  map.DEPT = (departments.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.code ?? ""} ${r.name}`.trim(),
  }));

  // employees 同時供應 SALESPERSON / TECHNICIAN / EMPLOYEE 三個 dim
  const empOpts = (employees.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.name}`,
  }));
  map.EMPLOYEE = empOpts;
  map.SALESPERSON = empOpts;
  map.TECHNICIAN = empOpts;

  map.CUSTOMER = (customers.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.code ?? ""} ${r.name}`.trim(),
  }));

  map.VENDOR = (suppliers.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.code ?? ""} ${r.name}`.trim(),
  }));

  map.PART_SKU = (items.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.code ?? ""} ${r.name}`.trim(),
  }));

  map.WAREHOUSE = (warehouses.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.code ?? ""} ${r.name}`.trim(),
  }));

  map.RO = (workOrders.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.wo_no ?? r.id.slice(0, 8)}`,
  }));

  map.MODEL = (vehicleModels.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.model_name}`,
  }));

  map.APPOINTMENT = (serviceAppts.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.appt_no ?? r.id.slice(0, 8)}`,
  }));

  // VEHICLE = customer_vehicles.id；VIN = customer_vehicles.vin
  map.VEHICLE = (customerVehicles.data ?? []).map((r) => ({
    value: r.id,
    label: `[${r.brand_id}] ${r.vin ?? r.id.slice(0, 8)}`,
  }));

  return map;
}
