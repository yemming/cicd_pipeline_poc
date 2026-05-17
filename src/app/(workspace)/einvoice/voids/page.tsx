import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEinvoiceVoidsPageData } from "@/domain/einvoice";

import { VoidsBoard } from "./_components/voids-board";

export const dynamic = "force-dynamic";

export default async function VoidsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EINVOICE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電子發票的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const dateFrom = sp.dateFrom ?? "";
  const dateTo = sp.dateTo ?? "";

  const rows = await getEinvoiceVoidsPageData({ dateFrom, dateTo });

  return <VoidsBoard rows={rows} filters={{ dateFrom, dateTo }} />;
}
