import { notFound, redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  CustomerDetailView,
  type DetailCustomer,
  type ContactRow,
  type VehicleRow,
  type WorkOrderRow,
  type ModelRef,
  type AccountRef,
} from "./_components/customer-detail-view";

export const dynamic = "force-dynamic";

async function loadDetail(id: string) {
  const supabase = await createClient();
  const brand = getBrandKey();

  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select(
      "id, code, name, type, tax_id, national_id, phone, email, address, birthday, source_module, gl_receivable_account_id, notes, is_active, created_at, updated_at, external_source, external_id",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (cErr || !customer) return null;

  const [contactsRes, vehiclesRes, workOrdersRes, accountsRes] = await Promise.all([
    supabase
      .from("customer_contacts")
      .select("id, name, role, relation, phone, email, is_active")
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("created_at"),
    supabase
      .from("customer_vehicles")
      .select(
        "id, license_plate, vin, engine_no, color, current_mileage, last_service_date, next_service_due_date, warranty_until, is_active, model_id",
      )
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_orders")
      .select("id, ro_no, status, opened_at, closed_at, parts_amount, labor_amount, total_amount")
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("opened_at", { ascending: false })
      .limit(100),
    supabase
      .from("accounts")
      .select("id, acct_code, acct_name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("acct_code"),
  ]);

  const contacts = (contactsRes.data ?? []) as unknown as ContactRow[];
  const vehicles = (vehiclesRes.data ?? []) as unknown as VehicleRow[];
  const workOrders = (workOrdersRes.data ?? []) as unknown as WorkOrderRow[];
  const accounts = (accountsRes.data ?? []) as unknown as AccountRef[];

  let models: ModelRef[] = [];
  const modelIds = Array.from(
    new Set(vehicles.map((v) => v.model_id).filter((x): x is string => Boolean(x))),
  );
  if (modelIds.length > 0) {
    const { data: mData } = await supabase
      .from("motorcycle_models")
      .select("id, display_name")
      .in("id", modelIds);
    models = (mData ?? []) as unknown as ModelRef[];
  }

  return {
    customer: customer as unknown as DetailCustomer,
    contacts,
    vehicles,
    workOrders,
    models,
    accounts,
  };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const data = await loadDetail(id);
  if (!data) notFound();

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);

  return <CustomerDetailView {...data} canEdit={canEdit} />;
}
