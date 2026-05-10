"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getDefaultTenantUuid } from "./queries";

export type MappingActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<string | null> {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) return "需要 admin 權限";
  return null;
}

export type MappingInput = {
  dealeros_dim: string;
  dealeros_id: string;
  netsuite_internal_id: string;
  netsuite_external_id?: string | null;
  netsuite_segment_type?: "native" | "custom" | null;
  netsuite_segment_script_id?: string | null;
  sync_notes?: string | null;
};

export async function upsertMappingAction(
  input: MappingInput,
): Promise<MappingActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  if (!input.dealeros_dim.trim()) return { ok: false, error: "DealerOS 維度必填" };
  if (!input.dealeros_id.trim()) return { ok: false, error: "DealerOS ID 必填" };
  if (!input.netsuite_internal_id.trim())
    return { ok: false, error: "NetSuite Internal ID 必填" };

  const tenant = await getDefaultTenantUuid();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("netsuite_dim_mapping")
    .upsert(
      {
        tenant_id: tenant,
        dealeros_dim: input.dealeros_dim.trim().toUpperCase(),
        dealeros_id: input.dealeros_id.trim(),
        netsuite_internal_id: input.netsuite_internal_id.trim(),
        netsuite_external_id: input.netsuite_external_id?.trim() || null,
        netsuite_segment_type: input.netsuite_segment_type ?? null,
        netsuite_segment_script_id: input.netsuite_segment_script_id?.trim() || null,
        sync_notes: input.sync_notes?.trim() || null,
        sync_status: "OK",
        synced_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,dealeros_dim,dealeros_id" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/accounting/netsuite-mapping", "page");
  return { ok: true, data: { id: data.id } };
}

export async function deleteMappingAction(
  id: string,
): Promise<MappingActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  const { error } = await sb.from("netsuite_dim_mapping").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/accounting/netsuite-mapping", "page");
  return { ok: true, data: { id } };
}

/**
 * 從現有 subsidiaries / organizations / departments / brands / vehicle_models 自動產生 placeholder mapping。
 * 對映 internal_id 預設為 NULL（待 NetSuite sync 後填入），sync_status='STALE'。
 * 給 demo 看到「對映清單初始狀態」。
 */
export async function seedDefaultMappingsAction(): Promise<
  MappingActionResult<{ inserted: number }>
> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const tenant = await getDefaultTenantUuid();
  const sb = createServiceClient();

  type SeedSpec = {
    dim: string;
    table: string;
    idCol: string;
    type: "native" | "custom";
    script: string | null;
  };
  const specs: SeedSpec[] = [
    { dim: "SUBSIDIARY", table: "subsidiaries", idCol: "id", type: "native", script: "subsidiary" },
    { dim: "STORE",      table: "organizations", idCol: "id", type: "native", script: "location" },
    { dim: "DEPT",       table: "departments", idCol: "id", type: "native", script: "department" },
    { dim: "BRAND",      table: "brands", idCol: "id", type: "custom", script: "cseg_brand" },
    { dim: "MODEL",      table: "vehicle_models", idCol: "id", type: "custom", script: "cseg_model" },
  ];

  let inserted = 0;
  for (const spec of specs) {
    const { data: rows, error: lerr } = await sb.from(spec.table).select(spec.idCol);
    if (lerr) return { ok: false, error: `${spec.table}: ${lerr.message}` };

    const payload = (rows ?? []).map((r) => ({
      tenant_id: tenant,
      dealeros_dim: spec.dim,
      dealeros_id: String((r as unknown as Record<string, unknown>)[spec.idCol]),
      netsuite_internal_id: "PENDING",
      netsuite_external_id: null,
      netsuite_segment_type: spec.type,
      netsuite_segment_script_id: spec.script,
      sync_status: "STALE",
      sync_notes: "auto-generated placeholder; awaiting NetSuite sync",
      synced_at: new Date().toISOString(),
    }));

    if (payload.length === 0) continue;

    const { error: ierr, count } = await sb
      .from("netsuite_dim_mapping")
      .upsert(payload, {
        onConflict: "tenant_id,dealeros_dim,dealeros_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (ierr) return { ok: false, error: `${spec.dim}: ${ierr.message}` };
    inserted += count ?? 0;
  }

  revalidatePath("/admin/accounting/netsuite-mapping", "page");
  return { ok: true, data: { inserted } };
}
