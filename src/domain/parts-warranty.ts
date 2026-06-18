"use server";

/**
 * Domain Helper — Parts Warranty / RO 工單串接（A 級狀態流頁）
 *
 * 對應路徑：`/parts/warranty/ro-link`
 * 對應規格：M04L-10、`docs/DUCATI_v2_output/04_庫存管理/08_保固索賠/11_保固索賠_RO工單串接.html`
 *
 * ⚠️ 2026-06-18 Russell 裁示：單一事實表遷移至 warranty_claims
 *   - 底層改讀 warranty_claims（25 筆舊資料已遷入，metadata.migrated_from='parts_warranty_claims'）
 *   - 對外回傳型別 WarrantyClaimRow 維持不變（UI 不動）
 *   - status 8 態（draft/submitted/under_review/approved/partial_approved/rejected/received/cancelled）
 *     統一 normalize 成 UI 5 態，新增：under_review→submitted、partial_approved→approved、
 *     received→reimbursed、cancelled→rejected
 *   - ro_no（顯示用）：ro_id join repair_orders.ro_code；無 ro_id 則 fallback metadata.orig_ro_no
 *   - item_label / hours_label：從 metadata 讀；無則從 warranty_claim_lines.notes 串
 *   - sla_days：warranty_claims 無此欄，統一用常數預設 21
 *
 * UI 一律透過此 helper 取資料，禁止 page / component import @/lib/supabase/*。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

const SLA_DAYS_DEFAULT = 21;

// ─── warranty_claims 欄位形狀（本地宣告，避免動 generated types）──────────
type RawClaim = {
  id: string;
  brand_id: string;
  cl_no: string;
  ro_id: string | null;
  applied_amount: number | string;
  approved_amount: number | string | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  received_at: string | null;
  forecast_receipt_date: string | null;
  oem_reference_no: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  repair_orders?: { ro_code: string | null } | null;
  warranty_claim_lines?: Array<{ notes: string | null }> | null;
};

// ────────────────────────────────────────────────────────────────────────────
// 型別
// ────────────────────────────────────────────────────────────────────────────

/** 規格 5 段狀態（normalize 後對外型別） */
export type WarrantyClaimStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "reimbursed";

export type WarrantyClaimRow = {
  id: string;
  brand_id: string;
  claim_no: string;
  ro_no: string | null;
  ro_id: string | null;
  ro_code: string | null;
  item_label: string;
  hours_label: string | null;
  warranty_type: string | null;
  apply_amount: number;
  approved_amount: number;
  /** normalize 後狀態（5 段） */
  status: WarrantyClaimStatus;
  /** DB 原始狀態（保留給 cost-recovery 等模組需要的場景） */
  raw_status: string;
  status_label: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  reimbursed_at: string | null;
  sla_days: number;
  /** SLA 倒數（負數=已過期；submitted 才有意義，其他狀態回 null） */
  sla_remaining_days: number | null;
  /** submitted 卡超過 SLA 視為 overdue（其他狀態 false） */
  overdue: boolean;
  expected_pay_date: string | null;
  notes: string | null;
  created_at: string;
};

export type WarrantyClaimsFilter = {
  status?: WarrantyClaimStatus | "all";
  overdue?: "all" | "yes" | "no";
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  keyword?: string;
};

export type WarrantyClaimStats = {
  total: number;
  draft_count: number;
  submitted_count: number;
  approved_count: number;
  rejected_count: number;
  reimbursed_count: number;
  overdue_count: number;
  reimbursed_amount: number;
  /** flow node 件數對照表，鍵 = WarrantyClaimStatus，給 FlowDiagram 用 */
  by_status: Record<WarrantyClaimStatus, number>;
};

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

function normalizeStatus(raw: string): WarrantyClaimStatus {
  switch (raw) {
    case "draft":
      return "draft";
    case "submitted":
    case "reviewing":       // 舊值相容
    case "under_review":    // warranty_claims 新態
      return "submitted";
    case "approved":
    case "partial_approved": // warranty_claims 新態
      return "approved";
    case "rejected":
    case "cancelled":       // warranty_claims 新態
      return "rejected";
    case "reimbursed":
    case "paid":            // 舊值相容
    case "received":        // warranty_claims 新態
      return "reimbursed";
    default:
      return "submitted";
  }
}

function diffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function decorateClaim(row: RawClaim): WarrantyClaimRow {
  const status = normalizeStatus(row.status);
  const slaDays = SLA_DAYS_DEFAULT; // warranty_claims 無 sla_days 欄，固定 21
  let slaRemaining: number | null = null;
  let overdue = false;
  if (status === "submitted" && row.submitted_at) {
    const submitted = new Date(row.submitted_at);
    const deadline = new Date(
      submitted.getTime() + slaDays * 24 * 60 * 60 * 1000,
    );
    slaRemaining = diffDays(new Date(), deadline);
    overdue = slaRemaining < 0;
  }

  // ro_no（顯示用）：join 取 ro_code；fallback metadata.orig_ro_no
  const roCode = row.repair_orders?.ro_code ?? null;
  const roNoFallback =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>).orig_ro_no as string | null ?? null
      : null;

  // item_label：metadata.item_label；沒有就從 claim_lines notes 串
  const metaItemLabel =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>).item_label as string | null ?? null
      : null;
  const linesLabel = row.warranty_claim_lines?.length
    ? row.warranty_claim_lines
        .map((l) => l.notes)
        .filter(Boolean)
        .join("、") || null
    : null;
  const itemLabel = metaItemLabel || linesLabel || "—";

  // hours_label：metadata.hours_label
  const hoursLabel =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>).hours_label as string | null ?? null
      : null;

  // warranty_type：metadata.warranty_type（遷移時沿用舊欄）
  const warrantyType =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>).warranty_type as string | null ?? null
      : null;

  // status_label：metadata.status_label（遷移時保留）
  const statusLabel =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>).status_label as string | null ?? null
      : null;

  return {
    id: row.id,
    brand_id: row.brand_id,
    claim_no: row.cl_no,                   // claim_no → cl_no
    ro_no: roNoFallback,                    // 顯示用舊 ro_no；新資料靠 ro_code
    ro_id: row.ro_id,
    ro_code: roCode,
    item_label: itemLabel,
    hours_label: hoursLabel,
    warranty_type: warrantyType,
    apply_amount: Number(row.applied_amount),   // apply_amount → applied_amount
    approved_amount: Number(row.approved_amount ?? 0),
    status,
    raw_status: row.status,
    status_label: statusLabel,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    reimbursed_at: row.received_at,             // reimbursed_at → received_at
    sla_days: slaDays,
    sla_remaining_days: slaRemaining,
    overdue,
    expected_pay_date: row.forecast_receipt_date ?? null, // expected_pay_date → forecast_receipt_date
    notes: row.notes,
    created_at: row.created_at,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

export async function listWarrantyClaims(
  filter: WarrantyClaimsFilter = {},
): Promise<WarrantyClaimRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 改讀 warranty_claims；join repair_orders 取 ro_code；join claim_lines 取 notes
  const { data, error } = await supabase
    .from("warranty_claims")
    .select(
      "id, brand_id, cl_no, ro_id, applied_amount, approved_amount, status, submitted_at, approved_at, received_at, forecast_receipt_date, oem_reference_no, notes, metadata, created_at, repair_orders:ro_id(ro_code), warranty_claim_lines(notes)",
    )
    .eq("brand_id", brand)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listWarrantyClaims: ${error.message}`);

  let rows: WarrantyClaimRow[] = (
    (data ?? []) as unknown as RawClaim[]
  ).map(decorateClaim);

  // Application-level filter（資料量小，POC 階段 OK）
  if (filter.status && filter.status !== "all") {
    rows = rows.filter((r) => r.status === filter.status);
  }
  if (filter.overdue === "yes") {
    rows = rows.filter((r) => r.overdue);
  } else if (filter.overdue === "no") {
    rows = rows.filter((r) => !r.overdue);
  }
  if (filter.from) {
    rows = rows.filter((r) =>
      r.submitted_at ? r.submitted_at.slice(0, 10) >= filter.from! : false,
    );
  }
  if (filter.to) {
    rows = rows.filter((r) =>
      r.submitted_at ? r.submitted_at.slice(0, 10) <= filter.to! : false,
    );
  }
  if (filter.keyword) {
    const q = filter.keyword.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.claim_no.toLowerCase().includes(q) ||
          (r.ro_no ?? "").toLowerCase().includes(q) ||
          (r.ro_code ?? "").toLowerCase().includes(q) ||
          r.item_label.toLowerCase().includes(q),
      );
    }
  }
  return rows;
}

export async function getWarrantyStats(): Promise<WarrantyClaimStats> {
  // 統計用「整 brand」、不被 filter 影響
  const all = await listWarrantyClaims({});

  const stats: WarrantyClaimStats = {
    total: all.length,
    draft_count: 0,
    submitted_count: 0,
    approved_count: 0,
    rejected_count: 0,
    reimbursed_count: 0,
    overdue_count: 0,
    reimbursed_amount: 0,
    by_status: {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      reimbursed: 0,
    },
  };
  for (const r of all) {
    stats.by_status[r.status] += 1;
    switch (r.status) {
      case "draft":
        stats.draft_count++;
        break;
      case "submitted":
        stats.submitted_count++;
        if (r.overdue) stats.overdue_count++;
        break;
      case "approved":
        stats.approved_count++;
        break;
      case "rejected":
        stats.rejected_count++;
        break;
      case "reimbursed":
        stats.reimbursed_count++;
        stats.reimbursed_amount += r.approved_amount;
        break;
    }
  }
  return stats;
}

export async function getRoLinkStatus(
  claimId: string,
): Promise<WarrantyClaimRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 改讀 warranty_claims
  const { data, error } = await supabase
    .from("warranty_claims")
    .select(
      "id, brand_id, cl_no, ro_id, applied_amount, approved_amount, status, submitted_at, approved_at, received_at, forecast_receipt_date, oem_reference_no, notes, metadata, created_at, repair_orders:ro_id(ro_code), warranty_claim_lines(notes)",
    )
    .eq("brand_id", brand)
    .eq("id", claimId)
    .maybeSingle();

  if (error) throw new Error(`getRoLinkStatus: ${error.message}`);
  if (!data) return null;
  return decorateClaim(data as unknown as RawClaim);
}
