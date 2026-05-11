"use server";

/**
 * Domain Helper — Purchase Requisitions（採購需求單）
 *
 * 業務狀態機（DB CHECK constraint 限定）：
 *   draft → submitted → approved → converted（已轉採購單）
 *                              ↘ cancelled（已拒絕 / 取消）
 *
 * 設計妥協：spec 表單一張需求單只有「料號 + 數量 + 原因」三個欄位，
 * 因此 create/update 將 master + 1 line 包成原子建立／更新。多明細場景留給未來擴充。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUserContext,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/policies";
import { PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

// ─────────────────────────────────────────────────────────────
// Result 型別（client 自控導航的 ok/error pattern）
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type Tables = Database["public"]["Tables"];
export type RequisitionRow = Tables["purchase_requisitions"]["Row"];
export type RequisitionLineRow = Tables["purchase_requisition_lines"]["Row"];

export type RequisitionWithLines = RequisitionRow & {
  org_name: string | null;
  store_name: string | null;
  line_count: number;
  first_item: { code: string; name: string; qty: number } | null;
};

export type RequisitionFilter = {
  status?: string;
  org_id?: string;
  date_from?: string;
};

export async function listRequisitions(
  filter: RequisitionFilter = {},
): Promise<RequisitionWithLines[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("purchase_requisitions")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false });

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.org_id) q = q.eq("org_id", filter.org_id);
  if (filter.date_from) q = q.gte("required_date", filter.date_from);

  const { data: reqs, error } = await q;
  if (error) throw error;
  if (!reqs || reqs.length === 0) return [];

  const reqIds = reqs.map((r) => r.id);
  const orgIds = Array.from(new Set(reqs.map((r) => r.org_id).filter((x): x is string => !!x)));

  const [linesRes, orgsRes] = await Promise.all([
    supabase
      .from("purchase_requisition_lines")
      .select("req_id, item_id, qty_required")
      .in("req_id", reqIds),
    orgIds.length > 0
      ? supabase.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (linesRes.error) throw linesRes.error;
  if (orgsRes.error) throw orgsRes.error;

  const orgMap = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name]));
  const linesByReq = new Map<string, { item_id: string | null; qty_required: number | null }[]>();
  for (const l of linesRes.data ?? []) {
    if (!l.req_id) continue;
    const arr = linesByReq.get(l.req_id) ?? [];
    arr.push({ item_id: l.item_id, qty_required: l.qty_required });
    linesByReq.set(l.req_id, arr);
  }

  // 撈第一筆 line 的 item info（如果有）
  const firstItemIds = Array.from(
    new Set(
      Array.from(linesByReq.values())
        .map((arr) => arr[0]?.item_id)
        .filter((x): x is string => !!x),
    ),
  );
  let itemMap = new Map<string, { code: string; name: string }>();
  if (firstItemIds.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from("items")
      .select("id, code, name")
      .in("id", firstItemIds);
    if (iErr) throw iErr;
    itemMap = new Map(
      (items ?? []).map((it) => [it.id, { code: it.code ?? "", name: it.name ?? "" }]),
    );
  }

  return reqs.map((r) => {
    const lines = linesByReq.get(r.id) ?? [];
    const firstLine = lines[0];
    const itemMeta =
      firstLine?.item_id ? itemMap.get(firstLine.item_id) : null;
    return {
      ...r,
      org_name: r.org_id ? orgMap.get(r.org_id) ?? null : null,
      store_name: r.org_id ? orgMap.get(r.org_id) ?? null : null,
      line_count: lines.length,
      first_item: itemMeta
        ? {
            code: itemMeta.code,
            name: itemMeta.name,
            qty: firstLine?.qty_required ?? 0,
          }
        : null,
    };
  });
}

export async function getRequisitionsPageData(
  filter: RequisitionFilter = {},
): Promise<{
  rows: RequisitionWithLines[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listRequisitions(filter),
    hasPermission(PERMISSIONS.PR_APPROVE),
  ]);
  return { rows, canEdit };
}

// ─────────────────────────────────────────────────────────────
// Mutations — create / update / approve / reject / convert / delete
// （從 src/lib/parts/actions/requisition-actions.ts 遷入，命名去掉 Action 字尾）
// ─────────────────────────────────────────────────────────────

export type RequisitionInput = {
  org_id: string | null;       // 申請門店
  required_date: string | null;
  notes: string | null;         // 需求原因（自由文字）
  // 第一條 line（demo：每張單先固定 1 line）
  item_id: string | null;
  qty_required: number;
  uom: string | null;
  expected_date: string | null;
};

export type RequisitionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "converted"
  | "cancelled";

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
    .eq("brand_id", (await getActiveScope()).brand_id)
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

export async function createRequisition(
  input: RequisitionInput,
): Promise<Result<{ id: string; req_no: string }>> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  if (!input.item_id) return { ok: false, error: "料號必選" };
  if (!input.qty_required || input.qty_required <= 0) return { ok: false, error: "需求數量需大於 0" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
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
    // 補救 — master 已寫入但 line 失敗,回滾 master
    await supabase.from("purchase_requisitions").delete().eq("id", req.id);
    return { ok: false, error: `明細建立失敗：${lineErr.message}` };
  }

  revalidatePath("/parts/purchase/requisitions");
  return { ok: true, data: { id: req.id, req_no: req.req_no } };
}

export async function updateRequisition(
  id: string,
  input: RequisitionInput,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };
  if (!input.qty_required || input.qty_required <= 0) return { ok: false, error: "需求數量需大於 0" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

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

export async function approveRequisition(id: string): Promise<Result<null>> {
  return setStatus(id, "approved", PERMISSIONS.PR_APPROVE);
}

export async function rejectRequisition(id: string): Promise<Result<null>> {
  // CHECK constraint 沒有 'rejected'，業務語意對應 'cancelled'
  return setStatus(id, "cancelled", PERMISSIONS.PR_APPROVE);
}

export async function convertRequisition(id: string): Promise<Result<null>> {
  return setStatus(id, "converted", PERMISSIONS.PR_APPROVE);
}

async function setStatus(
  id: string,
  next: RequisitionStatus,
  permission: PermissionCode,
): Promise<Result<null>> {
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
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `狀態更新失敗：${error.message}` };
  revalidatePath("/parts/purchase/requisitions");
  revalidatePath(`/parts/purchase/requisitions/${id}`);
  return { ok: true, data: null };
}

export async function deleteRequisition(id: string): Promise<Result<null>> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
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
