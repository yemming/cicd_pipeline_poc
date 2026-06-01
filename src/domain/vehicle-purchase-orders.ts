/**
 * 整車採購訂單 domain helper — server-only
 *
 * 對應 DB 表：vehicle_purchase_orders（單頭）+ vehicle_purchase_order_items（車輛明細）
 * 業務鏈起點：對原廠下整車採購訂單 → 提交後每筆明細依 qty 在 new_car_inventory
 *            建 status='in_transit' 的庫存 row（在途）。下游 RS_INV02 到港確認再轉 pending_pdi。
 *
 * 天條：UI 只 import 本 helper / server action，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPrintBrandBuyer, type PrintBrandInfo, type PrintBuyerInfo } from "@/lib/pdf/print-context";

// ── 型別 ──────────────────────────────────────────────────────────────

export type VehiclePOStatus =
  | "draft"
  | "submitted"
  | "in_transit"
  | "arrived"
  | "closed"
  | "cancelled";

export type VehiclePOItemRow = {
  id: string;
  purchase_order_id: string;
  seq: number | null;
  vehicle_model_id: string | null;
  color: string | null;
  color_code: string | null;
  qty: number;
  unit_price_source: number | null;
  unit_price_twd: number | null;
  factory_order_no: string | null;
  // joined（顯示用）
  model_display_name: string | null;
  model_series: string | null;
};

export type VehiclePORow = {
  id: string;
  brand_id: string;
  subsidiary_id: string | null;
  po_no: string;
  supplier_name: string | null;
  order_date: string | null;
  expected_arrival: string | null;
  warehouse_id: string | null;
  currency: string | null;
  exchange_rate: number | null;
  freight_estimate: number | null;
  insurance_estimate: number | null;
  customs_rate: number | null;
  status: VehiclePOStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  // 進口 P2P 欄位（Round C）
  pi_no: string | null;
  incoterms: string | null;
  deposit_ratio: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  origin_country: string | null;
  // 衍生（list 用）
  model_count: number;
  total_qty: number;
  total_amount_twd: number;
  warehouse_name: string | null;
  // 進口衍生（依 deposit_ratio × 總額）
  deposit_amount: number;
  balance_amount: number;
};

export type VehiclePODetail = VehiclePORow & {
  items: VehiclePOItemRow[];
};

export type VehiclePOFilters = {
  status?: string;
  q?: string;
};

export type VehicleModelOption = {
  id: string;
  display_name: string;
  series: string | null;
  msrp: number | null;
  standard_cost: number | null;
};

export type WarehouseOption = { id: string; name: string; code: string | null };

export const VEHICLE_PO_PAGE_SIZE_DEFAULT = 50;

// ── helper ────────────────────────────────────────────────────────────

async function getBrandId(): Promise<string> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return "indian";
  const { data } = await supabase
    .from("profile_brands")
    .select("brand_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.brand_id ?? "indian";
}

const HEAD_FIELDS = `
  id, brand_id, subsidiary_id, po_no, supplier_name, order_date, expected_arrival,
  warehouse_id, currency, exchange_rate, freight_estimate, insurance_estimate,
  customs_rate, status, notes, metadata, created_at, updated_at, created_by,
  pi_no, incoterms, deposit_ratio, deposit_paid_at, balance_paid_at, origin_country
`.trim();

/** 依 deposit_ratio × 採購總額算訂金/尾款（ratio 存小數 0.3 = 30%） */
function depositSplit(
  totalAmount: number,
  depositRatio: number | null,
): { deposit_amount: number; balance_amount: number } {
  const ratio = depositRatio == null ? 0 : Number(depositRatio);
  const deposit = Math.round(totalAmount * ratio);
  return { deposit_amount: deposit, balance_amount: Math.max(0, totalAmount - deposit) };
}

// ── 查詢 ──────────────────────────────────────────────────────────────

/**
 * 採購單列表（server-side 分頁；衍生 車款數 / 台數 / 金額）。
 */
export async function listVehiclePurchaseOrders(
  filters: VehiclePOFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: VehiclePORow[]; totalCount: number }> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? VEHICLE_PO_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("vehicle_purchase_orders")
    .select(HEAD_FIELDS, { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.q?.trim()) {
    const term = filters.q.trim();
    q = q.or(`po_no.ilike.%${term}%,supplier_name.ilike.%${term}%`);
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw error;

  const heads = (data ?? []) as unknown as Omit<
    VehiclePORow,
    | "model_count"
    | "total_qty"
    | "total_amount_twd"
    | "warehouse_name"
    | "deposit_amount"
    | "balance_amount"
  >[];

  if (heads.length === 0) return { rows: [], totalCount: count ?? 0 };

  const poIds = heads.map((h) => h.id);
  const warehouseIds = Array.from(
    new Set(heads.map((h) => h.warehouse_id).filter((x): x is string => !!x)),
  );

  const [itemsRes, whRes] = await Promise.all([
    supabase
      .from("vehicle_purchase_order_items")
      .select("purchase_order_id, qty, unit_price_twd")
      .in("purchase_order_id", poIds),
    warehouseIds.length
      ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  type ItemAgg = { purchase_order_id: string; qty: number | null; unit_price_twd: number | null };
  const aggMap = new Map<string, { models: number; qty: number; amount: number }>();
  for (const it of (itemsRes.data ?? []) as ItemAgg[]) {
    const a = aggMap.get(it.purchase_order_id) ?? { models: 0, qty: 0, amount: 0 };
    a.models += 1;
    a.qty += it.qty ?? 0;
    a.amount += (it.qty ?? 0) * Number(it.unit_price_twd ?? 0);
    aggMap.set(it.purchase_order_id, a);
  }
  const whMap = new Map(
    ((whRes.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]),
  );

  const rows: VehiclePORow[] = heads.map((h) => {
    const agg = aggMap.get(h.id) ?? { models: 0, qty: 0, amount: 0 };
    const split = depositSplit(agg.amount, h.deposit_ratio);
    return {
      ...h,
      metadata: (h.metadata as Record<string, unknown>) ?? {},
      model_count: agg.models,
      total_qty: agg.qty,
      total_amount_twd: agg.amount,
      warehouse_name: h.warehouse_id ? whMap.get(h.warehouse_id) ?? null : null,
      ...split,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * 採購單詳情（單頭 + 明細 join vehicle_models 顯示名）。
 */
export async function getVehiclePurchaseOrderById(
  id: string,
): Promise<VehiclePODetail | null> {
  const supabase = await createClient();
  const { data: head, error } = await supabase
    .from("vehicle_purchase_orders")
    .select(HEAD_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!head) return null;

  const h = head as unknown as Omit<
    VehiclePORow,
    | "model_count"
    | "total_qty"
    | "total_amount_twd"
    | "warehouse_name"
    | "deposit_amount"
    | "balance_amount"
  >;

  const { data: itemsData, error: itemsErr } = await supabase
    .from("vehicle_purchase_order_items")
    .select(
      `id, purchase_order_id, seq, vehicle_model_id, color, color_code, qty,
       unit_price_source, unit_price_twd, factory_order_no,
       vehicle_models(display_name, series)`,
    )
    .eq("purchase_order_id", id)
    .order("seq", { ascending: true });
  if (itemsErr) throw itemsErr;

  type JoinedItem = {
    id: string;
    purchase_order_id: string;
    seq: number | null;
    vehicle_model_id: string | null;
    color: string | null;
    color_code: string | null;
    qty: number | null;
    unit_price_source: number | null;
    unit_price_twd: number | null;
    factory_order_no: string | null;
    vehicle_models: { display_name?: string; series?: string } | null;
  };

  const items: VehiclePOItemRow[] = ((itemsData ?? []) as unknown as JoinedItem[]).map(
    (it) => ({
      id: it.id,
      purchase_order_id: it.purchase_order_id,
      seq: it.seq,
      vehicle_model_id: it.vehicle_model_id,
      color: it.color,
      color_code: it.color_code,
      qty: it.qty ?? 1,
      unit_price_source: it.unit_price_source,
      unit_price_twd: it.unit_price_twd,
      factory_order_no: it.factory_order_no,
      model_display_name: it.vehicle_models?.display_name ?? null,
      model_series: it.vehicle_models?.series ?? null,
    }),
  );

  let warehouse_name: string | null = null;
  if (h.warehouse_id) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("name")
      .eq("id", h.warehouse_id)
      .maybeSingle();
    warehouse_name = wh?.name ?? null;
  }

  const total_qty = items.reduce((s, it) => s + (it.qty ?? 0), 0);
  const total_amount_twd = items.reduce(
    (s, it) => s + (it.qty ?? 0) * Number(it.unit_price_twd ?? 0),
    0,
  );

  return {
    ...h,
    metadata: (h.metadata as Record<string, unknown>) ?? {},
    model_count: items.length,
    total_qty,
    total_amount_twd,
    warehouse_name,
    ...depositSplit(total_amount_twd, h.deposit_ratio),
    items,
  };
}

// ── 列印 ──────────────────────────────────────────────────────────────

export type ImportPOForPrint = {
  id: string;
  brand: PrintBrandInfo;
  buyer: PrintBuyerInfo;
  po_no: string;
  pi_no: string | null;
  supplier_name: string | null;
  incoterms: string | null;
  origin_country: string | null;
  order_date: string | null;
  expected_arrival: string | null;
  currency: string | null;
  exchange_rate: number | null;
  status: VehiclePOStatus;
  notes: string | null;
  lines: Array<{
    seq: number | null;
    model: string;
    color: string | null;
    qty: number;
    unit_price_twd: number;
    subtotal: number;
  }>;
  total_qty: number;
  total_amount_twd: number;
  deposit_ratio: number | null;
  deposit_amount: number;
  deposit_paid_at: string | null;
  balance_amount: number;
  balance_paid_at: string | null;
};

export async function getImportPOForPrint(id: string): Promise<ImportPOForPrint | null> {
  const po = await getVehiclePurchaseOrderById(id);
  if (!po) return null;
  const { brand, buyer } = await getPrintBrandBuyer(po.brand_id, po.subsidiary_id);
  return {
    id: po.id,
    brand,
    buyer,
    po_no: po.po_no,
    pi_no: po.pi_no,
    supplier_name: po.supplier_name,
    incoterms: po.incoterms,
    origin_country: po.origin_country,
    order_date: po.order_date,
    expected_arrival: po.expected_arrival,
    currency: po.currency,
    exchange_rate: po.exchange_rate,
    status: po.status,
    notes: po.notes,
    lines: po.items.map((it) => ({
      seq: it.seq,
      model: [it.model_series, it.model_display_name].filter(Boolean).join(" · ") || "—",
      color: it.color,
      qty: it.qty ?? 0,
      unit_price_twd: Number(it.unit_price_twd ?? 0),
      subtotal: (it.qty ?? 0) * Number(it.unit_price_twd ?? 0),
    })),
    total_qty: po.total_qty,
    total_amount_twd: po.total_amount_twd,
    deposit_ratio: po.deposit_ratio,
    deposit_amount: po.deposit_amount,
    deposit_paid_at: po.deposit_paid_at,
    balance_amount: po.balance_amount,
    balance_paid_at: po.balance_paid_at,
  };
}

// ── Lookup helpers ──────────────────────────────────────────────────────

export async function listVehicleModels(): Promise<VehicleModelOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("id, display_name, series, msrp, standard_cost")
    .eq("is_active", true)
    .order("series")
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as VehicleModelOption[];
}

export async function listVehicleWarehouses(): Promise<WarehouseOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, code")
    .order("name");
  if (error) throw error;
  return (data ?? []) as WarehouseOption[];
}

export async function getVehiclePOBrandId(): Promise<string> {
  return getBrandId();
}

// ── 編號產生器：VPO-YYYYMM-NNN（query 當月最大序號 +1）──────────────────

export async function nextVehiclePONo(brandId: string): Promise<string> {
  const supabase = await createClient();
  const now = new Date();
  // Asia/Taipei：用 UTC+8 算當月，避免月底跨日落在錯月
  const tpe = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const yyyymm = `${tpe.getUTCFullYear()}${String(tpe.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `VPO-${yyyymm}-`;

  const { data, error } = await supabase
    .from("vehicle_purchase_orders")
    .select("po_no")
    .eq("brand_id", brandId)
    .like("po_no", `${prefix}%`)
    .order("po_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  let next = 1;
  if (data?.po_no) {
    const tail = data.po_no.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(3, "0")}`;
}
