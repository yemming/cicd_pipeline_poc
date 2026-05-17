/**
 * Domain helper — 再接觸排程（CRM04A / CRM04B Tab 3）
 *
 * 走 call_tasks 表 + metadata.subkind='recontact' + metadata.lead_id + metadata.contact_method。
 * 不開新表（CRM04 Phase 1 拍板 Q1 = call_tasks 重用）。
 *
 * 寫入走 src/lib/sales/sales-recontact-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  RecontactKind,
  RecontactMethod,
} from "@/domain/sales-recontact.constants";

export type RecontactRow = {
  id: string;
  kind: RecontactKind;
  customer_id: string;
  lead_id: string | null;
  display_name: string;
  contact_method: RecontactMethod;
  scheduled_at: string;
  status: string;
  notes: string | null;
  rs_name: string | null;
  overdue_days: number | null;
};

export type RecontactFilters = {
  kind: RecontactKind;
  /** 起算（含），預設 now() */
  from?: string;
  /** 結算（含），預設 now() + 7d；傳 null 拿掉上限 */
  to?: string | null;
};

type RawRow = {
  id: string;
  kind: string;
  customer_id: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
  metadata: unknown;
};

function shape(r: RawRow): RecontactRow {
  const m = (r.metadata && typeof r.metadata === "object"
    ? r.metadata
    : {}) as Record<string, unknown>;
  return {
    id: r.id,
    kind: r.kind === "aftersales" ? "aftersales" : "sales",
    customer_id: r.customer_id,
    lead_id: typeof m.lead_id === "string" ? m.lead_id : null,
    display_name:
      typeof m.display_name === "string" && m.display_name
        ? m.display_name
        : "客戶",
    contact_method:
      typeof m.contact_method === "string"
        ? (m.contact_method as RecontactMethod)
        : "phone",
    scheduled_at: r.scheduled_at,
    status: r.status,
    notes: r.notes,
    rs_name: typeof m.rs_name === "string" ? m.rs_name : null,
    overdue_days:
      typeof m.overdue_days === "number"
        ? m.overdue_days
        : typeof m.overdue_days === "string"
          ? Number(m.overdue_days)
          : null,
  };
}

/** 本週待再接觸清單（預設 today..+7d） */
export async function listRecontactTasks(
  filters: RecontactFilters,
): Promise<RecontactRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const from = filters.from ?? new Date().toISOString();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 7);
  const to =
    filters.to === undefined ? toDate.toISOString() : (filters.to ?? null);

  let q = supabase
    .from("call_tasks")
    .select("id, kind, customer_id, scheduled_at, status, notes, metadata")
    .eq("brand_id", brand)
    .eq("kind", filters.kind)
    .eq("status", "pending")
    .filter("metadata->>subkind", "eq", "recontact")
    .gte("scheduled_at", from);

  if (to) q = q.lte("scheduled_at", to);

  const { data, error } = await q
    .order("scheduled_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`recontact list: ${error.message}`);

  return ((data ?? []) as unknown as RawRow[]).map(shape);
}

export async function countRecontactPending(
  kind: RecontactKind,
): Promise<number> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { count } = await supabase
    .from("call_tasks")
    .select("id", { head: true, count: "exact" })
    .eq("brand_id", brand)
    .eq("kind", kind)
    .eq("status", "pending")
    .filter("metadata->>subkind", "eq", "recontact");
  return count ?? 0;
}
