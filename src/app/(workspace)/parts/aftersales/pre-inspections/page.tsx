import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listAppointmentCandidates, listPreInspections } from "@/domain/pre-inspections";
import {
  PRE_INSPECTION_STATUS,
  type PreInspectionStatus,
} from "@/domain/pre-inspections.constants";

import { PreInspectionsBoard } from "./_components/pre-inspections-board";

export const dynamic = "force-dynamic";

const STATUS_FILTER: ReadonlyArray<PreInspectionStatus | "all"> = [
  "all",
  ...PRE_INSPECTION_STATUS,
];

export default async function PreInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視接待預檢的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const sp = await searchParams;
  const status = ((STATUS_FILTER as readonly string[]).includes(sp.status ?? "")
    ? sp.status
    : "all") as PreInspectionStatus | "all";
  const q = sp.q ?? "";

  const [rows, candidates] = await Promise.all([
    listPreInspections({ status, q }),
    listAppointmentCandidates(),
  ]);

  return (
    <PreInspectionsBoard
      rows={rows}
      candidates={candidates}
      filter={{ status, q }}
      canEdit={canEdit}
    />
  );
}
