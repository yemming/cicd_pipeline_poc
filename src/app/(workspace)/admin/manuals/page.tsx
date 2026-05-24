import { listManuals, listVehicleModelOptions } from "@/domain/manuals";
import { ManualsBoard } from "./_components/manuals-board";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

export default async function AdminManualsPage() {
  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);

  if (!canEdit) {
    return (
      <main className="px-6 py-5">
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] p-4 rounded">
          沒有權限。需要 master.customer.edit。
        </div>
      </main>
    );
  }

  const [manuals, vehicleModels] = await Promise.all([
    listManuals(),
    listVehicleModelOptions(),
  ]);
  return <ManualsBoard manuals={manuals} vehicleModels={vehicleModels} />;
}
