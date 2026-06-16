"use server";

/**
 * Server Actions — 報損報溢 (inventory_adjustments)
 *
 * 三級審批（2026-06-16 升級）：
 *   total < APPROVAL_THRESHOLD(5000)        → approval_tier='self'        → status='posted'（自批）
 *   5000 ≤ total < SENIOR(20000)            → approval_tier='manager'     → status='submitted'
 *   total ≥ SENIOR_APPROVAL_THRESHOLD(20000)→ approval_tier='store_manager'→ status='submitted'
 *
 * kind==='loss' 且 metadata 帶有 item_id + qty 時，同步寫 inventory_writeoffs（逐料件記錄）。
 *
 * Result<T> pattern：client 自己 router.push / 顯示 banner；不在 action 內 redirect。
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserDepartment } from "@/lib/rbac/department";
import {
  APPROVAL_THRESHOLD,
  SENIOR_APPROVAL_THRESHOLD,
} from "@/domain/loss-overflow.constants";
import { _syncWriteoffFromLoss } from "./writeoff-core";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type LossOverflowInput = {
  warehouse_id: string;
  kind: "loss" | "overflow";
  reason_kind: "damage" | "lost" | "expired" | "count_error" | "other";
  amount: number; // 正值，由 kind 決定正負
  notes?: string | null;
  /**
   * 選填：若 kind==='loss' 且有逐料件資料，帶入後會同步寫 inventory_writeoffs。
   * 沒有 item_id 時（金額彙總型）跳過 writeoff 建立。
   */
  item_id?: string | null;
  qty?: number | null;
  unit_cost?: number | null;
};

/** 三級審批門檻 helper（與 writeoff-actions 同步） */
function calcLossApprovalTier(
  absAmount: number,
): "self" | "manager" | "store_manager" {
  if (absAmount >= SENIOR_APPROVAL_THRESHOLD) return "store_manager";
  if (absAmount >= APPROVAL_THRESHOLD) return "manager";
  return "self";
}

const KIND_TO_TYPE: Record<"loss" | "overflow", string> = {
  loss: "loss",
  overflow: "gain",
};

async function generateAdjNo(brand: string): Promise<string> {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_adjustments")
    .select("adj_no")
    .eq("brand_id", brand)
    .like("adj_no", `LG${ymd}-%`)
    .order("adj_no", { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].adj_no?.match(/-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `LG${ymd}-${String(seq).padStart(3, "0")}`;
}

export async function createLossOverflowAction(
  input: LossOverflowInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.COUNT_ADJUST))) {
    return { ok: false, error: "沒有建立報損報溢的權限" };
  }
  if (!input.warehouse_id) return { ok: false, error: "倉庫必選" };
  if (!input.kind) return { ok: false, error: "類型必選" };
  if (!input.reason_kind) return { ok: false, error: "原因必選" };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "金額必須為正數" };
  }

  const scope = await getActiveScope();
  const supabase = await createClient();
  const brand = scope.brand_id;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;

  const adjNo = await generateAdjNo(brand);
  const signedAmount = input.kind === "loss" ? -amount : amount;

  // 三級審批
  const tier = calcLossApprovalTier(amount);
  const requiresApproval = tier !== "self";
  const status = requiresApproval ? "submitted" : "posted";

  const { data, error } = await supabase
    .from("inventory_adjustments")
    .insert({
      brand_id: brand,
      adj_no: adjNo,
      warehouse_id: input.warehouse_id,
      type: KIND_TO_TYPE[input.kind],
      reason: input.reason_kind,
      total_amount: signedAmount,
      status,
      notes: input.notes ?? null,
      gl_posted: status === "posted",
      posted_at: status === "posted" ? new Date().toISOString() : null,
      metadata: {
        reason_kind: input.reason_kind,
        source: "manual",
        approval_tier: tier,
      },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };

  const adjId = data.id;

  // kind==='loss' 且有 item_id/qty/unit_cost → 同步建 inventory_writeoffs
  if (input.kind === "loss" && input.item_id && input.qty && input.unit_cost) {
    after(async () => {
      await _syncWriteoffFromLoss({
        brand_id: brand,
        item_id: input.item_id!,
        qty: input.qty!,
        unit_cost: input.unit_cost!,
        writeoff_reason: input.reason_kind,
        requested_by: actorId,
        store_id: scope.store_id,
      });
    });
  }
  // 若 kind==='loss' 但沒有 item_id（金額彙總型），跳過 writeoff 建立

  revalidatePath("/parts/count/loss-overflow");
  return { ok: true, data: { id: adjId } };
}

export async function updateLossOverflowAction(
  id: string,
  patch: Partial<LossOverflowInput>,
): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.COUNT_ADJUST))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const updates: Record<string, unknown> = {};
  const meta: Record<string, unknown> = {};
  if (patch.warehouse_id !== undefined) updates.warehouse_id = patch.warehouse_id;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.reason_kind !== undefined) {
    updates.reason = patch.reason_kind;
    meta.reason_kind = patch.reason_kind;
  }
  if (patch.kind !== undefined) updates.type = KIND_TO_TYPE[patch.kind];
  if (patch.amount !== undefined) {
    const amt = Number(patch.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { ok: false, error: "金額必須為正數" };
    }
    // 需配合 kind 推出 signed amount — 取現有 row type 再算
    const { data: cur } = await supabase
      .from("inventory_adjustments")
      .select("type")
      .eq("id", id)
      .eq("brand_id", brand)
      .maybeSingle();
    const t = (patch.kind ? KIND_TO_TYPE[patch.kind] : cur?.type) ?? "loss";
    const isLoss = t === "loss" || t === "exception_out";
    updates.total_amount = isLoss ? -amt : amt;
  }
  if (Object.keys(meta).length > 0) {
    // 合併 metadata
    const { data: cur } = await supabase
      .from("inventory_adjustments")
      .select("metadata")
      .eq("id", id)
      .eq("brand_id", brand)
      .maybeSingle();
    updates.metadata = { ...((cur?.metadata as object) ?? {}), ...meta };
  }
  if (Object.keys(updates).length === 0) return { ok: true, data: { id } };

  const { error } = await supabase
    .from("inventory_adjustments")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidatePath("/parts/count/loss-overflow");
  return { ok: true, data: { id } };
}

export async function approveLossOverflowAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.COUNT_ADJUST))) {
    return { ok: false, error: "沒有審核權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: cur, error: getErr } = await supabase
    .from("inventory_adjustments")
    .select("status, metadata, total_amount")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (getErr || !cur) {
    return { ok: false, error: `找不到單據：${getErr?.message ?? "no row"}` };
  }
  if (!["submitted", "draft"].includes(cur.status)) {
    return { ok: false, error: `狀態 ${cur.status} 不可審核` };
  }

  // 取 metadata.approval_tier（舊資料無此欄位時，依 total_amount 重算）
  const meta = (cur.metadata ?? {}) as Record<string, unknown>;
  const absAmount = Math.abs(Number(cur.total_amount ?? 0));
  const tier =
    (meta.approval_tier as "self" | "manager" | "store_manager" | undefined) ??
    calcLossApprovalTier(absAmount);

  // store_manager tier：需店長旗標（is_cross_admin 或 role_codes 含 store_manager）
  if (tier === "store_manager") {
    const dept = await getCurrentUserDepartment();
    const isStoreManager =
      dept.is_cross_admin || dept.role_codes.includes("store_manager");
    if (!isStoreManager) {
      return {
        ok: false,
        error:
          `此單據金額 NT$${absAmount.toLocaleString()} 超過 ${SENIOR_APPROVAL_THRESHOLD.toLocaleString()}，` +
          "需要店長（store_manager role 或跨部門管理員）審批",
      };
    }
  }
  // manager tier：COUNT_ADJUST 已在上方 hasPermission 檢查，無需額外驗

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("inventory_adjustments")
    .update({
      status: "posted",
      approved_by: user?.id ?? null,
      approved_at: now,
      posted_at: now,
      gl_posted: true,
      gl_posted_at: now,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `審核失敗：${error.message}` };

  revalidatePath("/parts/count/loss-overflow");
  return { ok: true, data: { id } };
}

export async function rejectLossOverflowAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.COUNT_ADJUST))) {
    return { ok: false, error: "沒有駁回權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("inventory_adjustments")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("brand_id", brand)
    .in("status", ["submitted", "draft"]);
  if (error) return { ok: false, error: `駁回失敗：${error.message}` };
  revalidatePath("/parts/count/loss-overflow");
  return { ok: true, data: { id } };
}

export async function deleteLossOverflowAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.COUNT_ADJUST))) {
    return { ok: false, error: "沒有刪除權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  // 只允許刪 draft / rejected
  const { data: cur } = await supabase
    .from("inventory_adjustments")
    .select("status")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!cur) return { ok: false, error: "找不到單據" };
  if (!["draft", "rejected"].includes(cur.status)) {
    return { ok: false, error: `狀態 ${cur.status} 不可刪除（僅草稿 / 駁回可刪）` };
  }
  const { error } = await supabase
    .from("inventory_adjustments")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/parts/count/loss-overflow");
  return { ok: true, data: { id } };
}
