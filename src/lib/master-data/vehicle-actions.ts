"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { VehicleFieldKey } from "./vehicle-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";

const ACQUIRED_FROM = ["new", "transfer", "used", "import", "other"] as const;
type AcquiredFrom = (typeof ACQUIRED_FROM)[number];

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<VehicleFieldKey, string>> };

export type VehicleInput = {
  customer_id: string;
  model_id?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  engine_no?: string | null;
  color?: string | null;
  manufactured_year?: number | null;
  acquired_from?: AcquiredFrom | null;
  purchase_date?: string | null;
  purchase_amount?: number | null;
  current_mileage?: number | null;
  last_service_date?: string | null;
  last_service_mileage?: number | null;
  next_service_due_date?: string | null;
  next_service_due_mileage?: number | null;
  warranty_until?: string | null;
  insurance_company?: string | null;
  insurance_policy_no?: string | null;
  insurance_until?: string | null;
  preferred_technician_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

function pickAcquired(raw: string | null | undefined): AcquiredFrom {
  const v = String(raw ?? "new");
  return (ACQUIRED_FROM as readonly string[]).includes(v)
    ? (v as AcquiredFrom)
    : "new";
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<VehicleFieldKey, string>>;
} {
  if (error.code === "23505" && error.message.includes("customer_vehicles_brand_vin_unique")) {
    return {
      error: "VIN 重複",
      fieldErrors: { vin: "此 VIN 已登記在其他車輛上" },
    };
  }
  if (error.code === "23503" && error.message.includes("customer_id")) {
    return {
      error: "客戶不存在或已被移除",
      fieldErrors: { customer_id: "請重新選擇客戶" },
    };
  }
  return { error: `儲存失敗：${error.message}` };
}

function buildPayload(input: VehicleInput) {
  return {
    customer_id: (input.customer_id ?? "").trim(),
    model_id: trim(input.model_id ?? null),
    vin: trim(input.vin ?? null),
    license_plate: trim(input.license_plate ?? null),
    engine_no: trim(input.engine_no ?? null),
    color: trim(input.color ?? null),
    manufactured_year: input.manufactured_year ?? null,
    acquired_from: pickAcquired(input.acquired_from),
    purchase_date: trim(input.purchase_date ?? null),
    purchase_amount: input.purchase_amount ?? null,
    current_mileage: input.current_mileage ?? null,
    last_service_date: trim(input.last_service_date ?? null),
    last_service_mileage: input.last_service_mileage ?? null,
    next_service_due_date: trim(input.next_service_due_date ?? null),
    next_service_due_mileage: input.next_service_due_mileage ?? null,
    warranty_until: trim(input.warranty_until ?? null),
    insurance_company: trim(input.insurance_company ?? null),
    insurance_policy_no: trim(input.insurance_policy_no ?? null),
    insurance_until: trim(input.insurance_until ?? null),
    preferred_technician_id: trim(input.preferred_technician_id ?? null),
    notes: trim(input.notes ?? null),
  };
}

export async function createVehicleAction(
  input: VehicleInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<VehicleFieldKey, string>> = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("customer_vehicles")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...payload,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/vehicles");
  return { ok: true, data: { id: data.id } };
}

export async function updateVehicleAction(
  id: string,
  input: VehicleInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!id) return { ok: false, error: "缺少 vehicle id" };

  const payload = buildPayload(input);
  const fieldErrors: Partial<Record<VehicleFieldKey, string>> = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_vehicles")
    .update({
      ...payload,
      is_active: input.is_active ?? true,
    })
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/admin/master-data/vehicles");
  revalidatePath(`/admin/master-data/vehicles/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteVehicleAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  if (!id) return { ok: false, error: "缺少 vehicle id" };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_vehicles").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此車輛被工單 / 預約 / 索賠引用，無法刪除。請改用「停用」保留歷史。",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/vehicles");
  return { ok: true, data: null };
}
