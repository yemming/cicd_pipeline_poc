import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  ContractsBoard,
  type ContractRow,
  type SupplierOption,
} from "./_components/contracts-board";

export const dynamic = "force-dynamic";

async function loadData() {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [cRes, sRes] = await Promise.all([
    supabase
      .from("supplier_contracts")
      .select(
        "id, supplier_id, contract_no, effective_from, effective_to, payment_terms, min_order_amount, notes, status, document_url",
      )
      .eq("brand_id", brand)
      .order("contract_no"),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
  ]);
  if (cRes.error) throw new Error(`contracts: ${cRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  return {
    rows: (cRes.data ?? []) as unknown as ContractRow[],
    suppliers: (sRes.data ?? []) as unknown as SupplierOption[],
  };
}

export default async function ContractsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視採購合約的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_EDIT);
  const { rows, suppliers } = await loadData();
  return <ContractsBoard rows={rows} suppliers={suppliers} canEdit={canEdit} />;
}
