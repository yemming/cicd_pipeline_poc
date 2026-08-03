import "server-only";

/**
 * Domain Helper — 電訪任務建立前置檢查（Russell 2026-07-31 CRM 缺口四）
 *
 * 擋止對「請勿聯繫 / 已故」客戶建立 call_tasks（防止系統造成真實傷害的 downside 保護）。
 * 原文假設 customers.status IN ('do_not_contact','deceased')，實際 schema 查證後不存在，
 * 改用新增的 customers.contact_restriction 欄位。
 *
 * 所有建立 call_tasks 的地方都應先呼叫此 function：
 *   - src/domain/sales-call-tasks.ts::createFollowUpTask（共用 helper，涵蓋 D+3/D+7/D+10 等自動任務）
 *   - src/domain/deliveries.ts::scheduleD3FollowupTask
 *   - src/lib/deliveries.ts::scheduleWarrantyReminderTask
 *   - src/lib/sales/call-tasks-actions.ts::createCallTaskAction（人工建立）
 */

import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/domain/audit-logs";

export type CallTaskGuardResult =
  | { allowed: true }
  | { allowed: false; reason: "do_not_contact" | "deceased" };

export async function canCreateCallTask(
  customerId: string,
  brandId: string,
): Promise<CallTaskGuardResult> {
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("contact_restriction")
    .eq("id", customerId)
    .eq("brand_id", brandId)
    .maybeSingle();

  const restriction = customer?.contact_restriction as
    | "do_not_contact"
    | "deceased"
    | null
    | undefined;

  if (!restriction) return { allowed: true };

  await writeAuditLog({
    table_name: "call_tasks",
    record_id: customerId,
    action: "CALL_TASK_BLOCKED",
    brand_id: brandId,
    before: null,
    after: { reason: restriction, customer_id: customerId },
  });

  return { allowed: false, reason: restriction };
}
