import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getTransferForPrint } from "@/domain/transfers";

import { StockTransferPrintable } from "./_components/stock-transfer-printable";

export const dynamic = "force-dynamic";

/**
 * 調撥單列印頁 — 不在 (workspace) group 底下，所以沒有 topbar / sidebar。
 * 預覽歸預覽、列印歸列印 — 不 auto window.print()，使用者自己點右上「列印 / 另存 PDF」。
 */
export default async function StockTransferPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  // 列印權限 = 詳情頁讀取權限（TRANSFER_VIEW），沒額外的「列印 only」權限
  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印調撥單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getTransferForPrint(id);
  if (!data) notFound();

  return <StockTransferPrintable data={data} />;
}
