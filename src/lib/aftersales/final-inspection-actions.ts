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
// RP4 Layer1 稽核日誌
import { writeAuditLog } from "@/domain/audit-logs";
// RP5：複檢退回超 2 次自動送審
import { requestApproval } from "@/domain/aftersales-approvals";
// RP8 T07：複檢退回→技師+SA 站內通知
import { createInappNotifications } from "@/domain/user-notifications";
import { notifications } from "@/lib/notifications";

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
// 維修工單詳情頁路徑（跟 repair-order-actions.ts 的 PAGE_PATH 保持一致，通知用）
const RO_DETAIL_PATH = "/parts/aftersales/repair-orders";

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
    .select("id, line_no, kind, labor_name, part_name, labor_note, metadata")
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
      metadata: Record<string, unknown> | null;
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

  // 通知售後主管：複檢完成、RO 已推進到「待結帳」（非阻塞，失敗不影響複檢關閉主流程）
  {
    const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");
    const notifyRoId = ctx.row.repair_order_id as string;
    const notifyBrand = ctx.brand;
    after(async () => {
      try {
        const client = await createClient();
        const { data: ro } = await client
          .from("repair_orders")
          .select("ro_code")
          .eq("id", notifyRoId)
          .eq("brand_id", notifyBrand)
          .maybeSingle();
        await notifications.dispatch({
          code: "work_order.status_changed",
          payload: {
            orderNo: ro?.ro_code ?? notifyRoId,
            from: "維修中",
            to: "待結帳",
            actor: "複檢完成（自動推進）",
            actionUrl: `${appUrl}${RO_DETAIL_PATH}/${notifyRoId}`,
          },
        });
      } catch (e) {
        console.error("[複檢完成通知] 推播失敗（不影響）", e);
      }
    });
  }

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

    // ── RP4 Layer1 稽核日誌：複檢通過（非阻塞）──
    after(async () => {
      await writeAuditLog({
        table_name: "final_inspections",
        record_id: id,
        action: "final_inspection_passed",
        actor_id: fiActorId,
        brand_id: ctx.brand,
        before: { status: ctx.row.status },
        after: {
          status: "completed",
          ro_id: fiRoId,
          inspection_no: ctx.row.inspection_no,
          inspector_name: ctx.row.inspector_name ?? null,
        },
      });
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

  const roId = ctx.row.repair_order_id as string;

  // ── RP5：複檢退回超 2 次 → 累積 rework_count，>2 自動送審 ──
  // 先讀 RO metadata，取 rework_count，累積 +1 後寫回；
  // rework_count > 2（即已第 3 次或更多次退回）觸發 reinspect_exceed 授權申請。
  let newReworkCount = 1;
  {
    const { data: roRow } = await supabase
      .from("repair_orders")
      .select("metadata")
      .eq("id", roId)
      .eq("brand_id", ctx.brand)
      .maybeSingle();
    const roPrevMeta = ((roRow?.metadata ?? {}) as Record<string, unknown>);
    const prevCount = typeof roPrevMeta.rework_count === "number" ? roPrevMeta.rework_count : 0;
    newReworkCount = prevCount + 1;

    // 寫回 rework_count 到 RO metadata
    await supabase
      .from("repair_orders")
      .update({
        status: "維修中",
        metadata: { ...roPrevMeta, rework_count: newReworkCount },
        updated_at: new Date().toISOString(),
      })
      .eq("id", roId)
      .eq("brand_id", ctx.brand);
  }

  // ── RP5：rework_count > 2 → 自動送審（非阻塞）──
  if (newReworkCount > 2) {
    after(async () => {
      try {
        const approvalRes = await requestApproval({
          ro_id: roId,
          scenario: "reinspect_exceed",
          notes: `複檢退回第 ${newReworkCount} 次（超過 2 次門檻），系統自動觸發主管授權申請。退回原因：${reason ?? "未填寫"}`,
          context: {
            rework_count: newReworkCount,
            inspection_id: id,
            inspection_no: ctx.row.inspection_no,
            reject_reason: reason ?? ctx.row.issue_note ?? "退回技師重修",
          },
        });
        if (!approvalRes.ok) {
          // 若已有 pending（相同工單同情境），忽略重複送審
          console.log("[RP5 reinspect_exceed] 自動送審結果:", approvalRes.error);
        }
      } catch (e) {
        console.error("[RP5 reinspect_exceed] 自動送審副作用例外（不影響退回）", e);
      }
    });
  }

  // ── RP4 事件時間軸：記錄複檢退回（非阻塞） ──
  {
    const {
      data: { user: _rejectUser },
    } = await supabase.auth.getUser();
    const rejectActorId = _rejectUser?.id ?? null;
    const rejectReason = reason ?? ctx.row.issue_note ?? "退回技師重修";
    after(async () => {
      await appendRepairOrderEvent(
        roId,
        {
          action: "final_inspection_rejected",
          payload: {
            inspection_id: id,
            inspection_no: ctx.row.inspection_no,
            reason: rejectReason,
            rework_count: newReworkCount,
          },
        },
        rejectActorId,
      );
    });
  }

  // ── RP8 T07：複檢退回 → 技師（lead tech）+ SA 各收一則站內通知 ──
  // 非阻塞，失敗不影響主流程。
  // 收件人：① RO.lead_technician_id → employees.user_id（施工技師）
  //          ② RO.sa_id → employees.user_id（服務顧問）
  after(async () => {
    try {
      const sb = await createClient();
      const { data: ro } = await sb
        .from("repair_orders")
        .select("ro_code, sa_id, lead_technician_id")
        .eq("id", roId)
        .eq("brand_id", ctx.brand)
        .maybeSingle();
      if (!ro) return;

      const rejectReason = reason ?? ctx.row.issue_note ?? "退回技師重修";
      const inspNo = ctx.row.inspection_no as string | null;
      const notifTitle = `複檢退回重工 — ${ro.ro_code ?? ""}`;
      const notifBody = `複檢單 ${inspNo ?? ""} 退回（第 ${newReworkCount} 次）。原因：${rejectReason}`;
      const notifHref = `/parts/aftersales/repair-orders/${roId}`;

      // 收集收件人 user_id（去重）
      const empIds = [ro.sa_id, ro.lead_technician_id].filter(
        (v): v is string => Boolean(v),
      );
      if (empIds.length === 0) return;

      const { data: emps } = await sb
        .from("employees")
        .select("id, user_id")
        .in("id", empIds)
        .not("user_id", "is", null);
      if (!emps || emps.length === 0) return;

      // 去重（同一人可能既是 SA 又是 lead tech，避免重複送）
      const uniqueUserIds = [
        ...new Set((emps as Array<{ id: string; user_id: string | null }>)
          .map((e) => e.user_id)
          .filter((v): v is string => Boolean(v))),
      ];

      await createInappNotifications(
        uniqueUserIds.map((uid) => ({
          recipient_user_id: uid,
          event_code: "aftersales.final_inspection.rejected",
          title: notifTitle,
          body: notifBody,
          href: notifHref,
          priority: "red" as const,
          source_ro_id: roId,
          source_ro_code: ro.ro_code ?? undefined,
          brand_id: ctx.brand,
        })),
      );
    } catch (e) {
      console.error("[RP8 T07 複檢退回通知] 副作用例外（不影響退回）", e);
    }
  });

  // ── RP4 Layer1 稽核日誌：複檢退回（非阻塞）──
  {
    const {
      data: { user: _auditUser },
    } = await supabase.auth.getUser();
    const auditActorId = _auditUser?.id ?? null;
    const rejectReasonLog = reason ?? ctx.row.issue_note ?? "退回技師重修";
    after(async () => {
      await writeAuditLog({
        table_name: "final_inspections",
        record_id: id,
        action: "final_inspection_rejected",
        actor_id: auditActorId,
        brand_id: ctx.brand,
        before: { status: ctx.row.status },
        after: {
          status: "rejected",
          ro_id: roId,
          inspection_no: ctx.row.inspection_no,
          reason: rejectReasonLog,
          rework_count: newReworkCount,
        },
      });
    });
  }

  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  revalidatePath("/parts/aftersales/repair-orders");
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
