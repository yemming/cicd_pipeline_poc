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
  RO_STATUS_OPTIONS,
  RO_PRIORITY_SORT,
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
  lead_technician_id: string | null;
  status: string;
  /** 優先級 G-1：urgent | normal | flexible（派工置頂依此）*/
  priority: string | null;
  opened_at: string | null;
  closed_at: string | null;
  estimated_subtotal: number | null;
  estimated_labor_units: number | null;
  lines_subtotal: number | null;
  lines_total: number | null;
  warranty_status_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  store_id: string | null;
  subsidiary_id: string | null;
  images: string[] | null;
  /** 費用歸屬：customer（一般客付）/ vehicle_cost（PD 整備計入整車成本）/ vendor / insurer 等 */
  fee_allocation: string | null;
  related_new_car_id: string | null;
  related_used_car_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RepairOrderListRow = RepairOrderRow & {
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  sa_name: string | null;
  lead_technician_name: string | null;
  lead_technician_code: string | null;
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
  /** 同車近 30 天的歷史工單（返工偵測用）—— confirm-view 依當前 P1 過濾出同類 */
  recent_repairs: RecentRepairRow[];
};

/** 返工偵測：同 vehicle_id 近 N 天的工單摘要 */
export type RecentRepairRow = {
  id: string;
  ro_code: string;
  issue_date: string;
  prefix_p1: string;
  prefix_p2: string;
  status: string;
};

/**
 * 偵測同車近 withinDays 天內的工單（返工 RP-FR 判斷依據）。
 * confirm-view 拿到後再依「當前選的 P1」過濾出同類，避免換 P1 要重打 API。
 * 排除已取消單。
 */
export async function detectRecentRepairs(
  vehicleId: string,
  withinDays = 30,
): Promise<RecentRepairRow[]> {
  if (!vehicleId) return [];
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const since = new Date(Date.now() - withinDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const { data } = await supabase
    .from("repair_orders")
    .select("id, ro_code, issue_date, prefix_p1, prefix_p2, status")
    .eq("brand_id", brand)
    .eq("vehicle_id", vehicleId)
    .neq("status", "已取消")
    .gte("issue_date", since)
    .order("issue_date", { ascending: false })
    .limit(20);
  return (data ?? []) as RecentRepairRow[];
}

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
  const techIds = Array.from(
    new Set(rows.map((r) => r.lead_technician_id).filter((v): v is string => Boolean(v))),
  );
  const [custRes, vehRes, saRes, techRes] = await Promise.all([
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
    techIds.length
      ? supabase
          .from("aftersales_technicians")
          .select("id, name, code")
          .eq("brand_id", brand_id)
          .in("id", techIds)
      : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
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
  const techMap = new Map(
    ((techRes.data ?? []) as { id: string; name: string; code: string }[]).map((t) => [
      t.id,
      { name: t.name, code: t.code },
    ]),
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
    lead_technician_name: r.lead_technician_id
      ? techMap.get(r.lead_technician_id)?.name ?? null
      : null,
    lead_technician_code: r.lead_technician_id
      ? techMap.get(r.lead_technician_id)?.code ?? null
      : null,
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

  // 返工偵測：同車近 30 天工單（confirm-view 依當前 P1 過濾出同類）
  const recentRepairs = vehRaw?.id
    ? await detectRecentRepairs(vehRaw.id, 30)
    : [];

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
    recent_repairs: recentRepairs,
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

export type RoStatusStat = {
  status: string;
  count: number;
};

export type RepairOrderListPageData = {
  rows: RepairOrderListRow[];
  totalCount: number;
  prefixP1Defs: typeof PREFIX_P1_DEFS;
  prefixP2Defs: typeof PREFIX_P2_DEFS;
  statusStats: RoStatusStat[];
};

/**
 * getRoStatsByStatus — 同 brand 內 RO 各狀態筆數（M03-3 spec）。
 *
 * 給 List 頁頂 DonutChart 用。**只看 brand，不套 filter** —— donut 顯示「該 brand 整體
 * 工單分佈」是稳定的全景；filter 結果筆數另外由 totalCount 顯示。
 */
export async function getRoStatsByStatus(): Promise<RoStatusStat[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_orders")
    .select("status")
    .eq("brand_id", brand);

  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { status: string }[]) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }
  // 按 RO_STATUS_OPTIONS 順序排
  return RO_STATUS_OPTIONS.map((s) => ({
    status: s as string,
    count: counts.get(s) ?? 0,
  }));
}

export async function getRepairOrdersListPageData(
  filters: RepairOrderListFilters,
): Promise<RepairOrderListPageData> {
  const [rows, statusStats] = await Promise.all([
    listRepairOrders(filters),
    getRoStatsByStatus(),
  ]);
  return {
    rows,
    totalCount: rows.length,
    prefixP1Defs: PREFIX_P1_DEFS,
    prefixP2Defs: PREFIX_P2_DEFS,
    statusStats,
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

/**
 * B-21：把目前登入者解析成 employees.id（= 工單的 sa_id 口徑），
 * 給「今日我的工單」快篩用。找不到對應員工回 null。
 */
export async function getEmployeeIdByUser(userId: string): Promise<string | null> {
  if (!userId) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("brand_id", brand)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
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
  // B-21：指定日期區間（如「今日」快篩）時，以日期區間為準、不再套當月 fallback
  const hasDayRange = Boolean(filters.date_from || filters.date_to);
  // 查詢頁預設帶台北當月，避免空狀態
  const effectiveFilters: RepairOrderListFilters = {
    ...filters,
    business_month: hasDayRange
      ? undefined
      : filters.business_month && /^\d{4}-\d{2}$/.test(filters.business_month)
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

// ----- 包B：派工看板「緊急工單置頂」面板資料 -----

export type UrgentRoRow = {
  id: string;
  ro_code: string;
  status: string;
  customer_name: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  lead_technician_name: string | null;
};

/** 同 brand 內「緊急(urgent)」且未結束的工單，給派工看板置頂顯示 */
export async function listUrgentOpenRos(limit = 10): Promise<UrgentRoRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("brand_id", brand)
    .eq("priority", "urgent")
    .in("status", ["進行中", "維修中", "待結帳"])
    .order("issue_date", { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as unknown as RepairOrderRow[];
  const joined = await joinRepairOrderRows(rows, brand);
  return joined.map((r) => ({
    id: r.id,
    ro_code: r.ro_code,
    status: r.status,
    customer_name: r.customer_name,
    vehicle_license_plate: r.vehicle_license_plate,
    vehicle_model_name: r.vehicle_model_name,
    lead_technician_name: r.lead_technician_name,
  }));
}

/**
 * B-19：待派工工單 — 工單確認後 status='進行中'（尚未派給技師，派工後才轉 '維修中'）。
 * 派工看板用此清單顯示「⚠️ 有 N 張新工單待派工」通知橫幅。
 */
export async function listPendingDispatchRos(limit = 20): Promise<UrgentRoRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("brand_id", brand)
    .eq("status", "進行中")
    .order("priority", { ascending: true }) // urgent 排前
    .order("issue_date", { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as unknown as RepairOrderRow[];
  const joined = await joinRepairOrderRows(rows, brand);
  return joined.map((r) => ({
    id: r.id,
    ro_code: r.ro_code,
    status: r.status,
    customer_name: r.customer_name,
    vehicle_license_plate: r.vehicle_license_plate,
    vehicle_model_name: r.vehicle_model_name,
    lead_technician_name: r.lead_technician_name,
  }));
}

// ----- /service/workshop · 真派工看板 P1-#11 -----

export type WorkshopTechnicianRow = {
  id: string;
  code: string;
  name: string;
  grade: string | null;
  avatar_color: string | null;
  status: string;
  is_active: boolean;
  assigned_ro_count: number;
};

export type WorkshopBoardData = {
  active_ros: RepairOrderListRow[];
  technicians: WorkshopTechnicianRow[];
};

/** workshop 真派工頁的雙欄資料：active RO 清單 + 技師看板 */
export async function getWorkshopBoardData(): Promise<WorkshopBoardData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [roRes, techRes] = await Promise.all([
    supabase
      .from("repair_orders")
      .select("*")
      .eq("brand_id", brand)
      .not("status", "in", '("已關單","已取消","completed","cancelled","closed")')
      .order("issue_date", { ascending: false })
      .order("sequence_no", { ascending: false })
      .limit(200),
    supabase
      .from("aftersales_technicians")
      .select("id, code, name, grade, avatar_color, status, is_active")
      .eq("brand_id", brand)
      .order("sort_order", { ascending: true }),
  ]);

  if (roRes.error) throw roRes.error;
  if (techRes.error) throw techRes.error;

  const roRows = (roRes.data ?? []) as unknown as RepairOrderRow[];
  const joined = await joinRepairOrderRows(roRows, brand);

  // 派工置頂：依優先級排序（緊急 → 一般 → 彈性），同級維持原本日期序
  joined.sort(
    (a, b) =>
      (RO_PRIORITY_SORT[a.priority ?? "normal"] ?? 1) -
      (RO_PRIORITY_SORT[b.priority ?? "normal"] ?? 1),
  );

  // 計算每位技師被指派多少張 active RO（依 lead_technician_id）
  const techCountMap = new Map<string, number>();
  for (const r of joined) {
    if (r.lead_technician_id) {
      techCountMap.set(
        r.lead_technician_id,
        (techCountMap.get(r.lead_technician_id) ?? 0) + 1,
      );
    }
  }

  const technicians: WorkshopTechnicianRow[] = (
    (techRes.data ?? []) as {
      id: string;
      code: string;
      name: string;
      grade: string | null;
      avatar_color: string | null;
      status: string;
      is_active: boolean;
    }[]
  ).map((t) => ({
    ...t,
    assigned_ro_count: techCountMap.get(t.id) ?? 0,
  }));

  return { active_ros: joined, technicians };
}

/** Re-export 給 UI 統一 import @/domain/repair-orders（包成 wrapper 才能在 "use server" 檔重新導出）*/
import { setLeadTechnicianAction } from "@/lib/aftersales/repair-order-actions";
export async function setLeadTechnician(
  roId: string,
  technicianId: string | null,
) {
  return setLeadTechnicianAction(roId, technicianId);
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

// ─────────────────────────────────────────────────────────────
// 列印 — getRepairOrderForPrint(id)
//
// 跟 detail 不同：除了單頭，還要撈
//   - subsidiary（服務端法人 letterhead）
//   - customer 完整聯絡（電話 / email / 地址）
//   - vehicle 車籍（VIN / 引擎號碼 / 出廠日 / 現里程 / 保固到期）
//   - workshop / store 地址
//   - repair_order_lines：labor + parts 兩段
// 一支 helper 一次撈乾淨，print page 不要自己拼 query。
// ─────────────────────────────────────────────────────────────

export type RepairOrderForPrint = {
  /** repair_orders.id (uuid)，給 /api/pdf/repair-order/{id} 用 */
  id: string;
  // 服務端（公司 letterhead）
  buyer: {
    legalName: string;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    responsible: string | null;
  };
  brand: { key: string; displayName: string };

  // 客戶 + 車輛
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  vehicle: {
    licensePlate: string | null;
    modelName: string | null;
    vin: string | null;
    engineNo: string | null;
    color: string | null;
    manufacturedYear: number | null;
    currentMileage: number | null;
    warrantyUntil: string | null;
  };

  // 工廠 / 服務點
  workshop: {
    name: string | null;
    address: string | null;
  };

  // 單頭
  roCode: string;
  issueDate: string | null;
  prefixP1: string;
  prefixP2: string;
  status: string;
  saName: string | null;
  leadTechnicianName: string | null;
  leadTechnicianCode: string | null;
  mileageIn: number | null;
  openedAt: string | null;
  estimatedCompletion: string | null;
  closedAt: string | null;
  notes: string | null;
  customerComplaint: string | null;

  // 明細 — 兩段
  laborLines: Array<{
    lineNo: number;
    name: string;
    units: number;
    unitPrice: number;
    amount: number;
    isWarranty: boolean;
    note: string | null;
  }>;
  partLines: Array<{
    lineNo: number;
    code: string | null;
    name: string;
    qty: number;
    unitPrice: number;
    amount: number;
    isWarranty: boolean;
  }>;

  // 總計（同 lines 頁的算法：折扣 → 稅 5% → 含稅）
  amountLaborSubtotal: number;
  amountPartsSubtotal: number;
  amountSubtotal: number;
  discountPct: number;
  amountTax: number;
  amountTotal: number;
};

export async function getRepairOrderForPrint(
  id: string,
): Promise<RepairOrderForPrint | null> {
  if (!id) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();
  const brand = scope.brand_id;

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr || !ro) return null;

  const roRec = ro as unknown as RepairOrderRow;
  const meta = (roRec.metadata ?? {}) as Record<string, unknown>;
  const discount_pct = Number(meta.discount_pct ?? 0);
  // 客訴 / 預計完工 / 備註目前都存 metadata（repair_orders 沒有對應 typed column）
  const customerComplaint =
    typeof meta.customer_complaint === "string"
      ? (meta.customer_complaint as string)
      : typeof meta.complaint === "string"
        ? (meta.complaint as string)
        : null;
  const estimatedCompletion =
    typeof meta.estimated_completion === "string"
      ? (meta.estimated_completion as string)
      : null;
  const notes =
    typeof meta.notes === "string"
      ? (meta.notes as string)
      : typeof meta.memo === "string"
        ? (meta.memo as string)
        : null;

  const brandDisplayName: Record<string, string> = {
    ducati: "Ducati Taiwan",
    indian: "Indian Motorcycle Taiwan",
  };

  const [subsRes, custRes, vehRes, saRes, techRes, linesRes, storeRes] = await Promise.all([
    scope.subsidiary_id
      ? supabase
          .from("subsidiaries")
          .select("legal_name, tax_id, address, phone, responsible_person")
          .eq("id", scope.subsidiary_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    roRec.customer_id
      ? supabase
          .from("customers")
          .select("name, phone, email, address")
          .eq("id", roRec.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    roRec.vehicle_id
      ? supabase
          .from("customer_vehicles")
          .select(
            "license_plate, vin, engine_no, color, manufactured_year, current_mileage, warranty_until, vehicle_models(display_name)",
          )
          .eq("id", roRec.vehicle_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    roRec.sa_id
      ? supabase
          .from("employees")
          .select("name")
          .eq("id", roRec.sa_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    roRec.lead_technician_id
      ? supabase
          .from("aftersales_technicians")
          .select("name, code")
          .eq("id", roRec.lead_technician_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    supabase
      .from("repair_order_lines")
      .select(
        "id, line_no, kind, labor_name, labor_units, labor_note, part_code, part_name, qty, unit_price, amount, is_warranty",
      )
      .eq("repair_order_id", id)
      .order("line_no", { ascending: true }),
    roRec.store_id
      ? supabase
          .from("organizations")
          .select("name, address")
          .eq("id", roRec.store_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
  ]);

  const subs = subsRes.data as
    | {
        legal_name: string;
        tax_id: string | null;
        address: string | null;
        phone: string | null;
        responsible_person: string | null;
      }
    | null;
  const cust = custRes.data as
    | { name: string; phone: string | null; email: string | null; address: string | null }
    | null;
  const vehRaw = vehRes.data as
    | {
        license_plate: string | null;
        vin: string | null;
        engine_no: string | null;
        color: string | null;
        manufactured_year: number | null;
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
  const sa = saRes.data as { name: string } | null;
  const tech = techRes.data as { name: string; code: string } | null;
  const store = storeRes.data as { name: string | null; address: string | null } | null;

  type LineRaw = {
    line_no: number;
    kind: "labor" | "part";
    labor_name: string | null;
    labor_units: number | null;
    labor_note: string | null;
    part_code: string | null;
    part_name: string | null;
    qty: number | null;
    unit_price: number;
    amount: number;
    is_warranty: boolean;
  };
  const allLines = (linesRes.data ?? []) as unknown as LineRaw[];
  const laborLines = allLines
    .filter((l) => l.kind === "labor")
    .map((l) => ({
      lineNo: l.line_no,
      name: l.labor_name ?? "—",
      units: Number(l.labor_units ?? 0),
      unitPrice: Number(l.unit_price ?? 0),
      amount: Number(l.amount ?? 0),
      isWarranty: l.is_warranty === true,
      note: l.labor_note,
    }));
  const partLines = allLines
    .filter((l) => l.kind === "part")
    .map((l) => ({
      lineNo: l.line_no,
      code: l.part_code,
      name: l.part_name ?? "—",
      qty: Number(l.qty ?? 0),
      unitPrice: Number(l.unit_price ?? 0),
      amount: Number(l.amount ?? 0),
      isWarranty: l.is_warranty === true,
    }));

  // 金額：跟 lines 頁同算法（subtotal × (1-discount%) → tax 5% → total）
  const TAX_RATE = 0.05;
  const laborSubtotal = laborLines.reduce((s, l) => s + l.amount, 0);
  const partsSubtotal = partLines.reduce((s, l) => s + l.amount, 0);
  const subtotal = laborSubtotal + partsSubtotal;
  const safeDiscount = Math.max(0, Math.min(30, discount_pct));
  const discounted = subtotal * (1 - safeDiscount / 100);
  const tax = Math.round(discounted * TAX_RATE);
  const total = Math.round(discounted + tax);

  return {
    id: roRec.id,
    buyer: {
      legalName: subs?.legal_name ?? "—",
      taxId: subs?.tax_id ?? null,
      address: subs?.address ?? null,
      phone: subs?.phone ?? null,
      responsible: subs?.responsible_person ?? null,
    },
    brand: {
      key: brand,
      displayName: brandDisplayName[brand] ?? brand,
    },
    customer: {
      name: cust?.name ?? null,
      phone: cust?.phone ?? null,
      email: cust?.email ?? null,
      address: cust?.address ?? null,
    },
    vehicle: {
      licensePlate: vehRaw?.license_plate ?? null,
      modelName: vehicleModelName,
      vin: vehRaw?.vin ?? null,
      engineNo: vehRaw?.engine_no ?? null,
      color: vehRaw?.color ?? null,
      manufacturedYear: vehRaw?.manufactured_year ?? null,
      currentMileage: vehRaw?.current_mileage ?? null,
      warrantyUntil: vehRaw?.warranty_until ?? null,
    },
    workshop: {
      name: store?.name ?? null,
      address: store?.address ?? null,
    },
    roCode: roRec.ro_code,
    issueDate: roRec.issue_date,
    prefixP1: roRec.prefix_p1,
    prefixP2: roRec.prefix_p2,
    status: roRec.status,
    saName: sa?.name ?? null,
    leadTechnicianName: tech?.name ?? null,
    leadTechnicianCode: tech?.code ?? null,
    mileageIn: roRec.mileage_in,
    openedAt: roRec.opened_at,
    estimatedCompletion,
    closedAt: roRec.closed_at,
    notes,
    customerComplaint,
    laborLines,
    partLines,
    amountLaborSubtotal: laborSubtotal,
    amountPartsSubtotal: partsSubtotal,
    amountSubtotal: subtotal,
    discountPct: safeDiscount,
    amountTax: tax,
    amountTotal: total,
  };
}

// ─────────────────────────────────────────────────────────────
// RP4 層二：工單事件時間軸（append-only）
//
// 所有關鍵動作呼叫 appendRepairOrderEvent 把事件 append 到
// repair_orders.metadata.events[]（server UTC，不可改刪語意）。
//
// 欄位定義：
//   action      — 事件種類（見 RoEventAction）
//   actor_id    — auth.uid()，server context 取
//   at          — new Date().toISOString()（server UTC，防偽造）
//   payload     — 事件特定資料（可選）
//
// TODO promote: Phase 2 DDL 新增 repair_order_events 表，
//   讓事件持久化到獨立 table 而非 jsonb（方便跨 RO 查詢、7年保存）。
//   目前 jsonb 方案足以 demo，且無需 DDL。
// ─────────────────────────────────────────────────────────────

export type RoEventAction =
  | "ro_created"             // confirmRepairOrderAction
  | "dispatched"             // setLeadTechnicianAction（指派技師）
  | "status_changed"         // updateRepairOrderStatusAction
  | "final_inspection_passed"  // final-inspection completeAction
  | "final_inspection_rejected" // final-inspection rejectAction
  | "discount_applied"       // ro-checkout applyDiscountAction
  | "checkout_completed"     // ro-checkout completeAction（關單）
  | "checkout_sig_cleared"   // RP2：主管解鎖清除簽名（ro-checkout clearSignAction）
  | "addon_decision"         // repair-order-addon-actions decideAddonAction
  | "addon_cancelled"        // repair-order-addon-actions cancelAddonAction（RP3 退料）
  | "contact_attempt";       // 聯繫嘗試記錄（B5-02）

export type RoEvent = {
  /** 事件種類 */
  action: RoEventAction;
  /** 操作人 user id（auth.uid()）；server UTC，防偽造 */
  actor_id: string | null;
  /** 事件發生時間（server UTC ISO 8601） */
  at: string;
  /** 事件特定資料（依 action 而異） */
  payload?: Record<string, unknown>;
};

/**
 * appendRepairOrderEvent — RP4 層二：append 一筆事件到 repair_orders.metadata.events[]
 *
 * - append-only 語意：只 push 不刪改，DB 層無 trigger（POC 階段依靠程式紀律）
 * - server-side UTC 時間戳（`at` = new Date().toISOString()）防客端偽造
 * - actor_id 由 supabase.auth.getUser() 取，非 client 傳入
 * - 失敗靜默記 console.error，不影響主流程（副作用語意）
 *
 * 呼叫方式（在 "use server" 環境）：
 *   await appendRepairOrderEvent(roId, { action: "status_changed", payload: { from, to } });
 *
 * @param roId     repair_orders.id
 * @param event    RoEvent（不含 actor_id / at，由此函式填入）
 * @param actorId  可選；caller 已取得的 actor_id（避免二次 auth.getUser() 呼叫）
 */
export async function appendRepairOrderEvent(
  roId: string,
  event: Omit<RoEvent, "actor_id" | "at">,
  actorId?: string | null,
): Promise<void> {
  if (!roId) return;
  try {
    const supabase = await createClient();

    // 取 actor_id（如果 caller 已有就直接用）
    let resolvedActorId = actorId ?? null;
    if (resolvedActorId === undefined) {
      const { data: { user } } = await supabase.auth.getUser();
      resolvedActorId = user?.id ?? null;
    }

    // 撈現有 metadata.events
    const { data: existing, error: fetchErr } = await supabase
      .from("repair_orders")
      .select("metadata")
      .eq("id", roId)
      .maybeSingle();
    if (fetchErr) {
      console.error("[appendRepairOrderEvent] fetch metadata 失敗", fetchErr.message);
      return;
    }

    const meta = ((existing?.metadata ?? {}) as Record<string, unknown>);
    const prevEvents = Array.isArray(meta.events)
      ? (meta.events as unknown[])
      : [];

    const newEvent: RoEvent = {
      action: event.action,
      actor_id: resolvedActorId,
      at: new Date().toISOString(), // server UTC，不信任 client 傳入時間
      ...(event.payload ? { payload: event.payload } : {}),
    };

    const { error: updErr } = await supabase
      .from("repair_orders")
      .update({
        metadata: {
          ...meta,
          events: [...prevEvents, newEvent],
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", roId);

    if (updErr) {
      console.error("[appendRepairOrderEvent] update 失敗", updErr.message);
    }
  } catch (e) {
    console.error("[appendRepairOrderEvent] 例外（不影響主流程）", e);
  }
}
