import { notFound } from "next/navigation";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesQuoteById } from "@/domain/sales-quote";

import { QuotationDetailView } from "./_components/quotation-detail-view";

/**
 * 賞車報價單 Detail Page — view / edit mode
 *
 * 權限：reuse SALES_ORDER_VIEW/EDIT（與既有 list page 對齊；報價與訂單為同一業務流）。
 */
export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const canView = await hasPermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="text-[13px] text-[#CC0000]">
          沒有檢視賞車報價單的權限。
        </div>
      </main>
    );
  }

  const [quote, canEdit] = await Promise.all([
    getSalesQuoteById(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  if (!quote) notFound();

  return (
    <QuotationDetailView quote={quote} initialMode="view" canEdit={canEdit} />
  );
}
