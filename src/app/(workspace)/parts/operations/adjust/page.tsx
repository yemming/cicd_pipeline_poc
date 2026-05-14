import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getExceptionsPageData } from "@/domain/adjustments";
import { EXCEPTIONS_PAGE_SIZE_DEFAULT } from "@/domain/adjustments.constants";

import { ExceptionsBoard } from "../exceptions/_components/exceptions-board";

export const dynamic = "force-dynamic";

// 只顯示主動發起的庫存調整：手動調整 + 損耗報廢。
// （exception_in / exception_out / count / other 走 /parts/operations/exceptions 全清單）
const ADJUST_TYPES = ["manual", "damage"];

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    warehouse?: string;
    q?: string;
    page?: string;
  }>;
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
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = EXCEPTIONS_PAGE_SIZE_DEFAULT;

  // URL ?type=... 必須在 ADJUST_TYPES 白名單內，否則一律忽略（避免外部連結污染 scope）
  const requestedType =
    sp.type && ADJUST_TYPES.includes(sp.type) ? sp.type : undefined;

  // 沒指定就拉兩種（manual + damage）；指定就只拉那種
  const typeFilter = requestedType ?? ADJUST_TYPES;

  const { rows, totalCount, canEdit, warehouses } = await getExceptionsPageData(
    {
      type: typeFilter,
      status: sp.status || undefined,
      warehouse_id: sp.warehouse || undefined,
      q: sp.q || undefined,
    },
    { page, pageSize },
  );

  return (
    <ExceptionsBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      warehouses={warehouses}
      page={page}
      pageSize={pageSize}
      initialType={requestedType ?? ""}
      initialStatus={sp.status ?? ""}
      initialWarehouse={sp.warehouse ?? ""}
      initialQ={sp.q ?? ""}
      basePath="/parts/operations/adjust"
      title="庫存調整作業"
      sprint="7.2"
      caption="主動發起的庫存調整：手動調整 / 損耗報廢"
      allowedTypes={ADJUST_TYPES}
      newHref="/parts/operations/exceptions/new?type=manual"
      detailHrefBase="/parts/operations/exceptions"
      persistKey="parts/operations/adjust"
      noPermissionHint="💡 你目前沒有庫存調整權限（parts.exception.ops），僅能檢視"
      emptyMessage="沒有符合條件的調整單（僅顯示手動調整 / 損耗報廢）"
    />
  );
}
