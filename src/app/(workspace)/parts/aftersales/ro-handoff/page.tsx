import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listHandoffs } from "@/domain/ro-handoffs";
import { HANDOFF_STATUS, type HandoffStatus } from "@/domain/ro-handoffs.constants";

import { HandoffBoard } from "./_components/handoff-board";

export const dynamic = "force-dynamic";

const STATUS_FILTER: ReadonlyArray<HandoffStatus | "all"> = ["all", ...HANDOFF_STATUS];

export default async function ROHandoffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  const canView = await hasPermission(PERMISSIONS.RO_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-8 text-[13px] text-[#CC0000]">
        無權限檢視此頁面（service.ro.view）
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);

  const sp = await searchParams;
  const statusRaw = (sp.status ?? "all") as HandoffStatus | "all";
  const status = STATUS_FILTER.includes(statusRaw) ? statusRaw : "all";
  const q = sp.q ?? "";

  const rows = await listHandoffs({ status, q });

  return <HandoffBoard rows={rows} filter={{ status, q }} canEdit={canEdit} />;
}
