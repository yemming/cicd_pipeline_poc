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
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { createFollowUpTask } from "@/domain/sales-call-tasks";

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

  // ── 跨模組 hook #2：SA 鎖定 / 防重複指派（同步守門，非 after）──
  // proposal §#2：確認/指派前先擋。after() 是寫完才跑、擋不住重複，所以在 insert 之前查。
  // OPEN_RO_STATUSES：尚未結束的工單狀態（已關單 / 已取消 不算佔用）
  const OPEN_RO_STATUSES = ["進行中", "維修中", "待結帳"];

  // (a) 同車已有進行中工單 → 擋（一台車同時間只該有一張 open RO）
  if (input.vehicle_id) {
    const { data: openRo, error: openErr } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .eq("brand_id", brand)
      .eq("vehicle_id", input.vehicle_id)
      .in("status", OPEN_RO_STATUSES)
      .limit(1)
      .maybeSingle();
    if (openErr) return { ok: false, error: `防重檢查失敗：${openErr.message}` };
    if (openRo) {
      return {
        ok: false,
        error: `此車已有進行中的工單（${openRo.ro_code}），請先結清再建立新單。`,
      };
    }
  }

  // (b) 同一預約防重複 confirm → 一張預約只該開一張 RO
  if (input.appointment_id) {
    const { data: dupRo, error: dupErr } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .eq("brand_id", brand)
      .eq("appointment_id", input.appointment_id)
      .neq("status", "已取消")
      .limit(1)
      .maybeSingle();
    if (dupErr) return { ok: false, error: `防重檢查失敗：${dupErr.message}` };
    if (dupRo) {
      return {
        ok: false,
        error: `此預約已建立過工單（${dupRo.ro_code}），請勿重複確認。`,
      };
    }
  }

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

  // ── 跨模組 hook #7：工單關閉 → 建立 NPS 滿意度回訪任務 ──
  // 非阻塞、try/catch 吞錯；helper 以 metadata.source_ro 防同單重複觸發。
  // 範圍（Ming 拍板）：只做「關單 → 建 NPS 回訪 call_task」，不碰 work_orders 進廠數對齊。
  if (status === "已關單") {
    after(async () => {
      try {
        const sb = await createClient();
        const { data: ro } = await sb
          .from("repair_orders")
          .select("customer_id, vehicle_id, ro_code")
          .eq("id", id)
          .eq("brand_id", brand)
          .maybeSingle();
        if (!ro?.customer_id) return; // 沒掛客戶的工單不建 NPS

        const res = await createFollowUpTask({
          customer_id: ro.customer_id,
          kind: "aftersales",
          call_type: "nps_interview",
          days_from_now: 1, // 關單後隔天回訪
          notes: `系統自動建立：工單 ${ro.ro_code} 關單後 NPS 滿意度回訪`,
          metadata: {
            source: "repair_order_close_hook",
            source_ro: id,
            ro_code: ro.ro_code,
            vehicle_id: ro.vehicle_id ?? null,
          },
          dedupeMetaKey: "source_ro",
        });
        if (!res.ok) {
          console.error("[hook#7 關單→NPS] 建立失敗（不影響關單）", res.error);
        }
      } catch (e) {
        console.error("[hook#7 關單→NPS] 副作用例外（不影響關單）", e);
      }
    });
  }

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

/**
 * /service/workshop 真派工：指派主責技師
 *  - technicianId = null 即解除指派
 *  - 若 RO status 為「進行中」且原本沒指派技師，順手切到「維修中」（保守做法：兩階段都明示）
 */
export async function setLeadTechnicianAction(
  roId: string,
  technicianId: string | null,
): Promise<ActionResult<{ id: string; technician_id: string | null; status: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  if (!roId) return { ok: false, error: "缺少工單 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1. 驗 technician 屬於同 brand 且 is_active
  if (technicianId) {
    const { data: tech, error: techErr } = await supabase
      .from("aftersales_technicians")
      .select("id, brand_id, is_active")
      .eq("id", technicianId)
      .maybeSingle();
    if (techErr) return { ok: false, error: `技師驗證失敗：${techErr.message}` };
    if (!tech) return { ok: false, error: "找不到指定技師" };
    if (tech.brand_id !== brand) return { ok: false, error: "技師不屬於當前 brand" };
    if (!tech.is_active) return { ok: false, error: "技師非啟用中，無法派工" };
  }

  // 2. 取得目前 RO 狀態 + 確認屬於同 brand
  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, brand_id, status")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr) return { ok: false, error: `工單載入失敗：${roErr.message}` };
  if (!ro) return { ok: false, error: "找不到工單" };

  // 3. update repair_orders
  const upd: Record<string, unknown> = {
    lead_technician_id: technicianId,
    updated_at: new Date().toISOString(),
  };
  // 派工時：若狀態仍為「進行中」（初始受理），切到「維修中」(車間實際施工)
  let nextStatus = ro.status as string;
  if (technicianId && ro.status === "進行中") {
    upd.status = "維修中";
    nextStatus = "維修中";
  }

  const { error: updErr } = await supabase
    .from("repair_orders")
    .update(upd)
    .eq("id", roId)
    .eq("brand_id", brand);
  if (updErr) return { ok: false, error: `派工失敗：${updErr.message}` };

  revalidatePath("/service/workshop");
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${roId}`);
  return {
    ok: true,
    data: { id: roId, technician_id: technicianId, status: nextStatus },
  };
}
