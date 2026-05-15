"use server";

/**
 * Domain Helper — Aftersales Repair Order Lines（工項 / 零件明細）
 *
 * 對應頁面：/parts/aftersales/repair-orders/[id]/lines
 * Spec：docs/DUCATI_售後工單模組_..._最新版/03_維修項目零件明細.html
 *
 * 結構：
 *   repair_order_lines (kind: 'labor' | 'part')
 *     - labor: labor_name / labor_units / unit_price (per LU) / amount
 *     - part : item_id / part_code / part_name / qty / unit_price / amount
 *
 * Total = subtotal + tax (5%), 折扣存在 repair_orders.metadata.discount_pct
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type RepairOrderLineKind = "labor" | "part";

export type RepairOrderLineRow = {
  id: string;
  repair_order_id: string;
  brand_id: string;
  line_no: number;
  kind: RepairOrderLineKind;
  labor_name: string | null;
  labor_units: number | null;
  labor_note: string | null;
  item_id: string | null;
  part_code: string | null;
  part_name: string | null;
  qty: number | null;
  unit_price: number;
  amount: number;
  is_warranty: boolean;
  metadata: Record<string, unknown> | null;
};

export type RepairOrderLineWithStock = RepairOrderLineRow & {
  /** 同 brand 全倉的 on_hand 加總（part only） */
  stock_on_hand: number | null;
};

export type LinesSummary = {
  labor_subtotal: number;
  labor_units_total: number;
  parts_subtotal: number;
  subtotal: number;
  discount_pct: number;
  discount_reason: string | null;
  tax: number;
  total: number;
};

export type RepairOrderLinesPageData = {
  ro: {
    id: string;
    brand_id: string;
    ro_code: string;
    status: string;
    customer_name: string | null;
    vehicle_license_plate: string | null;
    vehicle_model_name: string | null;
    mileage_in: number | null;
    sa_name: string | null;
  };
  laborLines: RepairOrderLineWithStock[];
  partLines: RepairOrderLineWithStock[];
  summary: LinesSummary;
  /** 零件挑選用候選清單（前 200 條） */
  itemOptions: { id: string; code: string; name: string; suggested_price: number | null }[];
};

const TAX_RATE = 0.05;

function calcSummary(
  laborLines: RepairOrderLineRow[],
  partLines: RepairOrderLineRow[],
  discount_pct: number,
  discount_reason: string | null,
): LinesSummary {
  const laborSubtotal = laborLines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const partsSubtotal = partLines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const subtotalRaw = laborSubtotal + partsSubtotal;
  const discounted = subtotalRaw * (1 - Math.max(0, Math.min(30, discount_pct)) / 100);
  const tax = Math.round(discounted * TAX_RATE);
  const total = Math.round(discounted + tax);
  const laborUnits = laborLines.reduce((s, l) => s + Number(l.labor_units ?? 0), 0);
  return {
    labor_subtotal: laborSubtotal,
    labor_units_total: laborUnits,
    parts_subtotal: partsSubtotal,
    subtotal: subtotalRaw,
    discount_pct,
    discount_reason,
    tax,
    total,
  };
}

export async function getRepairOrderLinesPageData(
  repairOrderId: string,
): Promise<RepairOrderLinesPageData | null> {
  if (!repairOrderId) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select(
      "id, brand_id, ro_code, status, customer_id, vehicle_id, sa_id, mileage_in, metadata",
    )
    .eq("id", repairOrderId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr || !ro) return null;

  const roRec = ro as Record<string, unknown>;
  const meta = (roRec.metadata ?? {}) as Record<string, unknown>;
  const discount_pct = Number(meta.discount_pct ?? 0);
  const discount_reason =
    typeof meta.discount_reason === "string" ? (meta.discount_reason as string) : null;

  const [linesRes, custRes, vehRes, saRes] = await Promise.all([
    supabase
      .from("repair_order_lines")
      .select("*")
      .eq("repair_order_id", repairOrderId)
      .order("line_no", { ascending: true }),
    roRec.customer_id
      ? supabase
          .from("customers")
          .select("name")
          .eq("id", roRec.customer_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    roRec.vehicle_id
      ? supabase
          .from("customer_vehicles")
          .select("license_plate, vehicle_models(name)")
          .eq("id", roRec.vehicle_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    roRec.sa_id
      ? supabase
          .from("employees")
          .select("name")
          .eq("id", roRec.sa_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (linesRes.error) throw linesRes.error;
  const lines = (linesRes.data ?? []) as unknown as RepairOrderLineRow[];

  const laborLines = lines.filter((l) => l.kind === "labor");
  const partLines = lines.filter((l) => l.kind === "part");

  // 撈 part 的 stock on hand
  const partItemIds = Array.from(
    new Set(partLines.map((l) => l.item_id).filter((v): v is string => Boolean(v))),
  );
  const stockMap = new Map<string, number>();
  if (partItemIds.length) {
    const { data: stocks } = await supabase
      .from("stock_items")
      .select("item_id, qty")
      .eq("brand_id", brand)
      .in("item_id", partItemIds);
    for (const s of (stocks ?? []) as { item_id: string; qty: number }[]) {
      stockMap.set(s.item_id, (stockMap.get(s.item_id) ?? 0) + Number(s.qty ?? 0));
    }
  }

  const laborWithStock: RepairOrderLineWithStock[] = laborLines.map((l) => ({
    ...l,
    stock_on_hand: null,
  }));
  const partsWithStock: RepairOrderLineWithStock[] = partLines.map((l) => ({
    ...l,
    stock_on_hand: l.item_id ? stockMap.get(l.item_id) ?? 0 : null,
  }));

  const summary = calcSummary(laborLines, partLines, discount_pct, discount_reason);

  // 候選 item 清單（前 200 條，active）
  const { data: itemsData } = await supabase
    .from("items")
    .select("id, code, name, suggested_price")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(200);

  const itemOptions = ((itemsData ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    suggested_price: number | null;
  }>).map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    suggested_price: i.suggested_price != null ? Number(i.suggested_price) : null,
  }));

  const veh = vehRes.data as
    | { license_plate: string; vehicle_models: { name?: string } | { name?: string }[] | null }
    | null;
  const vehicleModelName = veh
    ? Array.isArray(veh.vehicle_models)
      ? veh.vehicle_models[0]?.name ?? null
      : veh.vehicle_models?.name ?? null
    : null;

  return {
    ro: {
      id: roRec.id as string,
      brand_id: roRec.brand_id as string,
      ro_code: roRec.ro_code as string,
      status: roRec.status as string,
      customer_name: (custRes.data as { name?: string } | null)?.name ?? null,
      vehicle_license_plate: veh?.license_plate ?? null,
      vehicle_model_name: vehicleModelName,
      mileage_in: (roRec.mileage_in as number | null) ?? null,
      sa_name: (saRes.data as { name?: string } | null)?.name ?? null,
    },
    laborLines: laborWithStock,
    partLines: partsWithStock,
    summary,
    itemOptions,
  };
}

/** ── 「核對明細」landing 列表 ─────────────────────────────────────
 * 撈當 brand 全部 RO + 每張的工項 / 零件 / 折扣彙總。
 * 走一次 RO query + 一次 lines query，避免 N+1。 */
export type RoLinesSummaryRow = {
  id: string;
  ro_code: string;
  status: string;
  issue_date: string;
  customer_name: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  sa_name: string | null;
  labor_count: number;
  labor_units_total: number;
  labor_subtotal: number;
  parts_count: number;
  parts_subtotal: number;
  discount_pct: number;
  total: number;
  has_low_stock: boolean;
  has_lines: boolean;
};

export type RoLinesSummaryFilters = {
  status?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  empty_only?: boolean; // 只顯示尚未核對（無 lines）
};

export type RoLinesSummaryPageData = {
  rows: RoLinesSummaryRow[];
  totalCount: number;
};

export async function listRosWithLinesSummary(
  filters: RoLinesSummaryFilters = {},
): Promise<RoLinesSummaryRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("repair_orders")
    .select(
      "id, ro_code, status, issue_date, customer_id, vehicle_id, sa_id, metadata",
    )
    .eq("brand_id", brand)
    .order("issue_date", { ascending: false })
    .order("sequence_no", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.date_from) q = q.gte("issue_date", filters.date_from);
  if (filters.date_to) q = q.lte("issue_date", filters.date_to);
  if (filters.q && filters.q.trim()) q = q.ilike("ro_code", `%${filters.q.trim()}%`);

  const { data: roRaw, error } = await q;
  if (error) throw error;
  const ros = (roRaw ?? []) as Array<{
    id: string;
    ro_code: string;
    status: string;
    issue_date: string;
    customer_id: string | null;
    vehicle_id: string | null;
    sa_id: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  if (!ros.length) return [];

  const roIds = ros.map((r) => r.id);
  const [linesRes, custRes, vehRes, saRes] = await Promise.all([
    supabase
      .from("repair_order_lines")
      .select("repair_order_id, kind, item_id, qty, labor_units, amount")
      .in("repair_order_id", roIds),
    (() => {
      const ids = Array.from(
        new Set(ros.map((r) => r.customer_id).filter((v): v is string => Boolean(v))),
      );
      return ids.length
        ? supabase.from("customers").select("id, name").eq("brand_id", brand).in("id", ids)
        : Promise.resolve({ data: [] as { id: string; name: string }[] });
    })(),
    (() => {
      const ids = Array.from(
        new Set(ros.map((r) => r.vehicle_id).filter((v): v is string => Boolean(v))),
      );
      return ids.length
        ? supabase
            .from("customer_vehicles")
            .select("id, license_plate, vehicle_models(name)")
            .in("id", ids)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              license_plate: string;
              vehicle_models: { name?: string } | { name?: string }[] | null;
            }>,
          });
    })(),
    (() => {
      const ids = Array.from(
        new Set(ros.map((r) => r.sa_id).filter((v): v is string => Boolean(v))),
      );
      return ids.length
        ? supabase.from("employees").select("id, name").in("id", ids)
        : Promise.resolve({ data: [] as { id: string; name: string }[] });
    })(),
  ]);

  const linesByRo = new Map<
    string,
    {
      labor_count: number;
      labor_units_total: number;
      labor_subtotal: number;
      parts_count: number;
      parts_subtotal: number;
      part_item_ids: Set<string>;
    }
  >();
  for (const ln of (linesRes.data ?? []) as Array<{
    repair_order_id: string;
    kind: string;
    item_id: string | null;
    qty: number | null;
    labor_units: number | null;
    amount: number | null;
  }>) {
    const cur = linesByRo.get(ln.repair_order_id) ?? {
      labor_count: 0,
      labor_units_total: 0,
      labor_subtotal: 0,
      parts_count: 0,
      parts_subtotal: 0,
      part_item_ids: new Set<string>(),
    };
    if (ln.kind === "labor") {
      cur.labor_count += 1;
      cur.labor_units_total += Number(ln.labor_units ?? 0);
      cur.labor_subtotal += Number(ln.amount ?? 0);
    } else if (ln.kind === "part") {
      cur.parts_count += 1;
      cur.parts_subtotal += Number(ln.amount ?? 0);
      if (ln.item_id) cur.part_item_ids.add(ln.item_id);
    }
    linesByRo.set(ln.repair_order_id, cur);
  }

  // 批次撈所有 part item 的庫存（同 brand 全倉）
  const allItemIds = new Set<string>();
  for (const v of linesByRo.values()) for (const i of v.part_item_ids) allItemIds.add(i);
  const stockMap = new Map<string, number>();
  if (allItemIds.size) {
    const { data: stocks } = await supabase
      .from("stock_items")
      .select("item_id, qty")
      .eq("brand_id", brand)
      .in("item_id", Array.from(allItemIds));
    for (const s of (stocks ?? []) as Array<{ item_id: string; qty: number | null }>) {
      stockMap.set(s.item_id, (stockMap.get(s.item_id) ?? 0) + Number(s.qty ?? 0));
    }
  }

  const custMap = new Map(
    ((custRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
  const vehMap = new Map(
    ((vehRes.data ?? []) as Array<{
      id: string;
      license_plate: string;
      vehicle_models: { name?: string } | { name?: string }[] | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [v.id, { plate: v.license_plate, model: m?.name ?? null }] as const;
    }),
  );
  const saMap = new Map(
    ((saRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );

  const TAX = 0.05;
  const out: RoLinesSummaryRow[] = ros.map((r) => {
    const agg = linesByRo.get(r.id);
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const discount_pct = Number(meta.discount_pct ?? 0);
    const labor_subtotal = agg?.labor_subtotal ?? 0;
    const parts_subtotal = agg?.parts_subtotal ?? 0;
    const subtotal = labor_subtotal + parts_subtotal;
    const discounted = subtotal * (1 - Math.max(0, Math.min(30, discount_pct)) / 100);
    const total = Math.round(discounted + Math.round(discounted * TAX));
    const has_low_stock = !!agg && Array.from(agg.part_item_ids).some((id) => {
      const onHand = stockMap.get(id) ?? 0;
      return onHand <= 1;
    });
    return {
      id: r.id,
      ro_code: r.ro_code,
      status: r.status,
      issue_date: r.issue_date,
      customer_name: r.customer_id ? custMap.get(r.customer_id) ?? null : null,
      vehicle_license_plate: r.vehicle_id ? vehMap.get(r.vehicle_id)?.plate ?? null : null,
      vehicle_model_name: r.vehicle_id ? vehMap.get(r.vehicle_id)?.model ?? null : null,
      sa_name: r.sa_id ? saMap.get(r.sa_id) ?? null : null,
      labor_count: agg?.labor_count ?? 0,
      labor_units_total: agg?.labor_units_total ?? 0,
      labor_subtotal,
      parts_count: agg?.parts_count ?? 0,
      parts_subtotal,
      discount_pct,
      total,
      has_low_stock,
      has_lines: !!agg,
    };
  });

  return filters.empty_only ? out.filter((r) => !r.has_lines) : out;
}

export async function getRoLinesSummaryPageData(
  filters: RoLinesSummaryFilters,
): Promise<RoLinesSummaryPageData> {
  const rows = await listRosWithLinesSummary(filters);
  return { rows, totalCount: rows.length };
}

/** 列出最近 N 張 RO（沒指定 ro id 時的選單頁用） */
export async function listRecentRosForPicker(
  limit: number = 10,
): Promise<{ id: string; ro_code: string; status: string; customer_name: string | null }[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_id")
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as { id: string; ro_code: string; status: string; customer_id: string | null }[];
  if (!rows.length) return [];
  const custIds = Array.from(
    new Set(rows.map((r) => r.customer_id).filter((v): v is string => Boolean(v))),
  );
  let custMap = new Map<string, string>();
  if (custIds.length) {
    const { data: cs } = await supabase
      .from("customers")
      .select("id, name")
      .eq("brand_id", brand)
      .in("id", custIds);
    custMap = new Map(
      ((cs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    );
  }
  return rows.map((r) => ({
    id: r.id,
    ro_code: r.ro_code,
    status: r.status,
    customer_name: r.customer_id ? custMap.get(r.customer_id) ?? null : null,
  }));
}
