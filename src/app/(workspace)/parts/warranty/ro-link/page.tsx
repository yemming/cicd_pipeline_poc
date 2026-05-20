import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getRoLinkConfig } from "@/domain/warranty";
import {
  listWarrantyClaims,
  getWarrantyStats,
  type WarrantyClaimStatus,
  type WarrantyClaimsFilter,
} from "@/domain/parts-warranty";

import { WarrantyRoLinkBoard } from "./_components/warranty-ro-link-board";

export const dynamic = "force-dynamic";

const STATUS_VALUES: WarrantyClaimStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "reimbursed",
];

function parseStatus(v: string | undefined): WarrantyClaimStatus | "all" {
  if (!v) return "all";
  if (v === "all") return "all";
  if ((STATUS_VALUES as string[]).includes(v)) {
    return v as WarrantyClaimStatus;
  }
  return "all";
}

export default async function RoLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-5">
        <p className="text-[14px] text-[#CC0000]">沒有檢視保固索賠的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);

  const sp = await searchParams;
  const pick = (k: string): string | undefined => {
    const v = sp[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v[0];
    return undefined;
  };

  const overdueRaw = pick("overdue");
  const overdue: WarrantyClaimsFilter["overdue"] =
    overdueRaw === "yes" || overdueRaw === "no" ? overdueRaw : "all";

  const filter: WarrantyClaimsFilter = {
    status: parseStatus(pick("status")),
    overdue,
    from: pick("from"),
    to: pick("to"),
    keyword: pick("q"),
  };

  const [claims, stats, config] = await Promise.all([
    listWarrantyClaims(filter),
    getWarrantyStats(),
    getRoLinkConfig(),
  ]);

  return (
    <WarrantyRoLinkBoard
      claims={claims}
      stats={stats}
      config={config}
      filter={filter}
      canEdit={canEdit}
    />
  );
}
