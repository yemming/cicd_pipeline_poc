import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getOrdersPageData } from "@/domain/orders";

import { OrdersBoard } from "./_components/orders-board";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit, kpis } = await getOrdersPageData({
    status: sp.status || undefined,
    q: sp.q || undefined,
  });

  return (
    <OrdersBoard
      rows={rows}
      canEdit={canEdit}
      kpis={kpis}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}
