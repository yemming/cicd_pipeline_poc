/**
 * Domain Helper — 售後客戶基盤（/aftersales/crm/customer-base）
 *
 * 角色：服務廠師父 / 服務顧問視角的客戶清單。
 * 不同於 sales/crm/customer-base（銷售視角看名下車輛 / 線索池）；
 * 此頁強調：
 *   1. 累積入廠次數（work_orders count）
 *   2. 上次入廠日 / 上次工單號（max work_orders.opened_at）
 *   3. 下次預定保養（min customer_vehicles.next_service_due_date）
 *   4. 服務狀態（active_service / at_risk / dormant）— 給 CSI 主動追回廠
 *   5. 主車輛（最新一台）的車牌 / 里程
 *
 * 寫入走 src/lib/aftersales/customer-base-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  AftersalesCustomerBaseFilters,
  AftersalesServiceStatus,
} from "./aftersales-customer-base.constants";

export type AftersalesCustomerBaseRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  phone: string | null;
  email: string | null;
  is_active: boolean;
  // 售後脈絡：
  primary_license_plate: string | null;
  primary_mileage: number | null;
  vehicle_count: number;
  visit_count: number;
  last_visit_at: string | null;
  last_ro_no: string | null;
  next_due_date: string | null;
  service_status: AftersalesServiceStatus;
};

export type AftersalesCustomerBaseListResult = {
  rows: AftersalesCustomerBaseRow[];
  totalCount: number;
};

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;
const NINETY_DAYS_MS = 1000 * 60 * 60 * 24 * 90;
const SIXTY_DAYS_MS = 1000 * 60 * 60 * 24 * 60;

function deriveServiceStatus(
  lastVisit: string | null,
  nextDue: string | null,
  now: number,
): AftersalesServiceStatus {
  if (!lastVisit && !nextDue) return "unknown";
  if (nextDue) {
    const due = new Date(nextDue).getTime();
    const diff = due - now;
    // 已過期或在 60 天內過期 → at_risk
    if (diff <= SIXTY_DAYS_MS) return "at_risk";
    if (diff <= NINETY_DAYS_MS) return "active_service";
  }
  if (lastVisit) {
    const last = new Date(lastVisit).getTime();
    if (now - last > SIX_MONTHS_MS) return "dormant";
    return "active_service";
  }
  return "unknown";
}

export async function getAftersalesCustomerBaseListPageData(
  filters: AftersalesCustomerBaseFilters,
): Promise<AftersalesCustomerBaseListResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("customers")
    .select("id, code, name, type, phone, email, is_active, tax_id, national_id, address")
    .eq("brand_id", brand);

  if (filters.type === "individual" || filters.type === "corporate") {
    q = q.eq("type", filters.type);
  }
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(
      `code.ilike.%${t}%,name.ilike.%${t}%,phone.ilike.%${t}%,tax_id.ilike.%${t}%,national_id.ilike.%${t}%`,
    );
  }

  const [listRes, totalRes] = await Promise.all([
    q.order("code").limit(500),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);
  if (listRes.error) throw new Error(`aftersales customer-base list: ${listRes.error.message}`);

  const customers = (listRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    type: "individual" | "corporate";
    phone: string | null;
    email: string | null;
    is_active: boolean;
  }>;

  if (customers.length === 0) {
    return { rows: [], totalCount: totalRes.count ?? 0 };
  }

  const ids = customers.map((c) => c.id);

  // 售後資料分三批撈：車輛、工單、預約
  const [vehRes, woRes] = await Promise.all([
    supabase
      .from("customer_vehicles")
      .select(
        "id, customer_id, license_plate, current_mileage, last_service_date, next_service_due_date, is_active, created_at",
      )
      .eq("brand_id", brand)
      .in("customer_id", ids)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_orders")
      .select("customer_id, ro_no, opened_at")
      .eq("brand_id", brand)
      .in("customer_id", ids)
      .order("opened_at", { ascending: false }),
  ]);

  // 第一台車（最新 created_at）+ vehicle_count + min(next_service_due_date)
  const firstVehicleByCustomer = new Map<
    string,
    { license_plate: string | null; mileage: number | null }
  >();
  const vehicleCount = new Map<string, number>();
  const minNextDueByCustomer = new Map<string, string>();

  for (const v of (vehRes.data ?? []) as Array<{
    customer_id: string;
    license_plate: string | null;
    current_mileage: number | string | null;
    next_service_due_date: string | null;
  }>) {
    vehicleCount.set(v.customer_id, (vehicleCount.get(v.customer_id) ?? 0) + 1);
    if (!firstVehicleByCustomer.has(v.customer_id)) {
      firstVehicleByCustomer.set(v.customer_id, {
        license_plate: v.license_plate,
        mileage:
          v.current_mileage == null
            ? null
            : typeof v.current_mileage === "string"
              ? Number(v.current_mileage)
              : v.current_mileage,
      });
    }
    if (v.next_service_due_date) {
      const prev = minNextDueByCustomer.get(v.customer_id);
      if (!prev || v.next_service_due_date < prev) {
        minNextDueByCustomer.set(v.customer_id, v.next_service_due_date);
      }
    }
  }

  // work_orders 已 order DESC，第一筆就是 last visit
  const visitCount = new Map<string, number>();
  const lastVisitByCustomer = new Map<string, { opened_at: string; ro_no: string }>();
  for (const w of (woRes.data ?? []) as Array<{
    customer_id: string;
    ro_no: string;
    opened_at: string;
  }>) {
    visitCount.set(w.customer_id, (visitCount.get(w.customer_id) ?? 0) + 1);
    if (!lastVisitByCustomer.has(w.customer_id)) {
      lastVisitByCustomer.set(w.customer_id, { opened_at: w.opened_at, ro_no: w.ro_no });
    }
  }

  const now = Date.now();
  let rows: AftersalesCustomerBaseRow[] = customers.map((c) => {
    const primary = firstVehicleByCustomer.get(c.id);
    const lastVisit = lastVisitByCustomer.get(c.id);
    const nextDue = minNextDueByCustomer.get(c.id) ?? null;
    const lastVisitAt = lastVisit?.opened_at ?? null;
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      phone: c.phone,
      email: c.email,
      is_active: c.is_active,
      primary_license_plate: primary?.license_plate ?? null,
      primary_mileage: primary?.mileage ?? null,
      vehicle_count: vehicleCount.get(c.id) ?? 0,
      visit_count: visitCount.get(c.id) ?? 0,
      last_visit_at: lastVisitAt,
      last_ro_no: lastVisit?.ro_no ?? null,
      next_due_date: nextDue,
      service_status: deriveServiceStatus(lastVisitAt, nextDue, now),
    };
  });

  // 篩選服務狀態（DB 沒這個欄位，client filter）
  if (
    filters.service_status === "active_service" ||
    filters.service_status === "at_risk" ||
    filters.service_status === "dormant"
  ) {
    rows = rows.filter((r) => r.service_status === filters.service_status);
  }
  // licen_plate 搜尋：再 filter 一次（避免改 OR 的複雜度）
  if (filters.q.trim()) {
    const t = filters.q.trim().toUpperCase();
    // 已經有原欄位 OR；這裡把 license_plate 也納入比對
    const plateMatch = rows.filter(
      (r) => r.primary_license_plate && r.primary_license_plate.toUpperCase().includes(t),
    );
    if (plateMatch.length > 0) {
      const merged = new Map<string, AftersalesCustomerBaseRow>();
      for (const r of rows) merged.set(r.id, r);
      for (const r of plateMatch) merged.set(r.id, r);
      rows = Array.from(merged.values()).sort((a, b) => a.code.localeCompare(b.code));
    }
  }

  return { rows, totalCount: totalRes.count ?? 0 };
}

// ──────────────────────────────────────────────────────────────────────────
// Detail
// ──────────────────────────────────────────────────────────────────────────

export type AftersalesCustomerDetail = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  tax_id: string | null;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthday: string | null;
  source_module: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AftersalesCustomerVehicle = {
  id: string;
  license_plate: string | null;
  vin: string | null;
  color: string | null;
  manufactured_year: number | null;
  current_mileage: number | null;
  last_service_date: string | null;
  last_service_mileage: number | null;
  next_service_due_date: string | null;
  next_service_due_mileage: number | null;
  warranty_until: string | null;
  is_active: boolean;
  model_id: string | null;
};

export type AftersalesWorkOrderRow = {
  id: string;
  ro_no: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  mileage_in: number | null;
  customer_complaint: string | null;
  work_summary: string | null;
  total_amount: number | null;
};

export type AftersalesAppointmentRow = {
  id: string;
  appt_no: string;
  scheduled_at: string;
  service_type: string | null;
  status: string;
  notes: string | null;
};

export type ModelRef = { id: string; display_name: string };

export type AftersalesCustomerDetailBundle = {
  customer: AftersalesCustomerDetail;
  vehicles: AftersalesCustomerVehicle[];
  workOrders: AftersalesWorkOrderRow[];
  appointments: AftersalesAppointmentRow[];
  models: ModelRef[];
};

export async function getAftersalesCustomerDetail(
  id: string,
): Promise<AftersalesCustomerDetailBundle | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select(
      "id, code, name, type, tax_id, national_id, phone, email, address, birthday, source_module, notes, is_active, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (cErr || !customer) return null;

  const [vehiclesRes, woRes, apptRes] = await Promise.all([
    supabase
      .from("customer_vehicles")
      .select(
        "id, license_plate, vin, color, manufactured_year, current_mileage, last_service_date, last_service_mileage, next_service_due_date, next_service_due_mileage, warranty_until, is_active, model_id",
      )
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_orders")
      .select(
        "id, ro_no, status, opened_at, closed_at, mileage_in, customer_complaint, work_summary, total_amount",
      )
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("opened_at", { ascending: false })
      .limit(30),
    supabase
      .from("service_appointments")
      .select("id, appt_no, scheduled_at, service_type, status, notes")
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("scheduled_at", { ascending: false })
      .limit(20),
  ]);

  const vehicles = (vehiclesRes.data ?? []) as AftersalesCustomerVehicle[];
  const workOrders = (woRes.data ?? []) as AftersalesWorkOrderRow[];
  const appointments = (apptRes.data ?? []) as AftersalesAppointmentRow[];

  let models: ModelRef[] = [];
  const modelIds = Array.from(
    new Set(vehicles.map((v) => v.model_id).filter((x): x is string => Boolean(x))),
  );
  if (modelIds.length > 0) {
    const { data: mData } = await supabase
      .from("vehicle_models")
      .select("id, display_name")
      .in("id", modelIds);
    models = (mData ?? []) as ModelRef[];
  }

  return {
    customer: customer as unknown as AftersalesCustomerDetail,
    vehicles,
    workOrders,
    appointments,
    models,
  };
}
