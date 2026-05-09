"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * 需求處理 actions：對應採購需求單表 purchase_requisitions（master）+ purchase_requisition_lines（detail）。
 *
 * 狀態機（DB CHECK constraint 限定）：
 *   draft → submitted → approved → converted（已轉採購單）
 *                              ↘ cancelled（已拒絕）
 *
 * 設計妥協：spec 表單一張需求單只有「料號 + 數量 + 原因」三個欄位，
 * 因此本 action 將 master + 1 line 包成原子建立／更新。多明細場景留給未來擴充。
 */

export type RequisitionInput = {
  org_id: string | null;     // 申請門店
  required_date: string | null;
  notes: string | null;       // 需求原因（自由文字）
  // 第一條 line（demo：每張單先固定 1 line）
  item_id: string | null;
  qty_required: number;
  uom: string | null;
  expected_date: string | null;
};

const STATUS_VALUES = ["draft", "submitted", "approved", "converted", "cancelled"] as const;
export type RequisitionStatus = (typeof STATUS_VALUES)[number];

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

async function genReqNo(): Promise<string> {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}-`;
  const { data } = await supabase
    .from("purchase_requisitions")
    .select("req_no")
    .eq("brand_id", getBrandKey())
    .ilike("req_no", `${prefix}%`)
    .order("req_no", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of data ?? []) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(row.req_no);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function createRequisitionAction(
  input: RequisitionInput,
): Promise<ActionResult<{ id: string; req_no: string }>> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  if (!input.item_id) return { ok: false, error: "料號必選" };
  if (!input.qty_required || input.qty_required <= 0) return { ok: false, error: "需求數量需大於 0" };

  const supabase = await createClient();
  const brand = getBrandKey();
  const req_no = await genReqNo();

  // master
  const { data: req, error: reqErr } = await supabase
    .from("purchase_requisitions")
    .insert({
      brand_id: brand,
      req_no,
      org_id: input.org_id,
      source: "manual",
      status: "submitted",
      required_date: trim(input.required_date),
      notes: trim(input.notes),
      created_by: ctx.userId,
    })
    .select("id, req_no")
    .single();
  if (reqErr || !req) return { ok: false, error: `建立失敗：${reqErr?.message ?? "unknown"}` };

  // line
  const { error: lineErr } = await supabase.from("purchase_requisition_lines").insert({
    brand_id: brand,
    req_id: req.id,
    line_no: 1,
    item_id: input.item_id,
    qty_required: input.qty_required,
    uom: trim(input.uom),
    expected_date: trim(input.expected_date),
  });
  if (lineErr) {
    // 補救 — master 已寫入但 line 失敗，回滾 master
    await supabase.from("purchase_requisitions").delete().eq("id", req.id);
    return { ok: false, error: `明細建立失敗：${lineErr.message}` };
  }

  revalidatePath("/parts/purchase/requisitions");
  return { ok: true, data: { id: req.id, req_no: req.req_no } };
}

export async function updateRequisitionAction(
  id: string,
  input: RequisitionInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };
  if (!input.qty_required || input.qty_required <= 0) return { ok: false, error: "需求數量需大於 0" };

  const supabase = await createClient();
  const brand = getBrandKey();

  const { error: reqErr } = await supabase
    .from("purchase_requisitions")
    .update({
      org_id: input.org_id,
      required_date: trim(input.required_date),
      notes: trim(input.notes),
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (reqErr) return { ok: false, error: `儲存失敗：${reqErr.message}` };

  // 同步更新第一條 line（demo 簡化：line_no=1）
  if (input.item_id) {
    const { error: lineErr } = await supabase
      .from("purchase_requisition_lines")
      .update({
        item_id: input.item_id,
        qty_required: input.qty_required,
        uom: trim(input.uom),
        expected_date: trim(input.expected_date),
      })
      .eq("brand_id", brand)
      .eq("req_id", id)
      .eq("line_no", 1);
    if (lineErr) return { ok: false, error: `明細儲存失敗：${lineErr.message}` };
  }

  revalidatePath("/parts/purchase/requisitions");
  revalidatePath(`/parts/purchase/requisitions/${id}`);
  return { ok: true, data: { id } };
}

export async function approveRequisitionAction(id: string): Promise<ActionResult<null>> {
  return setStatus(id, "approved", PERMISSIONS.PR_APPROVE);
}

export async function rejectRequisitionAction(id: string): Promise<ActionResult<null>> {
  // CHECK constraint 沒有 'rejected'，業務語意對應 'cancelled'
  return setStatus(id, "cancelled", PERMISSIONS.PR_APPROVE);
}

export async function convertRequisitionAction(id: string): Promise<ActionResult<null>> {
  return setStatus(id, "converted", PERMISSIONS.PR_APPROVE);
}

async function setStatus(
  id: string,
  next: RequisitionStatus,
  permission: PermissionCode,
): Promise<ActionResult<null>> {
  await requirePermission(permission);
  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: next };
  if (next === "approved" || next === "converted") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = ctx.userId ?? null;
  }
  const { error } = await supabase
    .from("purchase_requisitions")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `狀態更新失敗：${error.message}` };
  revalidatePath("/parts/purchase/requisitions");
  revalidatePath(`/parts/purchase/requisitions/${id}`);
  return { ok: true, data: null };
}

export async function deleteRequisitionAction(id: string): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  const supabase = await createClient();
  const brand = getBrandKey();
  // 先刪 lines、再刪 master（避免 FK 衝突）
  await supabase.from("purchase_requisition_lines").delete().eq("brand_id", brand).eq("req_id", id);
  const { error } = await supabase
    .from("purchase_requisitions")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/parts/purchase/requisitions");
  return { ok: true, data: null };
}
