/**
 * /sales/insurance — 保險招攬工作台（A 級，2026-05-20）
 *
 * 走 DB-driven：insurance_policies + insurance_attempts；helper 全走 @/domain/sales-insurance。
 * 舊版 mock-only Stitch demo board 保留在 ./_components/insurance-board-legacy（不再使用）。
 */

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listSalesDictionary } from "@/domain/sales-settings";
import {
  getInsuranceByType,
  getInsuranceKpis,
  getInsuranceLookups,
  getRenewalDueList,
  listInsurancePolicies,
} from "@/domain/sales-insurance";

import InsuranceBoard from "./_components/insurance-board";

export const metadata = {
  title: "保險招攬工作台 | DealerOS",
};

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  policy_type?: string;
  expiry_window?: string;
  search?: string;
  assigned_to?: string;
  page?: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const canView = await hasPermission(PERMISSIONS.SALES_INSURANCE_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-10 text-[13px]">
        <h1 className="text-[16px] font-semibold text-[#CC0000]">沒有檢視保險招攬的權限</h1>
        <p className="text-[#5A5955] mt-1.5">請聯絡管理員開通 sales.insurance.view。</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.SALES_INSURANCE_EDIT);

  const sp = await searchParams;
  const filters = {
    status: (sp.status as "active" | "expired" | "pending" | "all" | undefined) ?? "all",
    policy_type:
      (sp.policy_type as "compulsory" | "voluntary" | "theft" | "other" | "all" | undefined) ??
      "all",
    expiry_window: (sp.expiry_window as "30" | "60" | "90" | "expired" | "all" | undefined) ?? "all",
    search: sp.search ?? "",
    assigned_to: sp.assigned_to ?? "all",
  } as const;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // 字典 fallback（BDN #14 ROOT CAUSE 流失原因）
  let lostReasons: { code: string; label: string }[] = [];
  try {
    const rows = await listSalesDictionary({ kind: "insurance_lost_reason" });
    lostReasons = rows.filter((r) => r.is_active).map((r) => ({ code: r.code, label: r.label }));
  } catch (err) {
    console.error("[/sales/insurance] listSalesDictionary failed:", err);
  }

  const [policies, kpis, dueBuckets, byType, lookups] = await Promise.all([
    listInsurancePolicies(filters, { page, pageSize: 50 }),
    getInsuranceKpis(),
    getRenewalDueList(),
    getInsuranceByType(),
    getInsuranceLookups(),
  ]);

  return (
    <InsuranceBoard
      rows={policies.rows}
      totalCount={policies.totalCount}
      page={page}
      pageSize={50}
      kpis={kpis}
      dueBuckets={dueBuckets}
      byType={byType}
      lookups={lookups}
      filters={filters}
      lostReasons={lostReasons}
      canEdit={canEdit}
    />
  );
}
