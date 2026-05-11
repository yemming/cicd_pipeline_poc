"use server";

/**
 * Domain Helper — Supplier Contracts（採購合約）
 *
 * 共用範圍：
 *   - /parts/setup/contracts 列表 + detail page
 *   - /parts/setup/suppliers/[id] 的合約 tab（內嵌 modal CRUD）
 *
 * 既有 server actions 在 src/lib/parts-setup/contract-actions.ts 保留（未使用）。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type SupplierContractRow = Tables["supplier_contracts"]["Row"];

export type ContractStatus = "valid" | "expiring" | "expired" | "none";

export type ContractWithSupplier = SupplierContractRow & {
  supplier_name: string;
  supplier_code: string | null;
  contract_type: string;
  amount_limit: number | null;
  days_left: number | null;
  computed_status: ContractStatus;
};

const PAGE_PATH = "/parts/setup/contracts";
const SUPPLIER_PAGE_PATH = "/parts/setup/suppliers";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const trim = (v?: string | null): string => (v ?? "").trim();
const nullable = (v?: string | null): string | null => {
  const t = trim(v);
  return t.length === 0 ? null : t;
};
const nullableNumber = (v?: number | string | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

function calcStatus(effective_to: string | null): {
  status: ContractStatus;
  daysLeft: number | null;
} {
  if (!effective_to) return { status: "none", daysLeft: null };
  const today = new Date();
  const to = new Date(effective_to);
  const daysLeft = Math.floor((to.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 90) return { status: "expiring", daysLeft };
  return { status: "valid", daysLeft };
}

function enrichContract(
  c: SupplierContractRow,
  supplierMap: Map<string, { name: string; code: string | null }>,
): ContractWithSupplier {
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const contract_type =
    typeof meta.contract_type === "string" ? meta.contract_type : "annual";
  const amount_limit =
    typeof meta.amount_limit === "number" ? meta.amount_limit : null;
  const { status, daysLeft } = calcStatus(c.effective_to);
  const supplier = c.supplier_id ? supplierMap.get(c.supplier_id) : null;
  return {
    ...c,
    supplier_name: supplier?.name ?? "—",
    supplier_code: supplier?.code ?? null,
    contract_type,
    amount_limit,
    days_left: daysLeft,
    computed_status: status,
  };
}

async function fetchSupplierMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  supplierIds: string[],
): Promise<Map<string, { name: string; code: string | null }>> {
  const map = new Map<string, { name: string; code: string | null }>();
  if (supplierIds.length === 0) return map;
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, code")
    .in("id", supplierIds);
  if (error) throw error;
  for (const s of data ?? []) {
    map.set(s.id, { name: s.name ?? "", code: s.code ?? null });
  }
  return map;
}

// ───────────────── Read helpers ─────────────────

export async function listContracts(filter: {
  status?: ContractStatus | "all";
  q?: string;
  includeInactive?: boolean;
} = {}): Promise<ContractWithSupplier[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("supplier_contracts")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("effective_from", { ascending: false });
  if (!filter.includeInactive) q = q.neq("status", "terminated");

  const { data: contracts, error } = await q;
  if (error) throw error;
  if (!contracts || contracts.length === 0) return [];

  const supplierIds = Array.from(
    new Set(contracts.map((c) => c.supplier_id).filter((x): x is string => !!x)),
  );
  const supplierMap = await fetchSupplierMap(supabase, supplierIds);

  let enriched = contracts.map((c) => enrichContract(c, supplierMap));

  if (filter.status && filter.status !== "all") {
    enriched = enriched.filter((c) => c.computed_status === filter.status);
  }
  if (filter.q) {
    const k = filter.q.toLowerCase();
    enriched = enriched.filter(
      (c) =>
        c.contract_no?.toLowerCase().includes(k) ||
        c.supplier_name.toLowerCase().includes(k),
    );
  }
  return enriched;
}

export async function getContractById(
  id: string,
): Promise<ContractWithSupplier | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("supplier_contracts")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const supplierMap = data.supplier_id
    ? await fetchSupplierMap(supabase, [data.supplier_id])
    : new Map();
  return enrichContract(data, supplierMap);
}

export type ContractHistoryRow = SupplierContractRow & {
  computed_status: ContractStatus;
  days_left: number | null;
  contract_type: string;
  amount_limit: number | null;
};

export async function getContractHistory(
  supplier_id: string,
  contract_no_base: string,
): Promise<ContractHistoryRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  // 同 supplier、contract_no 是 base 或 base-{n} 形式
  const { data, error } = await supabase
    .from("supplier_contracts")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("supplier_id", supplier_id)
    .or(`contract_no.eq.${contract_no_base},contract_no.like.${contract_no_base}-%`)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const { status, daysLeft } = calcStatus(c.effective_to);
    return {
      ...c,
      computed_status: status,
      days_left: daysLeft,
      contract_type:
        typeof meta.contract_type === "string" ? meta.contract_type : "annual",
      amount_limit:
        typeof meta.amount_limit === "number" ? meta.amount_limit : null,
    };
  });
}

export type SupplierOption = {
  id: string;
  code: string | null;
  name: string;
};

export async function getSupplierOptions(): Promise<SupplierOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, code, name")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("code");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name ?? "",
  }));
}

export type ContractsKpis = {
  validCount: number;
  expiringCount: number;
  expiredCount: number;
};

export async function getContractsPageData(filter: {
  status?: ContractStatus | "all";
  q?: string;
} = {}): Promise<{
  rows: ContractWithSupplier[];
  kpis: ContractsKpis;
  canEdit: boolean;
}> {
  const [allContracts, filtered, canEdit] = await Promise.all([
    listContracts({}),
    listContracts(filter),
    hasPermission(PERMISSIONS.SUPPLIER_EDIT),
  ]);
  const kpis: ContractsKpis = {
    validCount: allContracts.filter((c) => c.computed_status === "valid").length,
    expiringCount: allContracts.filter((c) => c.computed_status === "expiring").length,
    expiredCount: allContracts.filter((c) => c.computed_status === "expired").length,
  };
  return { rows: filtered, kpis, canEdit };
}

// ───────────────── Write helpers ─────────────────

export type ContractWriteInput = {
  supplier_id: string;
  contract_no: string;
  effective_from: string;
  effective_to?: string | null;
  contract_type?: string | null;
  amount_limit?: number | string | null;
  payment_terms?: string | null;
  min_order_amount?: number | string | null;
  status?: string;
  document_url?: string | null;
  notes?: string | null;
};

function buildContractPatch(
  input: Partial<ContractWriteInput>,
  existingMetadata?: Record<string, unknown> | null,
): Record<string, unknown> {
  const upd: Record<string, unknown> = {};
  if (input.contract_no !== undefined) upd.contract_no = trim(input.contract_no);
  if (input.effective_from !== undefined) upd.effective_from = input.effective_from;
  if (input.effective_to !== undefined)
    upd.effective_to =
      input.effective_to && input.effective_to.length > 0
        ? input.effective_to
        : null;
  if (input.payment_terms !== undefined)
    upd.payment_terms = nullable(input.payment_terms);
  if (input.min_order_amount !== undefined)
    upd.min_order_amount = nullableNumber(input.min_order_amount);
  if (input.status !== undefined) upd.status = trim(input.status) || "active";
  if (input.document_url !== undefined)
    upd.document_url = nullable(input.document_url);
  if (input.notes !== undefined) upd.notes = nullable(input.notes);

  // metadata jsonb merge
  if (input.contract_type !== undefined || input.amount_limit !== undefined) {
    const meta: Record<string, unknown> = { ...(existingMetadata ?? {}) };
    if (input.contract_type !== undefined) {
      const v = nullable(input.contract_type);
      if (v) meta.contract_type = v;
      else delete meta.contract_type;
    }
    if (input.amount_limit !== undefined) {
      const v = nullableNumber(input.amount_limit);
      if (v !== null) meta.amount_limit = v;
      else delete meta.amount_limit;
    }
    upd.metadata = meta;
  }
  return upd;
}

function mapContractError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "此合約編號已存在";
  if (error.code === "23503") return "外鍵約束失敗（供應商不存在）";
  return `儲存失敗：${error.message}`;
}

export async function createContract(
  input: ContractWriteInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!input.supplier_id) return { ok: false, error: "缺少 supplier_id" };
  if (!trim(input.contract_no)) return { ok: false, error: "合約編號必填" };
  if (!input.effective_from) return { ok: false, error: "起始日期必填" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const upd = buildContractPatch(input);
  upd.brand_id = scope.brand_id;
  upd.supplier_id = input.supplier_id;
  if (upd.status === undefined) upd.status = "active";

  const { data, error } = await supabase
    .from("supplier_contracts")
    .insert(upd as Tables["supplier_contracts"]["Insert"])
    .select("id")
    .single();
  if (error) return { ok: false, error: mapContractError(error) };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${SUPPLIER_PAGE_PATH}/${input.supplier_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function updateContract(
  id: string,
  patch: Partial<ContractWriteInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 取現有 metadata 做 merge
  const { data: existing } = await supabase
    .from("supplier_contracts")
    .select("metadata, supplier_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  const upd = buildContractPatch(
    patch,
    (existing?.metadata ?? null) as Record<string, unknown> | null,
  );
  if (Object.keys(upd).length === 0) return { ok: true, data: { id } };

  const { error } = await supabase
    .from("supplier_contracts")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapContractError(error) };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  if (existing?.supplier_id) revalidatePath(`${SUPPLIER_PAGE_PATH}/${existing.supplier_id}`);
  return { ok: true, data: { id } };
}

/**
 * Hard delete — supplier detail tab 內合約 modal 使用（舊行為，保留相容）。
 * 新合約 detail page 改用 softDeleteContract。
 */
export async function deleteContract(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: existing } = await supabase
    .from("supplier_contracts")
    .select("supplier_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  const { error } = await supabase
    .from("supplier_contracts")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  if (existing?.supplier_id) revalidatePath(`${SUPPLIER_PAGE_PATH}/${existing.supplier_id}`);
  return { ok: true, data: { id } };
}

/**
 * 軟刪除：status='inactive'（合約 detail page 走這個）
 */
export async function softDeleteContract(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: existing } = await supabase
    .from("supplier_contracts")
    .select("supplier_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  const { error } = await supabase
    .from("supplier_contracts")
    .update({ status: "terminated" })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  if (existing?.supplier_id) revalidatePath(`${SUPPLIER_PAGE_PATH}/${existing.supplier_id}`);
  return { ok: true, data: { id } };
}

/**
 * 展延：舊 row 標 inactive 並把 contract_no 加 -{seq} 後綴，新 row 接續原 contract_no
 *
 * 注意：先 update 舊 row（移開 unique constraint）再 insert 新 row。
 */
export async function extendContract(
  id: string,
  new_effective_to: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!new_effective_to) return { ok: false, error: "新的到期日必填" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1. 取舊 row
  const { data: old, error: getErr } = await supabase
    .from("supplier_contracts")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (getErr) return { ok: false, error: `讀取失敗：${getErr.message}` };
  if (!old) return { ok: false, error: "合約不存在" };
  if (!old.contract_no) return { ok: false, error: "合約編號缺失，無法展延" };
  if (!old.supplier_id) return { ok: false, error: "供應商缺失，無法展延" };
  if (!old.effective_to) return { ok: false, error: "舊合約無到期日，無法展延" };

  // 2. 算後綴序號（找出 base 已有幾個 -{n}）
  // baseNo = old 的原始 contract_no（不 strip）；若 old 本身已是封存過的 row，從 metadata 拿 base
  const oldMetaBase = (old.metadata ?? {}) as Record<string, unknown>;
  const baseNo =
    typeof oldMetaBase.base_contract_no === "string"
      ? oldMetaBase.base_contract_no
      : old.contract_no;
  const { data: existingSeq } = await supabase
    .from("supplier_contracts")
    .select("contract_no")
    .eq("brand_id", scope.brand_id)
    .eq("supplier_id", old.supplier_id)
    .or(`contract_no.eq.${baseNo},contract_no.like.${baseNo}-%`);
  const seq = (existingSeq?.length ?? 1); // 含自己；下個版本後綴

  // 3. update 舊 row：contract_no 加後綴 + status=terminated + 寫入 base 供後續查 history
  const archivedNo = `${baseNo}-${seq}`;
  const oldMetaForArchive: Record<string, unknown> = {
    ...oldMetaBase,
    base_contract_no: baseNo,
  };
  const { error: updErr } = await supabase
    .from("supplier_contracts")
    .update({
      contract_no: archivedNo,
      status: "terminated",
      metadata: oldMetaForArchive,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (updErr) return { ok: false, error: `舊合約封存失敗：${updErr.message}` };

  // 4. insert 新 row
  const newFrom = new Date(old.effective_to);
  newFrom.setDate(newFrom.getDate() + 1);
  const newFromISO = newFrom.toISOString().slice(0, 10);

  const oldMeta = (old.metadata ?? {}) as Record<string, unknown>;
  const previousVersions = Array.isArray(oldMeta.previous_versions)
    ? [...oldMeta.previous_versions, old.id]
    : [old.id];

  const insertPayload: Tables["supplier_contracts"]["Insert"] = {
    brand_id: scope.brand_id,
    supplier_id: old.supplier_id,
    contract_no: baseNo,
    effective_from: newFromISO,
    effective_to: new_effective_to,
    payment_terms: old.payment_terms,
    min_order_amount: old.min_order_amount,
    status: "active",
    document_url: old.document_url,
    notes: old.notes,
    metadata: { ...oldMeta, previous_versions: previousVersions },
  };

  const { data: created, error: insErr } = await supabase
    .from("supplier_contracts")
    .insert(insertPayload)
    .select("id")
    .single();
  if (insErr) {
    // rollback：把舊 row 還原
    await supabase
      .from("supplier_contracts")
      .update({ contract_no: old.contract_no, status: old.status })
      .eq("id", id)
      .eq("brand_id", scope.brand_id);
    return { ok: false, error: `新合約建立失敗：${insErr.message}` };
  }

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  revalidatePath(`${PAGE_PATH}/${created.id}`);
  revalidatePath(`${SUPPLIER_PAGE_PATH}/${old.supplier_id}`);
  return { ok: true, data: { id: created.id } };
}
