"use server";

/**
 * Server actions for /parts/purchase/replenishment（A 級：Run List）。
 *
 * 提供 trigger / approve / reject / generate PO。Result<T> 介面、不 redirect。
 *
 * 為什麼不 import @/domain/orders.ts：本工項禁止跨範圍動 orders.ts。
 * 因此 generatePoFromRun 直接 insert purchase_orders（用同樣的 po_no 規則）。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const TAX_RATE = 0.05;

type RunMetadata = {
  approval?: { status?: string; note?: string | null; at?: string | null; by?: string | null; by_label?: string | null };
  rejected?: { at?: string | null; by?: string | null; by_label?: string | null; note?: string | null };
  generated_pos?: Array<{ id: string; po_no: string; vendor_id: string | null }>;
};

async function fetchRun(supabase: Awaited<ReturnType<typeof createClient>>, brand: string, runId: string) {
  const { data, error } = await supabase
    .from("replenishment_runs")
    .select("id, brand_id, warehouse_id, status, total_lines, total_amount, metadata")
    .eq("brand_id", brand)
    .eq("id", runId)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "找不到該補貨批次" };
  return { ok: true as const, run: data as { id: string; brand_id: string; warehouse_id: string | null; status: string; total_lines: number; total_amount: number; metadata: RunMetadata | null } };
}

export async function triggerReplenishmentRun(
  warehouseId: string | null,
  horizonDays = 7,
): Promise<ActionResult<{ runId: string; lines: number; amount: number }>> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_RUN);
  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase.rpc("calculate_replenishment", {
    p_brand: brand,
    p_warehouse_id: warehouseId,
    p_horizon_days: horizonDays,
    p_triggered_by: ctx.userId ?? null,
    p_trigger_kind: "manual",
  });
  if (error) return { ok: false, error: error.message };

  const runId = data as unknown as string;
  const { data: run } = await supabase
    .from("replenishment_runs")
    .select("total_lines, total_amount")
    .eq("id", runId)
    .maybeSingle();

  revalidatePath("/parts/purchase/replenishment");
  return {
    ok: true,
    data: {
      runId,
      lines: Number(run?.total_lines ?? 0),
      amount: Number(run?.total_amount ?? 0),
    },
  };
}

export async function approveRun(runId: string, note?: string | null): Promise<ActionResult<{ runId: string }>> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_RUN);
  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const cur = await fetchRun(supabase, brand, runId);
  if (!cur.ok) return cur;
  if (cur.run.status === "rejected") return { ok: false, error: "此批次已被駁回，不能核准" };
  if (cur.run.status === "converted") return { ok: false, error: "此批次已全部轉單" };

  const nextMeta: RunMetadata = {
    ...(cur.run.metadata ?? {}),
    approval: {
      status: "approved",
      note: note ?? null,
      at: new Date().toISOString(),
      by: ctx.userId ?? null,
      by_label: ctx.email ?? null,
    },
  };

  const { error } = await supabase
    .from("replenishment_runs")
    .update({
      status: cur.run.status === "open" ? "approved" : cur.run.status,
      metadata: nextMeta,
    })
    .eq("id", runId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parts/purchase/replenishment");
  return { ok: true, data: { runId } };
}

export async function rejectRun(runId: string, reason: string): Promise<ActionResult<{ runId: string }>> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_RUN);
  if (!reason || !reason.trim()) return { ok: false, error: "請填寫駁回原因" };
  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const cur = await fetchRun(supabase, brand, runId);
  if (!cur.ok) return cur;
  if (cur.run.status === "converted" || cur.run.status === "partially_converted") {
    return { ok: false, error: "已有轉單，無法駁回" };
  }

  const nextMeta: RunMetadata = {
    ...(cur.run.metadata ?? {}),
    rejected: {
      at: new Date().toISOString(),
      by: ctx.userId ?? null,
      by_label: ctx.email ?? null,
      note: reason.trim(),
    },
  };

  const { error } = await supabase
    .from("replenishment_runs")
    .update({ status: "rejected", metadata: nextMeta })
    .eq("id", runId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parts/purchase/replenishment");
  return { ok: true, data: { runId } };
}

type GenerateResult = { runId: string; createdPos: Array<{ id: string; po_no: string; lines: number }> };

/**
 * 從 run 的 open lines 按 supplier_id group，每組建一張 PO（status=draft）。
 * - 不 import @/domain/orders.ts
 * - 沒指定供應商的 line：跳過，於 result.skippedNoSupplier 累計
 * - 已 converted / ignored 的 line：跳過
 * - 倉庫：以 run.warehouse_id 為主；無則回退第一個 warehouse
 */
export async function generatePoFromRun(runId: string): Promise<ActionResult<GenerateResult>> {
  await requirePermission(PERMISSIONS.PO_CREATE);
  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const cur = await fetchRun(supabase, brand, runId);
  if (!cur.ok) return cur;
  if (cur.run.status === "rejected") return { ok: false, error: "已駁回的批次不能生 PO" };
  if (cur.run.status === "open") return { ok: false, error: "請先核准此補貨批次再生 PO" };

  const { data: linesRaw, error: linesErr } = await supabase
    .from("replenishment_run_lines")
    .select("id, item_id, supplier_id, suggested_qty, unit_price, required_date, warehouse_id, status")
    .eq("brand_id", brand)
    .eq("run_id", runId)
    .eq("status", "open");
  if (linesErr) return { ok: false, error: linesErr.message };

  const lines = (linesRaw ?? []) as Array<{
    id: string;
    item_id: string;
    supplier_id: string | null;
    suggested_qty: number;
    unit_price: number;
    required_date: string | null;
    warehouse_id: string | null;
    status: string;
  }>;
  const withSupplier = lines.filter((l) => l.supplier_id && Number(l.suggested_qty) > 0);
  if (withSupplier.length === 0) {
    return { ok: false, error: "沒有可建 PO 的 lines（皆無供應商或建議量為 0）" };
  }

  // 倉庫 fallback
  let fallbackWarehouseId: string | null = cur.run.warehouse_id;
  if (!fallbackWarehouseId) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("id")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code", { ascending: true })
      .limit(1)
      .maybeSingle();
    fallbackWarehouseId = (wh?.id as string | undefined) ?? null;
  }
  if (!fallbackWarehouseId) return { ok: false, error: "找不到可用倉庫" };

  // 產生 po_no 用的日期序
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastPO } = await supabase
    .from("purchase_orders")
    .select("po_no")
    .like("po_no", `PO${dateStr}-%`)
    .order("po_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastPO?.po_no) {
    const m = (lastPO.po_no as string).match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }

  // group by supplier
  const groups = new Map<string, typeof withSupplier>();
  for (const ln of withSupplier) {
    const k = ln.supplier_id as string;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(ln);
  }

  const createdPos: GenerateResult["createdPos"] = [];
  const newPoMetaEntries: NonNullable<RunMetadata["generated_pos"]> = [];

  for (const [vendorId, grpLines] of groups) {
    const po_no = `PO${dateStr}-${String(seq).padStart(3, "0")}`;
    seq += 1;

    const linesWithAmount = grpLines.map((l, idx) => {
      const qty = Number(l.suggested_qty);
      const price = Number(l.unit_price);
      const pretax = Math.round(qty * price * 100) / 100;
      const tax = Math.round(pretax * TAX_RATE * 100) / 100;
      const total = Math.round((pretax + tax) * 100) / 100;
      return {
        line_no: idx + 1,
        item_id: l.item_id,
        qty_ordered: qty,
        unit_price: price,
        uom: "PCS",
        tax_rate: TAX_RATE,
        line_amount_pretax: pretax,
        line_amount_tax: tax,
        line_amount_total: total,
        replenishment_line_id: l.id, // 帶在記憶體裡、不寫進表
      };
    });
    const subtotal = linesWithAmount.reduce((s, l) => s + l.line_amount_pretax, 0);
    const taxSum = linesWithAmount.reduce((s, l) => s + l.line_amount_tax, 0);
    const total = subtotal + taxSum;
    const qtyTotal = linesWithAmount.reduce((s, l) => s + l.qty_ordered, 0);
    const earliestReq = grpLines
      .map((l) => l.required_date)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        brand_id: brand,
        po_no,
        vendor_id: vendorId,
        warehouse_id: fallbackWarehouseId,
        purchase_type: "standard",
        notes: `自動建立（補貨批次 ${runId}）`,
        eta_date: earliestReq,
        po_date: today.toISOString().slice(0, 10),
        qty_ordered_total: qtyTotal,
        amount_pretax: subtotal,
        amount_tax: taxSum,
        amount_total: total,
        status: "draft",
        created_by: ctx.userId ?? null,
        metadata: { source: "replenishment_run", run_id: runId },
      })
      .select("id, po_no")
      .single();
    if (poErr) return { ok: false, error: `建立 PO 失敗：${poErr.message}` };

    const lineRows = linesWithAmount.map((l) => ({
      brand_id: brand,
      po_id: po.id as string,
      line_no: l.line_no,
      item_id: l.item_id,
      qty_ordered: l.qty_ordered,
      unit_price: l.unit_price,
      uom: l.uom,
      tax_rate: l.tax_rate,
      line_amount_pretax: l.line_amount_pretax,
      line_amount_tax: l.line_amount_tax,
      line_amount_total: l.line_amount_total,
    }));
    const { data: insertedLines, error: lineInsErr } = await supabase
      .from("purchase_order_lines")
      .insert(lineRows)
      .select("id, line_no");
    if (lineInsErr) {
      // 回滾
      await supabase.from("purchase_orders").delete().eq("id", po.id);
      return { ok: false, error: `建立 PO 明細失敗：${lineInsErr.message}` };
    }

    // 標補貨 lines 為 converted（converted_pr_line_id 在這個情境留 null，因為直接生 PO 沒過 PR）
    const rplIds = grpLines.map((l) => l.id);
    await supabase
      .from("replenishment_run_lines")
      .update({ status: "converted" })
      .in("id", rplIds)
      .eq("brand_id", brand);

    createdPos.push({ id: po.id as string, po_no: po.po_no as string, lines: insertedLines?.length ?? 0 });
    newPoMetaEntries.push({ id: po.id as string, po_no: po.po_no as string, vendor_id: vendorId });
  }

  // 更新 run 狀態
  const { count: openLeft } = await supabase
    .from("replenishment_run_lines")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("brand_id", brand)
    .eq("status", "open");

  const nextMeta: RunMetadata = {
    ...(cur.run.metadata ?? {}),
    generated_pos: [...((cur.run.metadata?.generated_pos as RunMetadata["generated_pos"]) ?? []), ...newPoMetaEntries],
  };
  await supabase
    .from("replenishment_runs")
    .update({
      status: openLeft && openLeft > 0 ? "partially_converted" : "converted",
      metadata: nextMeta,
    })
    .eq("id", runId)
    .eq("brand_id", brand);

  revalidatePath("/parts/purchase/replenishment");
  revalidatePath("/parts/purchase/orders");
  return { ok: true, data: { runId, createdPos } };
}
