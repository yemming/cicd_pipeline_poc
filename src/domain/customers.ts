/**
 * 客戶主檔 helper — server-only。
 *
 * Admin 後台 /admin/master-data/customers 的 list / detail 走這支。
 * 既有的 lib/master-data/queries.ts → listCustomers / getCustomerById 是「跨 53 頁
 * dropdown 共用」的 thin lookup（回完整 Customer row、欄位給 form 用），
 * 本檔的 *ForAdmin / Detail 則是「Admin list / detail 專用、欄位精簡到 UI 需要的子集」。
 * 兩條線並存：lookup vs 後台列表。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  CustomerRow,
  CustomerFilters,
} from "@/app/(workspace)/admin/master-data/customers/_components/customers-board";
import type {
  DetailCustomer,
  ContactRow,
  VehicleRow,
  WorkOrderRow,
  ModelRef,
} from "@/app/(workspace)/admin/master-data/customers/[id]/_components/customer-detail-view";

export type CustomerAdminListResult = {
  rows: CustomerRow[];
  totalCount: number;
};

export async function listCustomersForAdmin(
  filters: CustomerFilters,
): Promise<CustomerAdminListResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("customers")
    .select(
      "id, code, name, type, tax_id, national_id, phone, email, address, is_active",
    )
    .eq("brand_id", brand);

  if (filters.type === "individual" || filters.type === "corporate") {
    q = q.eq("type", filters.type);
  }
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(
      `code.ilike.%${t}%,name.ilike.%${t}%,phone.ilike.%${t}%,tax_id.ilike.%${t}%,national_id.ilike.%${t}%,email.ilike.%${t}%`,
    );
  }

  const [listRes, totalRes] = await Promise.all([
    q.order("code").limit(500),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);

  if (listRes.error) throw new Error(`listCustomersForAdmin: ${listRes.error.message}`);

  return {
    rows: (listRes.data ?? []) as unknown as CustomerRow[],
    totalCount: totalRes.count ?? 0,
  };
}

export type CustomerDetailBundle = {
  customer: DetailCustomer;
  contacts: ContactRow[];
  vehicles: VehicleRow[];
  workOrders: WorkOrderRow[];
  models: ModelRef[];
};

export async function getCustomerDetail(
  id: string,
): Promise<CustomerDetailBundle | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select(
      "id, code, name, type, tax_id, national_id, phone, email, address, birthday, source_module, gl_receivable_coa_id, notes, is_active, created_at, updated_at, external_source, external_id",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (cErr || !customer) return null;

  const [contactsRes, vehiclesRes, workOrdersRes] = await Promise.all([
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
      .select(
        "id, ro_no, status, opened_at, closed_at, parts_amount, labor_amount, total_amount",
      )
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("opened_at", { ascending: false })
      .limit(100),
  ]);

  const contacts = (contactsRes.data ?? []) as unknown as ContactRow[];
  const vehicles = (vehiclesRes.data ?? []) as unknown as VehicleRow[];
  const workOrders = (workOrdersRes.data ?? []) as unknown as WorkOrderRow[];

  let models: ModelRef[] = [];
  const modelIds = Array.from(
    new Set(vehicles.map((v) => v.model_id).filter((x): x is string => Boolean(x))),
  );
  if (modelIds.length > 0) {
    const { data: mData } = await supabase
      .from("vehicle_models")
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
  };
}
