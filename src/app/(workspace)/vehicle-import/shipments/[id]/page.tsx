import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getLandedCostWorkbench } from "@/domain/import-shipments";

import { ShipmentWorkbench } from "./_components/shipment-workbench";

export const dynamic = "force-dynamic";

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">進口採購管理僅限管理者使用</p>
      </main>
    );
  }
  const { id } = await params;
  const wb = await getLandedCostWorkbench(id);
  if (!wb) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">找不到批次 {id}</p>
      </main>
    );
  }
  return <ShipmentWorkbench wb={wb} />;
}
