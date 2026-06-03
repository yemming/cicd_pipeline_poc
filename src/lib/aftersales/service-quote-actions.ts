"use server";

/**
 * Server actions — 04B 快速報價查詢「三結果閉環」
 *
 * Spec：04B_快速報價查詢_v1.html → 同意 / 暫存 / 拒絕 三按鈕
 *  - saveQuoteAction：建 service_quotes + service_quote_lines（status=pending 暫存 或 agreed 同意）
 *  - applyQuoteToInspectionAction：status=agreed，並把報價寫回來源預檢單 metadata（apply-to-inspection 回帶）
 *  - rejectQuoteAction：status=rejected + reason，逐筆寫 vehicle_pending_items（下次回廠帶出）
 *
 * 表 service_quotes/service_quote_lines/vehicle_pending_items 由 migration aftersales_full_loop_g1 建。
 * 天條：UI 不直連 supabase；brand 走 getActiveScope()。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type QuoteLineInput = {
  kind: "labor" | "part";
  sku?: string | null;
  name: string;
  qty?: number | null;
  lu?: number | null;
  unitPrice?: number | null;
  subtotal?: number | null;
};

export type SaveQuoteInput = {
  vehicleId?: string | null;
  preInspectionId?: string | null;
  status?: "pending" | "agreed";
  lines: QuoteLineInput[];
  total?: number | null;
};

/** 建報價單（同意=agreed 直接帶回；暫存=pending）。 */
export async function saveQuoteAction(
  input: SaveQuoteInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  if (!input.lines?.length) return { ok: false, error: "報價內容不可為空" };

  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();

  const { data: quote, error } = await supabase
    .from("service_quotes")
    .insert({
      brand_id: scope.brand_id,
      vehicle_id: input.vehicleId ?? null,
      pre_inspection_id: input.preInspectionId ?? null,
      status: input.status ?? "pending",
      total: input.total ?? null,
      created_by: me.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const lines = input.lines.map((l) => ({
    quote_id: quote.id,
    kind: l.kind,
    sku: l.sku ?? null,
    name: l.name,
    qty: l.qty ?? null,
    lu: l.lu ?? null,
    unit_price: l.unitPrice ?? null,
    subtotal: l.subtotal ?? null,
  }));
  const { error: lErr } = await supabase.from("service_quote_lines").insert(lines);
  if (lErr) return { ok: false, error: lErr.message };

  revalidatePath("/parts/aftersales/quick-quote");
  return { ok: true, data: { id: quote.id } };
}

/** 同意 → status=agreed + 寫回來源預檢單 metadata.applied_quote（apply-to-inspection）。 */
export async function applyQuoteToInspectionAction(
  quoteId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("service_quotes")
    .select("id, pre_inspection_id, total")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, error: "找不到報價單" };

  const { error } = await supabase
    .from("service_quotes")
    .update({ status: "agreed" })
    .eq("id", quoteId);
  if (error) return { ok: false, error: error.message };

  // 回帶到預檢單（若有來源）：把 applied_quote 寫進 pre_inspections.metadata
  if (quote.pre_inspection_id) {
    const { data: pi } = await supabase
      .from("pre_inspections")
      .select("metadata")
      .eq("id", quote.pre_inspection_id)
      .maybeSingle();
    const meta = (pi?.metadata as Record<string, unknown> | null) ?? {};
    await supabase
      .from("pre_inspections")
      .update({
        metadata: { ...meta, applied_quote: { quote_id: quoteId, total: quote.total } },
      })
      .eq("id", quote.pre_inspection_id);
    revalidatePath(`/parts/aftersales/pre-inspections/${quote.pre_inspection_id}`);
  }
  revalidatePath("/parts/aftersales/quick-quote");
  return { ok: true, data: { id: quoteId } };
}

/** 拒絕 → status=rejected + reason，逐筆寫 vehicle_pending_items（下次回廠帶出）。 */
export async function rejectQuoteAction(
  quoteId: string,
  reason: string,
): Promise<ActionResult<{ id: string; pendingCount: number }>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  const r = (reason ?? "").trim();
  if (!r) return { ok: false, error: "請填拒絕原因（供下次回廠提醒）" };

  const scope = await getActiveScope();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("service_quotes")
    .select("id, vehicle_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, error: "找不到報價單" };

  const { error } = await supabase
    .from("service_quotes")
    .update({ status: "rejected", reject_reason: r })
    .eq("id", quoteId);
  if (error) return { ok: false, error: error.message };

  let pendingCount = 0;
  if (quote.vehicle_id) {
    const { data: lines } = await supabase
      .from("service_quote_lines")
      .select("name")
      .eq("quote_id", quoteId);
    const pending = (lines ?? []).map((l) => ({
      brand_id: scope.brand_id,
      vehicle_id: quote.vehicle_id,
      source_quote_id: quoteId,
      item_desc: l.name,
      reason: r,
      status: "pending",
    }));
    if (pending.length) {
      const { error: pErr } = await supabase.from("vehicle_pending_items").insert(pending);
      if (pErr) return { ok: false, error: pErr.message };
      pendingCount = pending.length;
    }
  }
  revalidatePath("/parts/aftersales/quick-quote");
  return { ok: true, data: { id: quoteId, pendingCount } };
}
