import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import { EInvoiceBoard, type EInvoiceRow } from "./_components/einvoice-board";

export const dynamic = "force-dynamic";

export type EInvoiceFilters = {
  status: string;
  source: string;
  type: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

async function loadData(filters: EInvoiceFilters) {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("einvoices")
    .select(
      "id, source_module, source_ref, ecpay_invoice_no, ecpay_invoice_date, ecpay_status, invoice_type, carrier_code, tax_id, buyer_name, total_amount, items, issued_at, created_at",
    )
    .eq("brand_id", brand);

  if (filters.status   !== "all") q = q.eq("ecpay_status",  filters.status);
  if (filters.source   !== "all") q = q.eq("source_module", filters.source);
  if (filters.type     !== "all") q = q.eq("invoice_type",  filters.type);
  if (filters.dateFrom)           q = q.gte("ecpay_invoice_date", filters.dateFrom);
  if (filters.dateTo)             q = q.lte("ecpay_invoice_date", filters.dateTo);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(
      `ecpay_invoice_no.ilike.%${t}%,source_ref.ilike.%${t}%,tax_id.ilike.%${t}%,buyer_name.ilike.%${t}%,carrier_code.ilike.%${t}%`,
    );
  }

  const [iRes, totalRes] = await Promise.all([
    q.order("created_at", { ascending: false }).limit(500),
    supabase
      .from("einvoices")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);

  if (iRes.error) throw new Error(`einvoices: ${iRes.error.message}`);

  return {
    rows:       (iRes.data ?? []) as unknown as EInvoiceRow[],
    totalCount: totalRes.count ?? 0,
  };
}

export default async function EInvoiceListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EINVOICE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電子發票的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.EINVOICE_EDIT);

  const sp = await searchParams;
  const filters: EInvoiceFilters = {
    status:   sp.status   ?? "all",
    source:   sp.source   ?? "all",
    type:     sp.type     ?? "all",
    dateFrom: sp.dateFrom ?? "",
    dateTo:   sp.dateTo   ?? "",
    q:        sp.q        ?? "",
  };
  const { rows, totalCount } = await loadData(filters);

  return (
    <EInvoiceBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={filters}
    />
  );
}
