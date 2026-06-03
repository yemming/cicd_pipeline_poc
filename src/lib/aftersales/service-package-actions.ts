"use server";

/**
 * Server actions — 07B 服務套餐與費率設定（售後主管後台）
 *
 * Spec：05_售後修護模組_HTML異動檔案包/07B_服務套餐與費率設定_v1.html
 *  - 套餐主檔 CRUD（service_packages，G4 已建表）
 *  - 工時費率 upsert（labor_rates，DUCATI/Indian 各一套）
 *  - 每次變更寫稽核日誌 → business_rules rule_kind='service_package_audit'（免新表）
 *
 * 天條：UI 不直連 supabase；brand 來源用 getActiveScope()（非 profile_brands，見 memory
 * vehicle-import-brand-resolution-pitfall）。Result 型別、不 redirect。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { ServicePackageItem } from "@/domain/service-packages";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE = "/parts/aftersales/management/service-packages";

type AuditAction = "add" | "modify" | "deactivate" | "reactivate";

/** 追加一筆稽核到 business_rules（read-modify-write，POC 階段不強制 DB transaction）。 */
async function appendAudit(
  brandId: string,
  entry: {
    action: AuditAction;
    entity: "package" | "labor_rate";
    entityName: string;
    before: unknown;
    after: unknown;
  },
): Promise<void> {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  const { data: existing } = await supabase
    .from("business_rules")
    .select("id, config")
    .eq("brand_id", brandId)
    .eq("rule_kind", "service_package_audit")
    .maybeSingle();
  const prevEntries =
    ((existing?.config as { entries?: unknown[] } | null)?.entries ?? []) as unknown[];
  const next = {
    entries: [
      ...prevEntries,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        ...entry,
        by: me.user?.email ?? me.user?.id ?? null,
      },
    ],
  };
  if (existing?.id) {
    await supabase.from("business_rules").update({ config: next }).eq("id", existing.id);
  } else {
    await supabase.from("business_rules").insert({
      brand_id: brandId,
      rule_kind: "service_package_audit",
      config: next,
    });
  }
}

/* ──────── 套餐 CRUD ──────── */

export type ServicePackageInput = {
  code: string;
  name: string;
  pkgType: "standard" | "store_custom" | "promo";
  mileageInterval?: number | null;
  items?: ServicePackageItem[];
  listPrice?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
};

export async function createServicePackageAction(
  input: ServicePackageInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SERVICE_PACKAGE_EDIT);
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "套餐代碼不可為空" };
  if (!name) return { ok: false, error: "套餐名稱不可為空" };

  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_packages")
    .insert({
      brand_id: scope.brand_id,
      code,
      name,
      pkg_type: input.pkgType ?? "standard",
      mileage_interval: input.mileageInterval ?? null,
      items: input.items ?? [],
      list_price: input.listPrice ?? null,
      valid_from: input.validFrom ?? null,
      valid_to: input.validTo ?? null,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此套餐代碼已存在" };
    return { ok: false, error: error.message };
  }
  await appendAudit(scope.brand_id, {
    action: "add",
    entity: "package",
    entityName: `${code} ${name}`,
    before: null,
    after: { code, name, pkgType: input.pkgType, listPrice: input.listPrice ?? null },
  });
  revalidatePath(PAGE);
  return { ok: true, data: { id: data.id } };
}

export async function updateServicePackageAction(
  id: string,
  patch: Partial<ServicePackageInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SERVICE_PACKAGE_EDIT);
  const scope = await getActiveScope();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("service_packages")
    .select("code, name, pkg_type, mileage_interval, list_price, valid_from, valid_to, items")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { ok: false, error: "找不到該套餐" };

  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.pkgType !== undefined) next.pkg_type = patch.pkgType;
  if (patch.mileageInterval !== undefined) next.mileage_interval = patch.mileageInterval;
  if (patch.items !== undefined) next.items = patch.items;
  if (patch.listPrice !== undefined) next.list_price = patch.listPrice;
  if (patch.validFrom !== undefined) next.valid_from = patch.validFrom;
  if (patch.validTo !== undefined) next.valid_to = patch.validTo;

  const { error } = await supabase.from("service_packages").update(next).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await appendAudit(scope.brand_id, {
    action: "modify",
    entity: "package",
    entityName: `${before.code} ${before.name}`,
    before,
    after: next,
  });
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function setServicePackageActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SERVICE_PACKAGE_EDIT);
  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("service_packages")
    .select("code, name")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("service_packages")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await appendAudit(scope.brand_id, {
    action: active ? "reactivate" : "deactivate",
    entity: "package",
    entityName: before ? `${before.code} ${before.name}` : id,
    before: { is_active: !active },
    after: { is_active: active },
  });
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function deleteServicePackageAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SERVICE_PACKAGE_EDIT);
  const supabase = await createClient();
  const { error } = await supabase.from("service_packages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

/* ──────── 工時費率 upsert ──────── */

export async function upsertLaborRateAction(
  bizType: string,
  ratePerLu: number,
): Promise<ActionResult<{ bizType: string }>> {
  await requirePermission(PERMISSIONS.SERVICE_PACKAGE_EDIT);
  const biz = (bizType ?? "").trim();
  if (!biz) return { ok: false, error: "業務類型不可為空" };
  if (!(ratePerLu >= 0)) return { ok: false, error: "費率需為非負數" };

  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("labor_rates")
    .select("id, rate_per_lu")
    .eq("brand_id", scope.brand_id)
    .eq("biz_type", biz)
    .maybeSingle();

  const { error } = await supabase
    .from("labor_rates")
    .upsert(
      {
        brand_id: scope.brand_id,
        biz_type: biz,
        rate_per_lu: ratePerLu,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,biz_type" },
    );
  if (error) return { ok: false, error: error.message };
  await appendAudit(scope.brand_id, {
    action: before ? "modify" : "add",
    entity: "labor_rate",
    entityName: biz,
    before: before ? { ratePerLu: Number(before.rate_per_lu) } : null,
    after: { ratePerLu },
  });
  revalidatePath(PAGE);
  return { ok: true, data: { bizType: biz } };
}

export async function checkServicePackageEditPermission(): Promise<boolean> {
  return await hasPermission(PERMISSIONS.SERVICE_PACKAGE_EDIT);
}
