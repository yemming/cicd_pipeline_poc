/**
 * 中古車庫存看板（RS03B）— 靜態 demo 資料。
 *
 * Day 1 走靜態常數，未來轉 DB 不動 UI（domain helper 抽象保證）。
 * 避雷：本檔不放 async function，純常數 + type；async helper 在 `sales-usedcar-inventory.ts`。
 */

export type UsedCarStatus = "在庫可售" | "整備中" | "已保留" | "已售出";

export type UsedCarGrade = "S" | "A" | "B" | "C" | "D";

/**
 * 衍生業務推薦 tag — BDN #13。
 * Demo 階段 admin 不能編輯（後續輪次再做維護介面），先 hardcode 在常數檔。
 */
export type BusinessTag = "保險" | "配件升級" | "Track Day";

export type UsedCarUnit = {
  id: string;
  model: string;
  year: number;
  km: number;
  color: string;
  colorHex: string;
  grade: UsedCarGrade;
  cost: number;
  price: number;
  margin: number;
  status: UsedCarStatus;
  daysInStock: number;
  vin: string;
  note: string;
  // ── BDN #13 三組業務 chip（皆 optional；undefined 表示「未知 / 不渲染」）──
  /** 動保塗銷狀態：true=已清償（綠）、false=未清償（紅）。 */
  lienCleared?: boolean;
  /** 下次年審到期日 ISO 'YYYY-MM-DD'；距今 ≤120 天時顯示「4 個月內驗車」黃 chip。 */
  inspectionDueDate?: string;
  /** 衍生業務推薦 tag 陣列；可多選並列（藍 chip）。 */
  recommendedServices?: BusinessTag[];
};

export type UsedCarKpi = {
  key: "available" | "prep" | "hold" | "avgDays" | "soldThisMonth";
  label: string;
  value: number;
  tone: "teal" | "purple" | "amber" | "navy" | "red";
  subtitle: string;
};

export const USED_CAR_INVENTORY_UNITS: UsedCarUnit[] = [
  { id: "U001", model: "Panigale V2", year: 2021, km: 35000, color: "紅", colorHex: "#C8001A", grade: "A", cost: 320000, price: 428000, margin: 33500, status: "在庫可售", daysInStock: 18, vin: "ZDM98765", note: "", lienCleared: true, inspectionDueDate: "2026-07-22", recommendedServices: ["保險", "Track Day"] },
  { id: "U002", model: "Monster SP", year: 2022, km: 12500, color: "黑", colorHex: "#222222", grade: "S", cost: 480000, price: 588000, margin: 72000, status: "在庫可售", daysInStock: 7, vin: "ZDM87654", note: "CPO 認證，附延長保固", lienCleared: true, inspectionDueDate: "2027-04-10", recommendedServices: ["保險", "配件升級"] },
  { id: "U003", model: "Streetfighter V4", year: 2020, km: 42000, color: "灰", colorHex: "#888888", grade: "B", cost: 580000, price: 728000, margin: 85000, status: "整備中", daysInStock: 35, vin: "ZDM76543", note: "引擎大保養進行中", lienCleared: false, inspectionDueDate: "2026-08-05", recommendedServices: ["保險", "配件升級", "Track Day"] },
  { id: "U004", model: "Multistrada V4 S", year: 2021, km: 28000, color: "紅", colorHex: "#C8001A", grade: "A", cost: 620000, price: 798000, margin: 96000, status: "已保留", daysInStock: 22, vin: "ZDM65432", note: "林先生保留至 5/30", lienCleared: true, inspectionDueDate: "2026-11-30", recommendedServices: ["保險"] },
  { id: "U005", model: "Hypermotard 821", year: 2019, km: 55000, color: "白", colorHex: "#F0EEE8", grade: "C", cost: 165000, price: 228000, margin: 22000, status: "在庫可售", daysInStock: 52, vin: "ZDM54321", note: "輪胎已更換", lienCleared: false, inspectionDueDate: "2026-06-18", recommendedServices: [] },
  { id: "U006", model: "Panigale V4", year: 2020, km: 18000, color: "黑", colorHex: "#222222", grade: "A", cost: 820000, price: 988000, margin: 88000, status: "在庫可售", daysInStock: 14, vin: "ZDM43210", note: "", lienCleared: true, inspectionDueDate: "2027-01-20", recommendedServices: ["Track Day", "配件升級"] },
  { id: "U007", model: "Monster 821", year: 2018, km: 68000, color: "紅", colorHex: "#C8001A", grade: "C", cost: 148000, price: 198000, margin: 15000, status: "整備中", daysInStock: 41, vin: "ZDM32109", note: "外觀整備中，漆面修復", lienCleared: false, inspectionDueDate: "2026-09-08", recommendedServices: ["配件升級"] },
  { id: "U008", model: "Diavel 1260", year: 2020, km: 22000, color: "黑", colorHex: "#222222", grade: "B", cost: 568000, price: 728000, margin: 82000, status: "在庫可售", daysInStock: 29, vin: "ZDM21098", note: "", lienCleared: true, inspectionDueDate: "2026-12-15", recommendedServices: ["保險"] },
  { id: "U009", model: "DesertX", year: 2023, km: 8500, color: "白", colorHex: "#F0EEE8", grade: "S", cost: 588000, price: 728000, margin: 88000, status: "在庫可售", daysInStock: 5, vin: "ZDM10987", note: "幾乎全新，原廠保固尚有 8 個月", lienCleared: true, inspectionDueDate: "2027-08-22", recommendedServices: ["保險", "配件升級"] },
  { id: "U010", model: "Scrambler 1100", year: 2020, km: 31000, color: "黃", colorHex: "#D4A017", grade: "B", cost: 318000, price: 418000, margin: 42000, status: "整備中", daysInStock: 19, vin: "ZDM09876", note: "", lienCleared: false, inspectionDueDate: "2026-10-05", recommendedServices: [] },
  { id: "U011", model: "Panigale V2", year: 2023, km: 6800, color: "白", colorHex: "#F0EEE8", grade: "S", cost: 568000, price: 698000, margin: 82000, status: "已保留", daysInStock: 8, vin: "ZDM99001", note: "張小姐保留", lienCleared: true, inspectionDueDate: "2027-03-14", recommendedServices: ["Track Day"] },
  // BDN #19 低毛利警示 demo：≤5% 毛利率（U012=3.9%、U013=3.8%）
  { id: "U012", model: "Scrambler Icon", year: 2019, km: 38000, color: "黃", colorHex: "#D4A017", grade: "C", cost: 295000, price: 308000, margin: 12000, status: "在庫可售", daysInStock: 38, vin: "ZDM88012", note: "為清庫存壓低售價，毛利偏低", lienCleared: true, inspectionDueDate: "2026-08-12", recommendedServices: [] },
  { id: "U013", model: "Monster 937", year: 2022, km: 18500, color: "紅", colorHex: "#C8001A", grade: "B", cost: 380000, price: 392000, margin: 15000, status: "在庫可售", daysInStock: 31, vin: "ZDM88013", note: "競爭對手同款下殺，被迫跟價", lienCleared: false, inspectionDueDate: "2026-11-05", recommendedServices: ["保險"] },
];

export const USED_CAR_KPI_SUMMARY: UsedCarKpi[] = [
  { key: "available", label: "在庫可售", value: 8, tone: "teal", subtitle: "整備完成，可交車" },
  { key: "prep", label: "整備中", value: 3, tone: "purple", subtitle: "維修 / 美容進行中" },
  { key: "hold", label: "已保留", value: 2, tone: "amber", subtitle: "客戶指定保留" },
  { key: "avgDays", label: "平均在庫天", value: 28, tone: "navy", subtitle: "目標 ≤ 45 天" },
  { key: "soldThisMonth", label: "本月已售", value: 2, tone: "red", subtitle: "2026 年 05 月" },
];

export const USED_CAR_GRADE_OPTIONS: { value: UsedCarGrade | ""; label: string }[] = [
  { value: "", label: "全部等級" },
  { value: "S", label: "S — CPO 認證" },
  { value: "A", label: "A — 優良" },
  { value: "B", label: "B — 良好" },
  { value: "C", label: "C — 普通" },
];

export const USED_CAR_STATUS_OPTIONS: { value: UsedCarStatus | ""; label: string }[] = [
  { value: "", label: "全部狀態" },
  { value: "在庫可售", label: "在庫可售" },
  { value: "整備中", label: "整備中" },
  { value: "已保留", label: "已保留" },
];

export type UsedCarKmRange = "low" | "mid" | "high";

export const USED_CAR_KM_RANGE_OPTIONS: { value: UsedCarKmRange | ""; label: string }[] = [
  { value: "", label: "全部里程" },
  { value: "low", label: "10,000 km 以下" },
  { value: "mid", label: "10,001 — 30,000 km" },
  { value: "high", label: "30,001 km 以上" },
];

export function inKmRange(km: number, range: UsedCarKmRange | ""): boolean {
  if (!range) return true;
  if (range === "low") return km <= 10000;
  if (range === "mid") return km > 10000 && km <= 30000;
  return km > 30000;
}
