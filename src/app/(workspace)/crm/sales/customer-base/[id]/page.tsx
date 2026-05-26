import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCustomerBaseDetail } from "@/domain/sales-customer-base";
import {
  getSalesPrivate,
  getServicePrivate,
} from "@/domain/customer-private";
import {
  SalesPrivateSection,
  ServicePrivateSection,
} from "@/components/customer/p08-private-sections";

import { CustomerBaseDetailView } from "./_components/customer-base-detail-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶基盤的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const { id } = await params;
  const [bundle, salesPrivate, servicePrivate, canEditSales, canEditService] =
    await Promise.all([
      getCustomerBaseDetail(id),
      getSalesPrivate(id),
      getServicePrivate(id),
      hasPermission(PERMISSIONS.CUSTOMER_SALES_PRIVATE_EDIT),
      hasPermission(PERMISSIONS.CUSTOMER_SERVICE_PRIVATE_EDIT),
    ]);
  if (!bundle) notFound();

  // 部門判斷 → 沒權限的 getSalesPrivate / getServicePrivate 會回 null
  // 但 null 也可能是「有權限但還沒建 row」— 我們仍要渲染區段（顯示空 + 編輯入口）
  // 區別靠 RBAC permission：沒 view permission 的 user 連這支 helper 都不該呼叫
  const canViewSalesP = await hasPermission(
    PERMISSIONS.CUSTOMER_SALES_PRIVATE_VIEW,
  );
  const canViewServiceP = await hasPermission(
    PERMISSIONS.CUSTOMER_SERVICE_PRIVATE_VIEW,
  );

  return (
    <>
      <CustomerBaseDetailView
        customer={bundle.customer}
        contacts={bundle.contacts}
        vehicles={bundle.vehicles}
        models={bundle.models}
        canEdit={canEdit}
        initialMode="view"
      />
      {(canViewSalesP || canViewServiceP) && (
        <div className="px-6 pb-6 space-y-3">
          {canViewSalesP && (
            <SalesPrivateSection
              customerId={id}
              initial={salesPrivate}
              canEdit={canEditSales}
            />
          )}
          {canViewServiceP && (
            <ServicePrivateSection
              customerId={id}
              initial={servicePrivate}
              canEdit={canEditService}
            />
          )}
        </div>
      )}
    </>
  );
}
