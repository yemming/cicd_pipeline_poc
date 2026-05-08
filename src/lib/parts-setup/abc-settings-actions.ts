"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/analytics/abc-settings";

export async function updateAbcSettingsAction(
  patch: Record<string, unknown>,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_CONTROL_TYPE_EDIT);
  const supabase = await createClient();
  const brand = getBrandKey();
  const { data: existing } = await supabase
    .from("abc_classification_config")
    .select("id")
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("abc_classification_config")
      .update(patch)
      .eq("brand_id", brand);
    if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  } else {
    const { error } = await supabase
      .from("abc_classification_config")
      .insert({ brand_id: brand, ...patch });
    if (error) return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { brand_id: brand } };
}
