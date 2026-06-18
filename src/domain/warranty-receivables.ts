import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

// ─── 型別 ───────────────────────────────────────────────────────────────────

/**
 * WarrantyReceivableRow — 對外型別維持不變（UI 不動）
 *
 * 2026-06-18 Russell 裁示：warranty_claim_receivables 凍結，改從 warranty_claims 衍生應收檢視。
 * 映射規則：
 *   claim_amount    ← approved_amount（有值）否則 applied_amount
 *   claim_status    ← status 映射（under_review→submitted, partial_approved→approved,
 *                                   received→paid, cancelled→rejected）
 *   submitted_at    ← submitted_at
 *   paid_at         ← received_at
 *   oem_reference_no← oem_reference_no
 *   claim_no        ← cl_no
 *   ro_no           ← repair_orders.ro_code 或 metadata.orig_ro_no
 */
export type WarrantyReceivableRow = {
  id: string;
  created_at: string;
  claim_no: string | null;
  ro_no: string | null;
  claim_amount: number;
  claim_status: string;
  submitted_at: string | null;
  oem_reference_no: string | null;
  paid_at: string | null;
};

export type WarrantyReceivableFilters = {
  status?: string;
};

// status 映射：warranty_claims 8 態 → 應收檢視的 legacy 5 態
function mapClaimStatus(raw: string): string {
  switch (raw) {
    case "draft":
      return "pending";
    case "submitted":
    case "under_review":
      return "submitted";
    case "approved":
    case "partial_approved":
      return "approved";
    case "rejected":
    case "cancelled":
      return "rejected";
    case "received":
      return "paid";
    default:
      return raw;
  }
}

// ─── Query ──────────────────────────────────────────────────────────────────

/**
 * 直接從 warranty_claims 衍生應收檢視（不再走 warranty_claim_receivables）
 */
export async function listWarrantyReceivables(
  filters: WarrantyReceivableFilters = {},
): Promise<{ rows: WarrantyReceivableRow[]; totalCount: number }> {
  const scope = await getActiveScope();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("warranty_claims")
    .select(
      "id, created_at, cl_no, ro_id, applied_amount, approved_amount, status, submitted_at, received_at, oem_reference_no, metadata, repair_orders:ro_id(ro_code)",
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[warranty-receivables] listWarrantyReceivables error:", error.message);
    return { rows: [], totalCount: 0 };
  }

  const allRows = (data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    cl_no: string;
    ro_id: string | null;
    applied_amount: number | string;
    approved_amount: number | string | null;
    status: string;
    submitted_at: string | null;
    received_at: string | null;
    oem_reference_no: string | null;
    metadata: Record<string, unknown> | null;
    repair_orders?: { ro_code: string | null } | null;
  }>;

  // 映射 + 應用層 filter（資料量小，POC OK）
  let rows: WarrantyReceivableRow[] = allRows.map((d) => {
    const meta = d.metadata ?? {};
    const mappedStatus = mapClaimStatus(d.status);
    const roNo = d.repair_orders?.ro_code ?? (meta.orig_ro_no as string | null) ?? null;

    return {
      id: d.id,
      created_at: d.created_at,
      claim_no: d.cl_no,
      ro_no: roNo,
      claim_amount: Number(d.approved_amount ?? d.applied_amount ?? 0),
      claim_status: mappedStatus,
      submitted_at: d.submitted_at,
      oem_reference_no: d.oem_reference_no,
      paid_at: d.received_at,                 // received_at → paid_at
    };
  });

  if (filters.status) {
    rows = rows.filter((r) => r.claim_status === filters.status);
  }

  return { rows, totalCount: rows.length };
}
