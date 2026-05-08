import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listCustomers,
  listEmployees,
  listMotorcycleModels,
} from "@/lib/master-data/queries";
import { createVehicleAction } from "@/lib/master-data/vehicle-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { VehicleForm } from "../_components/vehicle-form";

export const dynamic = "force-dynamic";

export default async function NewVehiclePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立車輛的權限</p>
      </main>
    );
  }

  const [customers, models, technicians] = await Promise.all([
    listCustomers({ limit: 500 }),
    listMotorcycleModels(),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/vehicles" className="hover:text-[#172B4D]">
          客戶車輛
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增車輛</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增車輛</h1>
        <p className="text-[13px] text-[#6B778C]">
          車主與車型必選；其餘欄位非必填，可日後補完
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <VehicleForm
          mode="create"
          action={createVehicleAction}
          customers={customers}
          models={models}
          technicians={technicians}
        />
      </section>
    </main>
  );
}
