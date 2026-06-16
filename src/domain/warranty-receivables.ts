import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

// ─── 型別 ───────────────────────────────────────────────────────────────────

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

// ─── Query ──────────────────────────────────────────────────────────────────

export async function listWarrantyReceivables(
  filters: WarrantyReceivableFilters = {},
): Promise<{ rows: WarrantyReceivableRow[]; totalCount: number }> {
  const scope = await getActiveScope();
  const supabase = await createClient();

  let q = supabase
    .from("warranty_claim_receivables")
    .select(
      `
      id,
      created_at,
      claim_amount,
      claim_status,
      submitted_at,
      oem_reference_no,
      paid_at,
      parts_warranty_claims!claim_id(claim_no, ro_no)
      `,
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false });

  if (filters.status) {
    q = q.eq("claim_status", filters.status);
  }

  const { data, count, error } = await q;

  if (error) {
    console.error("[warranty-receivables] listWarrantyReceivables error:", error.message);
    return { rows: [], totalCount: 0 };
  }

  const rows: WarrantyReceivableRow[] = (data ?? []).map((d) => {
    // Supabase join 回傳 single-row object 或 null
    const claim = Array.isArray(d.parts_warranty_claims)
      ? d.parts_warranty_claims[0]
      : d.parts_warranty_claims;
    return {
      id: d.id,
      created_at: d.created_at,
      claim_no: (claim as { claim_no?: string } | null)?.claim_no ?? null,
      ro_no: (claim as { ro_no?: string } | null)?.ro_no ?? null,
      claim_amount: d.claim_amount,
      claim_status: d.claim_status,
      submitted_at: d.submitted_at,
      oem_reference_no: d.oem_reference_no,
      paid_at: d.paid_at,
    };
  });

  return { rows, totalCount: count ?? 0 };
}
