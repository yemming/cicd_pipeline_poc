/**
 * Constants for the aftersales appointments module.
 *
 * 拆獨立 .constants.ts 是為了避開 Next 16 的 `"use server" file can only export
 * async functions` 限制（domain helper 是 server file，不能 export 非 async 值）。
 */

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
