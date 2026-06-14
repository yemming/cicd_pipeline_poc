import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listFinalInspections,
  listRoCandidatesForInspection,
} from "@/domain/final-inspections";
import {
  FINAL_INSPECTION_STATUS,
  type FinalInspectionStatus,
} from "@/domain/final-inspections.constants";

import { FinalInspectionsBoard } from "./_components/final-inspections-board";

export const dynamic = "force-dynamic";

const STATUS_FILTER: ReadonlyArray<FinalInspectionStatus | "all"> = [
  "all",
  ...FINAL_INSPECTION_STATUS,
];

export default async function FinalInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視竣工複檢的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const sp = await searchParams;

  const status = ((STATUS_FILTER as readonly string[]).includes(sp.status ?? "")
    ? sp.status
    : "all") as FinalInspectionStatus | "all";
  const q = sp.q ?? "";
  const roId = sp.ro_id ?? null;

  const [rows, candidates] = await Promise.all([
    listFinalInspections({ status, q, roId }),
    listRoCandidatesForInspection(),
  ]);

  return (
    <FinalInspectionsBoard
      rows={rows}
      candidates={candidates}
      filter={{ status, q, roId }}
      canEdit={canEdit}
    />
  );
}
