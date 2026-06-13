"use server";

/**
 * Server actions — final_inspections
 *
 * Spec：06_竣工複檢_v1.html (5-step wizard)
 *  - createFromRoAction：從 RO 建立複檢（預載 line_results）
 *  - updateLineResultsAction（step1）
 *  - updateTestDriveAction（step2）
 *  - updateCleaningAction（step3）
 *  - signAction / clearSignAction（step4）
 *  - addNotificationAction（step5）
 *  - updateNextServiceAction（step5）
 *  - completeAction（最終：複檢通過 → RO 推進到「待結帳」）
 *  - rejectAction（退回技師重修 → RO 改「維修中」）
 *  - deleteAction
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { registerOldPartFromInspection } from "@/domain/warranty";
import { appendRepairOrderEvent } from "@/domain/repair-orders";

import {
  buildInitialLineResults,
  hasAnyFail,
  isLineResultsAllPassed,
  type Cleaning,
  type LineResult,
  type NextService,
  type NotificationLog,
  type NotifyMethod,
  type TestDrive,
} from "@/domain/final-inspections.constants";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const PAGE = "/parts/aftersales/final-inspections";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function todayInTaipei(): { yymmdd: string; iso: string } {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = pad(tz.getMonth() + 1);
  const day = pad(tz.getDate());
  return { yymmdd: `${String(y).slice(2)}${m}${day}`, iso: `${y}-${m}-${day}` };
}

async function nextSequenceFor(brand: string, yymmdd: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("final_inspections")
    .select("inspection_no")
    .eq("brand_id", brand)
    .like("inspection_no", `FI-${yymmdd}-%`);
  if (error) throw error;
  const max = ((data ?? []) as { inspection_no: string }[])
    .map((r) => parseInt(r.inspection_no.split("-").pop() ?? "0", 10))
    .reduce((a, b) => Math.max(a, b), 0);
  return max + 1;
}

export async function createFromRoAction(
  ro_id: string,
  inspector?: { name?: string; role?: string },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, brand_id, ro_code, status, mileage_in, sa_id")
    .eq("id", ro_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr || !ro) return { ok: false, error: "找不到工單" };

  const { data: existed } = await supabase
    .from("final_inspections")
    .select("id")
    .eq("repair_order_id", ro_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existed) return { ok: false, error: "此工單已建立竣工複檢，請直接開啟" };

  const { data: lines, error: lineErr } = await supabase
    .from("repair_order_lines")
    .select("id, line_no, kind, labor_name, part_name, labor_note")
    .eq("repair_order_id", ro_id)
    .order("line_no", { ascending: true });
  if (lineErr) return { ok: false, error: "撈取維修項目失敗" };

  const initial = buildInitialLineResults(
    (lines ?? []) as Array<{
      id: string;
      line_no: number;
      kind: string;
      labor_name: string | null;
      part_name: string | null;
      labor_note: string | null;
    }>,
  );

  const { yymmdd } = todayInTaipei();
  const seq = await nextSequenceFor(brand, yymmdd);
  const inspection_no = `FI-${yymmdd}-${String(seq).padStart(3, "0")}`;

  const { data: ins, error: insErr } = await supabase
    .from("final_inspections")
    .insert({
      brand_id: brand,
      repair_order_id: ro_id,
      inspection_no,
      status: "in_progress",
      inspector_name: inspector?.name ?? null,
      inspector_role: inspector?.role ?? null,
      line_results: initial,
      test_drive: { km_before: ro.mileage_in ?? null, items: [] },
      cleaning: { items: [] },
      notifications: [],
      next_service: {},
    })
    .select("id")
    .single();
  if (insErr || !ins) return { ok: false, error: insErr?.message ?? "建立失敗" };

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${ins.id}`);
  return { ok: true, data: { id: ins.id } };
}

async function loadById(id: string) {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("final_inspections")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "找不到複檢單" };
  return { ok: true as const, brand, row: data };
}

export async function updateLineResultsAction(
  id: string,
  patch: { line_results: LineResult[]; issue_note?: string | null },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const { error } = await supabase
    .from("final_inspections")
    .update({
      line_results: patch.line_results,
      issue_note: patch.issue_note ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function updateTestDriveAction(
  id: string,
  patch: TestDrive,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const { error } = await supabase.from("final_inspections").update({ test_drive: patch }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function updateCleaningAction(
  id: string,
  patch: Cleaning,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const { error } = await supabase.from("final_inspections").update({ cleaning: patch }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function signAction(
  id: string,
  payload: { signature_text: string; inspector_name?: string; inspector_role?: string; signoff_note?: string; inspector_id?: string | null },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const lineResults = Array.isArray(ctx.row.line_results) ? (ctx.row.line_results as LineResult[]) : [];
  if (!isLineResultsAllPassed(lineResults)) {
    return { ok: false, error: "尚有維修項目未通過複檢，無法簽核" };
  }

  // ── M-09：複檢人員不得為施工 lead tech（後端驗證）──
  // 若有帶 inspector_id（從 aftersales_technicians），比對 RO.lead_technician_id
  if (payload.inspector_id) {
    const supabase = await createClient();
    const brand = (await getActiveScope()).brand_id;
    const { data: ro } = await supabase
      .from("repair_orders")
      .select("lead_technician_id")
      .eq("id", ctx.row.repair_order_id as string)
      .eq("brand_id", brand)
      .maybeSingle();
    const leadTechId = (ro as { lead_technician_id?: string | null } | null)?.lead_technician_id;
    if (leadTechId && leadTechId === payload.inspector_id) {
      return {
        ok: false,
        error: "M-09 違規：施工技師本人不得自行複檢，請指派其他技師執行竣工複檢",
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("final_inspections")
    .update({
      signed_at: new Date().toISOString(),
      signature_text: payload.signature_text,
      inspector_id: payload.inspector_id ?? ctx.row.inspector_id,
      inspector_name: payload.inspector_name ?? ctx.row.inspector_name,
      inspector_role: payload.inspector_role ?? ctx.row.inspector_role,
      signoff_note: payload.signoff_note ?? null,
      status: "passed",
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function clearSignAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const { error } = await supabase
    .from("final_inspections")
    .update({
      signed_at: null,
      signature_text: null,
      signoff_note: null,
      status: "in_progress",
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function addNotificationAction(
  id: string,
  payload: { method: NotifyMethod; note?: string | null },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const list: NotificationLog[] = Array.isArray(ctx.row.notifications)
    ? (ctx.row.notifications as NotificationLog[])
    : [];
  const newList = [
    ...list,
    { method: payload.method, sent_at: new Date().toISOString(), note: payload.note ?? null },
  ];
  const supabase = await createClient();
  const { error } = await supabase.from("final_inspections").update({ notifications: newList }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function updateNextServiceAction(
  id: string,
  patch: NextService,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const { error } = await supabase.from("final_inspections").update({ next_service: patch }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function completeAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (!ctx.row.signed_at) return { ok: false, error: "請先完成電子簽名再關閉複檢" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("final_inspections")
    .update({ status: "completed", closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  // 推進 RO 狀態到「待結帳」
  await supabase
    .from("repair_orders")
    .update({ status: "待結帳" })
    .eq("id", ctx.row.repair_order_id)
    .eq("brand_id", ctx.brand);

  // ── RP4 事件時間軸：記錄複檢通過（非阻塞） ──
  {
    const {
      data: { user: _fiUser },
    } = await supabase.auth.getUser();
    const fiActorId = _fiUser?.id ?? null;
    const fiRoId = ctx.row.repair_order_id as string;
    after(async () => {
      await appendRepairOrderEvent(
        fiRoId,
        {
          action: "final_inspection_passed",
          payload: {
            inspection_id: id,
            inspection_no: ctx.row.inspection_no,
            inspector_id: ctx.row.inspector_id ?? null,
            inspector_name: ctx.row.inspector_name ?? null,
          },
        },
        fiActorId,
      );
    });
  }

  // ── 跨模組 hook #6：複檢通過 → 保固單的換下舊件自動登錄 ──
  // 僅保固單（RO prefix_p1='WC'）觸發；撈該 RO 換下的保固零件逐筆 registerOldPart。
  // 非阻塞、try/catch 吞錯；helper 自帶 (ro_id,item_id) 防重。
  const roId = ctx.row.repair_order_id as string | null;
  if (roId) {
    after(async () => {
      try {
        const sb = await createClient();
        const brand = (await getActiveScope()).brand_id;

        // 是否為保固單
        const { data: ro } = await sb
          .from("repair_orders")
          .select("prefix_p1, vehicle_id")
          .eq("id", roId)
          .eq("brand_id", brand)
          .maybeSingle();
        if (!ro || ro.prefix_p1 !== "WC") return; // POC：只有 WC 保固單才登舊件

        // 取該 RO 換下的保固零件（kind=part / is_warranty / 有 item_id）
        const { data: lines } = await sb
          .from("repair_order_lines")
          .select("item_id, is_warranty, kind")
          .eq("repair_order_id", roId)
          .eq("brand_id", brand)
          .eq("kind", "part")
          .eq("is_warranty", true)
          .not("item_id", "is", null);

        const today = new Date().toISOString().slice(0, 10);
        for (const line of lines ?? []) {
          if (!line.item_id) continue;
          const res = await registerOldPartFromInspection({
            ro_id: roId,
            item_id: line.item_id,
            entry_date: today,
            oem_directive: "pending", // 待原廠處置指示（disposal_action → 'pending'）
          });
          if (!res.ok) {
            console.error("[hook#6 複檢→舊件] 單筆登錄失敗（續跑其餘）", line.item_id, res.error);
          }
        }
      } catch (e) {
        console.error("[hook#6 複檢→舊件] 副作用例外（不影響複檢完成）", e);
      }
    });
  }

  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  revalidatePath("/parts/aftersales/repair-orders");
  return { ok: true, data: { id } };
}

export async function rejectAction(
  id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const lineResults = Array.isArray(ctx.row.line_results) ? (ctx.row.line_results as LineResult[]) : [];
  if (!hasAnyFail(lineResults) && !reason) {
    return { ok: false, error: "尚未標記異常項目，請先在 step1 點異常或填寫退回原因" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("final_inspections")
    .update({ status: "rejected", issue_note: reason ?? ctx.row.issue_note ?? "退回技師重修" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  // RO 退回維修中
  await supabase
    .from("repair_orders")
    .update({ status: "維修中" })
    .eq("id", ctx.row.repair_order_id)
    .eq("brand_id", ctx.brand);

  // ── RP4 事件時間軸：記錄複檢退回（非阻塞） ──
  {
    const {
      data: { user: _rejectUser },
    } = await supabase.auth.getUser();
    const rejectActorId = _rejectUser?.id ?? null;
    const rejectRoId = ctx.row.repair_order_id as string;
    const rejectReason = reason ?? ctx.row.issue_note ?? "退回技師重修";
    after(async () => {
      await appendRepairOrderEvent(
        rejectRoId,
        {
          action: "final_inspection_rejected",
          payload: {
            inspection_id: id,
            inspection_no: ctx.row.inspection_no,
            reason: rejectReason,
          },
        },
        rejectActorId,
      );
    });
  }

  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function deleteAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const { error } = await supabase.from("final_inspections").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

// 註：原本這裡有 `export type { CheckState }`，但本檔有頂層 "use server"，
// Turbopack 會把 type 再匯出當成值匯出 → 觸發 'A "use server" file can only export
// async functions' + 'CheckState is not defined' 500（completeAction 整支炸、hook#6 不跑）。
// CheckState 沒有任何外部 import，移除此死 re-export。（第十一輪 Phase 2 SA-05 修）
