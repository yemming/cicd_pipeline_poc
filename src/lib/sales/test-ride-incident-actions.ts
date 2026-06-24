"use server";

/**
 * Server Actions — Test Ride Incidents（試乘事故登記）
 *
 * 新增②：登記事故 → 凍結車輛 + 通知店長。
 * 只 export async function（"use server" 規則）。
 */

import { revalidatePath } from "next/cache";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { reportTestRideIncident } from "@/domain/test-ride-incidents";
import type {
  ReportTestRideIncidentInput,
  Result,
} from "@/domain/test-ride-incidents.constants";

const LIST_PATH = "/sales/reception/test-rides";

export async function reportTestRideIncidentAction(
  input: ReportTestRideIncidentInput,
): Promise<Result<{ incidentId: string }>> {
  // 使用 CUSTOMER_EDIT（接待手卡同等權限）
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return { ok: false, error: "沒有登記試乘事故的權限" };
  }

  const res = await reportTestRideIncident(input);

  if (res.ok) {
    revalidatePath(LIST_PATH);
    revalidatePath(`${LIST_PATH}/${input.test_drive_id}`);
  }

  return res;
}
