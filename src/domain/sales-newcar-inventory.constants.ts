/**
 * 新車庫存看板（RS03A）— 靜態 demo 資料。
 *
 * Day 1 走靜態常數，未來轉 DB 不動 UI（domain helper 抽象保證）。
 * 避雷：本檔不放 async function，純常數 + type；async helper 在 `sales-newcar-inventory.ts`。
 */

export type NewCarStatus = "現車可售" | "已保留" | "訂車中" | "已售出";

export type NewCarSeries =
  | "Panigale"
  | "Streetfighter"
  | "Monster"
  | "Multistrada"
  | "DesertX"
  | "Hypermotard"
  | "Diavel";

export type NewCarUnit = {
  id: string;
  model: string;
  series: NewCarSeries;
  year: number;
  color: string;
  colorHex: string;
  msrp: number;
  status: NewCarStatus;
  vin: string;
  arrived: string;
  days: number | null;
  note: string;
};

export type NewCarKpi = {
  key: "available" | "hold" | "ordering" | "soldThisMonth";
  label: string;
  value: number;
  tone: "teal" | "amber" | "navy" | "red";
  subtitle: string;
};

export const NEW_CAR_INVENTORY_UNITS: NewCarUnit[] = [
  { id: "PV4S-001", model: "Panigale V4 S", series: "Panigale", year: 2026, color: "紅", colorHex: "#C8001A", msrp: 1498000, status: "現車可售", vin: "ZDM12345", arrived: "2026-03-15", days: 56, note: "" },
  { id: "PV4S-002", model: "Panigale V4 S", series: "Panigale", year: 2026, color: "白", colorHex: "#F0EEE8", msrp: 1498000, status: "已保留", vin: "ZDM12346", arrived: "2026-03-15", days: 56, note: "王先生保留至 5/20" },
  { id: "SFV4-001", model: "Streetfighter V4", series: "Streetfighter", year: 2026, color: "黑", colorHex: "#222222", msrp: 1188000, status: "現車可售", vin: "ZDM23456", arrived: "2026-04-01", days: 39, note: "" },
  { id: "SFV4-002", model: "Streetfighter V4 SP2", series: "Streetfighter", year: 2026, color: "灰", colorHex: "#888888", msrp: 1688000, status: "現車可售", vin: "ZDM23457", arrived: "2026-04-01", days: 39, note: "" },
  { id: "MSP-001", model: "Monster SP", series: "Monster", year: 2026, color: "紅", colorHex: "#C8001A", msrp: 688000, status: "現車可售", vin: "ZDM34567", arrived: "2026-04-10", days: 30, note: "" },
  { id: "MSP-002", model: "Monster SP", series: "Monster", year: 2026, color: "黑", colorHex: "#222222", msrp: 688000, status: "訂車中", vin: "—", arrived: "預計 6/15", days: null, note: "客戶李小姐訂購" },
  { id: "MV4S-001", model: "Multistrada V4 S", series: "Multistrada", year: 2026, color: "紅", colorHex: "#C8001A", msrp: 988000, status: "現車可售", vin: "ZDM45678", arrived: "2026-03-20", days: 51, note: "" },
  { id: "MV4S-002", model: "Multistrada V4 S", series: "Multistrada", year: 2026, color: "黑", colorHex: "#222222", msrp: 988000, status: "已保留", vin: "ZDM45679", arrived: "2026-03-20", days: 51, note: "陳先生保留" },
  { id: "DX-001", model: "DesertX Rally", series: "DesertX", year: 2026, color: "白", colorHex: "#F0EEE8", msrp: 858000, status: "現車可售", vin: "ZDM56789", arrived: "2026-04-20", days: 20, note: "" },
  { id: "HM-001", model: "Hypermotard 698 RVE", series: "Hypermotard", year: 2026, color: "紅", colorHex: "#C8001A", msrp: 498000, status: "現車可售", vin: "ZDM67890", arrived: "2026-04-25", days: 15, note: "" },
  { id: "HM-002", model: "Hypermotard 698 RVE", series: "Hypermotard", year: 2026, color: "黑", colorHex: "#222222", msrp: 498000, status: "訂車中", vin: "—", arrived: "預計 6/01", days: null, note: "" },
  { id: "PV2-001", model: "Panigale V2", series: "Panigale", year: 2026, color: "紅", colorHex: "#C8001A", msrp: 798000, status: "現車可售", vin: "ZDM12399", arrived: "2026-04-05", days: 35, note: "" },
  { id: "DV4-001", model: "Diavel V4", series: "Diavel", year: 2026, color: "黑", colorHex: "#222222", msrp: 1188000, status: "訂車中", vin: "—", arrived: "預計 7/01", days: null, note: "" },
  { id: "MSP-003", model: "Monster SP", series: "Monster", year: 2026, color: "白", colorHex: "#F0EEE8", msrp: 688000, status: "現車可售", vin: "ZDM34599", arrived: "2026-04-28", days: 12, note: "" },
  { id: "SFV4-003", model: "Streetfighter V4", series: "Streetfighter", year: 2026, color: "紅", colorHex: "#C8001A", msrp: 1188000, status: "已保留", vin: "ZDM23499", arrived: "2026-03-28", days: 43, note: "張先生保留至 5/25" },
  { id: "DX-002", model: "DesertX Rally", series: "DesertX", year: 2026, color: "黑", colorHex: "#222222", msrp: 858000, status: "訂車中", vin: "—", arrived: "預計 6/20", days: null, note: "" },
];

export const NEW_CAR_KPI_SUMMARY: NewCarKpi[] = [
  { key: "available", label: "現車可售", value: 8, tone: "teal", subtitle: "可立即交車" },
  { key: "hold", label: "已保留", value: 3, tone: "amber", subtitle: "客戶指定保留中" },
  { key: "ordering", label: "訂車中", value: 5, tone: "navy", subtitle: "向原廠訂購，待到貨" },
  { key: "soldThisMonth", label: "本月已售", value: 4, tone: "red", subtitle: "2026年05月" },
];

export const NEW_CAR_SERIES_OPTIONS: { value: NewCarSeries | ""; label: string }[] = [
  { value: "", label: "全部車系" },
  { value: "Panigale", label: "Panigale（仿賽）" },
  { value: "Streetfighter", label: "Streetfighter（裸把）" },
  { value: "Monster", label: "Monster（街車）" },
  { value: "Multistrada", label: "Multistrada（旅行）" },
  { value: "DesertX", label: "DesertX（越野）" },
  { value: "Hypermotard", label: "Hypermotard（超摩）" },
  { value: "Diavel", label: "Diavel（巡航）" },
];

export const NEW_CAR_STATUS_OPTIONS: { value: NewCarStatus | ""; label: string }[] = [
  { value: "", label: "全部狀態" },
  { value: "現車可售", label: "現車可售" },
  { value: "已保留", label: "已保留" },
  { value: "訂車中", label: "訂車中" },
];

export const NEW_CAR_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部顏色" },
  { value: "紅", label: "Ducati Red（紅）" },
  { value: "白", label: "Arctic White（白）" },
  { value: "黑", label: "Thrilling Black（黑）" },
  { value: "灰", label: "Winter Test（灰）" },
];
