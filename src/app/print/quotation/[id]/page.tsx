import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesQuoteForPrint } from "@/domain/sales-quote";

import { QuotationPrintable } from "./_components/quotation-printable";

export const dynamic = "force-dynamic";

/**
 * 賞車報價單列印頁 — 不在 (workspace) group 底下，所以沒有 topbar / sidebar。
 * 使用者看完預覽再自己點右上「列印 / 另存 PDF」（不 auto window.print）。
 */
export default async function QuotationPrintPage({
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
        沒有列印賞車報價單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getSalesQuoteForPrint(id);
  if (!data) notFound();

  return <QuotationPrintable data={data} />;
}
