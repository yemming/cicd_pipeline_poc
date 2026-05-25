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

// ── 試乘同意電子簽名（G3）──
// 存於 sales_test_drives.metadata.signature（inline base64 dataURL，零 migration）
export type TestDriveSignature = {
  data_url: string; // data:image/png;base64,...
  signed_at: string; // UTC ISO（顯示時轉 Asia/Taipei）
  consent_version?: string; // 同意條款版本（條款改版可辨識）
  signer_name?: string; // 冗餘存簽署人名，免 join 即可顯示
};

export type StartWithSignatureInput = {
  dataUrl: string;
  signerName?: string;
  consentVersion?: string;
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
