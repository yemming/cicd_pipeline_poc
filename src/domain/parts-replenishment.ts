/**
 * Domain Helper — 日常補貨計畫（Run List 視角，A 級）
 *
 * 與 src/domain/replenishment.ts 分工：
 *   - replenishment.ts → 「最新一筆 run 的 working-board」，給單一 run 操作 lines
 *   - 本檔 → 「多 runs 的歷史 / KPI / 詳情 / 審批 / 生 PO」
 *
 * server-only read helpers — UI 不能 import（避免 supabase / RLS 鏈到 client bundle）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { listWarehouses } from "@/lib/master-data/queries";

import type {
  ReplenishmentFilters,
  ReplenishmentKpis,
  ReplenishmentRunLineRow,
  ReplenishmentRunRow,
  RunListStatus,
} from "./parts-replenishment.constants";

const TPE_FMT = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type RunMetadata = {
  approval?: {
    status?: "approved" | "rejected";
    note?: string | null;
    at?: string | null;
    by?: string | null;
    by_label?: string | null;
  };
  rejected?: {
    at?: string | null;
    by?: string | null;
    by_label?: string | null;
    note?: string | null;
  };
  generated_pos?: Array<{ id: string; po_no: string; vendor_id: string | null }>;
};

function deriveApprovalView(meta: RunMetadata | null | undefined, status: string): {
  approval_status: "pending" | "approved" | "rejected";
  approval_note: string | null;
  approved_at: string | null;
  approved_by_label: string | null;
  rejected_at: string | null;
  rejected_by_label: string | null;
} {
  const ap = meta?.approval ?? {};
  const rj = meta?.rejected ?? {};
  let approvalStatus: "pending" | "approved" | "rejected" = "pending";
  if (status === "rejected" || rj.at) approvalStatus = "rejected";
  else if (ap.status === "approved" || status === "approved" || status === "converted" || status === "partially_converted") {
    approvalStatus = "approved";
  }
  return {
    approval_status: approvalStatus,
    approval_note: ap.note ?? null,
    approved_at: ap.at ?? null,
    approved_by_label: ap.by_label ?? null,
    rejected_at: rj.at ?? null,
    rejected_by_label: rj.by_label ?? null,
  };
}

export async function listReplenishmentRuns(
  filters: ReplenishmentFilters = {},
): Promise<{ runs: ReplenishmentRunRow[]; warehouses: Array<{ id: string; code: string; name: string }> }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("replenishment_runs")
    .select(
      "id, brand_id, warehouse_id, horizon_days, trigger_kind, total_lines, total_amount, status, created_at, metadata",
    )
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }
  if (filters.warehouseId && filters.warehouseId !== "all") {
    q = q.eq("warehouse_id", filters.warehouseId);
  }
  if (filters.month) {
    const [y, m] = filters.month.split("-").map((x) => parseInt(x, 10));
    if (Number.isFinite(y) && Number.isFinite(m)) {
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      q = q.gte("created_at", from).lt("created_at", to);
    }
  }

  const [runsRes, warehouses] = await Promise.all([q, listWarehouses()]);
  if (runsRes.error) throw new Error(runsRes.error.message);
  const whMap = new Map(warehouses.map((w) => [w.id, `${w.code} ${w.name}`]));

  const rows: ReplenishmentRunRow[] = (runsRes.data ?? []).map((r) => {
    const meta = (r.metadata as RunMetadata | null) ?? null;
    const derived = deriveApprovalView(meta, r.status);
    return {
      id: r.id as string,
      brand_id: r.brand_id as string,
      warehouse_id: (r.warehouse_id as string | null) ?? null,
      warehouse_label: r.warehouse_id ? whMap.get(r.warehouse_id as string) ?? null : null,
      horizon_days: Number(r.horizon_days),
      trigger_kind: r.trigger_kind as string,
      total_lines: Number(r.total_lines),
      total_amount: Number(r.total_amount),
      status: r.status as RunListStatus,
      ...derived,
      generated_po_ids: (meta?.generated_pos ?? []).map((p) => p.id),
      created_at: r.created_at as string,
      created_label: TPE_FMT.format(new Date(r.created_at as string)),
    };
  });

  return {
    runs: rows,
    warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
  };
}

export async function getReplenishmentKpis(): Promise<ReplenishmentKpis> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 本月起點（Asia/Taipei month boundary 用 UTC 近似即可）
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [monthCntRes, pendingRes, withPoRes, avgRes] = await Promise.all([
    supabase
      .from("replenishment_runs")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .gte("created_at", monthStart),
    supabase
      .from("replenishment_runs")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("status", "open"),
    supabase
      .from("replenishment_runs")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .in("status", ["partially_converted", "converted"]),
    supabase
      .from("replenishment_runs")
      .select("total_amount")
      .eq("brand_id", brand)
      .gte("created_at", monthStart),
  ]);

  const amounts = ((avgRes.data ?? []) as Array<{ total_amount: number | string }>).map((r) =>
    Number(r.total_amount ?? 0),
  );
  const avg = amounts.length > 0 ? amounts.reduce((s, n) => s + n, 0) / amounts.length : 0;

  return {
    monthRuns: monthCntRes.count ?? 0,
    pendingReview: pendingRes.count ?? 0,
    generatedPo: withPoRes.count ?? 0,
    avgAmount: Math.round(avg),
  };
}

export async function getRunDetail(
  runId: string,
): Promise<{ run: ReplenishmentRunRow; lines: ReplenishmentRunLineRow[] } | null> {
  if (!runId) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: runRow, error: runErr } = await supabase
    .from("replenishment_runs")
    .select(
      "id, brand_id, warehouse_id, horizon_days, trigger_kind, total_lines, total_amount, status, created_at, metadata",
    )
    .eq("brand_id", brand)
    .eq("id", runId)
    .maybeSingle();
  if (runErr) throw new Error(runErr.message);
  if (!runRow) return null;

  const warehouses = await listWarehouses();
  const whMap = new Map(warehouses.map((w) => [w.id, `${w.code} ${w.name}`]));
  const meta = (runRow.metadata as RunMetadata | null) ?? null;
  const derived = deriveApprovalView(meta, runRow.status);

  const run: ReplenishmentRunRow = {
    id: runRow.id as string,
    brand_id: runRow.brand_id as string,
    warehouse_id: (runRow.warehouse_id as string | null) ?? null,
    warehouse_label: runRow.warehouse_id ? whMap.get(runRow.warehouse_id as string) ?? null : null,
    horizon_days: Number(runRow.horizon_days),
    trigger_kind: runRow.trigger_kind as string,
    total_lines: Number(runRow.total_lines),
    total_amount: Number(runRow.total_amount),
    status: runRow.status as RunListStatus,
    ...derived,
    generated_po_ids: (meta?.generated_pos ?? []).map((p) => p.id),
    created_at: runRow.created_at as string,
    created_label: TPE_FMT.format(new Date(runRow.created_at as string)),
  };

  const [linesRes, itemsRes, supRes] = await Promise.all([
    supabase
      .from("replenishment_run_lines")
      .select(
        "id, item_id, abc_class, on_hand_qty, on_order_qty, reorder_point, safety_stock, gross_demand_qty, net_demand_qty, suggested_qty, unit_price, est_amount, supplier_id, lead_time_days, required_date, priority, status",
      )
      .eq("brand_id", brand)
      .eq("run_id", runId)
      .order("priority", { ascending: true })
      .order("est_amount", { ascending: false })
      .limit(500),
    supabase.from("items").select("id, code, name").eq("brand_id", brand),
    supabase.from("suppliers").select("id, name").eq("brand_id", brand),
  ]);
  if (linesRes.error) throw new Error(linesRes.error.message);

  const itemMap = new Map(
    ((itemsRes.data ?? []) as Array<{ id: string; code: string; name: string }>).map((i) => [i.id, i]),
  );
  const supMap = new Map(
    ((supRes.data ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]),
  );
  const lines: ReplenishmentRunLineRow[] = (linesRes.data ?? []).map((r) => {
    const itm = itemMap.get(r.item_id as string);
    return {
      id: r.id as string,
      item_id: r.item_id as string,
      item_code: itm?.code ?? "?",
      item_name: itm?.name ?? "?",
      abc_class: (r.abc_class as string | null) ?? null,
      on_hand_qty: Number(r.on_hand_qty),
      on_order_qty: Number(r.on_order_qty),
      reorder_point: Number(r.reorder_point),
      safety_stock: Number(r.safety_stock),
      gross_demand_qty: Number(r.gross_demand_qty),
      net_demand_qty: Number(r.net_demand_qty),
      suggested_qty: Number(r.suggested_qty),
      unit_price: Number(r.unit_price),
      est_amount: Number(r.est_amount),
      supplier_id: (r.supplier_id as string | null) ?? null,
      supplier_name: r.supplier_id ? supMap.get(r.supplier_id as string) ?? null : null,
      lead_time_days: (r.lead_time_days as number | null) ?? null,
      required_date: (r.required_date as string | null) ?? null,
      priority: r.priority as "urgent" | "normal" | "low",
      status: r.status as "open" | "converted" | "ignored",
    };
  });

  return { run, lines };
}
