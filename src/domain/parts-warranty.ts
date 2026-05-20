"use server";

/**
 * Domain Helper — Parts Warranty / RO 工單串接（A 級狀態流頁）
 *
 * 對應路徑：`/parts/warranty/ro-link`
 * 對應規格：M04L-10、`docs/DUCATI_v2_output/04_庫存管理/08_保固索賠/11_保固索賠_RO工單串接.html`
 *
 * 與 cost-recovery 共用底層 `parts_warranty_claims` 表，但這支 helper 聚焦
 * 「狀態流 + SLA + RO link」視角：
 *   1. status 統一 normalize 成 5 段：draft / submitted / approved / rejected / reimbursed
 *      （DB 內舊值 reviewing 視為 submitted、paid 視為 reimbursed，以維持 cost-recovery 相容）
 *   2. overdue 在應用層計算：submitted_at + sla_days < now() 且 status 仍卡在 submitted。
 *   3. SLA 倒數天數即時算出，不存欄位、不過時。
 *
 * UI 一律透過此 helper 取資料，禁止 page / component import @/lib/supabase/*。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

// 註：parts_warranty_claims 表近期加了 submitted_at / approved_at / reimbursed_at
// / sla_days / ro_id / notes 6 個欄位，database.types.ts 尚未 regenerate。
// 為避免動 generated types（會牽動全 repo），本檔本地宣告 RawClaim 形狀。
type RawClaim = {
  id: string;
  brand_id: string;
  claim_no: string;
  ro_no: string | null;
  ro_id: string | null;
  item_label: string;
  hours_label: string | null;
  warranty_type: string | null;
  apply_amount: number | string;
  approved_amount: number | string;
  status: string;
  status_label: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  reimbursed_at: string | null;
  sla_days: number | null;
  expected_pay_date: string | null;
  notes: string | null;
  created_at: string;
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
    case "reviewing":
      return "submitted";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "reimbursed":
    case "paid":
      return "reimbursed";
    default:
      return "submitted";
  }
}

function diffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function decorateClaim(
  row: RawClaim & { repair_orders?: { ro_code: string | null } | null },
): WarrantyClaimRow {
  const status = normalizeStatus(row.status);
  const slaDays = row.sla_days ?? 21;
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
  return {
    id: row.id,
    brand_id: row.brand_id,
    claim_no: row.claim_no,
    ro_no: row.ro_no,
    ro_id: row.ro_id,
    ro_code: row.repair_orders?.ro_code ?? null,
    item_label: row.item_label,
    hours_label: row.hours_label,
    warranty_type: row.warranty_type,
    apply_amount: Number(row.apply_amount),
    approved_amount: Number(row.approved_amount),
    status,
    raw_status: row.status,
    status_label: row.status_label,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    reimbursed_at: row.reimbursed_at,
    sla_days: slaDays,
    sla_remaining_days: slaRemaining,
    overdue,
    expected_pay_date: row.expected_pay_date,
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

  const { data, error } = await supabase
    .from("parts_warranty_claims")
    .select(
      "id, brand_id, claim_no, ro_no, ro_id, item_label, hours_label, warranty_type, apply_amount, approved_amount, status, status_label, submitted_at, approved_at, reimbursed_at, sla_days, expected_pay_date, notes, created_at, repair_orders:ro_id(ro_code)",
    )
    .eq("brand_id", brand)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listWarrantyClaims: ${error.message}`);

  let rows: WarrantyClaimRow[] = (
    (data ?? []) as unknown as Array<
      RawClaim & { repair_orders: { ro_code: string | null } | null }
    >
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

  const { data, error } = await supabase
    .from("parts_warranty_claims")
    .select(
      "id, brand_id, claim_no, ro_no, ro_id, item_label, hours_label, warranty_type, apply_amount, approved_amount, status, status_label, submitted_at, approved_at, reimbursed_at, sla_days, expected_pay_date, notes, created_at, repair_orders:ro_id(ro_code)",
    )
    .eq("brand_id", brand)
    .eq("id", claimId)
    .maybeSingle();

  if (error) throw new Error(`getRoLinkStatus: ${error.message}`);
  if (!data) return null;
  return decorateClaim(
    data as unknown as RawClaim & {
      repair_orders: { ro_code: string | null } | null;
    },
  );
}
