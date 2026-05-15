/**
 * Constants — 售後 竣工複檢（Final Inspection）
 *
 * Spec：docs/DUCATI_售後工單模組_..._最新版/06_竣工複檢_v1.html
 * 5-step wizard：line_results → test_drive → cleaning → sign → notify
 * 一張 RO 一份 final inspection（unique constraint）。
 */

export const FINAL_INSPECTION_STATUS = [
  "in_progress",
  "passed",
  "rejected",
  "completed",
] as const;
export type FinalInspectionStatus = (typeof FINAL_INSPECTION_STATUS)[number];

export const STATUS_LABEL: Record<FinalInspectionStatus, string> = {
  in_progress: "複檢中",
  passed: "已簽核",
  rejected: "退回重修",
  completed: "已完成（待結帳）",
};

export const STATUS_CHIP: Record<FinalInspectionStatus, string> = {
  in_progress: "bg-[#FDF3E3] text-[#854F0B]",
  passed: "bg-[#EAF4FB] text-[#185FA5]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
  completed: "bg-[#EAF3DE] text-[#3B6D11]",
};

export type CheckState = "none" | "ok" | "fail";

export type LineResult = {
  line_id: string;
  line_no: number;
  kind: string; // labor / part
  label: string;
  remark?: string | null;
  state: CheckState;
};

export type TestDriveItem = { id: string; label: string; state: CheckState };

export const DEFAULT_TEST_DRIVE_ITEMS: TestDriveItem[] = [
  { id: "t1", label: "引擎啟動順暢，無異音", state: "none" },
  { id: "t2", label: "各檔位變速正常", state: "none" },
  { id: "t3", label: "前/後煞車效能正常", state: "none" },
  { id: "t4", label: "儀表板警示燈無異常", state: "none" },
  { id: "t5", label: "電子輔助系統（ABS/TC）功能正常", state: "none" },
];

export type TestDrive = {
  km_before?: number | null;
  km_after?: number | null;
  route?: string | null;
  test_time?: string | null;
  technician?: string | null;
  items?: TestDriveItem[];
  note?: string | null;
};

export type CleaningItem = { id: string; label: string; state: CheckState };

export const DEFAULT_CLEANING_ITEMS: CleaningItem[] = [
  { id: "c1", label: "車身清潔（擦拭/無殘留油漬）", state: "none" },
  { id: "c2", label: "座墊及把手保持清潔", state: "none" },
  { id: "c3", label: "輪圈及煞車部位清潔", state: "none" },
  { id: "c4", label: "客戶個人物品已歸還", state: "none" },
  { id: "c5", label: "RO 工單副本已備妥交客戶", state: "none" },
];

export type Cleaning = {
  items?: CleaningItem[];
  personal_items_note?: string | null;
};

export type NotifyMethod = "line" | "sms" | "call";

export const NOTIFY_METHOD_LABEL: Record<NotifyMethod, string> = {
  line: "Line 訊息",
  sms: "簡訊",
  call: "電話通知",
};

export type NotificationLog = {
  method: NotifyMethod;
  sent_at: string; // ISO
  note?: string | null;
};

export type NextService = {
  km?: number | null;
  date?: string | null;
  items?: string | null;
  sa_note?: string | null;
};

/** 純函式：判斷 step1 是否「全通過」（沒有 fail、沒有 none） */
export function isLineResultsAllPassed(rs: LineResult[]): boolean {
  if (!rs.length) return false;
  return rs.every((r) => r.state === "ok");
}

/** 純函式：找出有沒有任一個 fail */
export function hasAnyFail(rs: LineResult[]): boolean {
  return rs.some((r) => r.state === "fail");
}

/** 純函式：把 RO line 預載成 LineResult */
export function buildInitialLineResults(
  lines: Array<{
    id: string;
    line_no: number;
    kind: string;
    labor_name?: string | null;
    part_name?: string | null;
    labor_note?: string | null;
  }>,
): LineResult[] {
  return lines.map((l) => ({
    line_id: l.id,
    line_no: l.line_no,
    kind: l.kind,
    label: l.labor_name || l.part_name || `項目 #${l.line_no}`,
    remark: l.labor_note ?? null,
    state: "none",
  }));
}

/** 純函式：產生複檢編號 FI-yyMMdd-NNN（client 用，server 真實流水另算） */
export function buildInspectionNo(issue_date: string, sequence_no: number): string {
  const yymmdd = issue_date.replace(/-/g, "").slice(2);
  return `FI-${yymmdd}-${String(sequence_no).padStart(3, "0")}`;
}

export const STEP_LABELS = [
  "維修項目複檢",
  "試車記錄",
  "清潔確認",
  "複檢簽核",
  "通知取車",
] as const;
