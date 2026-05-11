import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getExceptionsPageData } from "@/domain/adjustments";

import { ExceptionsBoard } from "../exceptions/_components/exceptions-board";

export const dynamic = "force-dynamic";

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.EXCEPTION_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視庫存調整的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit } = await getExceptionsPageData({
    status: sp.status || undefined,
    q: sp.q || undefined,
  });

  return (
    <ExceptionsBoard
      rows={rows}
      canEdit={canEdit}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}
