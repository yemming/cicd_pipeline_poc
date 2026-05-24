import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPurchaseOrderForPrint } from "@/domain/orders";

import { PurchaseOrderPrintable } from "./_components/purchase-order-printable";

export const dynamic = "force-dynamic";

/**
 * 採購單列印頁 — 不在 (workspace) group 底下，所以沒有 topbar / sidebar。
 * 載入後 client component useEffect 自動 window.print()，使用者可選實體印表機或另存 PDF。
 */
export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  // 列印權限 = 詳情頁讀取權限（PO_VIEW），沒額外的「列印 only」權限
  if (!(await hasPermission(PERMISSIONS.PO_VIEW))) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印採購單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getPurchaseOrderForPrint(id);
  if (!data) notFound();

  return <PurchaseOrderPrintable data={data} />;
}
