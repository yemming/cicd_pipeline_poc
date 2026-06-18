"use server";

/**
 * Server Actions — Parts Warranty RO-Link 狀態流動作
 *
 * 配對 helper：`@/domain/parts-warranty`
 * 對外型別：`ActionResult<T>` — 不 redirect，由 client 自控導航。
 *
 * ⚠️ 2026-06-18 Russell 裁示：
 *   - 底層改讀寫 warranty_claims（單一事實表）
 *   - 移除對 warranty_claim_receivables 的 syncReceivable 同步
 *     （應收 / AR 凍結，交未來會計系統；事實層不再寫 AR）
 *   - 狀態流：submit→status='submitted'；approve→'approved'；
 *             reimburse→'received'；reject→'rejected'
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { notifications } from "@/lib/notifications";

const RO_LINK_PATH = "/parts/warranty/ro-link";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * draft → submitted（送件原廠審核）
 */
export async function submitClaim(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 改讀 warranty_claims
  const existing = await supabase
    .from("warranty_claims")
    .select("status, ro_id, applied_amount, brand_id")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  // 相容舊值 reviewing / under_review；也允許 draft
  if (!["draft", "reviewing", "submitted", "under_review"].includes(existing.data.status)) {
    return { ok: false, error: "此單已超過送件狀態" };
  }

  const submittedAt = new Date().toISOString();
  // warranty_claims 無 status_label 欄位，寫 metadata 保留顯示資訊
  const { data: cur } = await supabase
    .from("warranty_claims")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();
  const newMeta = { ...(cur?.metadata as Record<string, unknown> ?? {}), status_label: "送件審核" };

  const { error } = await supabase
    .from("warranty_claims")
    .update({
      status: "submitted",
      submitted_at: submittedAt,
      metadata: newMeta,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `送件失敗：${error.message}` };

  // ⚠️ syncReceivable 已移除（Russell 裁示：AR 凍結）

  revalidatePath(RO_LINK_PATH);
  return { ok: true, data: { id } };
}

/**
 * submitted → approved（原廠核准）
 */
export async function markApproved(
  id: string,
  approvedAmount?: number,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 改讀 warranty_claims（applied_amount 取代 apply_amount）
  const existing = await supabase
    .from("warranty_claims")
    .select("status, applied_amount, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  // 相容舊值 reviewing / under_review
  if (!["submitted", "reviewing", "under_review"].includes(existing.data.status)) {
    return { ok: false, error: "僅送件審核中的索賠單可標記核准" };
  }

  const amt =
    typeof approvedAmount === "number" && approvedAmount >= 0
      ? approvedAmount
      : Number(existing.data.applied_amount);

  const newMeta = {
    ...(existing.data.metadata as Record<string, unknown> ?? {}),
    status_label: "已核准等撥款",
  };

  // warranty_claims 無 status_label 欄，改存 metadata
  const { error } = await supabase
    .from("warranty_claims")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_amount: amt,
      metadata: newMeta,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `核准失敗：${error.message}` };

  // ⚠️ syncReceivable 已移除（Russell 裁示：AR 凍結）

  revalidatePath(RO_LINK_PATH);
  return { ok: true, data: { id } };
}

/**
 * approved → received（撥款入帳；warranty_claims 狀態 = 'received'）
 */
export async function markReimbursed(
  id: string,
  amount?: number,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 改讀 warranty_claims
  const existing = await supabase
    .from("warranty_claims")
    .select("status, approved_amount, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  // 相容 partial_approved（normalize 後也是 approved）
  if (!["approved", "partial_approved"].includes(existing.data.status)) {
    return { ok: false, error: "僅已核准的索賠單可標記撥款" };
  }

  const now = new Date();
  const finalAmount =
    typeof amount === "number" && amount >= 0
      ? amount
      : Number(existing.data.approved_amount ?? 0);

  const newMeta = {
    ...(existing.data.metadata as Record<string, unknown> ?? {}),
    status_label: "已撥款",
  };

  // warranty_claims：reimbursed_at → received_at；status → 'received'
  const { error } = await supabase
    .from("warranty_claims")
    .update({
      status: "received",
      received_at: now.toISOString(),                         // reimbursed_at → received_at
      approved_amount: finalAmount,
      forecast_receipt_date: now.toISOString().slice(0, 10), // expected_pay_date → forecast_receipt_date
      metadata: newMeta,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `撥款標記失敗：${error.message}` };

  // ⚠️ syncReceivable 已移除（Russell 裁示：AR 凍結）

  revalidatePath(RO_LINK_PATH);
  revalidatePath("/parts/warranty/cost-recovery");
  return { ok: true, data: { id } };
}

/**
 * submitted → rejected（原廠駁回；warranty_claims 狀態 = 'rejected'）
 */
export async function markRejected(
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  if (!reason.trim()) return { ok: false, error: "請填寫駁回原因" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 改讀 warranty_claims
  const existing = await supabase
    .from("warranty_claims")
    .select("status, notes, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  // 相容 under_review / partial_approved
  if (!["submitted", "reviewing", "under_review", "approved", "partial_approved"].includes(existing.data.status)) {
    return { ok: false, error: "此單目前不可駁回" };
  }

  const newMeta = {
    ...(existing.data.metadata as Record<string, unknown> ?? {}),
    status_label: "原廠駁回",
  };

  const { error } = await supabase
    .from("warranty_claims")
    .update({
      status: "rejected",
      notes: reason.trim(),
      metadata: newMeta,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `駁回失敗：${error.message}` };

  // ⚠️ syncReceivable 已移除（Russell 裁示：AR 凍結）

  revalidatePath(RO_LINK_PATH);
  return { ok: true, data: { id } };
}

/**
 * 派送「催促」LINE 推播 — 透過 Notification Hub + `after()` 非阻塞。
 *
 * 為了不擴 EventCode union，借用既有的 `work_order.status_changed` 通道
 * （payload 自由），訊息內容由 client 端 status_label 補充辨識度。
 */
export async function sendUrgentReminder(
  claimId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 改讀 warranty_claims；sla_days 用常數 21
  const existing = await supabase
    .from("warranty_claims")
    .select(
      "id, cl_no, ro_id, status, submitted_at, applied_amount, metadata",
    )
    .eq("id", claimId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  // 相容 under_review / partial_approved
  if (!["submitted", "reviewing", "under_review", "approved", "partial_approved"].includes(existing.data.status)) {
    return { ok: false, error: "僅送件審核中 / 等撥款的單需要催促" };
  }

  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");
  const claimNo = existing.data.cl_no;
  // item_label 從 metadata 讀
  const meta = existing.data.metadata as Record<string, unknown> | null ?? {};
  const itemLabel = (meta.item_label as string | null) ?? "—";
  // ro_no 顯示：metadata.orig_ro_no 或空
  const roNo = (meta.orig_ro_no as string | null) ?? null;
  const submittedAt = existing.data.submitted_at;
  const SLA_DAYS = 21; // warranty_claims 無 sla_days 欄

  let daysOverdue = 0;
  if (submittedAt) {
    const sub = new Date(submittedAt);
    const deadline = new Date(sub.getTime() + SLA_DAYS * 86400000);
    daysOverdue = Math.max(
      0,
      Math.floor((Date.now() - deadline.getTime()) / 86400000),
    );
  }

  after(async () => {
    try {
      await notifications.dispatch({
        code: "work_order.status_changed",
        payload: {
          // 借用 work_order schema：把 claim 視為一張「保固工單」推播
          workOrderId: claimId,
          workOrderNo: claimNo,
          previousStatus: existing.data!.status,
          nextStatus: "urgent_reminder",
          subject: `⚠️ 保固索賠催促｜${claimNo}`,
          description: `項目：${itemLabel}${roNo ? ` / RO ${roNo}` : ""}${
            daysOverdue > 0 ? ` ｜已過 SLA ${daysOverdue} 天` : ""
          }`,
          actionUrl: `${appUrl}/parts/warranty/ro-link?focus=${claimId}`,
        },
      });
    } catch (e) {
      console.error(
        "[parts-warranty] 催促 LINE 推播失敗（不影響本次標記）",
        e,
      );
    }
  });

  revalidatePath(RO_LINK_PATH);
  return { ok: true, data: { id: claimId } };
}
