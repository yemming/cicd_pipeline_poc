"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/warranty/ro-link";

export type RoLinkConfigPatch = {
  sync_ro_to_issue?: boolean;
  sync_vin_check?: boolean;
  sync_warranty_label?: boolean;
  sync_technician?: boolean;
  sync_estimate?: boolean;
  sync_frequency?: string;
  fallback_action?: string;
  expiry_alert_days?: number;
};

export async function updateRoLinkConfigAction(
  patch: RoLinkConfigPatch,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const upd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) upd[k] = v;
  }
  if (upd.expiry_alert_days !== undefined) {
    upd.expiry_alert_days = Math.max(0, Math.floor(Number(upd.expiry_alert_days)));
  }
  const { error } = await supabase
    .from("parts_warranty_ro_link_config")
    .update(upd)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { brand_id: brand } };
}

export async function verifyRoLinkRecordAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_ro_link_records")
    .update({ sync_status: "done", sync_status_label: "✅ 同步完成" })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `驗證失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}
