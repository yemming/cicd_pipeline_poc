"use server";

/**
 * Domain Helper — Sales Staff Grid（員工評估九宮格）
 *
 * 設計稿：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § 員工評估九宮格
 * 路由：/sales/manager/staff-grid
 * Proposal：docs/proposals/feature-rs-m3-staff-grid-phase1.md
 *
 * 紀律：
 *  - 主表 employees + metadata.sales.grid_position（不開新表）
 *  - reuse `listSalesStaff` 的撈 + 月份聚合邏輯（同一張 employees）
 *  - 主管手動拖曳後 manual_override=true、永遠用此位置直到 reset all
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import { listSalesStaff, type SalesStaffRow } from "./sales-staff";
import {
  type SalesStaffMetadata,
} from "./sales-staff.constants";
import {
  type GridAxis,
  type GridPosition,
  cellKey,
  clearGridPosition,
  resolveGridPosition,
  writeGridPosition,
} from "./sales-staff-grid.constants";

export type StaffGridRow = SalesStaffRow & {
  grid_attitude: GridAxis;
  grid_skill: GridAxis;
  grid_manual_override: boolean;
  grid_evaluated_at: string;
  grid_cell_key: string;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ────────────── Read ────────────── */

/** 列出當前 brand 所有 active RS + 九宮格落點 */
export async function listStaffWithGridPositions(): Promise<StaffGridRow[]> {
  // 只看在職 RS（active）、不分頁（dashboard 視覺化，量不大）
  const { rows } = await listSalesStaff(
    { status: "active" },
    { page: 1, pageSize: 500 },
  );

  return rows.map((r) => {
    const pos = resolveGridPosition(r.metadata, {
      contacts: r.contacts_this_month,
      deals: r.deals_this_month,
    });
    return {
      ...r,
      grid_attitude: pos.attitude,
      grid_skill: pos.skill,
      grid_manual_override: pos.manual_override,
      grid_evaluated_at: pos.evaluated_at,
      grid_cell_key: cellKey(pos.attitude, pos.skill),
    };
  });
}

/* ────────────── Write ────────────── */

function isValidAxis(v: unknown): v is GridAxis {
  return v === 1 || v === 2 || v === 3;
}

/**
 * 主管拖曳後 — 把某 RS 的位置寫回 metadata + 標 manual_override=true
 */
export async function updateStaffGridPositionAction(
  employeeId: string,
  attitude: number,
  skill: number,
): Promise<ActionResult<{ id: string; position: GridPosition }>> {
  if (!employeeId) return { ok: false, error: "缺少 employee id" };
  if (!isValidAxis(attitude) || !isValidAxis(skill)) {
    return { ok: false, error: "axis 必須為 1 / 2 / 3" };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: cur, error: readErr } = await supabase
    .from("employees")
    .select("id, metadata")
    .eq("id", employeeId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr || !cur) {
    return { ok: false, error: readErr?.message ?? "找不到該員工" };
  }

  const position: GridPosition = {
    attitude,
    skill,
    manual_override: true,
    evaluated_at: new Date().toISOString(),
  };

  const nextMetadata = writeGridPosition(
    (cur.metadata ?? {}) as SalesStaffMetadata,
    position,
  );

  const { error: upErr } = await supabase
    .from("employees")
    .update({ metadata: nextMetadata })
    .eq("id", employeeId)
    .eq("brand_id", brand);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, data: { id: employeeId, position } };
}

/**
 * 重置全部為自動計算 — 清掉當前 brand 所有 active RS 的 grid_position
 */
export async function resetAllStaffGridAction(): Promise<
  ActionResult<{ count: number }>
> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 撈當前 brand 所有 active 員工的 metadata
  const { data, error } = await supabase
    .from("employees")
    .select("id, metadata")
    .eq("brand_id", brand)
    .eq("is_active", true);
  if (error) return { ok: false, error: error.message };

  let count = 0;
  for (const r of (data ?? []) as Array<{ id: string; metadata: unknown }>) {
    const meta = (r.metadata ?? {}) as SalesStaffMetadata;
    const hasPos = (meta.sales as { grid_position?: unknown } | undefined)?.grid_position;
    if (!hasPos) continue;
    const next = clearGridPosition(meta);
    const { error: upErr } = await supabase
      .from("employees")
      .update({ metadata: next })
      .eq("id", r.id)
      .eq("brand_id", brand);
    if (upErr) return { ok: false, error: upErr.message };
    count += 1;
  }
  return { ok: true, data: { count } };
}
