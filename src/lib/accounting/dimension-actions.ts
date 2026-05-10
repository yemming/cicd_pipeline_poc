"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getDefaultTenantUuid } from "./queries";

export type DimensionActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;

async function requireAdmin(): Promise<string | null> {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) return "需要 admin 權限";
  return null;
}

export type DimensionInput = {
  dimension_code: string;
  dimension_name: string;
  description?: string | null;
  reference_table?: string | null;
  reference_value_column?: string | null;
  is_required_globally?: boolean;
  netsuite_segment_type?: "native" | "custom" | null;
  netsuite_segment_script_id?: string | null;
};

export async function createDimensionAction(
  input: DimensionInput,
): Promise<DimensionActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const code = input.dimension_code.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return { ok: false, error: "維度代碼只允許大寫英數+底線、開頭必為英文" };
  }
  if (!input.dimension_name.trim()) return { ok: false, error: "維度名稱必填" };

  const tenant = await getDefaultTenantUuid();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("gl_dimensions")
    .insert({
      tenant_id: tenant,
      dimension_code: code,
      dimension_name: input.dimension_name.trim(),
      description: input.description?.trim() || null,
      reference_table: input.reference_table?.trim() || null,
      reference_value_column: input.reference_value_column?.trim() || null,
      is_required_globally: !!input.is_required_globally,
      is_system_default: false,
      netsuite_segment_type: input.netsuite_segment_type ?? null,
      netsuite_segment_script_id: input.netsuite_segment_script_id?.trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `維度代碼「${code}」已存在` };
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/accounting/dimensions", "page");
  return { ok: true, data: { id: data.id } };
}

export type DimensionPatch = {
  dimension_name?: string;
  description?: string | null;
  reference_table?: string | null;
  reference_value_column?: string | null;
  is_required_globally?: boolean;
  netsuite_segment_type?: "native" | "custom" | null;
  netsuite_segment_script_id?: string | null;
};

export async function updateDimensionAction(
  id: string,
  patch: DimensionPatch,
): Promise<DimensionActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };
  if (!id) return { ok: false, error: "缺少 id" };

  const sb = createServiceClient();
  const { data: row, error: getErr } = await sb
    .from("gl_dimensions")
    .select("is_system_default, dimension_code, reference_table")
    .eq("id", id)
    .single();
  if (getErr || !row) return { ok: false, error: getErr?.message ?? "找不到維度" };

  const upd: Record<string, unknown> = {};
  if (typeof patch.dimension_name === "string" && patch.dimension_name.trim())
    upd.dimension_name = patch.dimension_name.trim();
  if (typeof patch.description !== "undefined")
    upd.description = patch.description?.trim() || null;
  if (typeof patch.is_required_globally === "boolean")
    upd.is_required_globally = patch.is_required_globally;
  if (typeof patch.netsuite_segment_type !== "undefined")
    upd.netsuite_segment_type = patch.netsuite_segment_type;
  if (typeof patch.netsuite_segment_script_id !== "undefined")
    upd.netsuite_segment_script_id = patch.netsuite_segment_script_id?.trim() || null;

  // reference_table / reference_value_column：system default 不可改（別處可能還在 reference）
  if (typeof patch.reference_table !== "undefined") {
    if (row.is_system_default && (patch.reference_table || null) !== row.reference_table) {
      return {
        ok: false,
        error: `「${row.dimension_code}」為系統預設維度，reference_table 不可變更（會破壞 dim form lookup）`,
      };
    }
    upd.reference_table = patch.reference_table?.trim() || null;
  }
  if (typeof patch.reference_value_column !== "undefined")
    upd.reference_value_column = patch.reference_value_column?.trim() || null;

  if (Object.keys(upd).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const { error } = await sb.from("gl_dimensions").update(upd).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/accounting/dimensions", "page");
  return { ok: true, data: { id } };
}

// 反查面板：哪些 chart_of_accounts 的 required_dimensions 包含此 dim_code
export type CoaUsingDim = {
  id: string;
  account_code: string;
  name_zh_tw: string;
  l1_category: string;
  dealer_category: string;
};

export async function listCoaUsingDimensionAction(
  dimCode: string,
): Promise<DimensionActionResult<CoaUsingDim[]>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };
  if (!dimCode) return { ok: false, error: "缺少 dim code" };

  const sb = createServiceClient();
  // required_dimensions 是 jsonb array；supabase JS 對 jsonb @> 需要 stringify
  const { data, error } = await sb
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw, l1_category, dealer_category, required_dimensions")
    .filter("required_dimensions", "cs", JSON.stringify([dimCode.toUpperCase()]))
    .order("account_code");
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    account_code: r.account_code,
    name_zh_tw: r.name_zh_tw,
    l1_category: r.l1_category,
    dealer_category: r.dealer_category,
  }));
  return { ok: true, data: rows };
}

export async function setDimensionActiveAction(
  id: string,
  active: boolean,
): Promise<DimensionActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  const { data: row, error: getErr } = await sb
    .from("gl_dimensions")
    .select("is_system_default")
    .eq("id", id)
    .single();
  if (getErr || !row) return { ok: false, error: getErr?.message ?? "找不到維度" };
  if (row.is_system_default && !active) {
    return { ok: false, error: "系統預設維度不可停用（可改為僅在報表中過濾）" };
  }

  const { error } = await sb
    .from("gl_dimensions")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/accounting/dimensions", "page");
  return { ok: true, data: { id } };
}

export async function deleteDimensionAction(
  id: string,
): Promise<DimensionActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  const { data: row } = await sb
    .from("gl_dimensions")
    .select("is_system_default")
    .eq("id", id)
    .single();
  if (row?.is_system_default) {
    return { ok: false, error: "系統預設維度不可刪除" };
  }

  const { error } = await sb.from("gl_dimensions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/accounting/dimensions", "page");
  return { ok: true, data: { id } };
}
