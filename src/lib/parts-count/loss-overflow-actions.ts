"use server";

/**
 * Server Actions — 報損報溢 (inventory_adjustments)
 *
 * Result<T> pattern：client 自己 router.push / 顯示 banner；
 * 不在 action 內 redirect。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { APPROVAL_THRESHOLD } from "@/domain/loss-overflow.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type LossOverflowInput = {
  warehouse_id: string;
  kind: "loss" | "overflow";
  reason_kind: "damage" | "lost" | "expired" | "count_error" | "other";
  amount: number; // 正值，由 kind 決定正負
  notes?: string | null;
};

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

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const adjNo = await generateAdjNo(brand);
  const signedAmount = input.kind === "loss" ? -amount : amount;
  // > 5000 預設 submitted 等審；其餘 posted
  const requiresApproval = amount >= APPROVAL_THRESHOLD;
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
      metadata: { reason_kind: input.reason_kind, source: "manual" },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };

  revalidatePath("/parts/count/loss-overflow");
  return { ok: true, data: { id: data.id } };
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
    .select("status")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (getErr || !cur) {
    return { ok: false, error: `找不到單據：${getErr?.message ?? "no row"}` };
  }
  if (!["submitted", "draft"].includes(cur.status)) {
    return { ok: false, error: `狀態 ${cur.status} 不可審核` };
  }

  const { data: { user } } = await supabase.auth.getUser();

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
