import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { SuppliersBoard, type SupplierRow } from "./_components/suppliers-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, code, name, type, primary_contact, phone, email, address, tax_id, payment_terms, default_currency, notes, is_active",
    )
    .eq("brand_id", getBrandKey())
    .order("code");
  if (error) throw new Error(`suppliers: ${error.message}`);
  return (data ?? []) as unknown as SupplierRow[];
}

export default async function SuppliersPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_EDIT);
  const rows = await loadData();
  return <SuppliersBoard rows={rows} canEdit={canEdit} />;
}
