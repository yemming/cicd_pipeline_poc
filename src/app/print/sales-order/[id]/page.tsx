import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesOrderForPrint } from "@/domain/sales-orders";

import { SalesOrderPrintable } from "./_components/sales-order-printable";

export const dynamic = "force-dynamic";

/**
 * 銷售訂單列印頁 — 不在 (workspace) group 底下，沒有 topbar / sidebar。
 * 載入後使用者自己點右上「列印 / 另存 PDF」（不 auto window.print()）。
 */
export default async function SalesOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  // 列印權限 = 詳情頁讀取權限（SALES_ORDER_VIEW），沒額外的「列印 only」權限
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印銷售訂單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getSalesOrderForPrint(id);
  if (!data) notFound();

  return <SalesOrderPrintable data={data} />;
}
