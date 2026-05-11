"use server";

/**
 * Domain Helper — Purchase Requisitions（採購需求單）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

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
