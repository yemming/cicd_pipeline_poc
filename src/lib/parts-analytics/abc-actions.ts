"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { applyAbcConfig, getAbcSimulation } from "@/domain/parts-abc";
import type { AbcSimulationInput, AbcSimulationResult } from "@/domain/parts-abc.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/analytics/abc-settings";

/**
 * Dry-run：算新 thresholds 套到 results 後的分佈與變動，不寫 DB。
 */
export async function previewAbcAction(
  input: AbcSimulationInput,
): Promise<ActionResult<AbcSimulationResult>> {
  await requirePermission(PERMISSIONS.PARTS_CONTROL_TYPE_VIEW);
  try {
    const a = Number(input.a_percentile);
    const b = Number(input.b_percentile);
    if (!Number.isFinite(a) || a < 1 || a > 99) {
      return { ok: false, error: "A 類門檻必須在 1–99 之間" };
    }
    if (!Number.isFinite(b) || b <= a || b > 100) {
      return { ok: false, error: "B 類門檻必須大於 A 類且 ≤ 100" };
    }
    const metric = input.metric === "qty" || input.metric === "profit" ? input.metric : "revenue";
    const sim = await getAbcSimulation({ a_percentile: a, b_percentile: b, metric });
    return { ok: true, data: sim };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `預覽失敗：${msg}` };
  }
}

/**
 * 正式套用 ABC thresholds + 重算分類（dry-run 確認後才呼叫）。
 */
export async function applyAbcAction(
  input: AbcSimulationInput,
): Promise<ActionResult<{ affected: number }>> {
  await requirePermission(PERMISSIONS.PARTS_CONTROL_TYPE_EDIT);
  try {
    const a = Number(input.a_percentile);
    const b = Number(input.b_percentile);
    if (!Number.isFinite(a) || a < 1 || a > 99) {
      return { ok: false, error: "A 類門檻必須在 1–99 之間" };
    }
    if (!Number.isFinite(b) || b <= a || b > 100) {
      return { ok: false, error: "B 類門檻必須大於 A 類且 ≤ 100" };
    }
    const metric = input.metric === "qty" || input.metric === "profit" ? input.metric : "revenue";
    const res = await applyAbcConfig({ a_percentile: a, b_percentile: b, metric });
    revalidatePath(PAGE_PATH);
    revalidatePath("/parts/analytics/abc");
    return { ok: true, data: res };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `套用失敗：${msg}` };
  }
}
