"use server";

/**
 * Server actions — 「串接工單」(PI → RO handoff)
 *
 * Result<T> pattern。`pre_inspections` 為主表，無獨立 handoff 表。
 *
 * 寫入動作：
 *  - transferToROAction：把 PI 轉成正式 RO（reuse confirmRepairOrderAction 邏輯）
 *  - rejectHandoffAction：駁回（清 signed_at，要求 SA 回 PI 重簽）
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

const HANDOFF_PATH = "/parts/aftersales/ro-handoff";

export type TransferToROInput = {
  pi_id: string;
  prefix_p1: PrefixP1;
  prefix_p2: PrefixP2;
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

export async function transferToROAction(
  input: TransferToROInput,
): Promise<ActionResult<{ ro_id: string; ro_code: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);

  if (!input.pi_id) return { ok: false, error: "缺少預檢單 id" };

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

  // 1. 撈 PI 主檔
  const { data: pi, error: piErr } = await supabase
    .from("pre_inspections")
    .select(
      `id, brand_id, status, signed_at, repair_order_id, appointment_id, customer_id,
       vehicle_id, mileage_in, estimated_subtotal, estimated_labor_units, organization_id`,
    )
    .eq("id", input.pi_id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (piErr || !pi) return { ok: false, error: "找不到該預檢單" };
  if (pi.repair_order_id) {
    return { ok: false, error: "此預檢單已串接工單" };
  }
  if (!pi.signed_at) {
    return { ok: false, error: "車主尚未在預檢單簽名，無法串接" };
  }

  const issueDate = todayIsoDate();

  // 2. retry on unique violation（最多 5 次）
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    // 取下一個流水號
    const { data: topData } = await supabase
      .from("repair_orders")
      .select("sequence_no")
      .eq("brand_id", brand)
      .eq("issue_date", issueDate)
      .eq("prefix_p1", input.prefix_p1)
      .eq("prefix_p2", input.prefix_p2)
      .order("sequence_no", { ascending: false })
      .limit(1);
    const top = (topData ?? [])[0] as { sequence_no: number } | undefined;
    const seq = (top?.sequence_no ?? 0) + 1;
    const roCode = `${input.prefix_p1}-${input.prefix_p2}-${toYymmdd(issueDate)}-${String(seq).padStart(3, "0")}`;

    const metadata: Record<string, unknown> = {
      accounting_category_resolved: accounting,
      verdict,
      created_via: "ro_handoff_v1",
      created_from: "pre_inspection",
    };
    if (verdict === "needs_supervisor") {
      metadata.supervisor_approval = { required: true, approved_at: null, approver_id: null };
    }
    if (input.notes?.trim()) metadata.notes = input.notes.trim();

    const { data: roIns, error: roErr } = await supabase
      .from("repair_orders")
      .insert({
        brand_id: brand,
        ro_code: roCode,
        prefix_p1: input.prefix_p1,
        prefix_p2: input.prefix_p2,
        issue_date: issueDate,
        sequence_no: seq,
        appointment_id: pi.appointment_id ?? null,
        pre_inspection_id: pi.id,
        customer_id: pi.customer_id ?? null,
        vehicle_id: pi.vehicle_id ?? null,
        mileage_in: pi.mileage_in ?? null,
        store_id: pi.organization_id ?? null,
        status: "進行中",
        opened_at: new Date().toISOString(),
        estimated_subtotal: pi.estimated_subtotal ?? null,
        estimated_labor_units: pi.estimated_labor_units ?? null,
        warranty_status_snapshot: {},
        metadata,
      })
      .select("id, ro_code")
      .single();

    if (!roErr && roIns) {
      // 3. 回填 PI
      await supabase
        .from("pre_inspections")
        .update({
          repair_order_id: roIns.id as string,
          transferred_at: new Date().toISOString(),
          status: "transferred",
        })
        .eq("id", pi.id)
        .eq("brand_id", brand);

      // 3b. 橋接 work_orders.repair_order_id（C-28 FK bridge）
      // 若 PI 帶有 appointment_id，透過共用的 appointment_id 找到對應的 work_order 並回填。
      // 找不到也沒關係（work_order 可能尚未建立或走不同路徑），不影響 RO 串接主流程。
      if (pi.appointment_id) {
        await supabase
          .from("work_orders")
          .update({ repair_order_id: roIns.id as string })
          .eq("brand_id", brand)
          .eq("appointment_id", pi.appointment_id)
          .is("repair_order_id", null);
      }

      // 4. 上游 appointment 推 維修中
      if (pi.appointment_id) {
        await supabase
          .from("appointments")
          .update({ status: "維修中", started_at: new Date().toISOString() })
          .eq("id", pi.appointment_id)
          .eq("brand_id", brand)
          .in("status", ["待到廠", "已到廠", "等待中"]);
      }

      revalidatePath(HANDOFF_PATH);
      revalidatePath(`${HANDOFF_PATH}/${pi.id}`);
      revalidatePath("/parts/aftersales/repair-orders");
      revalidatePath("/parts/aftersales/pre-inspections");
      return {
        ok: true,
        data: { ro_id: roIns.id as string, ro_code: roIns.ro_code as string },
      };
    }

    lastErr = roErr?.message ?? "unknown";
    if (
      !lastErr.includes("duplicate") &&
      !lastErr.includes("unique") &&
      !lastErr.includes("23505")
    ) {
      break;
    }
  }

  return { ok: false, error: `串接失敗：${lastErr ?? "unknown"}` };
}

export async function rejectHandoffAction(
  pi_id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!pi_id) return { ok: false, error: "缺少預檢單 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: pi, error: piErr } = await supabase
    .from("pre_inspections")
    .select("id, repair_order_id, metadata")
    .eq("id", pi_id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (piErr || !pi) return { ok: false, error: "找不到該預檢單" };
  if (pi.repair_order_id) {
    return { ok: false, error: "已串接 RO 的單據不可駁回，請改在 RO 上取消" };
  }

  const meta = ((pi.metadata ?? {}) as Record<string, unknown>) || {};
  meta.handoff_rejected_at = new Date().toISOString();
  if (reason?.trim()) meta.handoff_reject_reason = reason.trim();

  const { error } = await supabase
    .from("pre_inspections")
    .update({ signed_at: null, metadata: meta, status: "in_progress" })
    .eq("id", pi_id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `駁回失敗：${error.message}` };

  revalidatePath(HANDOFF_PATH);
  revalidatePath(`${HANDOFF_PATH}/${pi_id}`);
  return { ok: true, data: { id: pi_id } };
}
