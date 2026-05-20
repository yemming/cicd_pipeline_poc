"use server";

/**
 * Server actions — /crm/aftersales/nps（M02-7）
 *
 * escalateDetractorAction：把一個批評者回覆標記為「已升級主管介入」。
 *
 * 設計取捨：原本 spec 提案把 detractor 升級成 followup_case，但 followup_cases
 * 表的 source_addon_id 是 NOT NULL FK 到 repair_order_addons（增項閉環模組），
 * NPS detractor 沒有對應的 addon 來源 — 硬塞 fake addon 會污染增項數據。
 *
 * 所以這版改成「軟升級」：寫一筆 escalation marker 到 nps_responses.metadata.escalation，
 * UI 端用 chip 標示「已升級」。未來真的要落地 followup case，要做的是先擴 schema
 * 允許 source_type='nps' + source_nps_id 二選一，不是現在硬幹。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE = "/crm/aftersales/nps";

export async function escalateDetractorAction(
  npsId: string,
  notes: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { userId } = await getCurrentUserAndAdmin();

  // 讀現有 metadata，merge escalation
  const { data: row, error: readErr } = await supabase
    .from("nps_responses")
    .select("id, score, metadata, brand_id, kind")
    .eq("id", npsId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr || !row) return { ok: false, error: "找不到該筆 NPS 回覆" };
  if (row.kind !== "aftersales")
    return { ok: false, error: "僅售後 NPS 回覆可從本頁升級" };
  if (row.score > 6)
    return { ok: false, error: "僅批評者（分數 ≤ 6）可升級主管介入" };

  const cleanNotes = notes.trim();
  if (!cleanNotes) return { ok: false, error: "請輸入升級說明" };

  const currentMeta =
    (row.metadata as Record<string, unknown> | null | undefined) ?? {};
  const nextMeta: Record<string, unknown> = {
    ...currentMeta,
    escalation: {
      escalated_at: new Date().toISOString(),
      escalated_by: userId,
      notes: cleanNotes,
    },
  };

  const { error: updErr } = await supabase
    .from("nps_responses")
    .update({ metadata: nextMeta })
    .eq("id", npsId)
    .eq("brand_id", brand);
  if (updErr) return { ok: false, error: `升級失敗：${updErr.message}` };

  revalidatePath(PAGE);
  return { ok: true, data: { id: npsId } };
}

/** Server-side helper：判斷目前 user 能不能 escalate（給 page.tsx 傳給 board） */
export async function canEscalateDetractor(): Promise<boolean> {
  return await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
}
