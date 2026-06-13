import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserDepartment } from "@/lib/rbac/department";
import { getApprovalsPageData } from "@/domain/aftersales-approvals";
import { ApprovalsView } from "./_components/approvals-view";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ roId: string }>;
}) {
  const { roId } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>
    );
  }

  const canView = await hasPermission(PERMISSIONS.RO_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限查看授權記錄</main>
    );
  }

  const [pageData, dept, canRequest] = await Promise.all([
    getApprovalsPageData(roId),
    getCurrentUserDepartment(),
    hasPermission(PERMISSIONS.RO_CLOSE),
  ]);

  if (!pageData.ro) notFound();

  const canDecide = dept.is_dept_manager || dept.is_cross_admin;

  return (
    <Suspense
      fallback={
        <div className="px-6 py-5 text-[13px] text-[#9A9890]">載入中⋯</div>
      }
    >
      <ApprovalsView
        roId={roId}
        roCode={pageData.ro.ro_code ?? roId}
        customerName={pageData.customerName}
        approvals={pageData.approvals}
        canDecide={canDecide}
        canRequest={canRequest}
      />
    </Suspense>
  );
}
