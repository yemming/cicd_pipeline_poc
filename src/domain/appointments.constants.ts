/**
 * Constants & types for the aftersales appointments module.
 *
 * 拆獨立 .constants.ts 是為了避開 Next 16 的 `"use server" file can only export
 * async functions` 限制（domain helper 是 server file，不能 export 非 async 值）。
 * Row types 放這裡讓 client component 可安全 import。
 */

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];

// ─────────────────────────────────────────────────────────────
// Row types（client-safe — 純資料結構，無 supabase 呼叫）
// ─────────────────────────────────────────────────────────────

export type AppointmentRow = Tables["appointments"]["Row"];

export type AppointmentListRow = AppointmentRow & {
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  technician_name: string | null;
};

export type AppointmentListFilters = {
  date?: string; // YYYY-MM-DD; default = today
  status?: string;
  service_type?: string;
  technician_id?: string;
  q?: string;
};

export type DailyKpis = {
  total: number;
  arrived: number;
  waiting: number;
  waiting_overdue: number;
  in_progress: number;
  in_progress_avg_hours: number;
  completed: number;
  pending_pickup: number;
};

/**
 * AppointmentStats — Notion spec 規格「頂 KpiCard（本日預約/入廠率/未到/取消）」+ 月度趨勢用。
 * checked_in_rate / no_show_count / canceled_count 用月度（最近 30 天）統計。
 * delta_* = 與「再前一個月」比較的百分點 / 百分比變化。
 */
export type AppointmentStats = {
  today_total: number;
  today_arrived: number;
  today_remaining: number;
  // 月度（最近 30 天）
  month_total: number;
  month_arrived: number;
  month_no_show: number;
  month_canceled: number;
  checked_in_rate: number;    // 入廠率 = arrived / total（不含已取消）
  no_show_rate: number;       // 未到率 = no_show / total
  cancel_rate: number;        // 取消率 = canceled / total
  delta_checked_in_rate: number; // 百分點差（vs 前 30 天）
  delta_no_show_rate: number;
  delta_cancel_rate: number;
  delta_today_total: number;     // 百分比差（today vs 同星期上週同日）
};

/** Heat map cell：day_of_week 0=Sun ... 6=Sat；hour 0–23 */
export type HeatmapCell = {
  day_of_week: number;
  hour: number;
  count: number;
};

export type ScheduleItem = {
  customer_name: string | null;
  service_label: string;
  technician_short: string | null;
  status: string;
};
export type ScheduleSlot = {
  bucket: string; // e.g. "09:00–10:00"
  items: ScheduleItem[];
};

export type TechnicianLoad = {
  id: string;
  name: string;
  load: number;
  max: number;
  status: string;
};

export type AppointmentLookups = {
  customers: { id: string; name: string; phone: string | null }[];
  vehicles: {
    id: string;
    customer_id: string;
    license_plate: string;
    model_name: string | null;
  }[];
  technicians: { id: string; name: string }[];
};

/** 當日即時狀態統計（設計稿 B1-02 KPI 列） */
export type TodayStatusKpis = {
  /** 待到廠：尚未入廠的預約數 */
  pending_arrival: number;
  /** 維修中：正在施工的預約數 */
  in_repair: number;
  /** 已完成：完工但尚未取車的預約數 */
  completed: number;
  /** 取車中：狀態為「待取車」的預約數 */
  pending_pickup: number;
};

export type AppointmentsListPageData = {
  rows: AppointmentListRow[];
  totalCount: number;
  kpis: DailyKpis;
  stats: AppointmentStats;
  todayStatusKpis: TodayStatusKpis;
  heatmap: HeatmapCell[];
  schedule: ScheduleSlot[];
  techLoad: TechnicianLoad[];
  lookups: AppointmentLookups;
};

/** Kanban columns（依 Notion spec：待確認 / 已確認 / 入廠 / 完成） */
export const APPOINTMENT_KANBAN_COLUMNS = [
  { id: "待到廠", title: "待到廠", tone: "gray" as const },
  { id: "已到廠", title: "已到廠 / 等待", tone: "blue" as const, includes: ["已到廠", "等待中"] as readonly string[] },
  { id: "維修中", title: "維修中", tone: "amber" as const },
  { id: "已完成", title: "已完成 / 取車", tone: "green" as const, includes: ["已完成", "待取車"] as readonly string[] },
] as const;

/** 把 row.status 對映到 kanban column id（多對一） */
export function statusToKanbanColumn(status: string): string {
  for (const col of APPOINTMENT_KANBAN_COLUMNS) {
    const inc = (col as { includes?: readonly string[] }).includes;
    if (inc?.includes(status)) return col.id;
    if (col.id === status) return col.id;
  }
  return "待到廠";
}

/** Kanban column id → 拖入後設定的目標 status（多選 column 用主要值） */
export function kanbanColumnToStatus(columnId: string): string {
  return columnId; // 目前 column id 同 status
}

export const DAY_OF_WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export const APPOINTMENT_STATUSES = [
  "待到廠",
  "已到廠",
  "等待中",
  "維修中",
  "待取車",
  "已完成",
  "已取消",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const SERVICE_TYPES = [
  { code: "MN", label: "MN 定保" },
  { code: "RP", label: "RP 機修" },
  { code: "WC", label: "WC 保固" },
  { code: "AC", label: "AC 事故" },
  { code: "OT", label: "OT 其他" },
] as const;
export type ServiceTypeCode = (typeof SERVICE_TYPES)[number]["code"];

export const SERVICE_SUBTYPES = [
  { code: "CP", label: "一般" },
  { code: "WR", label: "保固" },
  { code: "FR", label: "返工" },
] as const;
export type ServiceSubtypeCode = (typeof SERVICE_SUBTYPES)[number]["code"];

export const APPOINTMENT_SOURCES = [
  "電話",
  "LINE",
  "官網",
  "進廠",
  "SA 主動聯絡",
] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

export const TECH_LOAD_MAX = 4;

/** Map status → chip color token (matches design pattern §List View) */
export function statusChipClass(status: string): string {
  switch (status) {
    case "待到廠":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    case "已到廠":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "等待中":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "維修中":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "待取車":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "已完成":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "已取消":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

export function serviceTypeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const found = SERVICE_TYPES.find((s) => s.code === code);
  return found ? found.label : code;
}

export function serviceSubtypeLabel(code: string | null | undefined): string {
  if (!code) return "";
  const found = SERVICE_SUBTYPES.find((s) => s.code === code);
  return found ? found.label : code;
}
