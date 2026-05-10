import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  listJournalEntries,
  type JournalEntryFilters,
} from "@/lib/accounting/queries";

import { JournalEntryBoard } from "./_components/journal-entry-board";

export const dynamic = "force-dynamic";

export default async function JournalEntriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">會計分錄僅限管理者使用</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filters: JournalEntryFilters = {
    q: sp.q ?? "",
    status: sp.status ?? "all",
    date_from: sp.date_from ?? "",
    date_to: sp.date_to ?? "",
  };

  const { rows, totalCount } = await listJournalEntries(filters);

  return <JournalEntryBoard rows={rows} totalCount={totalCount} filters={filters} />;
}
