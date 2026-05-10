"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { VehicleFormState } from "./vehicle-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";
const ACQUIRED_FROM = ["new", "transfer", "used", "import", "other"] as const;
type AcquiredFrom = (typeof ACQUIRED_FROM)[number];

function pickAcquired(raw: FormDataEntryValue | null): AcquiredFrom {
  const v = String(raw ?? "new");
  return (ACQUIRED_FROM as readonly string[]).includes(v)
    ? (v as AcquiredFrom)
    : "new";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function dateOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function numOrNull(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function mapDbError(error: { code?: string; message: string }): VehicleFormState {
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

function pickPayload(fd: FormData) {
  return {
    customer_id: String(fd.get("customer_id") ?? "").trim(),
    model_id: strOrNull(fd.get("model_id")),
    vin: strOrNull(fd.get("vin")),
    license_plate: strOrNull(fd.get("license_plate")),
    engine_no: strOrNull(fd.get("engine_no")),
    color: strOrNull(fd.get("color")),
    manufactured_year: intOrNull(fd.get("manufactured_year")),
    acquired_from: pickAcquired(fd.get("acquired_from")),
    purchase_date: dateOrNull(fd.get("purchase_date")),
    purchase_amount: numOrNull(fd.get("purchase_amount")),
    current_mileage: numOrNull(fd.get("current_mileage")),
    last_service_date: dateOrNull(fd.get("last_service_date")),
    last_service_mileage: numOrNull(fd.get("last_service_mileage")),
    next_service_due_date: dateOrNull(fd.get("next_service_due_date")),
    next_service_due_mileage: numOrNull(fd.get("next_service_due_mileage")),
    warranty_until: dateOrNull(fd.get("warranty_until")),
    insurance_company: strOrNull(fd.get("insurance_company")),
    insurance_policy_no: strOrNull(fd.get("insurance_policy_no")),
    insurance_until: dateOrNull(fd.get("insurance_until")),
    preferred_technician_id: strOrNull(fd.get("preferred_technician_id")),
    notes: strOrNull(fd.get("notes")),
  };
}

export async function createVehicleAction(
  _prevState: VehicleFormState,
  fd: FormData,
): Promise<VehicleFormState> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const fieldErrors: VehicleFormState["fieldErrors"] = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customer_vehicles").insert({
    brand_id: (await getActiveScope()).brand_id,
    ...payload,
    created_by: ctx.userId,
  });
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/vehicles");
  redirect("/admin/master-data/vehicles");
}

export async function updateVehicleAction(
  _prevState: VehicleFormState,
  fd: FormData,
): Promise<VehicleFormState> {
  await requirePermission(PERMISSIONS.VEHICLE_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 vehicle id" };

  const payload = pickPayload(fd);
  const fieldErrors: VehicleFormState["fieldErrors"] = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_vehicles")
    .update({
      ...payload,
      is_active: fd.get("is_active") === "on",
    })
    .eq("id", id);
  if (error) return mapDbError(error);

  revalidatePath("/admin/master-data/vehicles");
  revalidatePath(`/admin/master-data/vehicles/${id}`);
  redirect("/admin/master-data/vehicles");
}
