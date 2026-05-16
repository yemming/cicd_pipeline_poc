"use server";

/**
 * Domain Helper — Aftersales Repair Orders（正式工單 RO）
 *
 * 從預檢單 / 預約轉 RO 的 gate page 主資料 + RO list / detail 讀取。
 * 對應頁面：/parts/aftersales/repair-orders（list） / .../repair-orders/new（gate confirm）
 * Spec：docs/proposals/feature-aftersales-ro-phase1.md
 * 來源 HTML：docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/02_正式工單RO.html
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  PREFIX_P1_DEFS,
  PREFIX_P2_DEFS,
  type PrefixP1,
  type PrefixP2,
} from "./repair-orders.constants";

export type RepairOrderRow = {
  id: string;
  brand_id: string;
  ro_code: string;
  prefix_p1: PrefixP1;
  prefix_p2: PrefixP2;
  issue_date: string;
  sequence_no: number;
  appointment_id: string | null;
  pre_inspection_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  mileage_in: number | null;
  sa_id: string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  estimated_subtotal: number | null;
  estimated_labor_units: number | null;
  warranty_status_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  store_id: string | null;
  subsidiary_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RepairOrderListRow = RepairOrderRow & {
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  sa_name: string | null;
};

export type RepairOrderListFilters = {
  status?: string;
  prefix_p1?: string;
  prefix_p2?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  sa_id?: string;
  business_month?: string;
};

/** 預檢摘要（gate confirm 頁的「由預檢單帶入」段）— 因 pre_inspections 表尚未落地，
 * 此 helper 接受 appointment_id 為來源，後續 PI 表落地後追加 pre_inspection_id 入口。 */
export type RoDraft = {
  source: "appointment" | "pre_inspection";
  source_id: string;
  customer: { id: string; name: string; phone: string | null } | null;
  vehicle: {
    id: string;
    license_plate: string | null;
    model_name: string | null;
    current_mileage: number | null;
    warranty_until: string | null;
  } | null;
  appointment_id: string | null;
  pre_inspection_id: string | null;
  arrived_date: string;
  brand_id: string;
  store_id: string | null;
  subsidiary_id: string | null;
  warranty: { is_valid: boolean; expires_at: string | null; mileage_limit: string };
  /** PI 是否勾「疑似保固問題」/「公報召回通知」— 用來把 RO P1 預設成 WC（拍板紀錄 §11 Q4 option A） */
  has_warranty_concern: boolean;
  estimated_subtotal: number;
  estimated_labor_units: number;
  preview_items: { label: string; lu: number; amount: number }[];
};

function todayIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function listRepairOrders(
  filters: RepairOrderListFilters = {},
): Promise<RepairOrderListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("repair_orders")
    .select("*")
    .eq("brand_id", brand)
    .order("issue_date", { ascending: false })
    .order("sequence_no", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.prefix_p1 && filters.prefix_p1 !== "all")
    query = query.eq("prefix_p1", filters.prefix_p1);
  if (filters.prefix_p2 && filters.prefix_p2 !== "all")
    query = query.eq("prefix_p2", filters.prefix_p2);
  if (filters.date_from) query = query.gte("issue_date", filters.date_from);
  if (filters.date_to) query = query.lte("issue_date", filters.date_to);
  if (filters.q && filters.q.trim()) query = query.ilike("ro_code", `%${filters.q.trim()}%`);
  if (filters.sa_id && filters.sa_id !== "all") query = query.eq("sa_id", filters.sa_id);
  if (filters.business_month && /^\d{4}-\d{2}$/.test(filters.business_month)) {
    const [yy, mm] = filters.business_month.split("-").map(Number);
    const from = `${yy}-${String(mm).padStart(2, "0")}-01`;
    const next = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    query = query.gte("issue_date", from).lt("issue_date", next);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as RepairOrderRow[];
  return joinRepairOrderRows(rows, brand);
}

async function joinRepairOrderRows(
  rows: RepairOrderRow[],
  brand_id: string,
): Promise<RepairOrderListRow[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const customerIds = Array.from(
    new Set(rows.map((r) => r.customer_id).filter((v): v is string => Boolean(v))),
  );
  const vehicleIds = Array.from(
    new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => Boolean(v))),
  );
  const saIds = Array.from(
    new Set(rows.map((r) => r.sa_id).filter((v): v is string => Boolean(v))),
  );
  const [custRes, vehRes, saRes] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, name, phone")
          .eq("brand_id", brand_id)
          .in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[] }),
    vehicleIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, vehicle_models(display_name)")
          .in("id", vehicleIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            license_plate: string;
            vehicle_models: { display_name?: string } | { display_name?: string }[] | null;
          }[],
        }),
    saIds.length
      ? supabase.from("employees").select("id, name").in("id", saIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const custMap = new Map(
    ((custRes.data ?? []) as { id: string; name: string; phone: string | null }[]).map((c) => [
      c.id,
      c,
    ]),
  );
  const vehMap = new Map(
    ((vehRes.data ?? []) as Array<{
      id: string;
      license_plate: string;
      vehicle_models: { display_name?: string } | { display_name?: string }[] | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [v.id, { license_plate: v.license_plate, model_name: m?.display_name ?? null }] as const;
    }),
  );
  const saMap = new Map(
    ((saRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  return rows.map((r) => ({
    ...r,
    customer_name: r.customer_id ? custMap.get(r.customer_id)?.name ?? null : null,
    customer_phone: r.customer_id ? custMap.get(r.customer_id)?.phone ?? null : null,
    vehicle_license_plate: r.vehicle_id
      ? vehMap.get(r.vehicle_id)?.license_plate ?? null
      : null,
    vehicle_model_name: r.vehicle_id ? vehMap.get(r.vehicle_id)?.model_name ?? null : null,
    sa_name: r.sa_id ? saMap.get(r.sa_id) ?? null : null,
  }));
}

export async function getRepairOrderById(id: string): Promise<RepairOrderListRow | null> {
  if (!id) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const joined = await joinRepairOrderRows([data as unknown as RepairOrderRow], brand);
  return joined[0] ?? null;
}

/** 從 appointment 組 RO draft（PI 表落地前的 demo 來源） */
export async function getRoDraftFromAppointment(
  appointmentId: string,
): Promise<RoDraft | null> {
  if (!appointmentId) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: appt, error } = await supabase
    .from("appointments")
    .select(
      "id, brand_id, store_id, subsidiary_id, appointment_date, customer_id, vehicle_id, service_type, service_subtype, estimated_hours, notes",
    )
    .eq("id", appointmentId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !appt) return null;

  const a = appt as Record<string, unknown>;

  const [custRes, vehRes] = await Promise.all([
    a.customer_id
      ? supabase
          .from("customers")
          .select("id, name, phone")
          .eq("id", a.customer_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    a.vehicle_id
      ? supabase
          .from("customer_vehicles")
          .select(
            "id, license_plate, current_mileage, warranty_until, model_id, vehicle_models(display_name)",
          )
          // NOTE: vehicle_models column is `display_name`, not `name`. helper join 修正於 ro-search 落地。
          .eq("id", a.vehicle_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const cust = custRes.data as { id: string; name: string; phone: string | null } | null;
  const vehRaw = vehRes.data as
    | {
        id: string;
        license_plate: string;
        current_mileage: number | null;
        warranty_until: string | null;
        vehicle_models: { display_name?: string } | { display_name?: string }[] | null;
      }
    | null;

  const vehicleModelName = vehRaw
    ? Array.isArray(vehRaw.vehicle_models)
      ? vehRaw.vehicle_models[0]?.display_name ?? null
      : vehRaw.vehicle_models?.display_name ?? null
    : null;

  // 預估金額：取 appointment.estimated_hours × 單位 LU 工資 + 標準保養零件估
  const lu = Number(a.estimated_hours ?? 1);
  const estLabor = lu * 1500; // 每 LU 1500 元 demo 估
  const previewItems: { label: string; lu: number; amount: number }[] =
    a.service_type === "保養"
      ? [
          { label: "Desmo 12,000km 定期保養", lu: 2.5, amount: 5300 },
          { label: "前煞車皮（左右）更換", lu: 0.5, amount: 2000 },
          { label: "鏈條張力調整", lu: 0.5, amount: 500 },
        ]
      : [
          {
            label: `${a.service_type ?? "維修"}${a.service_subtype ? "—" + a.service_subtype : ""}`,
            lu,
            amount: Math.round(estLabor),
          },
        ];
  const estTotal = previewItems.reduce((s, x) => s + x.amount, 0);

  const warrantyValid = vehRaw?.warranty_until
    ? new Date(vehRaw.warranty_until) > new Date()
    : false;

  // 從 appointment 反查 PI、抓 metadata.purposes 看有沒有勾「疑似保固」(idx 5) / 「公報召回」(idx 6)
  const { data: piRow } = await supabase
    .from("pre_inspections")
    .select("metadata")
    .eq("appointment_id", appointmentId)
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const piPurposes =
    (piRow?.metadata as { purposes?: number[] } | null)?.purposes ?? [];
  const hasWarrantyConcern = piPurposes.includes(5) || piPurposes.includes(6);

  return {
    source: piRow ? "pre_inspection" : "appointment",
    source_id: appointmentId,
    customer: cust,
    vehicle: vehRaw
      ? {
          id: vehRaw.id,
          license_plate: vehRaw.license_plate,
          model_name: vehicleModelName,
          current_mileage: vehRaw.current_mileage,
          warranty_until: vehRaw.warranty_until,
        }
      : null,
    appointment_id: appointmentId,
    pre_inspection_id: null,
    arrived_date: (a.appointment_date as string) ?? todayIsoDate(),
    brand_id: brand,
    store_id: (a.store_id as string) ?? null,
    subsidiary_id: (a.subsidiary_id as string) ?? null,
    warranty: {
      is_valid: warrantyValid,
      expires_at: vehRaw?.warranty_until ?? null,
      mileage_limit: "NORM",
    },
    has_warranty_concern: hasWarrantyConcern,
    estimated_subtotal: estTotal,
    estimated_labor_units: lu,
    preview_items: previewItems,
  };
}

/** Gate page 用：取最近一筆可被「轉 RO」的 appointment，若沒指定 from。 */
export async function getDefaultDraftCandidate(): Promise<{
  id: string;
  label: string;
} | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("appointments")
    .select("id, appointment_date, customer_id, status")
    .eq("brand_id", brand)
    .order("appointment_date", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { id: string; appointment_date: string } | undefined;
  if (!row) return null;
  return { id: row.id, label: `${row.appointment_date} 預約` };
}

export type RepairOrderListPageData = {
  rows: RepairOrderListRow[];
  totalCount: number;
  prefixP1Defs: typeof PREFIX_P1_DEFS;
  prefixP2Defs: typeof PREFIX_P2_DEFS;
};

export async function getRepairOrdersListPageData(
  filters: RepairOrderListFilters,
): Promise<RepairOrderListPageData> {
  const rows = await listRepairOrders(filters);
  return {
    rows,
    totalCount: rows.length,
    prefixP1Defs: PREFIX_P1_DEFS,
    prefixP2Defs: PREFIX_P2_DEFS,
  };
}

// ----- Aftersales · 工單查詢頁（售後 · 10）-----

export type RoSearchSaOption = { id: string; name: string };

export type RoSearchKpi = {
  monthRoCount: number;
  monthRoCountDeltaVsLast: number;
  inProgressCount: number;
  inProgressTodayCount: number;
  monthRevenueCustomerPay: number;
  avgRoAmount: number;
};

export type RoSearchPageData = {
  rows: RepairOrderListRow[];
  totalCount: number;
  saOptions: RoSearchSaOption[];
  kpi: RoSearchKpi;
};

/** 取得售後工單查詢頁的 SA 下拉候選（同 brand 內部 SA / 員工） */
export async function listRoSearchSaOptions(): Promise<RoSearchSaOption[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) 蒐集 brand 內 RO 出現過的 sa_id
  const { data: ros } = await supabase
    .from("repair_orders")
    .select("sa_id")
    .eq("brand_id", brand)
    .not("sa_id", "is", null)
    .limit(2000);
  const saIds = Array.from(
    new Set((ros ?? []).map((r) => (r as { sa_id: string | null }).sa_id).filter(Boolean) as string[]),
  );
  if (saIds.length === 0) return [];
  const { data: emps } = await supabase
    .from("employees")
    .select("id, name")
    .in("id", saIds);
  return ((emps ?? []) as { id: string; name: string }[]).map((e) => ({
    id: e.id,
    name: e.name,
  }));
}

/** 取得售後工單查詢頁的 KPI 摘要（依 business_month / filters 範圍計算） */
export async function getRoSearchKpi(filters: RepairOrderListFilters): Promise<RoSearchKpi> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 月份範圍：filter 給就用，否則用台北今日所在月
  let month = filters.business_month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    const today = todayIsoDate();
    month = today.slice(0, 7);
  }
  const [yy, mm] = month.split("-").map(Number);
  const monthFrom = `${yy}-${String(mm).padStart(2, "0")}-01`;
  const monthTo =
    mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
  const lastMonthFrom =
    mm === 1
      ? `${yy - 1}-12-01`
      : `${yy}-${String(mm - 1).padStart(2, "0")}-01`;
  const lastMonthTo = monthFrom;

  // 並行：本月 / 上月 / 進行中
  const [thisM, lastM, inProg] = await Promise.all([
    supabase
      .from("repair_orders")
      .select("id, prefix_p2, estimated_subtotal", { count: "exact" })
      .eq("brand_id", brand)
      .gte("issue_date", monthFrom)
      .lt("issue_date", monthTo),
    supabase
      .from("repair_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .gte("issue_date", lastMonthFrom)
      .lt("issue_date", lastMonthTo),
    supabase
      .from("repair_orders")
      .select("id, issue_date", { count: "exact" })
      .eq("brand_id", brand)
      .in("status", ["進行中", "維修中", "待結帳"]),
  ]);

  const thisRows = (thisM.data ?? []) as {
    id: string;
    prefix_p2: string;
    estimated_subtotal: number | null;
  }[];
  const monthRoCount = thisM.count ?? thisRows.length;
  const monthRoCountDeltaVsLast = monthRoCount - (lastM.count ?? 0);

  // 客付產值：prefix_p2 = CP（保固 WR / 免費 FR 不計）
  const monthRevenueCustomerPay = thisRows
    .filter((r) => r.prefix_p2 === "CP")
    .reduce((s, r) => s + Number(r.estimated_subtotal ?? 0), 0);

  const avgRoAmount =
    monthRoCount > 0
      ? Math.round(
          thisRows.reduce((s, r) => s + Number(r.estimated_subtotal ?? 0), 0) / monthRoCount,
        )
      : 0;

  const inProgRows = (inProg.data ?? []) as { id: string; issue_date: string }[];
  const today = todayIsoDate();
  return {
    monthRoCount,
    monthRoCountDeltaVsLast,
    inProgressCount: inProg.count ?? inProgRows.length,
    inProgressTodayCount: inProgRows.filter((r) => r.issue_date === today).length,
    monthRevenueCustomerPay,
    avgRoAmount,
  };
}

export async function getRoSearchPageData(
  filters: RepairOrderListFilters,
): Promise<RoSearchPageData> {
  // 查詢頁預設帶台北當月，避免空狀態
  const effectiveFilters: RepairOrderListFilters = {
    ...filters,
    business_month:
      filters.business_month && /^\d{4}-\d{2}$/.test(filters.business_month)
        ? filters.business_month
        : todayIsoDate().slice(0, 7),
  };
  const [rows, saOptions, kpi] = await Promise.all([
    listRepairOrders(effectiveFilters),
    listRoSearchSaOptions(),
    getRoSearchKpi(effectiveFilters),
  ]);
  return { rows, totalCount: rows.length, saOptions, kpi };
}

/** 內部用：取下一個流水號（同 brand × date × p1 × p2 的當日流水） */
export async function nextSequenceNo(
  brand_id: string,
  issue_date: string,
  p1: PrefixP1,
  p2: PrefixP2,
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repair_orders")
    .select("sequence_no")
    .eq("brand_id", brand_id)
    .eq("issue_date", issue_date)
    .eq("prefix_p1", p1)
    .eq("prefix_p2", p2)
    .order("sequence_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { sequence_no: number } | undefined;
  return (top?.sequence_no ?? 0) + 1;
}
