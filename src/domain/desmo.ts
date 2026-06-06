"use server";

/**
 * C-26 Desmo 汽門保養到期 — Domain Helper（server）
 *
 * 寫入路徑：登錄一次汽門保養 → 更新 last_desmo_service_* → 依車型間隔推算並回寫
 *   desmo_service_due_date / desmo_service_due_mileage。
 * 純計算 / 狀態判定在 desmo.constants.ts（client-safe）。
 *
 * 天條：UI 一律走本 helper，禁直連 supabase。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  resolveDesmoInterval,
  computeDesmoDue,
  type DesmoModelMeta,
} from "@/domain/desmo.constants";

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * 重算單一車輛的 Desmo 到期並回寫（用 last_desmo_service_* 為基準，
 * 缺則 fallback 用 last_service_date/mileage）。回 due 結果。
 * 不適用 Desmo 的車（非 Ducati / model 關閉）→ 清空 due 欄位、回 applicable=false。
 */
export async function recomputeDesmoDue(
  vehicleId: string,
): Promise<Result<{ applicable: boolean; dueDate: string | null; dueMileage: number | null }>> {
  if (!vehicleId) return { ok: false, error: "缺少 vehicleId" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: v, error } = await supabase
    .from("customer_vehicles")
    .select(
      "id, model_id, last_desmo_service_date, last_desmo_service_mileage, last_service_date, last_service_mileage",
    )
    .eq("id", vehicleId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) return { ok: false, error: `撈車輛失敗：${error.message}` };
  if (!v) return { ok: false, error: "找不到車輛" };

  let modelMeta: DesmoModelMeta = null;
  if (v.model_id) {
    const { data: m } = await supabase
      .from("vehicle_models")
      .select("metadata")
      .eq("id", v.model_id)
      .maybeSingle();
    modelMeta = (m?.metadata ?? null) as DesmoModelMeta;
  }

  const interval = resolveDesmoInterval(brand, modelMeta);
  if (!interval) {
    // 不適用 → 清空到期欄位（避免殘留誤導）
    await supabase
      .from("customer_vehicles")
      .update({ desmo_service_due_date: null, desmo_service_due_mileage: null })
      .eq("id", vehicleId)
      .eq("brand_id", brand);
    return { ok: true, data: { applicable: false, dueDate: null, dueMileage: null } };
  }

  const lastDate = v.last_desmo_service_date ?? v.last_service_date ?? null;
  const lastMileage =
    v.last_desmo_service_mileage != null
      ? Number(v.last_desmo_service_mileage)
      : v.last_service_mileage != null
        ? Number(v.last_service_mileage)
        : null;

  const { dueDate, dueMileage } = computeDesmoDue({ lastDate, lastMileage, interval });

  const { error: upErr } = await supabase
    .from("customer_vehicles")
    .update({
      desmo_service_due_date: dueDate,
      desmo_service_due_mileage: dueMileage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vehicleId)
    .eq("brand_id", brand);
  if (upErr) return { ok: false, error: `回寫到期失敗：${upErr.message}` };

  return { ok: true, data: { applicable: true, dueDate, dueMileage } };
}

/**
 * 登錄一次汽門保養：寫 last_desmo_service_* 後立即重算到期。
 */
export async function recordDesmoServiceAction(
  vehicleId: string,
  input: { date: string; mileage?: number | null },
): Promise<Result<{ dueDate: string | null; dueMileage: number | null }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!vehicleId) return { ok: false, error: "缺少 vehicleId" };
  if (!input.date) return { ok: false, error: "請填寫汽門保養日期" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { error } = await supabase
    .from("customer_vehicles")
    .update({
      last_desmo_service_date: input.date,
      last_desmo_service_mileage: input.mileage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vehicleId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `登錄汽門保養失敗：${error.message}` };

  const res = await recomputeDesmoDue(vehicleId);
  if (!res.ok) return res;
  return { ok: true, data: { dueDate: res.data.dueDate, dueMileage: res.data.dueMileage } };
}
