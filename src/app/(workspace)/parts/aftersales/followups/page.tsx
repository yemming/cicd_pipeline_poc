import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listCases,
  listSaNames,
  topLostItems,
  saPerformance,
  type CaseSafetyLevel,
  type CaseStatus,
  type CasesListFilter,
} from "@/domain/followup-cases";

import { FollowupsBoard } from "./_components/followups-board";

export const dynamic = "force-dynamic";

const STATUS_FILTER: ReadonlyArray<CaseStatus | "all" | "open"> = [
  "all",
  "open",
  "tracking",
  "escalated",
  "long_term",
  "closed_won",
  "closed_lost",
];
const SAFETY: ReadonlyArray<CaseSafetyLevel | "all"> = [
  "all",
  "normal",
  "safety_related",
  "safety_critical",
];

export default async function FollowupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視追蹤閉環的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const sp = await searchParams;

  const status = (STATUS_FILTER as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as CasesListFilter["status"])
    : "open";
  const safety = (SAFETY as readonly string[]).includes(sp.safety ?? "")
    ? (sp.safety as CasesListFilter["safetyLevel"])
    : "all";

  const filter: CasesListFilter = {
    status,
    safetyLevel: safety,
    saName: sp.sa || null,
    q: sp.q || null,
  };

  const [{ rows, summary }, saNames, ranks, sas] = await Promise.all([
    listCases(filter),
    listSaNames(),
    topLostItems(),
    saPerformance(),
  ]);

  return (
    <FollowupsBoard
      rows={rows}
      summary={summary}
      filter={filter}
      canEdit={canEdit}
      saNames={saNames}
      ranks={ranks}
      saPerformance={sas}
    />
  );
}
