/**
 * 整車到港確認 domain helper — server-only
 *
 * 對應 DB 表：vehicle_arrivals（批次單頭）。
 * 業務鏈第 2 棒（RS_INV02）：採購單下的 in_transit 庫存車到港 → 逐台掃 VIN → 批次確認。
 *   無損傷車：new_car_inventory.status in_transit → pending_pdi，並各建一張 PD-IN 工單（PDI）。
 *   有損傷車：status → damaged，不建 PDI 工單，待採購人員處理。
 *
 * 天條：UI 只 import 本 helper / server action，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

// ── 型別 ──────────────────────────────────────────────────────────────

export type ArrivalStatus = "pending" | "partial" | "completed";

export type ArrivalRow = {
  id: string;
  brand_id: string;
  arrival_no: string;
  purchase_order_id: string | null;
  arrival_date: string | null;
  warehouse_id: string | null;
  total_vehicles: number;
  confirmed_vehicles: number;
  damaged_vehicles: number;
  status: ArrivalStatus;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  // 衍生（list 顯示用）
  po_no: string | null;
  warehouse_name: string | null;
};

export type ArrivalVehicleDetail = {
  new_car_id: string;
  vin: string | null;
  status: string;
  color: string | null;
  damage_flag: boolean;
  damage_notes: string | null;
  pdi_workorder_id: string | null;
  pdi_ro_code: string | null;
  model_display_name: string | null;
  model_series: string | null;
};

export type ArrivalDetail = ArrivalRow & {
  supplier_name: string | null;
  vehicles: ArrivalVehicleDetail[];
};

export type ArrivalFilters = {
  status?: string;
  q?: string;
};

/** wizard STEP 1 用：可到港確認的採購單（有 in_transit 庫存車） */
export type IncomingPurchaseOrder = {
  id: string;
  po_no: string;
  supplier_name: string | null;
  expected_arrival: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  in_transit_count: number;
};

/** wizard STEP 2 用：採購單下待掃 VIN 的在途車 */
export type InTransitCar = {
  id: string;
  vehicle_model_id: string | null;
  color: string | null;
  vin: string | null;
  model_display_name: string | null;
  model_series: string | null;
};

export const ARRIVAL_PAGE_SIZE_DEFAULT = 50;

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

export async function getArrivalBrandId(): Promise<string> {
  return getBrandId();
}

const HEAD_FIELDS = `
  id, brand_id, arrival_no, purchase_order_id, arrival_date, warehouse_id,
  total_vehicles, confirmed_vehicles, damaged_vehicles, status, metadata,
  created_at, updated_at, created_by
`.trim();

// ── 查詢 ──────────────────────────────────────────────────────────────

/**
 * 到港批次列表（server-side 分頁，衍生 採購單號 / 倉名）。
 */
export async function listArrivals(
  filters: ArrivalFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: ArrivalRow[]; totalCount: number }> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? ARRIVAL_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("vehicle_arrivals")
    .select(HEAD_FIELDS, { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.q?.trim()) {
    const term = filters.q.trim();
    q = q.ilike("arrival_no", `%${term}%`);
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw error;

  const heads = (data ?? []) as unknown as Omit<ArrivalRow, "po_no" | "warehouse_name">[];
  if (heads.length === 0) return { rows: [], totalCount: count ?? 0 };

  const poIds = Array.from(
    new Set(heads.map((h) => h.purchase_order_id).filter((x): x is string => !!x)),
  );
  const whIds = Array.from(
    new Set(heads.map((h) => h.warehouse_id).filter((x): x is string => !!x)),
  );

  const [poRes, whRes] = await Promise.all([
    poIds.length
      ? supabase.from("vehicle_purchase_orders").select("id, po_no").in("id", poIds)
      : Promise.resolve({ data: [] as { id: string; po_no: string }[] }),
    whIds.length
      ? supabase.from("warehouses").select("id, name").in("id", whIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const poMap = new Map(
    ((poRes.data ?? []) as { id: string; po_no: string }[]).map((p) => [p.id, p.po_no]),
  );
  const whMap = new Map(
    ((whRes.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]),
  );

  const rows: ArrivalRow[] = heads.map((h) => ({
    ...h,
    metadata: (h.metadata as Record<string, unknown>) ?? {},
    po_no: h.purchase_order_id ? poMap.get(h.purchase_order_id) ?? null : null,
    warehouse_name: h.warehouse_id ? whMap.get(h.warehouse_id) ?? null : null,
  }));

  return { rows, totalCount: count ?? 0 };
}

/**
 * 到港批次詳情（單頭 + 本批車輛 + 各車 PDI 工單號）。
 */
export async function getArrivalById(id: string): Promise<ArrivalDetail | null> {
  const supabase = await createClient();
  const { data: head, error } = await supabase
    .from("vehicle_arrivals")
    .select(HEAD_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!head) return null;

  const h = head as unknown as Omit<ArrivalRow, "po_no" | "warehouse_name">;

  // 採購單號 + 供應商 / 倉名
  let po_no: string | null = null;
  let supplier_name: string | null = null;
  if (h.purchase_order_id) {
    const { data: po } = await supabase
      .from("vehicle_purchase_orders")
      .select("po_no, supplier_name")
      .eq("id", h.purchase_order_id)
      .maybeSingle();
    po_no = po?.po_no ?? null;
    supplier_name = po?.supplier_name ?? null;
  }
  let warehouse_name: string | null = null;
  if (h.warehouse_id) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("name")
      .eq("id", h.warehouse_id)
      .maybeSingle();
    warehouse_name = wh?.name ?? null;
  }

  // 本批車輛（arrival_batch_id = 本批 id）
  const { data: carsData, error: carsErr } = await supabase
    .from("new_car_inventory")
    .select(
      `id, vin, status, color, damage_flag, damage_notes, pdi_workorder_id,
       vehicle_models(display_name, series)`,
    )
    .eq("arrival_batch_id", id)
    .order("created_at", { ascending: true });
  if (carsErr) throw carsErr;

  type JoinedCar = {
    id: string;
    vin: string | null;
    status: string;
    color: string | null;
    damage_flag: boolean | null;
    damage_notes: string | null;
    pdi_workorder_id: string | null;
    vehicle_models: { display_name?: string; series?: string } | null;
  };
  const cars = (carsData ?? []) as unknown as JoinedCar[];

  // 撈本批 PDI 工單號（依 pdi_workorder_id）
  const woIds = Array.from(
    new Set(cars.map((c) => c.pdi_workorder_id).filter((x): x is string => !!x)),
  );
  const woMap = new Map<string, string>();
  if (woIds.length) {
    const { data: wos } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .in("id", woIds);
    for (const w of (wos ?? []) as { id: string; ro_code: string }[]) {
      woMap.set(w.id, w.ro_code);
    }
  }

  const vehicles: ArrivalVehicleDetail[] = cars.map((c) => ({
    new_car_id: c.id,
    vin: c.vin,
    status: c.status,
    color: c.color,
    damage_flag: c.damage_flag ?? false,
    damage_notes: c.damage_notes,
    pdi_workorder_id: c.pdi_workorder_id,
    pdi_ro_code: c.pdi_workorder_id ? woMap.get(c.pdi_workorder_id) ?? null : null,
    model_display_name: c.vehicle_models?.display_name ?? null,
    model_series: c.vehicle_models?.series ?? null,
  }));

  return {
    ...h,
    metadata: (h.metadata as Record<string, unknown>) ?? {},
    po_no,
    supplier_name,
    warehouse_name,
    vehicles,
  };
}

/**
 * wizard STEP 1：可到港確認的採購單。
 * 條件：status in ('submitted','in_transit') 且該採購單底下尚有 in_transit 庫存車。
 */
export async function listIncomingPurchaseOrders(
  brandId: string,
): Promise<IncomingPurchaseOrder[]> {
  const supabase = await createClient();

  const { data: pos, error } = await supabase
    .from("vehicle_purchase_orders")
    .select("id, po_no, supplier_name, expected_arrival, warehouse_id")
    .eq("brand_id", brandId)
    .in("status", ["submitted", "in_transit"])
    .order("created_at", { ascending: false });
  if (error) throw error;

  const heads = (pos ?? []) as {
    id: string;
    po_no: string;
    supplier_name: string | null;
    expected_arrival: string | null;
    warehouse_id: string | null;
  }[];
  if (heads.length === 0) return [];

  const poIds = heads.map((h) => h.id);

  // 撈各採購單的 in_transit 庫存車數
  const { data: cars } = await supabase
    .from("new_car_inventory")
    .select("purchase_order_id")
    .eq("brand_id", brandId)
    .eq("status", "in_transit")
    .in("purchase_order_id", poIds);

  const countMap = new Map<string, number>();
  for (const c of (cars ?? []) as { purchase_order_id: string | null }[]) {
    if (!c.purchase_order_id) continue;
    countMap.set(c.purchase_order_id, (countMap.get(c.purchase_order_id) ?? 0) + 1);
  }

  // 倉名
  const whIds = Array.from(
    new Set(heads.map((h) => h.warehouse_id).filter((x): x is string => !!x)),
  );
  const whMap = new Map<string, string>();
  if (whIds.length) {
    const { data: whs } = await supabase
      .from("warehouses")
      .select("id, name")
      .in("id", whIds);
    for (const w of (whs ?? []) as { id: string; name: string }[]) whMap.set(w.id, w.name);
  }

  // 只回有在途車的單
  return heads
    .map((h) => ({
      id: h.id,
      po_no: h.po_no,
      supplier_name: h.supplier_name,
      expected_arrival: h.expected_arrival,
      warehouse_id: h.warehouse_id,
      warehouse_name: h.warehouse_id ? whMap.get(h.warehouse_id) ?? null : null,
      in_transit_count: countMap.get(h.id) ?? 0,
    }))
    .filter((p) => p.in_transit_count > 0);
}

/**
 * wizard STEP 2：採購單下 status='in_transit' 的庫存車（逐台掃 VIN）。
 */
export async function listInTransitCarsByPO(poId: string): Promise<InTransitCar[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select(
      `id, vehicle_model_id, color, vin, vehicle_models(display_name, series)`,
    )
    .eq("purchase_order_id", poId)
    .eq("status", "in_transit")
    .order("created_at", { ascending: true });
  if (error) throw error;

  type JoinedCar = {
    id: string;
    vehicle_model_id: string | null;
    color: string | null;
    vin: string | null;
    vehicle_models: { display_name?: string; series?: string } | null;
  };
  return ((data ?? []) as unknown as JoinedCar[]).map((c) => ({
    id: c.id,
    vehicle_model_id: c.vehicle_model_id,
    color: c.color,
    vin: c.vin,
    model_display_name: c.vehicle_models?.display_name ?? null,
    model_series: c.vehicle_models?.series ?? null,
  }));
}

// ── 域C + A-10 到港端：候補手卡精確比對 + call_tasks 建立 ─────────────────

/**
 * 到港確認後，找出符合此批新車的 open 候補手卡，對每張手卡建立一筆 call_task
 * 通知業務員（assignee）跟進。
 *
 * 域C 精確比對規則：
 *   主要：backorder_vehicle_model_id = vehicle.vehicle_model_id（UUID 完全相等）
 *   顏色：backorder_color = vehicle.color（精確，均有時才比）
 *
 * 舊 backorder_model 自由文字比對已全面移除。只有已設 backorder_vehicle_model_id
 * 的候補手卡才會被比對命中。
 *
 * 失敗時靜默 log（不影響到港主流程）。
 */
export async function matchBackordersAndCreateCallTasks(params: {
  brandId: string;
  arrivalId: string;
  vehicles: Array<{
    new_car_id: string;
    vehicleModelId: string | null;    // 域C：改傳 vehicle_model_id（UUID）
    modelDisplayName: string | null;  // 僅用於 notes 說明文字
    color: string | null;
  }>;
  createdBy: string | null;
}): Promise<{ matched: number; created: number }> {
  const supabase = await createClient();
  let totalMatched = 0;
  let totalCreated = 0;

  for (const v of params.vehicles) {
    // 必須有 vehicle_model_id 才能精確比對
    if (!v.vehicleModelId) continue;

    // 精確比對：backorder_vehicle_model_id = vehicle.vehicleModelId
    let q = supabase
      .from("sales_handcards")
      .select("id, assigned_rs_user_id, customer_id, backorder_color")
      .eq("brand_id", params.brandId)
      .eq("status", "open")
      .eq("backorder_vehicle_model_id", v.vehicleModelId);

    // 顏色若兩側都有值則精確比對
    if (v.color) {
      q = q.eq("backorder_color", v.color);
    }

    const { data: handcards, error: hcErr } = await q;
    if (hcErr) {
      console.error("[域C/A-10] 搜尋候補手卡失敗", hcErr.message);
      continue;
    }
    if (!handcards || handcards.length === 0) continue;
    totalMatched += handcards.length;

    type HandcardRow = {
      id: string;
      assigned_rs_user_id: string | null;
      customer_id: string | null;
      backorder_color: string | null;
    };

    for (const hc of handcards as HandcardRow[]) {
      // call_type='custom' + metadata.backorder_matched=true（明確標示候補到貨任務）
      const { error: ctErr } = await supabase
        .from("call_tasks")
        .insert({
          brand_id: params.brandId,
          kind: "sales",
          call_type: "custom",
          assignee_id: hc.assigned_rs_user_id ?? null,
          customer_id: hc.customer_id ?? null,
          status: "pending",
          notes: `[候補到貨] 到港車輛符合候補登記：車型 ${v.modelDisplayName ?? v.vehicleModelId}，顏色：${hc.backorder_color ?? "—"}。請主動聯繫客戶確認購車意願。`,
          metadata: {
            backorder_matched: true,
            trigger: "vehicle_arrival",
            arrival_id: params.arrivalId,
            new_car_id: v.new_car_id,
            handcard_id: hc.id,
            vehicle_model_id: v.vehicleModelId,
          },
          scheduled_at: new Date().toISOString(),
          created_by: params.createdBy,
        });
      if (ctErr) {
        console.error("[域C/A-10] 建立 call_task 失敗", ctErr.message, { handcard_id: hc.id });
      } else {
        totalCreated++;
      }
    }
  }

  return { matched: totalMatched, created: totalCreated };
}

// ── 編號產生器：ARR-YYYYMMDD-NNN（query 當日最大序號 +1）──────────────

export async function nextArrivalNo(brandId: string): Promise<string> {
  const supabase = await createClient();
  // Asia/Taipei：UTC+8 算當日
  const tpe = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const yyyymmdd = `${tpe.getUTCFullYear()}${String(tpe.getUTCMonth() + 1).padStart(2, "0")}${String(tpe.getUTCDate()).padStart(2, "0")}`;
  const prefix = `ARR-${yyyymmdd}-`;

  const { data, error } = await supabase
    .from("vehicle_arrivals")
    .select("arrival_no")
    .eq("brand_id", brandId)
    .like("arrival_no", `${prefix}%`)
    .order("arrival_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  let next = 1;
  if (data?.arrival_no) {
    const tail = data.arrival_no.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(3, "0")}`;
}
