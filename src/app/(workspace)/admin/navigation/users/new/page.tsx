import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { loadScopeOptions } from "../_lib/load-scope-options";
import { AssignmentDetailView } from "../[userId]/[roleId]/_components/assignment-detail-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) redirect("/admin/navigation");

  const options = await loadScopeOptions();

  return (
    <main className="px-6 py-5 space-y-3">
      <AssignmentDetailView
        mode="create"
        email={null}
        userId={null}
        role={null}
        granted={{ groups: [], brands: [], stores: [] }}
        groups={options.groups}
        brands={options.brands}
        stores={options.stores}
        allRoles={options.roles}
      />
    </main>
  );
}
