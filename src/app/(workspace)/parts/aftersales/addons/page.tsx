import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listAddons, listRoOptionsForAddons, getAddonCostSummaryByRo } from "@/domain/repair-order-addons";
import type {
  AddonsListFilter,
  CustomerDecision,
  SafetyLevel,
} from "@/domain/repair-order-addons.constants";

import { AddonsBoard } from "./_components/addons-board";

export const dynamic = "force-dynamic";

const DECISIONS: ReadonlyArray<CustomerDecision | "all"> = [
  "all",
  "pending",
  "agreed",
  "deferred",
  "rejected",
  "cancelled",
];
const SAFETY: ReadonlyArray<SafetyLevel | "all"> = [
  "all",
  "normal",
  "safety_related",
  "safety_critical",
];

export default async function AddonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視追加項目的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const sp = await searchParams;

  const decision = (DECISIONS as readonly string[]).includes(sp.decision ?? "")
    ? (sp.decision as AddonsListFilter["decision"])
    : "all";
  const safety = (SAFETY as readonly string[]).includes(sp.safety ?? "")
    ? (sp.safety as AddonsListFilter["safetyLevel"])
    : "all";

  const filter: AddonsListFilter = {
    decision,
    safetyLevel: safety,
    roId: sp.ro_id || null,
    q: sp.q || null,
  };

  // 費用摘要只在選定工單時才撈（避免全廠模式下無意義的聚合）
  const [{ rows, summary }, roOptions, costSummary] = await Promise.all([
    listAddons(filter),
    listRoOptionsForAddons(),
    filter.roId ? getAddonCostSummaryByRo(filter.roId) : Promise.resolve(null),
  ]);

  return (
    <AddonsBoard
      rows={rows}
      summary={summary}
      filter={filter}
      canEdit={canEdit}
      roOptions={roOptions}
      costSummary={costSummary}
    />
  );
}
