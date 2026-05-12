import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getReceiptsPageData } from "@/domain/receipts";

import { ReturnInBoard } from "./_components/return-in-board";

export const dynamic = "force-dynamic";

export default async function ReturnInPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視入庫單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit } = await getReceiptsPageData({
    type: "ro_return",
    status: sp.status || undefined,
    q: sp.q || undefined,
  });

  return (
    <ReturnInBoard
      rows={rows}
      canEdit={canEdit}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}
