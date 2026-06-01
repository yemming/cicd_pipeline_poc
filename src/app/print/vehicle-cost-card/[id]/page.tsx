import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getVehicleCostCardForPrint } from "@/domain/import-cost-cards";

import { VehicleCostCardPrintable } from "./_components/vehicle-cost-card-printable";

export const dynamic = "force-dynamic";

export default async function VehicleCostCardPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印車輛成本卡的權限
      </main>
    );
  }
  const { id } = await params;
  const data = await getVehicleCostCardForPrint(id);
  if (!data) notFound();
  return <VehicleCostCardPrintable data={data} />;
}
