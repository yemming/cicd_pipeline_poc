import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRepairOrderForPrint } from "@/domain/repair-orders";

import { RepairOrderPrintable } from "./_components/repair-order-printable";

export const dynamic = "force-dynamic";

/**
 * 維修工單列印頁 — 不在 (workspace) group 底下，沒有 topbar / sidebar。
 * 載入後使用者自行決定列印 / 另存 PDF（不 auto window.print()）。
 */
export default async function RepairOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印維修工單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getRepairOrderForPrint(id);
  if (!data) notFound();

  return <RepairOrderPrintable data={data} />;
}
