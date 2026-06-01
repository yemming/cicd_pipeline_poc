"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getTariffBrandId } from "@/domain/hs-code-tariffs";

export type TariffActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type TariffInput = {
  hs_code: string;
  effective_year: number;
  displacement_min?: number | null;
  displacement_max?: number | null;
  plate_class?: string | null;
  customs_rate: number;
  commodity_tax_rate: number;
  trade_promotion_rate: number;
  vat_rate: number;
  note?: string | null;
};

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { error: "請先登入" };
  if (!isAdmin) return { error: "需要 admin 權限" };
  return { userId };
}

function validate(input: Partial<TariffInput>): string | null {
  if (!input.hs_code?.trim()) return "HS Code 必填";
  if (!input.effective_year || input.effective_year < 2000 || input.effective_year > 2100)
    return "年度版本需為合理年份";
  const rates: Array<[string, number | undefined]> = [
    ["關稅率", input.customs_rate],
    ["貨物稅率", input.commodity_tax_rate],
    ["推貿費率", input.trade_promotion_rate],
    ["營業稅率", input.vat_rate],
  ];
  for (const [name, v] of rates) {
    if (v == null || !Number.isFinite(v)) return `${name}必填（小數，如 0.17）`;
    if (v < 0 || v > 1) return `${name}需介於 0~1（小數，如 0.17 代表 17%）`;
  }
  return null;
}

export async function createTariffAction(
  input: TariffInput,
): Promise<TariffActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const brandId = await getTariffBrandId();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("hs_code_tariffs")
    .insert({
      brand_id: brandId,
      hs_code: input.hs_code.trim(),
      effective_year: input.effective_year,
      displacement_min: input.displacement_min ?? null,
      displacement_max: input.displacement_max ?? null,
      plate_class: input.plate_class || null,
      customs_rate: input.customs_rate,
      commodity_tax_rate: input.commodity_tax_rate,
      trade_promotion_rate: input.trade_promotion_rate,
      vat_rate: input.vat_rate,
      note: input.note?.trim() || null,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `稅則「${input.hs_code} / ${input.effective_year}」已存在` };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath("/vehicle-import/tariffs", "page");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateTariffAction(
  id: string,
  patch: Partial<TariffInput>,
): Promise<TariffActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const err = validate({ hs_code: "x", effective_year: 2026, ...patch } as TariffInput);
  if (err && err !== "HS Code 必填") return { ok: false, error: err };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of [
    "hs_code",
    "effective_year",
    "displacement_min",
    "displacement_max",
    "plate_class",
    "customs_rate",
    "commodity_tax_rate",
    "trade_promotion_rate",
    "vat_rate",
    "note",
  ] as const) {
    if (typeof patch[k] !== "undefined") update[k] = patch[k] === "" ? null : patch[k];
  }

  const sb = createServiceClient();
  const { error } = await sb.from("hs_code_tariffs").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "同 HS Code + 年度已存在" };
    return { ok: false, error: `更新失敗：${error.message}` };
  }
  revalidatePath("/vehicle-import/tariffs", "page");
  revalidatePath(`/vehicle-import/tariffs/${id}`, "page");
  return { ok: true, data: { id } };
}

export async function setTariffActiveAction(
  id: string,
  active: boolean,
): Promise<TariffActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { error } = await sb.from("hs_code_tariffs").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/vehicle-import/tariffs", "page");
  return { ok: true, data: { id } };
}

export async function deleteTariffAction(
  id: string,
): Promise<TariffActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { error } = await sb.from("hs_code_tariffs").delete().eq("id", id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/vehicle-import/tariffs", "page");
  return { ok: true, data: { id } };
}
