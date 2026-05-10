import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCustomerById,
  getCustomerVehicleById,
  listCustomers,
  listEmployees,
  listVehicleModels,
} from "@/lib/master-data/queries";
import { updateVehicleAction } from "@/lib/master-data/vehicle-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { VehicleForm } from "../_components/vehicle-form";

export const dynamic = "force-dynamic";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視車輛的權限</p>
      </main>
    );
  }

  const [vehicle, customers, models, technicians] = await Promise.all([
    getCustomerVehicleById(id),
    listCustomers({ limit: 500 }),
    listVehicleModels(),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  if (!vehicle) notFound();

  // 確保現任車主在 dropdown — listCustomers 預設只回 is_active；補上以防萬一
  const owner = await getCustomerById(vehicle.customer_id);
  if (owner && !customers.find((c) => c.id === owner.id)) {
    customers.unshift(owner);
  }

  const canEdit = await hasPermission(PERMISSIONS.VEHICLE_EDIT);
  const ownerName = owner?.name ?? "(未知車主)";
  const plate = vehicle.license_plate ?? vehicle.vin ?? vehicle.id.slice(0, 8);

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/vehicles" className="hover:text-[#172B4D]">
          客戶車輛
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">
          {plate} ・ {ownerName}
        </span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯車輛 ・ {plate}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於 {new Date(vehicle.created_at).toLocaleString("zh-TW")} ・
          最近更新 {new Date(vehicle.updated_at).toLocaleString("zh-TW")}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <VehicleForm
            mode="edit"
            action={updateVehicleAction}
            vehicle={vehicle}
            customers={customers}
            models={models}
            technicians={technicians}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}
