import { notFound } from "next/navigation";
import {
  getNewCarById,
  getVehicleModelOptions,
  getOrganizationOptions,
  getCurrentBrandId,
} from "@/domain/new-car-inventory";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import NewCarDetailView from "./_components/new-car-detail-view";

export const metadata = {
  title: "車輛詳情 | DealerOS",
};

export default async function NewCarDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [car, vehicleModels, organizations, brandId, canDemoEdit, canDemoRetire] = await Promise.all([
    getNewCarById(id),
    getVehicleModelOptions(),
    getOrganizationOptions(),
    getCurrentBrandId(),
    hasPermission(PERMISSIONS.SALES_CAR_DEMO_EDIT),
    hasPermission(PERMISSIONS.SALES_CAR_DEMO_RETIRE),
  ]);

  if (!car) notFound();

  return (
    <NewCarDetailView
      car={car}
      vehicleModels={vehicleModels}
      organizations={organizations}
      brandId={brandId}
      canEdit={true}
      canDemoEdit={canDemoEdit}
      canDemoRetire={canDemoRetire}
      initialMode="view"
    />
  );
}
