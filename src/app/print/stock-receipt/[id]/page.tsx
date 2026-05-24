import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getReceiptForPrint } from "@/domain/receipts";

import { StockReceiptPrintable } from "./_components/stock-receipt-printable";

export const dynamic = "force-dynamic";

/**
 * 進貨單列印頁 — 不在 (workspace) group 底下，所以沒有 topbar / sidebar。
 * 載入後使用者自己點右上「列印 / 另存 PDF」。
 */
export default async function StockReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  // 列印權限 = 詳情頁讀取權限（RECEIPT_VIEW）
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印進貨單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getReceiptForPrint(id);
  if (!data) notFound();

  return <StockReceiptPrintable data={data} />;
}
