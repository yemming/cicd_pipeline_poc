"use server";

/**
 * Server actions — aftersales repair orders
 *
 * Result<T> pattern。對應 spec：docs/proposals/feature-aftersales-ro-phase1.md
 *
 * 寫入動作：
 *  - confirmRepairOrderAction：閘門頁唯一寫入動作（POC 階段不真推 LINE）
 *  - updateRepairOrderStatusAction：03-08 後續單據觸發狀態切換
 *  - cancelRepairOrderAction / deleteRepairOrderAction（admin only）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  PREFIX_COMBO_RULES,
  type PrefixP1,
  type PrefixP2,
} from "@/domain/repair-orders.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/aftersales/repair-orders";

export type ConfirmRepairOrderInput = {
  appointment_id?: string | null;
  pre_inspection_id?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
  prefix_p1: PrefixP1;
  prefix_p2: PrefixP2;
  mileage_in?: number | null;
  estimated_subtotal?: number | null;
  estimated_labor_units?: number | null;
  store_id?: string | null;
  subsidiary_id?: string | null;
  warranty_status_snapshot?: Record<string, unknown> | null;
  notes?: string | null;
};

function todayIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toYymmdd(dateStr: string): string {
  return dateStr.replace(/-/g, "").slice(2);
}

async function nextSequenceNo(
  brand_id: string,
  issue_date: string,
  p1: PrefixP1,
  p2: PrefixP2,
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repair_orders")
    .select("sequence_no")
    .eq("brand_id", brand_id)
    .eq("issue_date", issue_date)
    .eq("prefix_p1", p1)
    .eq("prefix_p2", p2)
    .order("sequence_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { sequence_no: number } | undefined;
  return (top?.sequence_no ?? 0) + 1;
}

export async function confirmRepairOrderAction(
  input: ConfirmRepairOrderInput,
): Promise<ActionResult<{ id: string; ro_code: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);

  // 1. 驗組合
  const rule = PREFIX_COMBO_RULES.find(
    (r) => r.p1 === input.prefix_p1 && r.p2 === input.prefix_p2,
  );
  if (rule?.verdict === "invalid") {
    return { ok: false, error: rule.description };
  }
  const verdict = rule?.verdict ?? "needs_supervisor";
  const accounting = rule?.accounting ?? null;

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const issueDate = todayIsoDate();

  // 2. 簡單 retry on unique violation（POC 階段：上限 5 次）
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = await nextSequenceNo(brand, issueDate, input.prefix_p1, input.prefix_p2);
    const roCode = `${input.prefix_p1}-${input.prefix_p2}-${toYymmdd(issueDate)}-${String(seq).padStart(3, "0")}`;

    const metadata: Record<string, unknown> = {
      accounting_category_resolved: accounting,
      verdict,
      created_via: "gate_page_v1",
      created_from: input.pre_inspection_id ? "pre_inspection" : "appointment",
    };
    if (verdict === "needs_supervisor") {
      metadata.supervisor_approval = { required: true, approved_at: null, approver_id: null };
    }
    if (input.notes?.trim()) metadata.notes = input.notes.trim();

    const { data, error } = await supabase
      .from("repair_orders")
      .insert({
        brand_id: brand,
        ro_code: roCode,
        prefix_p1: input.prefix_p1,
        prefix_p2: input.prefix_p2,
        issue_date: issueDate,
        sequence_no: seq,
        appointment_id: input.appointment_id || null,
        pre_inspection_id: input.pre_inspection_id || null,
        customer_id: input.customer_id || null,
        vehicle_id: input.vehicle_id || null,
        mileage_in: input.mileage_in ?? null,
        store_id: input.store_id || null,
        subsidiary_id: input.subsidiary_id || null,
        status: "進行中",
        opened_at: new Date().toISOString(),
        estimated_subtotal: input.estimated_subtotal ?? null,
        estimated_labor_units: input.estimated_labor_units ?? null,
        warranty_status_snapshot: input.warranty_status_snapshot ?? {},
        metadata,
      })
      .select("id, ro_code")
      .single();

    if (!error) {
      // 3. 更新上游預約狀態 → 維修中（demo：保留原狀態如果不是「等待中」）
      if (input.appointment_id) {
        await supabase
          .from("appointments")
          .update({ status: "維修中", started_at: new Date().toISOString() })
          .eq("id", input.appointment_id)
          .eq("brand_id", brand)
          .in("status", ["待到廠", "已到廠", "等待中"]);
      }

      // 4. 副作用 placeholder：notifications.dispatch（POC 階段先不真推、留 hook）
      // TODO: after(() => notifications.dispatch({ code: 'aftersales.repair_order.created', payload: { ro_code, ...} }))

      revalidatePath(PAGE_PATH);
      revalidatePath(`${PAGE_PATH}/${data.id}`);
      revalidatePath("/parts/aftersales/appointments");
      return {
        ok: true,
        data: { id: data.id as string, ro_code: data.ro_code as string },
      };
    }

    lastErr = error.message;
    // 23505 unique violation = 並發撞號 → retry；其他 error 直接 fail
    if (!error.message.includes("duplicate") && !error.message.includes("unique")) break;
  }

  return { ok: false, error: `建立失敗：${lastErr ?? "unknown"}` };
}

export async function updateRepairOrderStatusAction(
  id: string,
  status: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const upd: Record<string, unknown> = { status };
  if (status === "已關單") upd.closed_at = new Date().toISOString();

  const { error } = await supabase
    .from("repair_orders")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function cancelRepairOrderAction(
  id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: existing } = await supabase
    .from("repair_orders")
    .select("metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  const meta = ((existing?.metadata ?? {}) as Record<string, unknown>) || {};
  if (reason?.trim()) meta.cancel_reason = reason.trim();
  meta.canceled_at = new Date().toISOString();

  const { error } = await supabase
    .from("repair_orders")
    .update({ status: "已取消", metadata: meta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `取消失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteRepairOrderAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("repair_orders")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}
