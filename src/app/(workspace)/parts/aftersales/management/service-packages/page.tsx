import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  listServicePackages,
  listLaborRates,
  listServicePackageAudit,
} from "@/domain/service-packages";
import { getPricingPolicyNameMap } from "@/domain/group-pricing";
import { checkServicePackageEditPermission } from "@/lib/aftersales/service-package-actions";

import { ServicePackagesBoard } from "./_components/service-packages-board";

export const dynamic = "force-dynamic";

export default async function ServicePackagesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">請先登入</p>
      </main>
    );
  }
  if (!(await hasPermission(PERMISSIONS.SERVICE_PACKAGE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視服務套餐與費率設定的權限</p>
      </main>
    );
  }

  const scope = await getActiveScope();
  const brand = scope.brand_id;

  const [packages, laborRates, audit, canEdit, policyMap] = await Promise.all([
    listServicePackages(brand, { includeInactive: true }),
    listLaborRates(brand, { includeInactive: true }),
    listServicePackageAudit(brand),
    checkServicePackageEditPermission(),
    getPricingPolicyNameMap(brand),
  ]);

  return (
    <ServicePackagesBoard
      brand={brand}
      packages={packages}
      laborRates={laborRates}
      audit={audit}
      canEdit={canEdit}
      policyMap={policyMap}
    />
  );
}
