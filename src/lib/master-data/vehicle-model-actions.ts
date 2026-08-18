"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/admin/master-data/vehicle-models";

export type VehicleType = "motorcycle"; // 目前 enum 只有一個值；保留 type 待擴充

export type VehicleModelInput = {
  series: string;
  model_name: string;
  display_name: string;
  vehicle_type?: VehicleType;
  year_start?: number | null;
  year_end?: number | null;
  engine_cc?: number | null;
  engine_kw?: number | null;
  standard_cost?: number | null;
  msrp?: number | null;
  is_active?: boolean;
};

export type GlField = "inventory" | "cogs" | "revenue";

const GL_FIELD_TO_COLUMN: Record<GlField, string> = {
  inventory: "gl_inventory_coa_id",
  cogs: "gl_cogs_coa_id",
  revenue: "gl_revenue_coa_id",
};

function validate(input: VehicleModelInput): string | null {
  if (!input.series?.trim()) return "車系（series）必填";
  if (!input.model_name?.trim()) return "型號（model_name）必填";
  if (!input.display_name?.trim()) return "顯示名稱必填";
  if (input.year_start != null && input.year_end != null && input.year_end < input.year_start) {
    return "結束年份不可早於起始年份";
  }
  if (input.engine_cc != null && input.engine_cc < 0) return "排量不可為負";
  if (input.engine_kw != null && input.engine_kw < 0) return "馬力不可為負";
  if (input.standard_cost != null && input.standard_cost < 0) return "標準成本不可為負";
  if (input.msrp != null && input.msrp < 0) return "建議售價不可為負";
  return null;
}

function normalisePayload(input: VehicleModelInput) {
  return {
    series: input.series.trim(),
    model_name: input.model_name.trim(),
    display_name: input.display_name.trim(),
    vehicle_type: input.vehicle_type ?? "motorcycle",
    year_start: input.year_start ?? null,
    year_end: input.year_end ?? null,
    engine_cc: input.engine_cc ?? null,
    engine_kw: input.engine_kw ?? null,
    standard_cost: input.standard_cost ?? null,
    msrp: input.msrp ?? null,
  };
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("vehicle_models_brand_id_series_model_name_year_start_key")) {
    return "此車型（品牌 × 車系 × 型號 × 起始年份）已存在 — 請改編輯既有那筆";
  }
  if (error.code === "23503") return "外鍵不存在（科目或稅碼可能已刪除）";
  return `儲存失敗：${error.message}`;
}

// ============================================================
// CRUD
// ============================================================

export async function createVehicleModelAction(
  input: VehicleModelInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("vehicle_models")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...normalisePayload(input),
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateVehicleModelAction(
  id: string,
  patch: Partial<VehicleModelInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  // 完整輸入時跑 validate；partial patch 只挑 sanity check
  if (patch.series && patch.model_name && patch.display_name) {
    const verr = validate(patch as VehicleModelInput);
    if (verr) return { ok: false, error: verr };
  }

  const upd: Record<string, unknown> = {};
  if (patch.series !== undefined) upd.series = patch.series.trim();
  if (patch.model_name !== undefined) upd.model_name = patch.model_name.trim();
  if (patch.display_name !== undefined) upd.display_name = patch.display_name.trim();
  if (patch.vehicle_type !== undefined) upd.vehicle_type = patch.vehicle_type;
  if (patch.year_start !== undefined) upd.year_start = patch.year_start;
  if (patch.year_end !== undefined) upd.year_end = patch.year_end;
  if (patch.engine_cc !== undefined) upd.engine_cc = patch.engine_cc;
  if (patch.engine_kw !== undefined) upd.engine_kw = patch.engine_kw;
  if (patch.standard_cost !== undefined) upd.standard_cost = patch.standard_cost;
  if (patch.msrp !== undefined) upd.msrp = patch.msrp;
  if (patch.is_active !== undefined) upd.is_active = patch.is_active;

  if (Object.keys(upd).length === 0) return { ok: true, data: { id } };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("vehicle_models")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function setVehicleModelActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("vehicle_models")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `切換狀態失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteVehicleModelAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("vehicle_models")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此車型已被零件相容性 / 客戶車輛 / 維修工單引用，無法刪除（請改停用）",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

// ============================================================
// 批次匯入（比照 items 的 TSV 貼上 + 陣列批次寫入模式）
// ============================================================

const BULK_IMPORT_BATCH_SIZE = 500;

export async function bulkImportVehicleModelsAction(
  rows: VehicleModelInput[],
): Promise<ActionResult<{ inserted: number; skipped: number; errors: string[] }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!rows.length) return { ok: false, error: "未提供任何資料" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  const valid = rows.filter((r) => {
    if (r.series?.trim() && r.model_name?.trim() && r.display_name?.trim()) return true;
    skipped++;
    errors.push(`跳過：車系/型號/顯示名稱有缺 (${r.model_name || r.series || "?"})`);
    return false;
  });

  for (let i = 0; i < valid.length; i += BULK_IMPORT_BATCH_SIZE) {
    const batch = valid.slice(i, i + BULK_IMPORT_BATCH_SIZE).map((r) => ({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...normalisePayload(r),
      is_active: r.is_active ?? true,
    }));
    const { error } = await supabase.from("vehicle_models").insert(batch);
    if (!error) {
      inserted += batch.length;
      continue;
    }
    if (error.code === "23505") {
      for (const row of batch) {
        const { error: rowError } = await supabase.from("vehicle_models").insert(row);
        if (rowError) {
          skipped++;
          errors.push(
            `${row.model_name}: ${rowError.code === "23505" ? "已存在（品牌×車系×型號×起始年份重複）" : rowError.message}`,
          );
        } else {
          inserted++;
        }
      }
    } else {
      skipped += batch.length;
      errors.push(`批次寫入失敗（第 ${i + 1}–${i + batch.length} 筆）: ${error.message}`);
    }
  }

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { inserted, skipped, errors: errors.slice(0, 20) } };
}

// ============================================================
// GL binding（與 items 同模式）
// ============================================================

export async function updateVehicleModelGlAccountAction(
  modelId: string,
  field: GlField,
  coaId: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!modelId) return { ok: false, error: "缺少車型 id" };

  const column = GL_FIELD_TO_COLUMN[field];
  if (!column) return { ok: false, error: "不允許的科目類型" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 確認該 model 存在且屬於當前 brand
  const { data: m, error: mErr } = await supabase
    .from("vehicle_models")
    .select("id")
    .eq("id", modelId)
    .eq("brand_id", brand)
    .single();
  if (mErr || !m) return { ok: false, error: "找不到該車型（或不在當前品牌）" };

  if (coaId) {
    const { data: coa, error: coaErr } = await supabase
      .from("chart_of_accounts")
      .select("id, is_postable, is_active")
      .eq("id", coaId)
      .single();
    if (coaErr || !coa) return { ok: false, error: "找不到指定科目" };
    if (!coa.is_postable) {
      return { ok: false, error: "此科目為中分類、無法綁定（請選 leaf-level 可入帳科目）" };
    }
    if (!coa.is_active) return { ok: false, error: "此科目已停用、無法綁定" };
  }

  const { error } = await supabase
    .from("vehicle_models")
    .update({ [column]: coaId })
    .eq("id", modelId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${modelId}`);
  return { ok: true, data: { id: modelId } };
}

export async function updateVehicleModelTaxCodeAction(
  modelId: string,
  taxCodeId: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!modelId) return { ok: false, error: "缺少車型 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: m, error: mErr } = await supabase
    .from("vehicle_models")
    .select("id")
    .eq("id", modelId)
    .eq("brand_id", brand)
    .single();
  if (mErr || !m) return { ok: false, error: "找不到該車型（或不在當前品牌）" };

  if (taxCodeId) {
    const { data: tc, error: tcErr } = await supabase
      .from("tax_codes")
      .select("id, is_active")
      .eq("id", taxCodeId)
      .single();
    if (tcErr || !tc) return { ok: false, error: "找不到指定稅碼" };
    if (!tc.is_active) return { ok: false, error: "此稅碼已停用、無法綁定" };
  }

  const { error } = await supabase
    .from("vehicle_models")
    .update({ default_tax_code_id: taxCodeId })
    .eq("id", modelId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${modelId}`);
  return { ok: true, data: { id: modelId } };
}
