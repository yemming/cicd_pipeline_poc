import "server-only";

/**
 * Domain Helper — Test Ride Incidents（試乘事故記錄）
 *
 * 新增②：試乘事故凍結流程
 *   1. 寫 test_ride_incidents（incident_occurred=true）
 *   2. 若車輛在 new_car_inventory → status 設 incident_hold
 *   3. 同步通知店長（Notification Hub），失敗記 log 不阻斷主流程
 *
 * UI 禁止直接 import @/lib/supabase；一律透過此 helper。
 */

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { notifications } from "@/lib/notifications";

import type {
  ReportTestRideIncidentInput,
  TestRideIncidentRow,
  Result,
} from "./test-ride-incidents.constants";

export type { ReportTestRideIncidentInput, TestRideIncidentRow, Result };

/**
 * 登記試乘事故：
 *  - 建 test_ride_incidents row（incident_occurred=true）
 *  - 更新 new_car_inventory.status = 'incident_hold'（若 vehicle_inventory_id 有值）
 *  - 非同步通知店長（after()，不阻塞回應）
 */
export async function reportTestRideIncident(
  input: ReportTestRideIncidentInput,
): Promise<Result<{ incidentId: string }>> {
  if (!input.test_drive_id) {
    return { ok: false, error: "缺少試駕記錄 ID" };
  }
  if (!input.description?.trim()) {
    return { ok: false, error: "事故描述必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 取當前使用者（作為 reported_by）
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { ok: false, error: "請先登入" };
  }

  // 1. 讀取試駕基本資料（用於通知 payload）
  const { data: testDrive, error: tdErr } = await supabase
    .from("sales_test_drives")
    .select(
      "id, brand_id, customer_id, vehicle_model_id, vehicle_model:vehicle_models!sales_test_drives_vehicle_model_id_fkey(model_name), customer:customers!sales_test_drives_customer_id_fkey(name)",
    )
    .eq("id", input.test_drive_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (tdErr) return { ok: false, error: tdErr.message };
  if (!testDrive) return { ok: false, error: "找不到試駕記錄" };

  // 2. 建 test_ride_incidents row
  const now = new Date().toISOString();
  const { data: incident, error: insErr } = await supabase
    .from("test_ride_incidents")
    .insert({
      test_drive_id: input.test_drive_id,
      incident_occurred: true,
      reported_by: user.id,
      reported_at: now,
      brand_id: scope.brand_id,
      metadata: {
        description: input.description.trim(),
        location: input.location ?? null,
        injured: input.injured ?? false,
        damage_description: input.damage_description ?? null,
        vehicle_inventory_id: input.vehicle_inventory_id ?? null,
      },
    })
    .select("id")
    .single();

  if (insErr) return { ok: false, error: insErr.message };

  // 3. 若指定了庫存車輛 → 凍結為 incident_hold
  if (input.vehicle_inventory_id) {
    const { error: invErr } = await supabase
      .from("new_car_inventory")
      .update({ status: "incident_hold" })
      .eq("id", input.vehicle_inventory_id)
      .eq("brand_id", scope.brand_id);

    if (invErr) {
      // 凍結失敗：非阻斷主流程，但要記 log（嚴重程度高）
      console.error(
        "[reportTestRideIncident] 凍結庫存車輛失敗（事故已記錄）",
        invErr.message,
        { vehicle_inventory_id: input.vehicle_inventory_id },
      );
    }
  }

  // 4. 非同步通知店長（after()，不阻塞主流程；失敗只記 log）
  const vehicleModelName =
    testDrive.vehicle_model &&
    typeof testDrive.vehicle_model === "object" &&
    "model_name" in testDrive.vehicle_model
      ? ((testDrive.vehicle_model as { model_name: string | null }).model_name ?? "未知車款")
      : "未知車款";

  const customerName =
    testDrive.customer &&
    typeof testDrive.customer === "object" &&
    "name" in testDrive.customer
      ? ((testDrive.customer as { name: string | null }).name ?? "未知客戶")
      : "未知客戶";

  const actionUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app"}/sales/reception/test-rides/${input.test_drive_id}`;

  const notifyPayload = {
    testDriveId: input.test_drive_id,
    vehicleModel: vehicleModelName,
    customerName,
    description: input.description.trim(),
    location: input.location ?? "",
    reportedAt: new Date(now).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
    actionUrl,
    brandId: scope.brand_id,
  };

  after(async () => {
    try {
      // brandId 放進 payload（subscription filter_rules 用 brand_id 比對）
      // dealerId 填 scope.brand_id 供 MVP filter_rules 過濾
      const result = await notifications.dispatch({
        code: "test_ride_incident.reported",
        payload: notifyPayload,
        dealerId: scope.brand_id,
      });
      if (result.failed > 0) {
        console.error(
          "[reportTestRideIncident] 事故通知部分失敗",
          result.deliveries.filter((d) => !d.ok),
        );
      }
    } catch (e) {
      console.error("[reportTestRideIncident] 事故通知例外（事故已記錄）", e);
    }
  });

  return { ok: true, data: { incidentId: incident.id } };
}

/**
 * 列出某試駕記錄的所有事故（通常 0~1 筆，但允許多筆）
 */
export async function listTestRideIncidentsByTestDrive(
  testDriveId: string,
): Promise<TestRideIncidentRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("test_ride_incidents")
    .select("*")
    .eq("test_drive_id", testDriveId)
    .eq("brand_id", scope.brand_id)
    .order("reported_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TestRideIncidentRow[];
}

/**
 * 取得試駕記錄關聯的庫存車（vehicle_model_id 有值時）目前狀態
 * 用於試駕建立時過濾掉 incident_hold 的車輛
 */
export async function getAvailableInventoryVehicles(
  vehicleModelId: string,
): Promise<Array<{ id: string; status: string; notes: string | null }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("id, status, notes")
    .eq("brand_id", scope.brand_id)
    .eq("vehicle_model_id", vehicleModelId)
    .neq("status", "incident_hold")
    .neq("status", "sold")
    .neq("status", "delivered")
    .order("status");

  if (error) throw error;
  return (data ?? []) as Array<{ id: string; status: string; notes: string | null }>;
}
