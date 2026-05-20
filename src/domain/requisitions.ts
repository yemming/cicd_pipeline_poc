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

export type RequisitionPriority = "urgent" | "high" | "normal" | "low";

export type RequisitionWithLines = RequisitionRow & {
  org_name: string | null;
  store_name: string | null;
  line_count: number;
  first_item: { code: string; name: string; qty: number } | null;
  /** 估算總成本（所有 line 的 qty × items.standard_cost 加總） */
  estimated_cost: number;
  /** 已用預算百分比（0~999），無 budget_limit 時為 null */
  budget_used_pct: number | null;
};

export type RequisitionFilter = {
  status?: string;
  org_id?: string;
  date_from?: string;
  priority?: string;
};

export type RequisitionKpi = {
  pendingApproval: number;
  approved: number;
  overdue: number;
  newThisMonth: number;
  overBudget: number;
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
  if (filter.priority) q = q.eq("priority", filter.priority);

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

  // 撈所有 line 涉及的 item info + standard_cost（一次性 batch）
  const allItemIds = Array.from(
    new Set(
      Array.from(linesByReq.values())
        .flat()
        .map((l) => l.item_id)
        .filter((x): x is string => !!x),
    ),
  );
  let itemMap = new Map<string, { code: string; name: string; standard_cost: number }>();
  if (allItemIds.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from("items")
      .select("id, code, name, standard_cost")
      .in("id", allItemIds);
    if (iErr) throw iErr;
    itemMap = new Map(
      (items ?? []).map((it) => [
        it.id,
        {
          code: it.code ?? "",
          name: it.name ?? "",
          standard_cost: Number(it.standard_cost ?? 0),
        },
      ]),
    );
  }

  return reqs.map((r) => {
    const lines = linesByReq.get(r.id) ?? [];
    const firstLine = lines[0];
    const itemMeta = firstLine?.item_id ? itemMap.get(firstLine.item_id) : null;
    let estCost = 0;
    for (const l of lines) {
      const it = l.item_id ? itemMap.get(l.item_id) : null;
      if (!it) continue;
      estCost += (Number(l.qty_required ?? 0)) * it.standard_cost;
    }
    const budget = Number(r.budget_limit ?? 0);
    const usedPct = budget > 0 ? Math.round((estCost / budget) * 100) : null;
    return {
      ...r,
      org_name: r.org_id ? orgMap.get(r.org_id) ?? null : null,
      store_name: r.org_id ? orgMap.get(r.org_id) ?? null : null,
      line_count: lines.length,
      first_item: itemMeta
        ? {
            code: itemMeta.code,
            name: itemMeta.name,
            qty: Number(firstLine?.qty_required ?? 0),
          }
        : null,
      estimated_cost: estCost,
      budget_used_pct: usedPct,
    };
  });
}

/**
 * 計算 KPI（待審 / 已核准 / 逾期 / 本月新增 / 超預算）
 * 注意：直接取目前 brand 全表，不受 filter 影響（KPI 是全集）
 */
export async function getRequisitionsKpi(): Promise<RequisitionKpi> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const rows = await listRequisitions({});

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  // 全集（不只 5 個 list 顯示的）— 為了精準計數，再次 query 一次 minimal 欄位
  const { data: all } = await supabase
    .from("purchase_requisitions")
    .select("id, status, required_date, created_at, brand_id")
    .eq("brand_id", scope.brand_id);

  let pendingApproval = 0;
  let approved = 0;
  let overdue = 0;
  let newThisMonth = 0;
  for (const r of all ?? []) {
    if (r.status === "submitted") pendingApproval++;
    if (r.status === "approved") approved++;
    if (
      (r.status === "submitted" || r.status === "approved") &&
      r.required_date &&
      r.required_date < todayISO
    ) {
      overdue++;
    }
    if (r.created_at && r.created_at.slice(0, 10) >= monthStart) newThisMonth++;
  }

  const overBudget = rows.filter(
    (r) => r.budget_used_pct !== null && r.budget_used_pct > 100,
  ).length;

  return { pendingApproval, approved, overdue, newThisMonth, overBudget };
}

export async function getRequisitionsPageData(
  filter: RequisitionFilter = {},
): Promise<{
  rows: RequisitionWithLines[];
  canEdit: boolean;
  kpi: RequisitionKpi;
}> {
  const [rows, canEdit, kpi] = await Promise.all([
    listRequisitions(filter),
    hasPermission(PERMISSIONS.PR_APPROVE),
    getRequisitionsKpi(),
  ]);
  return { rows, canEdit, kpi };
}

// ─────────────────────────────────────────────────────────────
// Mutations — create / update / approve / reject / convert / delete
// （從 src/lib/parts/actions/requisition-actions.ts 遷入，命名去掉 Action 字尾）
// ─────────────────────────────────────────────────────────────

export type RequisitionInput = {
  org_id: string | null;       // 申請門店
  required_date: string | null;
  notes: string | null;         // 需求原因（自由文字）
  priority: RequisitionPriority;
  budget_limit: number | null;
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
      priority: input.priority,
      budget_limit: input.budget_limit,
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
      priority: input.priority,
      budget_limit: input.budget_limit,
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

/**
 * 變更需求單 priority（list view inline 切換用）
 * 任何有 PR_CREATE 權限的人都可改（不需 PR_APPROVE）
 */
export async function setRequisitionPriority(
  id: string,
  priority: RequisitionPriority,
): Promise<Result<null>> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  if (!["urgent", "high", "normal", "low"].includes(priority)) {
    return { ok: false, error: "無效的優先度" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("purchase_requisitions")
    .update({ priority })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
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

// ─────────────────────────── Requisition new page（/parts/purchase/requisitions/new） ───────────────────────────

import type {
  DetailRequisition,
  LineRow,
  ItemRef,
  OrgRef,
} from "@/app/(workspace)/parts/purchase/requisitions/[id]/_components/requisition-detail-view";

export interface RequisitionsNewPageData {
  items: ItemRef[];
  orgs: OrgRef[];
}

export async function getRequisitionsNewPageData(): Promise<RequisitionsNewPageData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [orgsRes, itemsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("items")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(500),
  ]);
  return {
    items: (itemsRes.data ?? []) as unknown as ItemRef[],
    orgs: (orgsRes.data ?? []) as unknown as OrgRef[],
  };
}

// ─────────────────────────── Requisition detail page（/parts/purchase/requisitions/[id]） ───────────────────────────

export interface RequisitionDetailPageData {
  requisition: DetailRequisition;
  lines: LineRow[];
  items: ItemRef[];
  orgs: OrgRef[];
  estimatedCost: number;
}

export async function getRequisitionDetailPageData(
  id: string,
): Promise<RequisitionDetailPageData | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: req, error: reqErr } = await supabase
    .from("purchase_requisitions")
    .select(
      "id, req_no, org_id, status, required_date, notes, source, approved_at, created_at, updated_at, priority, budget_limit",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (reqErr || !req) return null;

  const [linesRes, orgsRes] = await Promise.all([
    supabase
      .from("purchase_requisition_lines")
      .select("id, line_no, item_id, qty_required, uom, expected_date, notes")
      .eq("brand_id", brand)
      .eq("req_id", id)
      .order("line_no"),
    supabase
      .from("organizations")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
  ]);

  const lines = (linesRes.data ?? []) as unknown as LineRow[];
  const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
  // 撈 linked items 帶上 standard_cost（為了 estimatedCost 計算）
  const linkedRes = itemIds.length
    ? await supabase.from("items").select("id, code, name, standard_cost").in("id", itemIds)
    : { data: [] as Array<{ id: string; code: string; name: string; standard_cost: number | null }> };
  const linkedWithCost = linkedRes.data ?? [];

  const { data: allItemsData } = await supabase
    .from("items")
    .select("id, code, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("code")
    .limit(500);
  const allItems = (allItemsData ?? []) as unknown as ItemRef[];

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  for (const it of linkedWithCost) {
    if (!itemMap.has(it.id)) {
      itemMap.set(it.id, { id: it.id, code: it.code ?? "", name: it.name ?? "" });
    }
  }

  // 估算 cost：每條 line × items.standard_cost 加總
  const costByItem = new Map<string, number>();
  for (const it of linkedWithCost) {
    costByItem.set(it.id, Number(it.standard_cost ?? 0));
  }
  let estimatedCost = 0;
  for (const l of lines) {
    const c = costByItem.get(l.item_id) ?? 0;
    estimatedCost += Number(l.qty_required ?? 0) * c;
  }

  return {
    requisition: req as unknown as DetailRequisition,
    lines,
    items: Array.from(itemMap.values()),
    orgs: (orgsRes.data ?? []) as unknown as OrgRef[],
    estimatedCost,
  };
}
