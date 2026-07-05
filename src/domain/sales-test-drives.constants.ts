/**
 * Client-safe constants — Sales Test Drives
 *
 * 純展示常數 / type，client component 從這裡 import；
 * server-only 的 query / mutation 留在 sales-test-drives.ts。
 */

export type TestDriveStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export const TEST_DRIVE_STATUS_LABELS: Record<TestDriveStatus, string> = {
  scheduled: "已排程",
  in_progress: "進行中",
  completed: "已完成",
  cancelled: "已取消",
  no_show: "未到",
};

export const TEST_DRIVE_STATUS_CHIP: Record<
  TestDriveStatus,
  { bg: string; text: string }
> = {
  scheduled: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  in_progress: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  completed: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  cancelled: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
  no_show: { bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
};

export type TestDriveRow = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  vehicle_model_id: string | null;
  lead_id: string | null;
  handcard_id: string | null;
  sales_consultant_id: string | null;
  scheduled_at: string;
  completed_at: string | null;
  status: TestDriveStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  // 新增①：typed columns
  insurance_verified: boolean | null;
  insurance_note: string | null;
  // A-5：typed column
  safety_check_ng_items: SafetyNgItem[] | null;
  // RS04 裁示：安全清單 NG 項目主管放行（前後端雙重擋，非文字原因可自行放行）
  safety_override_by: string | null;
  safety_override_at: string | null;
  safety_override_reason: string | null;
  /** joined：safety_override_by 對應的顯示名稱（profiles.display_name/name） */
  safety_override_by_name: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer_name: string | null;
  vehicle_model_name: string | null;
  consultant_name: string | null;
};

export type ListTestDrivesFilter = {
  status?: string;
  q?: string;
  sales_consultant_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  page?: number;
  pageSize?: number;
};

export type TestDriveStats = {
  todayCount: number;
  weekCompleted: number;
  avgRating: number | null;
  scheduledCount: number;
};

export type CompleteTestDriveInput = {
  rating?: number | null;
  feedback?: string | null;
  mileage_before?: number | null;
  mileage_after?: number | null;
  route_taken?: string | null;
  notes?: string | null;
  /**
   * wizard 完整評估快照（buildMetadata() 產出：overall_tone / power_feel …）。
   * 於 completeTestDrive 內以 read-merge-write 併入 metadata，排在 prevMeta 之後、
   * 標準欄位之前 —— 保留 signature / started_at 不被覆蓋。RS02 wizard 5 步流程用。
   */
  extraMetadata?: Record<string, unknown>;
};

export type CreateTestDriveInput = {
  customer_id?: string | null;
  vehicle_model_id?: string | null;
  lead_id?: string | null;
  sales_consultant_id?: string | null;
  scheduled_at: string;
  status?: TestDriveStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateTestDriveInput = Partial<CreateTestDriveInput> & {
  completed_at?: string | null;
};

// ── 試乘同意電子簽名（G3、輪2-1）──
// 簽名圖上傳到 Storage，metadata.signature 只存 URL（不存 base64）
export type TestDriveSignature = {
  /** Storage 公開 URL（輪2-1 後）；舊資料可能殘有 data:image/... base64 */
  data_url: string;
  signed_at: string; // UTC ISO（顯示時轉 Asia/Taipei）
  consent_version?: string; // 同意條款版本（條款改版可辨識）
  signer_name?: string; // 冗餘存簽署人名，免 join 即可顯示
};

export type StartWithSignatureInput = {
  dataUrl: string;
  signerName?: string;
  consentVersion?: string;
  /** 新增①：保險證明已驗（前後端雙重擋） */
  insuranceVerified?: boolean;
  /** 新增①：保險備注（有疑問時填寫原因） */
  insuranceNote?: string;
};

// ── 安全清單 NG 項目（A-5）──
export type SafetyNgItem = {
  item_id: string;
  item_label: string;
  ng_note: string; // NG 必填原因
};

// ── 安全清單 NG 項目主管放行（RS04 裁示：NG 需主管授權才可繼續，不是 RS 自行文字放行）──
export type SafetyOverrideInput = {
  /** 放行原因（例：輕微刮傷，不影響行車安全，客戶已知情） */
  reason: string;
};

export type SafetyOverrideResult = {
  id: string;
  safety_override_by: string | null;
  safety_override_by_name: string | null;
  safety_override_at: string | null;
  safety_override_reason: string | null;
};

// 目前同意條款版本（條文改版時 bump）
export const TEST_DRIVE_CONSENT_VERSION = "test-drive-v1";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const TEST_DRIVES_PAGE_SIZE_DEFAULT = 50;

export type TestDriveLookups = {
  customers: Array<{ id: string; name: string }>;
  models: Array<{ id: string; name: string }>;
  consultants: Array<{ id: string; name: string }>;
  leads: Array<{ id: string }>;
};
