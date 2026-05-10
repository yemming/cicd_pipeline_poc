import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import { EInvoiceDetailView, type EInvoiceFull, type AllowanceRow, type VoidRow } from "./_components/einvoice-detail-view";

export const dynamic = "force-dynamic";

async function loadData(id: string): Promise<{ einvoice: EInvoiceFull; allowances: AllowanceRow[]; voids: VoidRow[] } | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [eRes, aRes, vRes] = await Promise.all([
    supabase
      .from("einvoices")
      .select(
        "id, brand_id, source_module, source_id, source_ref, ecpay_invoice_no, ecpay_invoice_date, ecpay_random_number, ecpay_status, ecpay_error_msg, invoice_type, carrier_type, carrier_code, tax_id, buyer_name, buyer_address, buyer_email, buyer_phone, donation_code, total_amount, tax_amount, items, remark, issued_at, created_at",
      )
      .eq("id", id)
      .eq("brand_id", brand)
      .single(),
    supabase
      .from("einvoice_allowances")
      .select("id, ecpay_allowance_no, total_amount, tax_amount, items, reason, status, ecpay_error_msg, notify_method, notify_target, issued_at, created_at")
      .eq("einvoice_id", id)
      .eq("brand_id", brand)
      .order("created_at", { ascending: false }),
    supabase
      .from("einvoice_voids")
      .select("id, reason, voided_at, voided_by")
      .eq("einvoice_id", id)
      .eq("brand_id", brand)
      .order("voided_at", { ascending: false }),
  ]);

  if (eRes.error || !eRes.data) return null;

  return {
    einvoice:   eRes.data as unknown as EInvoiceFull,
    allowances: (aRes.data ?? []) as unknown as AllowanceRow[],
    voids:      (vRes.data ?? []) as unknown as VoidRow[],
  };
}

export default async function EInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const canVoid      = await hasPermission(PERMISSIONS.EINVOICE_VOID);
  const canAllowance = await hasPermission(PERMISSIONS.EINVOICE_ALLOWANCE);

  const { id } = await params;
  const data = await loadData(id);
  if (!data) notFound();

  return (
    <EInvoiceDetailView
      einvoice={data.einvoice}
      allowances={data.allowances}
      voids={data.voids}
      canVoid={canVoid}
      canAllowance={canAllowance}
    />
  );
}
