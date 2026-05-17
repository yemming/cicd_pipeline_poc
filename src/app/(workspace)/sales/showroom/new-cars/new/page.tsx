import {
  getVehicleModelOptions,
  getOrganizationOptions,
  getCurrentBrandId,
} from "@/domain/new-car-inventory";
import NewCarDetailView from "../[id]/_components/new-car-detail-view";

export const metadata = {
  title: "新增車輛 | DealerOS",
};

export default async function NewCarNewPage() {
  const [vehicleModels, organizations, brandId] = await Promise.all([
    getVehicleModelOptions(),
    getOrganizationOptions(),
    getCurrentBrandId(),
  ]);

  return (
    <NewCarDetailView
      car={null}
      vehicleModels={vehicleModels}
      organizations={organizations}
      brandId={brandId}
      canEdit={true}
      initialMode="create"
    />
  );
}
