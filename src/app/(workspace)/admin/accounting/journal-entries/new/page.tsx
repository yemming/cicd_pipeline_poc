import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  listDimensionLookups,
  listGlDimensions,
  listPostableCoaOptions,
} from "@/lib/accounting/queries";

import { JournalEntryDetailView } from "../[id]/_components/journal-entry-detail-view";

export const dynamic = "force-dynamic";

export default async function NewJournalEntryPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">會計分錄僅限管理者使用</p>
      </main>
    );
  }

  const [coaOptions, dimensionLookups, dimRowsRes] = await Promise.all([
    listPostableCoaOptions(),
    listDimensionLookups(),
    listGlDimensions({ status: "active" }),
  ]);

  const dimensionsCatalog = dimRowsRes.rows.map((r) => ({
    code: r.dimension_code,
    name: r.dimension_name,
    hasLookup: !!r.reference_table,
  }));

  return (
    <JournalEntryDetailView
      entry={null}
      lines={[]}
      coaOptions={coaOptions}
      dimensionLookups={dimensionLookups}
      dimensionsCatalog={dimensionsCatalog}
      initialMode="create"
    />
  );
}
