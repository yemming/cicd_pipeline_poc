"use server";

/**
 * Server actions — RP5 授權申請入口（各頁面可 import）
 *
 * 三個情境的申請動作獨立為一個 lib 檔，供跨路由的 client component import：
 *   - requestCancelOrderApprovalAction：工單中途取消送審
 *   - requestFeeUnlockApprovalAction：費用鎖定後修改送審
 *
 * 注意：requestWarrantyGraceAction 和 decideApprovalAction 留在
 *   src/app/(workspace)/parts/aftersales/approvals/[roId]/actions.ts
 *   供授權頁面自用。
 */

import { revalidatePath } from "next/cache";
import { requestApproval } from "@/domain/aftersales-approvals";

type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * requestCancelOrderApprovalAction — SA 申請工單中途取消（情境 cancel_order）。
 *
 * 觸發後：
 *   1. requestApproval("cancel_order") 寫入 metadata.approvals[]
 *   2. 工單狀態不立即切換（等主管核准後，SA 再透過狀態快切執行）
 *   3. 主管收到 LINE / 站內通知
 *
 * 後端 guard：updateRepairOrderStatusAction 轉「已關閉-中途取消」前
 *   呼叫 hasApprovedApproval(roId, "cancel_order") 確認已核准才放行。
 */
export async function requestCancelOrderApprovalAction(
  roId: string,
  notes: string,
): Promise<ActionResult<{ approval_id: string }>> {
  if (!notes.trim()) return { ok: false, error: "請填寫取消原因" };
  const res = await requestApproval({
    ro_id: roId,
    scenario: "cancel_order",
    notes: notes.trim(),
    context: { initiated_via: "repair_order_detail" },
  });
  if (res.ok) {
    revalidatePath(`/parts/aftersales/repair-orders/${roId}`);
    revalidatePath(`/parts/aftersales/approvals/${roId}`);
  }
  return res;
}

/**
 * requestFeeUnlockApprovalAction — SA 申請結帳費用鎖定後修改（情境 fee_unlock）。
 *
 * 觸發後：
 *   1. requestApproval("fee_unlock") 寫入 metadata.approvals[]
 *   2. 費用鎖定狀態不立即解除（等主管核准後，由主管執行 clearSignAction）
 *   3. 主管收到 LINE / 站內通知
 */
export async function requestFeeUnlockApprovalAction(
  roId: string,
  checkoutId: string,
  notes: string,
): Promise<ActionResult<{ approval_id: string }>> {
  if (!notes.trim()) return { ok: false, error: "請填寫修改原因" };
  const res = await requestApproval({
    ro_id: roId,
    scenario: "fee_unlock",
    notes: notes.trim(),
    context: { checkout_id: checkoutId, initiated_via: "checkout_wizard" },
  });
  if (res.ok) {
    revalidatePath(`/parts/aftersales/checkout/${checkoutId}`);
    revalidatePath(`/parts/aftersales/approvals/${roId}`);
  }
  return res;
}
