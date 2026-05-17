/**
 * Sales Staff（RS 人員 / 業務部員工）— 純 constants / pure helpers
 *
 * 設計稿：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § Tab3
 * 路由：/sales/manager/staff
 * Proposal：docs/proposals/feature-rs-m3-staff-phase1.md
 *
 * 沿用 aftersales-staff 的「主表 employees + metadata jsonb」慣例。
 * sales 命名空間放 metadata.sales.{key}，跟 aftersales 共存不衝突。
 */

export const SALES_STAFF_PAGE_SIZE_DEFAULT = 50;

/** 業務部 department code（嚴格依此判斷是否為 RS） */
export const SALES_DEPT_CODES = ["SAL", "SALES"] as const;
/** 業務部 name 模糊匹配（fallback、當 code 沒設） */
export const SALES_DEPT_NAME_PATTERN = /業務|銷售/;

/**
 * Sales metadata 命名空間。
 * 任何 sales 模組要存在 employees.metadata 裡的欄位都掛在 metadata.sales.{key}，
 * 避免污染 aftersales 已用的 root keys（grade / work_type / final_inspection_auth / system_account）。
 */
export type SalesEmployeeMetadata = {
  /**
   * 該 RS 負責的車系（vehicle_models.series 集合）
   * - 不存在 / 空陣列 = 「全車系」
   * - 有元素 = 限定特定 series
   */
  responsible_models?: string[];
  /** 預留給後續 sales 模組 */
  [k: string]: unknown;
};

/** 全域 employee.metadata 形狀（aftersales root keys + sales namespace） */
export type SalesStaffMetadata = {
  // aftersales legacy root keys（不動）
  grade?: string | null;
  work_type?: string | null;
  final_inspection_auth?: boolean | null;
  system_account?: string | null;
  // sales namespace
  sales?: SalesEmployeeMetadata;
  [k: string]: unknown;
};

/** 取出 metadata.sales.responsible_models，空 / 缺 = [] */
export function getResponsibleModels(meta: SalesStaffMetadata | null | undefined): string[] {
  const list = meta?.sales?.responsible_models;
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** 是否「全車系」（無限制） */
export function isAllSeries(meta: SalesStaffMetadata | null | undefined): boolean {
  return getResponsibleModels(meta).length === 0;
}

/** 把 responsible_models 寫回 metadata（保留其他 keys） */
export function writeResponsibleModels(
  meta: SalesStaffMetadata | null | undefined,
  models: string[],
): SalesStaffMetadata {
  const base = (meta ?? {}) as SalesStaffMetadata;
  const next: SalesStaffMetadata = {
    ...base,
    sales: { ...(base.sales ?? {}), responsible_models: models },
  };
  return next;
}

/** 月份範圍（Asia/Taipei）— 回 ISO 字串可塞 supabase filter */
export function currentMonthRange(now: Date = new Date()): { from: string; to: string } {
  // 把當前 UTC 時間調到 Taipei (+8) 再算月初月末，再轉回 UTC ISO
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = taipei.getUTCFullYear();
  const m = taipei.getUTCMonth();
  const monthStartTaipei = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const monthEndTaipei = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  // 再扣 8 小時還原成真正的 UTC 邊界
  const fromUtc = new Date(monthStartTaipei.getTime() - 8 * 60 * 60 * 1000);
  const toUtc = new Date(monthEndTaipei.getTime() - 8 * 60 * 60 * 1000);
  return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
}
