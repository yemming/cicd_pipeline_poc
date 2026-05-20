"use server";

/**
 * Domain Helper — Aftersales Appointments
 *
 * 售後預約管理：list / detail / create / update / status 切換。
 * 對應頁面：/parts/aftersales/appointments
 * Spec：docs/proposals/feature-aftersales-appointments.md
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import { TECH_LOAD_MAX } from "./appointments.constants";
import type {
  AppointmentRow,
  AppointmentListRow,
  AppointmentListFilters,
  DailyKpis,
  AppointmentStats,
  HeatmapCell,
  ScheduleSlot,
  TechnicianLoad,
  AppointmentLookups,
  AppointmentsListPageData,
} from "./appointments.constants";

// ── Re-export types from .constants.ts（server-side caller 仍可 import from "@/domain/appointments"）──
export type {
  AppointmentRow,
  AppointmentListRow,
  AppointmentListFilters,
  DailyKpis,
  AppointmentStats,
  HeatmapCell,
  ScheduleItem,
  ScheduleSlot,
  TechnicianLoad,
  AppointmentLookups,
  AppointmentsListPageData,
} from "./appointments.constants";

function todayIsoDate(): string {
  // Asia/Taipei 為標準（per global instruction）
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchLookups(brand_id: string): Promise<AppointmentLookups> {
  const supabase = await createClient();
  const [custRes, vehRes, techRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("brand_id", brand_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("customer_vehicles")
      .select("id, customer_id, license_plate, model_id, vehicle_models(name)")
      .eq("brand_id", brand_id)
      .eq("is_active", true)
      .order("license_plate")
      .limit(1000),
    supabase
      .from("employees")
      .select("id, name")
      .eq("brand_id", brand_id)
      .eq("is_active", true)
      .order("name")
      .limit(100),
  ]);
  const vehicles = (vehRes.data ?? []).map((v) => {
    const modelName =
      Array.isArray(v.vehicle_models)
        ? (v.vehicle_models[0] as { name?: string } | undefined)?.name ?? null
        : ((v.vehicle_models as { name?: string } | null)?.name ?? null);
    return {
      id: v.id as string,
      customer_id: v.customer_id as string,
      license_plate: (v.license_plate as string) ?? "",
      model_name: modelName,
    };
  });
  return {
    customers: (custRes.data ?? []) as { id: string; name: string; phone: string | null }[],
    vehicles,
    technicians: (techRes.data ?? []) as { id: string; name: string }[],
  };
}

async function joinAppointmentRows(
  rows: AppointmentRow[],
  brand_id: string,
): Promise<AppointmentListRow[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const customerIds = Array.from(
    new Set(rows.map((r) => r.customer_id).filter((v): v is string => Boolean(v))),
  );
  const vehicleIds = Array.from(
    new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => Boolean(v))),
  );
  const techIds = Array.from(
    new Set(
      rows
        .map((r) => r.assigned_technician_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const [custRes, vehRes, techRes] = await Promise.all([
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
          .select("id, license_plate, vehicle_models(name)")
          .in("id", vehicleIds)
      : Promise.resolve({ data: [] as { id: string; license_plate: string; vehicle_models: { name: string } | null }[] }),
    techIds.length
      ? supabase.from("employees").select("id, name").in("id", techIds)
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
      vehicle_models: { name?: string } | { name?: string }[] | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [v.id, { license_plate: v.license_plate, model_name: m?.name ?? null }] as const;
    }),
  );
  const techMap = new Map(
    ((techRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  return rows.map((r) => ({
    ...r,
    customer_name: r.customer_id ? custMap.get(r.customer_id)?.name ?? null : null,
    customer_phone: r.customer_id ? custMap.get(r.customer_id)?.phone ?? null : null,
    vehicle_license_plate: r.vehicle_id ? vehMap.get(r.vehicle_id)?.license_plate ?? null : null,
    vehicle_model_name: r.vehicle_id ? vehMap.get(r.vehicle_id)?.model_name ?? null : null,
    technician_name: r.assigned_technician_id
      ? techMap.get(r.assigned_technician_id) ?? null
      : null,
  }));
}

export async function listAppointments(
  filters: AppointmentListFilters,
): Promise<AppointmentListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const date = filters.date || todayIsoDate();

  let query = supabase
    .from("appointments")
    .select("*")
    .eq("brand_id", brand)
    .eq("appointment_date", date)
    .order("appointment_time");

  if (filters.status && filters.status !== "all" && filters.status !== "全部") {
    query = query.eq("status", filters.status);
  }
  if (filters.service_type && filters.service_type !== "all" && filters.service_type !== "全部") {
    query = query.eq("service_type", filters.service_type);
  }
  if (filters.technician_id && filters.technician_id !== "all") {
    query = query.eq("assigned_technician_id", filters.technician_id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return joinAppointmentRows((data ?? []) as AppointmentRow[], brand);
}

export async function getAppointmentById(id: string): Promise<AppointmentListRow | null> {
  if (!id) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const joined = await joinAppointmentRows([data as AppointmentRow], brand);
  return joined[0] ?? null;
}

function computeKpis(rows: AppointmentRow[]): DailyKpis {
  const total = rows.length;
  const arrived = rows.filter((r) =>
    ["已到廠", "等待中", "維修中", "待取車", "已完成"].includes(r.status),
  ).length;
  const waiting = rows.filter((r) => r.status === "等待中").length;
  // 超時：等待中且 arrived_at < 30 分鐘前
  const cutoff = Date.now() - 30 * 60 * 1000;
  const waiting_overdue = rows.filter(
    (r) => r.status === "等待中" && r.arrived_at && new Date(r.arrived_at).getTime() < cutoff,
  ).length;
  const inProgressList = rows.filter((r) => r.status === "維修中");
  const in_progress = inProgressList.length;
  const in_progress_avg_hours = in_progress
    ? Number(
        (
          inProgressList.reduce((sum, r) => sum + (Number(r.estimated_hours) || 0), 0) /
          in_progress
        ).toFixed(1),
      )
    : 0;
  const completed = rows.filter((r) => r.status === "已完成").length;
  const pending_pickup = rows.filter((r) => r.status === "待取車").length;
  return {
    total,
    arrived,
    waiting,
    waiting_overdue,
    in_progress,
    in_progress_avg_hours,
    completed,
    pending_pickup,
  };
}

function computeSchedule(rows: AppointmentListRow[]): ScheduleSlot[] {
  // 用半小時 bucket，預設按 estimated_hours 計算結束時間，bucket label = "HH:MM–HH:MM"
  const slots: ScheduleSlot[] = rows
    .slice()
    .sort((a, b) => (a.appointment_time > b.appointment_time ? 1 : -1))
    .map((r) => {
      const start = (r.appointment_time as string).slice(0, 5);
      const [h, m] = start.split(":").map(Number);
      const totalMin = h * 60 + m + Math.max(30, Math.round((Number(r.estimated_hours) || 1) * 60));
      const eh = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
      const em = String(totalMin % 60).padStart(2, "0");
      const techShort = r.technician_name ? r.technician_name.charAt(0) : null;
      return {
        bucket: `${start}–${eh}:${em}`,
        items: [
          {
            customer_name: r.customer_name,
            service_label: `${r.service_type ?? ""}${r.service_subtype ? "-" + r.service_subtype : ""}`,
            technician_short: techShort,
            status: r.status,
          },
        ],
      };
    });
  return slots;
}

function computeTechLoad(
  rows: AppointmentListRow[],
  technicians: { id: string; name: string }[],
): TechnicianLoad[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    if (!r.assigned_technician_id) return;
    if (["已取消", "已完成"].includes(r.status)) return;
    counts.set(r.assigned_technician_id, (counts.get(r.assigned_technician_id) ?? 0) + 1);
  });
  return technicians.map((t) => {
    const load = counts.get(t.id) ?? 0;
    const status = load === 0 ? "待命中" : load >= TECH_LOAD_MAX ? "已滿" : "施工中";
    return { id: t.id, name: t.name, load, max: TECH_LOAD_MAX, status };
  });
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10; // 一位小數
}

/**
 * 月度（最近 30 天 vs 前 30 天）+ 今日（vs 上週同日）KPI 統計。
 * 在 server 端一次查出 60 天 row、本地分群計算，避免多輪 round-trip。
 */
export async function getAppointmentStats(): Promise<AppointmentStats> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const today = todayIsoDate();
  const todayDate = new Date(`${today}T00:00:00Z`);

  // 過去 60 天 + 今天 + 未來預期不影響 stats
  const from = new Date(todayDate);
  from.setUTCDate(from.getUTCDate() - 60);
  const fromIso = from.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sevenIso = sevenDaysAgo.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date, status, arrived_at")
    .eq("brand_id", brand)
    .gte("appointment_date", fromIso)
    .lte("appointment_date", today);
  if (error) throw error;

  const rows = (data ?? []) as Pick<
    AppointmentRow,
    "appointment_date" | "status" | "arrived_at"
  >[];

  const inWindow = (d: string, daysBack: number, len: number) => {
    const dd = new Date(`${d}T00:00:00Z`).getTime();
    const start = todayDate.getTime() - daysBack * 86400000;
    const end = start + len * 86400000;
    return dd >= start && dd < end;
  };

  // 最近 30 天 (含今天)
  const win30 = rows.filter((r) => inWindow(r.appointment_date, 29, 30));
  // 前 30 天 (30..60 天前)
  const prev30 = rows.filter((r) => inWindow(r.appointment_date, 59, 30));

  const arrivedStatuses = new Set(["已到廠", "等待中", "維修中", "待取車", "已完成"]);

  const summarize = (list: typeof rows) => {
    const total = list.length;
    const arrived = list.filter((r) => arrivedStatuses.has(r.status)).length;
    const no_show = list.filter((r) => r.status === "待到廠" &&
      new Date(`${r.appointment_date}T00:00:00Z`).getTime() < todayDate.getTime()).length;
    const canceled = list.filter((r) => r.status === "已取消").length;
    return {
      total,
      arrived,
      no_show,
      canceled,
      checked_in_rate: pct(arrived, total - canceled),
      no_show_rate: pct(no_show, total),
      cancel_rate: pct(canceled, total),
    };
  };

  const cur = summarize(win30);
  const prev = summarize(prev30);

  // 今日 vs 上週同日
  const todayRows = rows.filter((r) => r.appointment_date === today);
  const lastWeekSame = rows.filter((r) => r.appointment_date === sevenIso);
  const today_total = todayRows.length;
  const today_arrived = todayRows.filter((r) => arrivedStatuses.has(r.status)).length;
  const today_remaining = todayRows.filter((r) => r.status === "待到廠").length;
  const last_week_total = lastWeekSame.length;

  return {
    today_total,
    today_arrived,
    today_remaining,
    month_total: cur.total,
    month_arrived: cur.arrived,
    month_no_show: cur.no_show,
    month_canceled: cur.canceled,
    checked_in_rate: cur.checked_in_rate,
    no_show_rate: cur.no_show_rate,
    cancel_rate: cur.cancel_rate,
    delta_checked_in_rate: Math.round((cur.checked_in_rate - prev.checked_in_rate) * 10) / 10,
    delta_no_show_rate: Math.round((cur.no_show_rate - prev.no_show_rate) * 10) / 10,
    delta_cancel_rate: Math.round((cur.cancel_rate - prev.cancel_rate) * 10) / 10,
    delta_today_total: last_week_total
      ? Math.round(((today_total - last_week_total) / last_week_total) * 1000) / 10
      : 0,
  };
}

/**
 * 最近 N 天的「星期幾 × 小時」預約熱點。預設 N=60 提供穩定信號。
 * 回傳純資料 array；UI 端再 pivot 成 7×24 grid。
 */
export async function getAppointmentHeatmap(days = 60): Promise<HeatmapCell[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const today = todayIsoDate();
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  const fromIso = from.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date, appointment_time")
    .eq("brand_id", brand)
    .gte("appointment_date", fromIso)
    .lte("appointment_date", today);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { appointment_date: string; appointment_time: string }[]) {
    // 用 UTC 解析就可（appointment_date 不帶 tz、只是日曆日；day_of_week 用 local）
    const d = new Date(`${r.appointment_date}T00:00:00`);
    const dow = d.getDay(); // 0=Sun
    const hour = Number((r.appointment_time as string).slice(0, 2));
    const key = `${dow}-${hour}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 8; h < 20; h++) {
      // 預約集中在 08:00-19:59
      cells.push({ day_of_week: d, hour: h, count: counts.get(`${d}-${h}`) ?? 0 });
    }
  }
  return cells;
}

export async function getAppointmentsListPageData(
  filters: AppointmentListFilters,
): Promise<AppointmentsListPageData> {
  const lookups = await fetchLookups((await getActiveScope()).brand_id);
  const [rows, stats, heatmap] = await Promise.all([
    listAppointments(filters),
    getAppointmentStats(),
    getAppointmentHeatmap(),
  ]);
  const kpis = computeKpis(rows);
  const schedule = computeSchedule(rows);
  const techLoad = computeTechLoad(rows, lookups.technicians);
  return {
    rows,
    totalCount: rows.length,
    kpis,
    stats,
    heatmap,
    schedule,
    techLoad,
    lookups,
  };
}

export async function getAppointmentDetailPageData(id: string): Promise<{
  appointment: AppointmentListRow | null;
  lookups: AppointmentLookups;
}> {
  const brand = (await getActiveScope()).brand_id;
  const [appointment, lookups] = await Promise.all([
    getAppointmentById(id),
    fetchLookups(brand),
  ]);
  return { appointment, lookups };
}

export async function getAppointmentNewPageData(): Promise<AppointmentLookups> {
  return fetchLookups((await getActiveScope()).brand_id);
}
