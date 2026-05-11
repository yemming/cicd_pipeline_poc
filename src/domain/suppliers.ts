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

export async function getSuppliersPageData(
  filter: SupplierListFilter = {},
): Promise<{
  rows: SupplierWithContract[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listSuppliersWithContract(filter),
    hasPermission(PERMISSIONS.SUPPLIER_EDIT),
  ]);
  return { rows, canEdit };
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
