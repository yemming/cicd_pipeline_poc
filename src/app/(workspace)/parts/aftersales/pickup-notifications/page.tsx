import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listPickupCandidates,
  getPickupStats,
  type PickupFilters,
} from "@/domain/pickup-notifications";

import { PickupNotificationsBoard } from "./_components/pickup-notifications-board";

export const dynamic = "force-dynamic";

const SCOPE_VALUES = ["all", "pending", "sent"] as const;
type Scope = (typeof SCOPE_VALUES)[number];

export default async function PickupNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視取車通知的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CLOSE);
  const sp = await searchParams;
  const scope = ((SCOPE_VALUES as readonly string[]).includes(sp.scope ?? "")
    ? sp.scope
    : "pending") as Scope;
  const q = sp.q ?? "";

  const filters: PickupFilters = { scope, q };
  const [rows, stats] = await Promise.all([
    listPickupCandidates(filters),
    getPickupStats(),
  ]);

  return (
    <PickupNotificationsBoard
      rows={rows}
      stats={stats}
      filter={{ scope, q }}
      canEdit={canEdit}
    />
  );
}
