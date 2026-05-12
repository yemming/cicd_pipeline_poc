"use server";

/**
 * Domain Helper — Replenishment（日常補貨計畫，§4.2）
 *
 * 取代 src/lib/parts/replenishment-actions.ts（2026-05-11 升級）
 * 提案：docs/proposals/feature-purchase-replenishment-2026-05-11.md
 *
 * 純遷移：函式名與內部邏輯維持原樣，僅將檔案位置由 lib/parts 移至 domain/。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type RunReplenishmentResult =
  | { ok: true; runId: string; lines: number; amount: number }
  | { ok: false; error: string };

export async function runReplenishment(input: {
  warehouseId?: string | null;
  horizonDays?: number;
}): Promise<RunReplenishmentResult> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_RUN);
  const ctx = await getCurrentUserContext();
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase.rpc("calculate_replenishment", {
    p_brand: brand,
    p_warehouse_id: input.warehouseId ?? null,
    p_horizon_days: input.horizonDays ?? 7,
    p_triggered_by: ctx.userId ?? null,
    p_trigger_kind: "manual",
  });
  if (error) return { ok: false, error: error.message };
  const runId = data as unknown as string;

  const { data: run, error: runErr } = await supabase
    .from("replenishment_runs")
    .select("total_lines, total_amount")
    .eq("id", runId)
    .maybeSingle();
  if (runErr) return { ok: false, error: runErr.message };

  revalidatePath("/parts/purchase/replenishment");
  return {
    ok: true,
    runId,
    lines: Number(run?.total_lines ?? 0),
    amount: Number(run?.total_amount ?? 0),
  };
}

export type LineActionResult = { ok: true } | { ok: false; error: string };

export async function ignoreReplenishmentLines(lineIds: string[]): Promise<LineActionResult> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_RUN);
  if (lineIds.length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("replenishment_run_lines")
    .update({ status: "ignored" })
    .in("id", lineIds)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("status", "open");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parts/purchase/replenishment");
  return { ok: true };
}

export async function updateSuggestedQty(
  lineId: string,
  newQty: number,
): Promise<LineActionResult> {
  await requirePermission(PERMISSIONS.REPLENISHMENT_RUN);
  if (!lineId) return { ok: false, error: "缺少 line id" };
  if (!Number.isFinite(newQty) || newQty < 0) {
    return { ok: false, error: "建議量需為 0 或正數" };
  }
  const supabase = await createClient();
  const { data: line, error: readErr } = await supabase
    .from("replenishment_run_lines")
    .select("unit_price")
    .eq("id", lineId)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const unitPrice = Number(line?.unit_price ?? 0);
  const { error } = await supabase
    .from("replenishment_run_lines")
    .update({
      suggested_qty: newQty,
      est_amount: Math.round(newQty * unitPrice * 100) / 100,
    })
    .eq("id", lineId)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parts/purchase/replenishment");
  return { ok: true };
}

export type ConvertResult =
  | { ok: true; createdPRs: { id: string; req_no: string; supplier_id: string | null; lines: number }[] }
  | { ok: false; error: string };

/**
 * 把選中的 replenishment_run_lines 按供應商分組，每組建一張 purchase_requisition。
 * source = 'replenishment'，source_ref_id = run_id，便於後續追蹤。
 */
export async function convertLinesToPRs(input: {
  runId: string;
  lineIds: string[];
}): Promise<ConvertResult> {
  await requirePermission(PERMISSIONS.PR_CREATE);
  const ctx = await getCurrentUserContext();
  if (!input.lineIds.length) return { ok: false, error: "請至少勾選一項建議" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: linesRaw, error: linesErr } = await supabase
    .from("replenishment_run_lines")
    .select("id, item_id, supplier_id, suggested_qty, required_date, warehouse_id, status")
    .in("id", input.lineIds)
    .eq("brand_id", brand)
    .eq("run_id", input.runId);
  if (linesErr) return { ok: false, error: linesErr.message };

  const lines = (linesRaw ?? []) as Array<{
    id: string;
    item_id: string;
    supplier_id: string | null;
    suggested_qty: number;
    required_date: string | null;
    warehouse_id: string | null;
    status: string;
  }>;

  const pendingLines = lines.filter((l) => l.status === "open" && Number(l.suggested_qty) > 0);
  if (pendingLines.length === 0) return { ok: false, error: "選中項目皆已轉單或建議量為 0" };

  // group by supplier_id
  const groups = new Map<string, typeof pendingLines>();
  for (const ln of pendingLines) {
    const key = ln.supplier_id ?? "__no_supplier__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ln);
  }

  const created: { id: string; req_no: string; supplier_id: string | null; lines: number }[] = [];
  const stamp = Date.now().toString().slice(-6);

  for (const [supplierKey, groupLines] of groups) {
    const supplierId = supplierKey === "__no_supplier__" ? null : supplierKey;
    const reqNo = `PR-RPL-${stamp}-${created.length + 1}`;
    const requiredDate =
      groupLines
        .map((l) => l.required_date)
        .filter((d): d is string => Boolean(d))
        .sort()[0] ?? null;
    const warehouseId = groupLines.find((l) => l.warehouse_id)?.warehouse_id ?? null;

    const { data: prRow, error: prErr } = await supabase
      .from("purchase_requisitions")
      .insert({
        brand_id: brand,
        req_no: reqNo,
        warehouse_id: warehouseId,
        source: "replenishment",
        source_ref_id: input.runId,
        status: "draft",
        required_date: requiredDate,
        notes: supplierId ? `自動建單（來自補貨建議）— supplier=${supplierId}` : "自動建單（來自補貨建議）— 未指定供應商",
        created_by: ctx.userId ?? null,
      })
      .select("id, req_no")
      .single();
    if (prErr || !prRow) return { ok: false, error: prErr?.message ?? "建立 PR 失敗" };

    const lineRows = groupLines.map((l, idx) => ({
      brand_id: brand,
      req_id: prRow.id,
      line_no: idx + 1,
      item_id: l.item_id,
      qty_required: Number(l.suggested_qty),
      uom: "EA",
      expected_date: l.required_date,
      notes: `補貨建議 line ${l.id}`,
    }));
    const { data: insertedLines, error: lineInsErr } = await supabase
      .from("purchase_requisition_lines")
      .insert(lineRows)
      .select("id");
    if (lineInsErr) return { ok: false, error: lineInsErr.message };

    // 把 replenishment line 標 converted
    const lineIdToPrLineId = new Map<string, string>();
    (insertedLines ?? []).forEach((il, idx) => {
      lineIdToPrLineId.set(groupLines[idx].id, (il as { id: string }).id);
    });
    for (const [rplId, prLineId] of lineIdToPrLineId) {
      await supabase
        .from("replenishment_run_lines")
        .update({ status: "converted", converted_pr_line_id: prLineId })
        .eq("id", rplId)
        .eq("brand_id", brand);
    }

    created.push({
      id: prRow.id,
      req_no: prRow.req_no,
      supplier_id: supplierId,
      lines: groupLines.length,
    });
  }

  // 更新 run 狀態
  const { count: openLeft } = await supabase
    .from("replenishment_run_lines")
    .select("id", { count: "exact", head: true })
    .eq("run_id", input.runId)
    .eq("brand_id", brand)
    .eq("status", "open");
  await supabase
    .from("replenishment_runs")
    .update({ status: openLeft && openLeft > 0 ? "partially_converted" : "converted" })
    .eq("id", input.runId)
    .eq("brand_id", brand);

  revalidatePath("/parts/purchase/replenishment");
  revalidatePath("/parts/purchase/requisitions");
  return { ok: true, createdPRs: created };
}

// ─────────────────────────── Replenishment page（/parts/purchase/replenishment） ───────────────────────────

import {
  getActiveReplenishmentPolicy,
  listWarehouses,
} from "@/lib/master-data/queries";
import type {
  ReplenishLine,
  RunMeta,
} from "@/app/(workspace)/parts/purchase/replenishment/_components/replenishment-board";

const TPE_FMT = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type RawLine = {
  id: string;
  status: "open" | "converted" | "ignored";
  abc_class: string | null;
  on_hand_qty: number;
  on_order_qty: number;
  gross_demand_qty: number;
  reorder_point: number;
  safety_stock: number;
  net_demand_qty: number;
  suggested_qty: number;
  unit_price: number;
  est_amount: number;
  supplier_id: string | null;
  lead_time_days: number | null;
  required_date: string | null;
  latest_order_date: string | null;
  priority: "urgent" | "normal" | "low";
  item_id: string;
};

export interface ReplenishmentPageData {
  run: RunMeta | null;
  lines: ReplenishLine[];
  warehouses: Array<{ id: string; code: string; name: string }>;
  policy:
    | {
        horizon_days: number;
        frequency: string;
        auto_create_pr_for_urgent: boolean;
      }
    | null;
}

export async function getReplenishmentPageData(): Promise<ReplenishmentPageData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [runRes, warehouses, policy] = await Promise.all([
    supabase
      .from("replenishment_runs")
      .select("id, created_at, horizon_days, total_lines, total_amount, status")
      .eq("brand_id", brand)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    listWarehouses(),
    getActiveReplenishmentPolicy(null),
  ]);
  if (runRes.error) throw new Error(runRes.error.message);

  const runRow = runRes.data as Omit<RunMeta, "created_label"> | null;
  const run: RunMeta | null = runRow
    ? { ...runRow, created_label: TPE_FMT.format(new Date(runRow.created_at)) }
    : null;

  let lines: ReplenishLine[] = [];
  if (run) {
    const [linesRes, itemsRes, supRes] = await Promise.all([
      supabase
        .from("replenishment_run_lines")
        .select(
          "id, status, abc_class, on_hand_qty, on_order_qty, gross_demand_qty, reorder_point, safety_stock, net_demand_qty, suggested_qty, unit_price, est_amount, supplier_id, lead_time_days, required_date, latest_order_date, priority, item_id",
        )
        .eq("brand_id", brand)
        .eq("run_id", run.id)
        .order("priority", { ascending: true })
        .order("est_amount", { ascending: false })
        .limit(500),
      supabase.from("items").select("id, code, name").eq("brand_id", brand),
      supabase.from("suppliers").select("id, name").eq("brand_id", brand),
    ]);
    if (linesRes.error) throw new Error(linesRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (supRes.error) throw new Error(supRes.error.message);

    const itemMap = new Map(
      ((itemsRes.data ?? []) as Array<{ id: string; code: string; name: string }>).map((i) => [
        i.id,
        i,
      ]),
    );
    const supMap = new Map(
      ((supRes.data ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]),
    );
    lines = ((linesRes.data ?? []) as unknown as RawLine[]).map((r) => {
      const item = itemMap.get(r.item_id);
      return {
        id: r.id,
        item_code: item?.code ?? "?",
        item_name: item?.name ?? "?",
        abc_class: r.abc_class,
        on_hand_qty: Number(r.on_hand_qty),
        on_order_qty: Number(r.on_order_qty),
        gross_demand_qty: Number(r.gross_demand_qty),
        reorder_point: Number(r.reorder_point),
        safety_stock: Number(r.safety_stock),
        net_demand_qty: Number(r.net_demand_qty),
        suggested_qty: Number(r.suggested_qty),
        unit_price: Number(r.unit_price),
        est_amount: Number(r.est_amount),
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_id ? supMap.get(r.supplier_id) ?? null : null,
        lead_time_days: r.lead_time_days,
        required_date: r.required_date,
        latest_order_date: r.latest_order_date,
        priority: r.priority,
        status: r.status,
      };
    });
  }

  return {
    run,
    lines,
    warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
    policy: policy
      ? {
          horizon_days: policy.horizon_days,
          frequency: policy.frequency,
          auto_create_pr_for_urgent: policy.auto_create_pr_for_urgent,
        }
      : null,
  };
}
