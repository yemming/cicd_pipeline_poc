import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listRoCheckouts,
  listRoCandidatesForCheckout,
  getCheckoutKpis,
} from "@/domain/ro-checkouts";
import {
  RO_CHECKOUT_STATUS,
  type RoCheckoutStatus,
} from "@/domain/ro-checkouts.constants";

import { RoCheckoutsBoard } from "./_components/ro-checkouts-board";

export const dynamic = "force-dynamic";

const STATUS_FILTER: ReadonlyArray<RoCheckoutStatus | "all"> = [
  "all",
  ...RO_CHECKOUT_STATUS,
];

export default async function RoCheckoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視結帳收款的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CLOSE);
  const sp = await searchParams;

  const status = ((STATUS_FILTER as readonly string[]).includes(sp.status ?? "")
    ? sp.status
    : "all") as RoCheckoutStatus | "all";
  const q = sp.q ?? "";
  const roId = sp.ro_id ?? null;

  const [rows, candidates, kpis] = await Promise.all([
    listRoCheckouts({ status, q, roId }),
    listRoCandidatesForCheckout(),
    getCheckoutKpis(),
  ]);

  return (
    <RoCheckoutsBoard
      rows={rows}
      candidates={candidates}
      filter={{ status, q, roId }}
      canEdit={canEdit}
      kpis={kpis}
    />
  );
}
