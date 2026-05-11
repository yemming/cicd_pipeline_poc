import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listReceipts } from "@/domain/receipts";

import { ReceiptsHistoryBoard } from "./_components/receipts-history-board";

export const dynamic = "force-dynamic";

export default async function ReceiptsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視入庫紀錄的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const rows = await listReceipts({
    type: sp.type || undefined,
    q: sp.q || undefined,
  });

  return (
    <ReceiptsHistoryBoard
      rows={rows}
      initialType={sp.type ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}
