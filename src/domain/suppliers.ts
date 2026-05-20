"use server";

/**
 * Domain Helper — Suppliers（供應商資訊）
 *
 * Phase 1: read helpers + 合約效期/狀態計算
 * Phase 2: 完整 CRUD + 合約 CRUD + 軟刪除（cascade contracts）
 *
 * 既有 server actions 在 src/lib/parts-setup/supplier-actions.ts 保留 — items detail
 * page 還在 import createSupplierAction，不刪。新功能一律用本檔。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type SupplierRow = Tables["suppliers"]["Row"];
export type SupplierContractRow = Tables["supplier_contracts"]["Row"];

export type ContractStatus = "valid" | "expiring" | "expired" | "none";

export type SupplierWithContract = SupplierRow & {
  latest_contract_to: string | null;
  contract_status: ContractStatus;
  supply_categories: string;
};

export type SupplierListFilter = {
  type?: string;
  contract_status?: ContractStatus | "all";
  q?: string;
};

const PAGE_PATH = "/parts/setup/suppliers";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const trim = (v?: string | null): string => (v ?? "").trim();
const nullable = (v?: string | null): string | null => {
  const t = trim(v);
  return t.length === 0 ? null : t;
};
const nullableUuid = (v?: string | null): string | null => {
  const t = trim(v);
  if (t.length === 0) return null;
  return t;
};
const nullableNumber = (v?: number | string | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

function calcContractStatus(effective_to: string | null): ContractStatus {
  if (!effective_to) return "none";
  const today = new Date();
  const to = new Date(effective_to);
  const daysLeft = Math.floor((to.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 90) return "expiring";
  return "valid";
}

// ───────────────── Read helpers ─────────────────

export async function listSuppliersWithContract(
  filter: SupplierListFilter = {},
): Promise<SupplierWithContract[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("suppliers")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("code");

  if (filter.type) q = q.eq("supplier_type", filter.type);
  if (filter.q) q = q.ilike("name", `%${filter.q}%`);

  const { data: suppliers, error } = await q;
  if (error) throw error;
  if (!suppliers || suppliers.length === 0) return [];

  const supplierIds = suppliers.map((s) => s.id);
  const { data: contracts, error: cErr } = await supabase
    .from("supplier_contracts")
    .select("supplier_id, effective_to")
    .in("supplier_id", supplierIds);
  if (cErr) throw cErr;

  const latestBySupplier = new Map<string, string>();
  for (const c of (contracts ?? []) as SupplierContractRow[]) {
    if (!c.supplier_id || !c.effective_to) continue;
    const cur = latestBySupplier.get(c.supplier_id);
    if (!cur || c.effective_to > cur) {
      latestBySupplier.set(c.supplier_id, c.effective_to);
    }
  }

  const enriched: SupplierWithContract[] = suppliers.map((s) => {
    const latest_contract_to = latestBySupplier.get(s.id) ?? null;
    const contract_status = calcContractStatus(latest_contract_to);
    const meta = (s.metadata ?? {}) as Record<string, unknown>;
    const supply_categories =
      typeof meta.supply_categories === "string" ? meta.supply_categories : "";
    return {
      ...s,
      latest_contract_to,
      contract_status,
      supply_categories,
    };
  });

  if (filter.contract_status && filter.contract_status !== "all") {
    return enriched.filter((s) => s.contract_status === filter.contract_status);
  }
  return enriched;
}

export type SupplierWithActivity = SupplierWithContract & {
  last_po_date: string | null;
  po_count_180d: number;
  po_amount_180d: number;
};

export async function getSuppliersPageData(
  filter: SupplierListFilter = {},
): Promise<{
  rows: SupplierWithActivity[];
  canEdit: boolean;
  stats: SuppliersStats;
}> {
  const [rows, canEdit, stats, activities] = await Promise.all([
    listSuppliersWithContract(filter),
    hasPermission(PERMISSIONS.SUPPLIER_EDIT),
    getSuppliersStats(),
    getSupplierActivities(),
  ]);
  const enriched: SupplierWithActivity[] = rows.map((r) => {
    const a = activities.get(r.id);
    return {
      ...r,
      last_po_date: a?.last_po_date ?? null,
      po_count_180d: a?.po_count_180d ?? 0,
      po_amount_180d: a?.po_amount_180d ?? 0,
    };
  });
  return { rows: enriched, canEdit, stats };
}

export async function getSupplierById(id: string): Promise<SupplierRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getContractsBySupplierId(
  supplierId: string,
): Promise<SupplierContractRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("supplier_contracts")
    .select("*")
    .eq("supplier_id", supplierId)
    .eq("brand_id", scope.brand_id)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type CoaOption = { id: string; account_code: string; name: string };
export type TaxCodeOption = {
  id: string;
  tax_code: string;
  name: string;
  rate: number;
  direction: string;
};

export type SupplierLookups = {
  coaOptions: CoaOption[];
  taxCodeOptions: TaxCodeOption[];
};

export async function getSupplierLookups(): Promise<SupplierLookups> {
  const supabase = await createClient();
  const [coaRes, taxRes] = await Promise.all([
    supabase
      .from("chart_of_accounts")
      .select("id, account_code, name_zh_tw, is_active, is_postable")
      .eq("is_active", true)
      .order("account_code"),
    supabase
      .from("tax_codes")
      .select("id, tax_code, name_zh_tw, rate, direction, is_active")
      .eq("is_active", true)
      .order("tax_code"),
  ]);
  if (coaRes.error) throw coaRes.error;
  if (taxRes.error) throw taxRes.error;

  const coaOptions: CoaOption[] = (coaRes.data ?? [])
    .filter((r) => r.is_postable !== false)
    .map((r) => ({
      id: r.id as string,
      account_code: (r.account_code as string) ?? "",
      name: (r.name_zh_tw as string) ?? "",
    }));
  const taxCodeOptions: TaxCodeOption[] = (taxRes.data ?? []).map((r) => ({
    id: r.id as string,
    tax_code: (r.tax_code as string) ?? "",
    name: (r.name_zh_tw as string) ?? "",
    rate: Number(r.rate ?? 0),
    direction: (r.direction as string) ?? "",
  }));
  return { coaOptions, taxCodeOptions };
}

// ───────────────── Supplier CRUD ─────────────────

export type SupplierWriteInput = {
  code: string;
  name: string;
  supplier_type?: string | null;
  type?: string | null;
  primary_contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  payment_terms?: string | null;
  payment_terms_days?: number | string | null;
  default_currency?: string | null;
  notes?: string | null;
  is_active?: boolean;
  is_withholding_required?: boolean;
  withholding_tax_code_id?: string | null;
  default_tax_code_id?: string | null;
  gl_payable_coa_id?: string | null;
  default_expense_coa_id?: string | null;
  supply_categories?: string | null;
};

function buildSupplierWritePatch(
  input: Partial<SupplierWriteInput>,
  existingMetadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const upd: Record<string, unknown> = {};
  if (input.code !== undefined) upd.code = trim(input.code).toUpperCase();
  if (input.name !== undefined) upd.name = trim(input.name);
  if (input.supplier_type !== undefined) upd.supplier_type = nullable(input.supplier_type);
  if (input.type !== undefined) upd.type = nullable(input.type) ?? "agent";
  if (input.primary_contact !== undefined)
    upd.primary_contact = nullable(input.primary_contact);
  if (input.phone !== undefined) upd.phone = nullable(input.phone);
  if (input.email !== undefined) upd.email = nullable(input.email);
  if (input.address !== undefined) upd.address = nullable(input.address);
  if (input.tax_id !== undefined) upd.tax_id = nullable(input.tax_id);
  if (input.payment_terms !== undefined) upd.payment_terms = nullable(input.payment_terms);
  if (input.payment_terms_days !== undefined)
    upd.payment_terms_days = nullableNumber(input.payment_terms_days);
  if (input.default_currency !== undefined)
    upd.default_currency = nullable(input.default_currency) ?? "TWD";
  if (input.notes !== undefined) upd.notes = nullable(input.notes);
  if (input.is_active !== undefined) upd.is_active = input.is_active;
  if (input.is_withholding_required !== undefined)
    upd.is_withholding_required = input.is_withholding_required;
  if (input.withholding_tax_code_id !== undefined)
    upd.withholding_tax_code_id = nullableUuid(input.withholding_tax_code_id);
  if (input.default_tax_code_id !== undefined)
    upd.default_tax_code_id = nullableUuid(input.default_tax_code_id);
  if (input.gl_payable_coa_id !== undefined)
    upd.gl_payable_coa_id = nullableUuid(input.gl_payable_coa_id);
  if (input.default_expense_coa_id !== undefined)
    upd.default_expense_coa_id = nullableUuid(input.default_expense_coa_id);

  if (input.supply_categories !== undefined) {
    const merged: Record<string, unknown> = { ...existingMetadata };
    const v = trim(input.supply_categories);
    if (v.length === 0) {
      delete merged.supply_categories;
    } else {
      merged.supply_categories = v;
    }
    upd.metadata = merged;
  }
  return upd;
}

function mapSupplierError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "此代碼已存在";
  if (error.code === "23503") return "外鍵約束失敗（會計科目 / 稅碼不存在）";
  return `儲存失敗：${error.message}`;
}

export async function createSupplier(
  input: SupplierWriteInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!trim(input.code)) return { ok: false, error: "代碼必填" };
  if (!trim(input.name)) return { ok: false, error: "名稱必填" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const upd = buildSupplierWritePatch(input, {});
  upd.brand_id = scope.brand_id;
  if (upd.is_active === undefined) upd.is_active = true;
  if (upd.type === undefined) upd.type = "agent";

  const { data, error } = await supabase
    .from("suppliers")
    .insert(upd as Tables["suppliers"]["Insert"])
    .select("id")
    .single();
  if (error) return { ok: false, error: mapSupplierError(error) };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${data.id}`);
  return { ok: true, data: { id: data.id } };
}

export async function updateSupplier(
  id: string,
  patch: Partial<SupplierWriteInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  let existingMetadata: Record<string, unknown> = {};
  if (patch.supply_categories !== undefined) {
    const { data: existing } = await supabase
      .from("suppliers")
      .select("metadata")
      .eq("id", id)
      .eq("brand_id", scope.brand_id)
      .maybeSingle();
    existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
  }

  const upd = buildSupplierWritePatch(patch, existingMetadata);
  if (Object.keys(upd).length === 0) return { ok: true, data: { id } };

  const { error } = await supabase
    .from("suppliers")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapSupplierError(error) };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function setSupplierActive(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `切換失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function softDeleteSupplier(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_soft_delete", {
    p_supplier_id: id,
  });
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

// ───────────────── Contract CRUD ─────────────────
// 已搬至 @/domain/contracts。supplier-detail-view 直接 import 該檔。
// 此處不再導出，避免 dup logic（2026-05-11 Phase 2）

// ───────────────── Stats / KPI helpers（A 級升級用） ─────────────────

export type SupplierTypeBucket = {
  supplier_type: string;
  label: string;
  count: number;
};

export type ContractBucket = {
  status: ContractStatus;
  count: number;
};

export type TopSupplierAmount = {
  supplier_id: string;
  name: string;
  code: string;
  po_count: number;
  total_amount: number;
};

export type SuppliersStats = {
  total: number;
  active: number;
  inactive: number;
  type_distribution: SupplierTypeBucket[];
  contract_distribution: ContractBucket[];
  expiring_soon: number; // 90 天內到期
  withholding_count: number; // 需扣繳
  top_by_amount: TopSupplierAmount[]; // 過去 180 天
  total_po_amount_180d: number;
};

const TYPE_LABEL_MAP: Record<string, string> = {
  VEHICLE_DEALER: "原廠 / 整車代理",
  PARTS_SUPPLIER: "零件供應商",
  OTHER: "其他 / 耗材",
};

export async function getSuppliersStats(): Promise<SuppliersStats> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 取得本品牌全部 supplier（不套 filter）— 統計要用 superset
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, code, supplier_type, is_active, is_withholding_required",
    )
    .eq("brand_id", scope.brand_id);
  if (error) throw error;

  const all = suppliers ?? [];
  const ids = all.map((s) => s.id);

  // 取每張合約最後 effective_to
  let contracts: { supplier_id: string | null; effective_to: string | null }[] = [];
  if (ids.length > 0) {
    const { data: cs, error: cErr } = await supabase
      .from("supplier_contracts")
      .select("supplier_id, effective_to")
      .in("supplier_id", ids);
    if (cErr) throw cErr;
    contracts = cs ?? [];
  }
  const latestBySupplier = new Map<string, string>();
  for (const c of contracts) {
    if (!c.supplier_id || !c.effective_to) continue;
    const cur = latestBySupplier.get(c.supplier_id);
    if (!cur || c.effective_to > cur) latestBySupplier.set(c.supplier_id, c.effective_to);
  }

  // 過去 180 天的 PO 加總（依 vendor_id 分組）
  const sinceISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  })();
  let pos: { vendor_id: string | null; amount_total: number | null }[] = [];
  if (ids.length > 0) {
    const { data: poData, error: poErr } = await supabase
      .from("purchase_orders")
      .select("vendor_id, amount_total")
      .eq("brand_id", scope.brand_id)
      .gte("po_date", sinceISO)
      .neq("status", "cancelled");
    if (poErr) throw poErr;
    pos = (poData ?? []) as typeof pos;
  }
  const amountByVendor = new Map<string, { sum: number; count: number }>();
  let totalPoAmount180d = 0;
  for (const p of pos) {
    if (!p.vendor_id) continue;
    const amt = Number(p.amount_total ?? 0);
    totalPoAmount180d += amt;
    const cur = amountByVendor.get(p.vendor_id) ?? { sum: 0, count: 0 };
    cur.sum += amt;
    cur.count += 1;
    amountByVendor.set(p.vendor_id, cur);
  }

  // 統計
  const typeCounts = new Map<string, number>();
  const contractCounts: Record<ContractStatus, number> = {
    valid: 0,
    expiring: 0,
    expired: 0,
    none: 0,
  };
  let active = 0;
  let withholdingCount = 0;
  let expiringSoon = 0;

  for (const s of all) {
    if (s.is_active) active += 1;
    if (s.is_withholding_required) withholdingCount += 1;
    const tk = s.supplier_type ?? "OTHER";
    typeCounts.set(tk, (typeCounts.get(tk) ?? 0) + 1);
    const status = calcContractStatus(latestBySupplier.get(s.id) ?? null);
    contractCounts[status] += 1;
    if (status === "expiring") expiringSoon += 1;
  }

  const typeDistribution: SupplierTypeBucket[] = Array.from(typeCounts.entries())
    .map(([k, v]) => ({
      supplier_type: k,
      label: TYPE_LABEL_MAP[k] ?? k,
      count: v,
    }))
    .sort((a, b) => b.count - a.count);

  const contractDistribution: ContractBucket[] = (
    ["valid", "expiring", "expired", "none"] as ContractStatus[]
  ).map((s) => ({ status: s, count: contractCounts[s] }));

  // Top 5 by PO amount
  const topByAmount: TopSupplierAmount[] = all
    .map((s) => {
      const bucket = amountByVendor.get(s.id);
      return {
        supplier_id: s.id,
        name: s.name ?? "",
        code: s.code ?? "",
        po_count: bucket?.count ?? 0,
        total_amount: bucket?.sum ?? 0,
      };
    })
    .filter((r) => r.total_amount > 0)
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 5);

  return {
    total: all.length,
    active,
    inactive: all.length - active,
    type_distribution: typeDistribution,
    contract_distribution: contractDistribution,
    expiring_soon: expiringSoon,
    withholding_count: withholdingCount,
    top_by_amount: topByAmount,
    total_po_amount_180d: totalPoAmount180d,
  };
}

// 單一 supplier 的績效統計（detail page 用）
export type SupplierMetrics = {
  partnership_days: number; // 從 created_at 至今
  po_count_ltm: number; // last 12 months
  po_amount_ltm: number;
  po_count_total: number;
  po_amount_total: number;
  last_po_date: string | null;
  open_po_count: number; // draft / approved / partial
  closed_po_count: number;
  contract_count: number;
  active_contract_count: number;
  recent_pos: {
    id: string;
    po_no: string;
    po_date: string | null;
    status: string;
    amount_total: number;
  }[];
};

export async function getSupplierMetrics(
  supplierId: string,
): Promise<SupplierMetrics> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [{ data: supplier }, contractsRes, posRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("created_at")
      .eq("id", supplierId)
      .eq("brand_id", scope.brand_id)
      .maybeSingle(),
    supabase
      .from("supplier_contracts")
      .select("id, status")
      .eq("supplier_id", supplierId)
      .eq("brand_id", scope.brand_id),
    supabase
      .from("purchase_orders")
      .select("id, po_no, po_date, status, amount_total")
      .eq("brand_id", scope.brand_id)
      .eq("vendor_id", supplierId)
      .order("po_date", { ascending: false })
      .limit(200),
  ]);

  const createdAt = supplier?.created_at
    ? new Date(supplier.created_at as string).getTime()
    : Date.now();
  const partnershipDays = Math.max(
    0,
    Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24)),
  );

  const contracts = contractsRes.data ?? [];
  const pos = (posRes.data ?? []) as {
    id: string;
    po_no: string | null;
    po_date: string | null;
    status: string | null;
    amount_total: number | null;
  }[];

  const ltmCutoff = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

  let poCountLtm = 0;
  let poAmountLtm = 0;
  let poAmountTotal = 0;
  let openCount = 0;
  let closedCount = 0;
  let lastPoDate: string | null = null;

  for (const p of pos) {
    const amt = Number(p.amount_total ?? 0);
    poAmountTotal += amt;
    if (p.po_date && (!lastPoDate || p.po_date > lastPoDate)) lastPoDate = p.po_date;
    if (p.po_date && p.po_date >= ltmCutoff) {
      poCountLtm += 1;
      poAmountLtm += amt;
    }
    if (p.status === "closed") closedCount += 1;
    else if (p.status && p.status !== "cancelled") openCount += 1;
  }

  return {
    partnership_days: partnershipDays,
    po_count_ltm: poCountLtm,
    po_amount_ltm: poAmountLtm,
    po_count_total: pos.length,
    po_amount_total: poAmountTotal,
    last_po_date: lastPoDate,
    open_po_count: openCount,
    closed_po_count: closedCount,
    contract_count: contracts.length,
    active_contract_count: contracts.filter((c) => c.status === "active").length,
    recent_pos: pos.slice(0, 8).map((p) => ({
      id: p.id,
      po_no: p.po_no ?? "",
      po_date: p.po_date,
      status: p.status ?? "",
      amount_total: Number(p.amount_total ?? 0),
    })),
  };
}

// list 用 — supplier 加掛 last PO 日期 + 最近 12 個月 PO 數量
export type SupplierActivity = {
  supplier_id: string;
  last_po_date: string | null;
  po_count_180d: number;
  po_amount_180d: number;
};

export async function getSupplierActivities(): Promise<Map<string, SupplierActivity>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const sinceISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  })();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("vendor_id, po_date, amount_total")
    .eq("brand_id", scope.brand_id)
    .gte("po_date", sinceISO)
    .neq("status", "cancelled");
  if (error) throw error;

  const map = new Map<string, SupplierActivity>();
  for (const r of (data ?? []) as { vendor_id: string | null; po_date: string | null; amount_total: number | null }[]) {
    if (!r.vendor_id) continue;
    const cur =
      map.get(r.vendor_id) ??
      ({
        supplier_id: r.vendor_id,
        last_po_date: null,
        po_count_180d: 0,
        po_amount_180d: 0,
      } satisfies SupplierActivity);
    cur.po_count_180d += 1;
    cur.po_amount_180d += Number(r.amount_total ?? 0);
    if (r.po_date && (!cur.last_po_date || r.po_date > cur.last_po_date)) {
      cur.last_po_date = r.po_date;
    }
    map.set(r.vendor_id, cur);
  }
  return map;
}
