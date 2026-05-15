/**
 * Aftersales Staff（售後服務部門員工名冊）— 純 constants / pure helpers
 *
 * 設計稿：07_售後管理模組_v2.html → Tab A 員工人員名冊
 * 對應路由：/parts/aftersales/management/staff
 */

/** 售後職級（spec 規定 5 種） */
export const AFTERSALES_GRADES = [
  "售後主管",
  "售後接待",
  "車間技師",
  "零件主管",
  "零件專員",
] as const;
export type AftersalesGrade = (typeof AFTERSALES_GRADES)[number];

/** 售後工種（spec 規定常見值；其他自由文字） */
export const AFTERSALES_WORK_TYPES = [
  "管理",
  "接待",
  "機電",
  "電裝",
  "鈑噴",
  "備料",
] as const;
export type AftersalesWorkType = (typeof AFTERSALES_WORK_TYPES)[number] | string;

/** 各職級對應的標籤 chip 顏色（spec gradeColor） */
export const GRADE_CHIP_STYLE: Record<string, { bg: string; fg: string }> = {
  售後主管: { bg: "#FDECEA", fg: "#CC0000" },
  售後接待: { bg: "#EAF4FB", fg: "#185FA5" },
  車間技師: { bg: "#FDF3E3", fg: "#854F0B" },
  零件主管: { bg: "#EAF3DE", fg: "#3B6D11" },
  零件專員: { bg: "#EEEEFF", fg: "#534AB7" },
};

export function getGradeChipStyle(grade: string | null | undefined) {
  if (!grade) return { bg: "#F2F2F2", fg: "#6B6A68" };
  return GRADE_CHIP_STYLE[grade] ?? { bg: "#F2F2F2", fg: "#6B6A68" };
}

/** 預設「售後主管」一律有竣工複檢授權，UI 不可關 */
export function isFinalInspectionAuthLocked(grade: string | null | undefined): boolean {
  return grade === "售後主管";
}

/** 售後職級規範決定預設複檢授權 */
export function defaultFinalInspectionAuth(grade: string | null | undefined): boolean {
  return grade === "售後主管";
}

export const AFTERSALES_STAFF_PAGE_SIZE_DEFAULT = 50;

/** 售後 metadata key 白名單（純 typing） */
export type AftersalesStaffMetadata = {
  grade?: string | null;
  work_type?: string | null;
  final_inspection_auth?: boolean | null;
  system_account?: string | null;
  /** 預留給其他售後模組註記用 */
  [k: string]: unknown;
};
