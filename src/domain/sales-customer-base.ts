/**
 * Domain Helper — 銷售客戶基盤（/sales/crm/customer-base）
 *
 * 角色：銷售團隊看自己負責的客戶名單、聯絡狀態、車輛擁有、最近互動。
 * 不同於 admin/master-data/customers（純主檔維護視角）：此頁強調
 *   1. 客戶分類 chip（個人/公司）+ 啟用狀態
 *   2. 名下車輛數（vehicle_count）給銷售一眼看出大客戶
 *   3. 聯絡人數（contact_count）— 公司戶很重要
 *   4. 建立來源（source_module）— 知道 leads 從哪來
 *
 * 寫入走 src/lib/sales/customer-base-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

// Re-export client-safe types & constants（HABC / FollowUp / CRM row / filters / KPI / list row）
// 真正定義在 sales-customer-base.constants.ts，client board 直接 import constants 檔。
export {
  HABC_GRADES,
  HABC_LABEL,
  HABC_SUB,
  FOLLOW_UP_LABEL,
} from "./sales-customer-base.constants";
export type {
  HabcGrade,
  FollowUpStatus,
  SalesCustomerCrmRow,
  SalesCustomerCrmKpi,
  SalesCustomerCrmFilters,
  CustomerBaseFilters,
  CustomerBaseRow,
} from "./sales-customer-base.constants";

import type {
  HabcGrade,
  FollowUpStatus,
  SalesCustomerCrmRow,
  SalesCustomerCrmKpi,
  SalesCustomerCrmFilters,
  CustomerBaseFilters,
  CustomerBaseRow,
} from "./sales-customer-base.constants";

export type CustomerBaseListResult = {
  rows: CustomerBaseRow[];
  totalCount: number;
};

export async function getCustomerBaseListPageData(
  filters: CustomerBaseFilters,
): Promise<CustomerBaseListResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("customers")
    .select(
      "id, code, name, type, tax_id, phone, email, address, source_module, is_active, created_at",
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

  if (listRes.error) throw new Error(`customer-base list: ${listRes.error.message}`);

  const customers = (listRes.data ?? []) as Array<
    Omit<CustomerBaseRow, "vehicle_count" | "contact_count">
  >;
  const ids = customers.map((c) => c.id);
  const vehicleCountById = new Map<string, number>();
  const contactCountById = new Map<string, number>();

  if (ids.length > 0) {
    const [vehRes, conRes] = await Promise.all([
      supabase
        .from("customer_vehicles")
        .select("customer_id")
        .eq("brand_id", brand)
        .in("customer_id", ids)
        .eq("is_active", true),
      supabase
        .from("customer_contacts")
        .select("customer_id")
        .eq("brand_id", brand)
        .in("customer_id", ids)
        .eq("is_active", true),
    ]);
    for (const r of (vehRes.data ?? []) as Array<{ customer_id: string }>) {
      vehicleCountById.set(r.customer_id, (vehicleCountById.get(r.customer_id) ?? 0) + 1);
    }
    for (const r of (conRes.data ?? []) as Array<{ customer_id: string }>) {
      contactCountById.set(r.customer_id, (contactCountById.get(r.customer_id) ?? 0) + 1);
    }
  }

  const rows: CustomerBaseRow[] = customers.map((c) => ({
    ...c,
    vehicle_count: vehicleCountById.get(c.id) ?? 0,
    contact_count: contactCountById.get(c.id) ?? 0,
  }));

  return { rows, totalCount: totalRes.count ?? 0 };
}

// ──────────────────────────────────────────────────────────────────────────
// Detail
// ──────────────────────────────────────────────────────────────────────────

export type CustomerBaseDetail = {
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

export type CustomerBaseContact = {
  id: string;
  name: string;
  role: string;
  relation: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

export type CustomerBaseVehicle = {
  id: string;
  license_plate: string | null;
  vin: string | null;
  color: string | null;
  current_mileage: number | null;
  last_service_date: string | null;
  next_service_due_date: string | null;
  warranty_until: string | null;
  is_active: boolean;
  model_id: string | null;
};

export type ModelRef = { id: string; display_name: string };

export type CustomerBaseDetailBundle = {
  customer: CustomerBaseDetail;
  contacts: CustomerBaseContact[];
  vehicles: CustomerBaseVehicle[];
  models: ModelRef[];
};

// ──────────────────────────────────────────────────────────────────────────
// CRM Board view（v2 design pattern：HABC 5 KPI + sidebar + quick filter + 卡片 list + Kanban 拖曳）
// 第四輪 BDN Batch 1 Step 2（CRM01A 銷售客戶基盤 v2）落地新增，與 CRM01B 對稱。
//
// Types & 常數定義已搬到 sales-customer-base.constants.ts（client-safe）。
// 本檔只負責 server-side query。
// ──────────────────────────────────────────────────────────────────────────

function deriveFollowUpStatus(
  nextDate: string | null,
  storedStatus: string | null,
  now: number,
): FollowUpStatus {
  if (storedStatus === "urgent" || storedStatus === "today" || storedStatus === "ok" || storedStatus === "none") {
    // 用 cache 值；下面再用 nextDate 重算覆蓋（cache 可能 stale）
    if (!nextDate) return storedStatus as FollowUpStatus;
  }
  if (!nextDate) return "none";
  const d = new Date(nextDate).getTime();
  if (d < now - 86_400_000) return "urgent";
  if (d <= now + 86_400_000) return "today";
  return "ok";
}

function daysFromNow(d: string | null, now: number): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - now) / 86_400_000);
}

export async function listSalesCustomersForCrmBoard(
  filters: SalesCustomerCrmFilters,
): Promise<{
  rows: SalesCustomerCrmRow[];
  kpi: SalesCustomerCrmKpi;
  totalCount: number;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("customers")
    .select(
      "id, code, name, type, phone, email, address, is_active, source_module, created_at, habc_grade, follow_up_status, next_follow_up_date",
    )
    .eq("brand_id", brand);

  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(
      `code.ilike.%${t}%,name.ilike.%${t}%,phone.ilike.%${t}%,email.ilike.%${t}%`,
    );
  }

  const [listRes, totalRes] = await Promise.all([
    q.order("code").limit(500),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);
  if (listRes.error)
    throw new Error(`sales-customer-base crm list: ${listRes.error.message}`);

  const customers = (listRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    type: "individual" | "corporate";
    phone: string | null;
    email: string | null;
    address: string | null;
    is_active: boolean;
    source_module: string | null;
    created_at: string;
    habc_grade: string | null;
    follow_up_status: string | null;
    next_follow_up_date: string | null;
  }>;

  // 撈 vehicle / contact count
  const ids = customers.map((c) => c.id);
  const vehicleCountById = new Map<string, number>();
  const contactCountById = new Map<string, number>();
  if (ids.length > 0) {
    const [vehRes, conRes] = await Promise.all([
      supabase
        .from("customer_vehicles")
        .select("customer_id")
        .eq("brand_id", brand)
        .in("customer_id", ids)
        .eq("is_active", true),
      supabase
        .from("customer_contacts")
        .select("customer_id")
        .eq("brand_id", brand)
        .in("customer_id", ids)
        .eq("is_active", true),
    ]);
    for (const r of (vehRes.data ?? []) as Array<{ customer_id: string }>) {
      vehicleCountById.set(r.customer_id, (vehicleCountById.get(r.customer_id) ?? 0) + 1);
    }
    for (const r of (conRes.data ?? []) as Array<{ customer_id: string }>) {
      contactCountById.set(r.customer_id, (contactCountById.get(r.customer_id) ?? 0) + 1);
    }
  }

  const now = Date.now();
  let rows: SalesCustomerCrmRow[] = customers.map((c) => {
    const followStatus = deriveFollowUpStatus(c.next_follow_up_date, c.follow_up_status, now);
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      phone: c.phone,
      email: c.email,
      address: c.address,
      is_active: c.is_active,
      source_module: c.source_module,
      created_at: c.created_at,
      habc_grade:
        c.habc_grade === "H" || c.habc_grade === "A" || c.habc_grade === "B" || c.habc_grade === "C"
          ? (c.habc_grade as HabcGrade)
          : null,
      follow_up_status: followStatus,
      next_follow_up_date: c.next_follow_up_date,
      days_until_next_follow_up: daysFromNow(c.next_follow_up_date, now),
      vehicle_count: vehicleCountById.get(c.id) ?? 0,
      contact_count: contactCountById.get(c.id) ?? 0,
    };
  });

  // ── KPI（全資料集，不受 filter 影響的部分要先算好；本月新增也要） ──
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();

  const kpi: SalesCustomerCrmKpi = {
    total: rows.length,
    h: rows.filter((r) => r.habc_grade === "H").length,
    a: rows.filter((r) => r.habc_grade === "A").length,
    b: rows.filter((r) => r.habc_grade === "B").length,
    c: rows.filter((r) => r.habc_grade === "C").length,
    unclassified: rows.filter((r) => r.habc_grade === null).length,
    this_month_new: rows.filter((r) => new Date(r.created_at).getTime() >= monthStartMs).length,
    urgent: rows.filter((r) => r.follow_up_status === "urgent").length,
    today: rows.filter((r) => r.follow_up_status === "today").length,
  };

  // ── 套 quick filter（client-side） ──
  if (filters.quick === "H" || filters.quick === "A" || filters.quick === "B" || filters.quick === "C") {
    rows = rows.filter((r) => r.habc_grade === filters.quick);
  } else if (filters.quick === "unclassified") {
    rows = rows.filter((r) => r.habc_grade === null);
  } else if (filters.quick === "urgent") {
    rows = rows.filter((r) => r.follow_up_status === "urgent");
  } else if (filters.quick === "today") {
    rows = rows.filter((r) => r.follow_up_status === "today");
  } else if (filters.quick === "new") {
    rows = rows.filter((r) => new Date(r.created_at).getTime() >= monthStartMs);
  }

  if (
    filters.follow_status === "urgent" ||
    filters.follow_status === "today" ||
    filters.follow_status === "ok" ||
    filters.follow_status === "none"
  ) {
    rows = rows.filter((r) => r.follow_up_status === filters.follow_status);
  }

  return { rows, kpi, totalCount: totalRes.count ?? 0 };
}

export async function getCustomerBaseDetail(
  id: string,
): Promise<CustomerBaseDetailBundle | null> {
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

  const [contactsRes, vehiclesRes] = await Promise.all([
    supabase
      .from("customer_contacts")
      .select("id, name, role, relation, phone, email, is_active")
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("created_at"),
    supabase
      .from("customer_vehicles")
      .select(
        "id, license_plate, vin, color, current_mileage, last_service_date, next_service_due_date, warranty_until, is_active, model_id",
      )
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const contacts = (contactsRes.data ?? []) as CustomerBaseContact[];
  const vehicles = (vehiclesRes.data ?? []) as CustomerBaseVehicle[];

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
    customer: customer as unknown as CustomerBaseDetail,
    contacts,
    vehicles,
    models,
  };
}
