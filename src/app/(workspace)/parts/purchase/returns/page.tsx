import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  listPurchaseReturns,
  getPurchaseReturnKpis,
  listVendorOptions,
  listPurchaseOrderOptions,
  type PurchaseReturnListFilter,
} from "@/domain/procurement";

import { ReturnsBoard } from "./_components/returns-board";

export const dynamic = "force-dynamic";

export default async function PurchaseReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購退貨的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.PO_RETURN);
  const canApprove = await hasPermission(PERMISSIONS.PO_APPROVE);

  const sp = await searchParams;
  const filter: PurchaseReturnListFilter = {
    status: sp.status && sp.status !== "all" ? sp.status : undefined,
    vendor_id: sp.vendor_id || undefined,
    return_reason: sp.return_reason && sp.return_reason !== "all" ? sp.return_reason : undefined,
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
    q: sp.q || undefined,
  };

  let loadError: string | null = null;
  let rows: Awaited<ReturnType<typeof listPurchaseReturns>>["rows"] = [];
  let total = 0;
  let kpis = { pending_count: 0, shipped_count: 0, completed_this_month: 0, amount_this_month: 0 };
  let vendors: Awaited<ReturnType<typeof listVendorOptions>> = [];
  let poOptions: Awaited<ReturnType<typeof listPurchaseOrderOptions>> = [];
  try {
    const [listRes, kpiRes, vendorRes, poRes] = await Promise.all([
      listPurchaseReturns(filter),
      getPurchaseReturnKpis(),
      listVendorOptions(),
      listPurchaseOrderOptions(),
    ]);
    rows = listRes.rows;
    total = listRes.total;
    kpis = kpiRes;
    vendors = vendorRes;
    poOptions = poRes;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <ReturnsBoard
      rows={rows}
      total={total}
      kpis={kpis}
      vendors={vendors}
      poOptions={poOptions}
      canEdit={canEdit}
      canApprove={canApprove}
      filter={{
        status: sp.status ?? "all",
        vendor_id: sp.vendor_id ?? "",
        return_reason: sp.return_reason ?? "all",
        date_from: sp.date_from ?? "",
        date_to: sp.date_to ?? "",
        q: sp.q ?? "",
      }}
      loadError={loadError}
      autoOpenCreate={sp.new === "1"}
    />
  );
}
