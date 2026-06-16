"use server";

/**
 * Server Actions — Parts Warranty RO-Link 狀態流動作
 *
 * 配對 helper：`@/domain/parts-warranty`
 * 對外型別：`ActionResult<T>` — 不 redirect，由 client 自控導航。
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { notifications } from "@/lib/notifications";

// ────────────────────────────────────────────────────────────────────────────
// warranty_claim_receivables 同步輔助（非阻斷，失敗只 console.error）
// ────────────────────────────────────────────────────────────────────────────
type ReceivableClaimStatus = "pending" | "submitted" | "approved" | "rejected" | "paid";

/** upsert / update warranty_claim_receivables，不 throw（cron 安全） */
async function syncReceivable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claimId: string,
  patch: {
    claim_status: ReceivableClaimStatus;
    brand_id?: string;
    workorder_id?: string | null;
    claim_amount?: number;
    submitted_at?: string;
    paid_at?: string;
    store_id?: string | null;
  },
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    if (patch.claim_status === "submitted") {
      // upsert（idempotent，conflict on claim_id）
      const { error } = await sb
        .from("warranty_claim_receivables")
        .upsert(
          {
            claim_id: claimId,
            brand_id: patch.brand_id,
            workorder_id: patch.workorder_id ?? null,
            claim_amount: patch.claim_amount ?? 0,
            claim_status: "submitted",
            submitted_at: patch.submitted_at ?? new Date().toISOString(),
            store_id: patch.store_id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "claim_id" },
        );
      if (error) throw error;
    } else {
      const updatePayload: Record<string, unknown> = {
        claim_status: patch.claim_status,
        updated_at: new Date().toISOString(),
      };
      if (typeof patch.claim_amount === "number") updatePayload.claim_amount = patch.claim_amount;
      if (patch.paid_at) updatePayload.paid_at = patch.paid_at;

      const { error } = await sb
        .from("warranty_claim_receivables")
        .update(updatePayload)
        .eq("claim_id", claimId)
        .eq("brand_id", patch.brand_id);
      if (error) throw error;
    }
  } catch (e) {
    console.error("[parts-warranty] warranty_claim_receivables 同步失敗（不影響主流程）", claimId, e);
  }
}

const RO_LINK_PATH = "/parts/warranty/ro-link";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * draft → submitted（送件原廠審核）
 *
 * 規格 normalize 後是 "submitted"，DB 寫的也是 "submitted"；cost-recovery 用的
 * "reviewing" 是 alias，listWarrantyClaims 會 normalize 回 submitted。
 */
export async function submitClaim(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const existing = await supabase
    .from("parts_warranty_claims")
    .select("status, ro_id, apply_amount, brand_id")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  if (!["draft", "reviewing", "submitted"].includes(existing.data.status)) {
    return { ok: false, error: "此單已超過送件狀態" };
  }

  const submittedAt = new Date().toISOString();
  const { error } = await supabase
    .from("parts_warranty_claims")
    .update({
      status: "submitted",
      status_label: "送件審核",
      submitted_at: submittedAt,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `送件失敗：${error.message}` };

  // 同步應收款（upsert idempotent，非阻斷）
  const scope = await getActiveScope();
  await syncReceivable(supabase, id, {
    claim_status: "submitted",
    brand_id: brand,
    workorder_id: existing.data.ro_id ?? null,
    claim_amount: Number(existing.data.apply_amount),
    submitted_at: submittedAt,
    store_id: scope.store_id ?? null,
  });

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

  const existing = await supabase
    .from("parts_warranty_claims")
    .select("status, apply_amount")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  if (!["submitted", "reviewing"].includes(existing.data.status)) {
    return { ok: false, error: "僅送件審核中的索賠單可標記核准" };
  }

  const amt =
    typeof approvedAmount === "number" && approvedAmount >= 0
      ? approvedAmount
      : Number(existing.data.apply_amount);

  const { error } = await supabase
    .from("parts_warranty_claims")
    .update({
      status: "approved",
      status_label: "已核准等撥款",
      approved_at: new Date().toISOString(),
      approved_amount: amt,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `核准失敗：${error.message}` };

  // 同步應收款（非阻斷）
  await syncReceivable(supabase, id, {
    claim_status: "approved",
    brand_id: brand,
    ...(typeof approvedAmount === "number" && approvedAmount >= 0
      ? { claim_amount: approvedAmount }
      : {}),
  });

  revalidatePath(RO_LINK_PATH);
  return { ok: true, data: { id } };
}

/**
 * approved → reimbursed（撥款入帳）
 */
export async function markReimbursed(
  id: string,
  amount?: number,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const existing = await supabase
    .from("parts_warranty_claims")
    .select("status, approved_amount")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  if (existing.data.status !== "approved") {
    return { ok: false, error: "僅已核准的索賠單可標記撥款" };
  }

  // 沿用 cost-recovery 命名：DB 內寫 paid，helper 對外 normalize 成 reimbursed
  const now = new Date();
  const finalAmount =
    typeof amount === "number" && amount >= 0
      ? amount
      : Number(existing.data.approved_amount);

  const { error } = await supabase
    .from("parts_warranty_claims")
    .update({
      status: "paid",
      status_label: "已撥款",
      reimbursed_at: now.toISOString(),
      approved_amount: finalAmount,
      expected_pay_date: now.toISOString().slice(0, 10),
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `撥款標記失敗：${error.message}` };

  // 同步應收款（非阻斷）
  await syncReceivable(supabase, id, {
    claim_status: "paid",
    brand_id: brand,
    claim_amount: finalAmount,
    paid_at: now.toISOString(),
  });

  revalidatePath(RO_LINK_PATH);
  revalidatePath("/parts/warranty/cost-recovery");
  return { ok: true, data: { id } };
}

/**
 * submitted → rejected（原廠駁回）
 */
export async function markRejected(
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  if (!reason.trim()) return { ok: false, error: "請填寫駁回原因" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const existing = await supabase
    .from("parts_warranty_claims")
    .select("status, notes")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  if (!["submitted", "reviewing", "approved"].includes(existing.data.status)) {
    return { ok: false, error: "此單目前不可駁回" };
  }

  const { error } = await supabase
    .from("parts_warranty_claims")
    .update({
      status: "rejected",
      status_label: "原廠駁回",
      notes: reason.trim(),
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `駁回失敗：${error.message}` };

  // 同步應收款（非阻斷）
  await syncReceivable(supabase, id, {
    claim_status: "rejected",
    brand_id: brand,
  });

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

  const existing = await supabase
    .from("parts_warranty_claims")
    .select(
      "id, claim_no, ro_no, item_label, status, submitted_at, sla_days, apply_amount",
    )
    .eq("id", claimId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  if (!["submitted", "reviewing", "approved"].includes(existing.data.status)) {
    return { ok: false, error: "僅送件審核中 / 等撥款的單需要催促" };
  }

  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");
  const claimNo = existing.data.claim_no;
  const itemLabel = existing.data.item_label;
  const roNo = existing.data.ro_no;
  const submittedAt = existing.data.submitted_at;

  let daysOverdue = 0;
  if (submittedAt) {
    const sub = new Date(submittedAt);
    const deadline = new Date(
      sub.getTime() + (existing.data.sla_days ?? 21) * 86400000,
    );
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
