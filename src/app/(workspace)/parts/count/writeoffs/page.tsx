import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listInventoryWriteoffs,
  listWriteoffItemOptions,
} from "@/domain/writeoffs";

import { WriteoffsBoard } from "./_components/writeoffs-board";

export const dynamic = "force-dynamic";

export default async function WriteoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">請先登入</p>
      </main>
    );
  }

  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視報廢審批的權限</p>
      </main>
    );
  }

  const sp = await searchParams;

  const [{ rows, totalCount }, itemOptions, canEdit] = await Promise.all([
    listInventoryWriteoffs({ status: sp.status || undefined }),
    listWriteoffItemOptions(),
    hasPermission(PERMISSIONS.COUNT_ADJUST),
  ]);

  return (
    <WriteoffsBoard
      rows={rows}
      totalCount={totalCount}
      itemOptions={itemOptions}
      canEdit={canEdit}
      initialStatus={sp.status ?? ""}
    />
  );
}
