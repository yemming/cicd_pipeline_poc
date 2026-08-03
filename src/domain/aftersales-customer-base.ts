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
  AftersalesCustomerBaseKpi,
  AftersalesServiceStatus,
  AftersalesCustomerTraffic,
  AftersalesCustomerCrmRow,
  AftersalesCustomerCrmKpi,
  AftersalesCustomerCrmFilters,
} from "./aftersales-customer-base.constants";
import { isVipRow } from "./aftersales-customer-base.constants";
import { listComplaintsByCustomer, type ComplaintRow } from "./complaints";

export type { ComplaintRow } from "./complaints";

// Re-export 給既有 caller 用（page.tsx 過去從這支 import 這些 type）
export type {
  AftersalesCustomerCrmRow,
  AftersalesCustomerCrmKpi,
  AftersalesCustomerCrmFilters,
  AftersalesCustomerTraffic,
} from "./aftersales-customer-base.constants";

export type AftersalesCustomerBaseRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  phone: string | null;
  email: string | null;
  is_active: boolean;
  avatar_url: string | null;
  // 售後脈絡：
  primary_license_plate: string | null;
  primary_mileage: number | null;
  /** 主車輛的 model_id（列表頁車型篩選用） */
  primary_model_id: string | null;
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
    .select("id, code, name, type, phone, email, is_active, avatar_url, tax_id, national_id, address")
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
        "id, customer_id, license_plate, current_mileage, last_service_date, next_service_due_date, is_active, created_at, model_id",
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
    { license_plate: string | null; mileage: number | null; model_id: string | null }
  >();
  const vehicleCount = new Map<string, number>();
  const minNextDueByCustomer = new Map<string, string>();

  for (const v of (vehRes.data ?? []) as Array<{
    customer_id: string;
    license_plate: string | null;
    current_mileage: number | string | null;
    next_service_due_date: string | null;
    model_id: string | null;
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
        model_id: v.model_id,
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
      avatar_url: (c as { avatar_url?: string | null }).avatar_url ?? null,
      primary_license_plate: primary?.license_plate ?? null,
      primary_mileage: primary?.mileage ?? null,
      primary_model_id: primary?.model_id ?? null,
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
  // 車型篩選（按主車輛 model_id）
  const modelFilter = (filters as AftersalesCustomerBaseFilters & { model_id?: string }).model_id;
  if (modelFilter && modelFilter !== "all") {
    rows = rows.filter((r) => r.primary_model_id === modelFilter);
  }
  // license_plate 搜尋：再 filter 一次（避免改 OR 的複雜度）
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

/**
 * 人車檔案列表頁專用：在 `getAftersalesCustomerBaseListPageData` 之上補 KpiCard 列。
 * KPI 為「全集」級（不被 filter 影響） — 總客戶 / VIP / 本月進廠數 / 待回廠+流失。
 *
 * 本月進廠數需要額外一次 work_orders 撈（限本月開單），其他 KPI 從 rows derive。
 */
export async function getAftersalesCustomerBaseListPageDataWithKpi(
  filters: AftersalesCustomerBaseFilters,
): Promise<AftersalesCustomerBaseListResult & { kpi: AftersalesCustomerBaseKpi }> {
  const { rows, totalCount } = await getAftersalesCustomerBaseListPageData(
    filters,
  );

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  const { count: monthVisitCount } = await supabase
    .from("work_orders")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand)
    .gte("opened_at", monthStart);

  // VIP / at-risk / dormant 由 rows derive
  const vipCount = rows.filter((r) => isVipRow(r)).length;
  const atRiskDormant = rows.filter(
    (r) => r.service_status === "at_risk" || r.service_status === "dormant",
  ).length;

  const kpi: AftersalesCustomerBaseKpi = {
    total_customers: totalCount,
    vip_count: vipCount,
    this_month_visits: monthVisitCount ?? 0,
    at_risk_dormant: atRiskDormant,
  };

  return { rows, totalCount, kpi };
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
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  /** LINE ID（存於 metadata.line_id） */
  line_id: string | null;
  /** 請勿聯繫 / 已故標記，非 null 時擋自動電訪任務建立（缺口四） */
  contact_restriction: "do_not_contact" | "deceased" | null;
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
  /** 接待 SA 姓名（join employees via assigned_sa_user_id） */
  sa_name: string | null;
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

// ──────────────────────────────────────────────────────────────────────────
// 人車檔案（SA 接待視角）— /parts/aftersales/customers/[id]
// 在現有 detail bundle 之上補：
//   - repairOrders：repair_orders（接待視角的維修歷史，跟工單表 work_orders 並存）
//   - followups：followup_cases（透過 source_ro_id 反查到客戶名下的 RO）
//   - officialTags：customer_tags 字典（brand 級可選標籤，SA 端唯讀參考）
//   - pickupNotify：business_rules 取車通知範本（per brand）
// 不建任何新表；皆讀現有 schema。
// ──────────────────────────────────────────────────────────────────────────

export type AftersalesRepairOrderRow = {
  id: string;
  ro_code: string;
  status: string;
  issue_date: string;
  opened_at: string | null;
  closed_at: string | null;
  mileage_in: number | null;
  vehicle_id: string | null;
  estimated_subtotal: number | null;
  lines_total: number | null;
  /** 費用歸屬：customer（客付）/ vehicle_cost（整車成本，PD 工單）/ vendor / internal … */
  fee_allocation: string | null;
  /** 接待 SA 姓名（join employees via assigned_sa_user_id） */
  sa_name: string | null;
};

export type AftersalesFollowupCaseRow = {
  id: string;
  case_no: string;
  title: string;
  status: string;
  safety_level: string;
  estimated_fee: number;
  recovered_amount: number;
  next_contact_at: string | null;
  last_contacted_at: string | null;
  closed_at: string | null;
  source_ro_id: string | null;
  vehicle_license_plate: string | null;
  vehicle_model: string | null;
  created_at: string | null;
};

export type AftersalesOfficialTagRow = {
  id: string;
  label: string;
  code: string | null;
  color: string;
  emoji: string | null;
  description: string | null;
  sort_order: number;
};

export type AftersalesPickupNotifyTemplate = {
  has_template: boolean;
  default_channels: { line: boolean; sms: boolean; phone: boolean };
  line_template: string | null;
  sms_template: string | null;
  updated_at: string | null;
};

/** 待處理項目（vehicle_pending_items 精簡版，僅含 UI 需要的欄位） */
export type AftersalesCustomerPendingItem = {
  id: string;
  vehicle_id: string;
  item_desc: string;
  safety_level: "緊急" | "警示" | "建議";
  source: string;
  reject_count: number;
  reason: string | null;
  created_at: string;
};

/** 投訴記錄（complaints 精簡版） */
export type AftersalesCustomerComplaintRow = {
  id: string;
  complaint_type: string | null;
  description: string | null;
  status: string;
  result: string | null;
  repair_order_id: string | null;
  ro_code: string | null;
  /** F-3：關聯銷售訂單 ID */
  related_sales_order_id: string | null;
  /** join：關聯銷售訂單單號（若有關聯） */
  sales_order_no: string | null;
  created_at: string;
};

export type AftersalesCustomerFullBundle = AftersalesCustomerDetailBundle & {
  repairOrders: AftersalesRepairOrderRow[];
  followups: AftersalesFollowupCaseRow[];
  officialTags: AftersalesOfficialTagRow[];
  pickupNotify: AftersalesPickupNotifyTemplate;
  /** 人車檔案 A 級新增：終身價值 — 累計進廠 / 累計金額 / 平均客單 / 距上次進廠天數 */
  lifetime: AftersalesCustomerLifetime;
  /** 人車檔案 A 級新增：NPS 摘要（推薦者 / 中立 / 批評）— 不一定有資料 */
  npsSummary: AftersalesNpsSummary;
  /** 待處理項目（四來源：追加拒絕/暫緩/Quick Quote拒絕/SA手動） */
  pendingItems: AftersalesCustomerPendingItem[];
  /** 投訴歷史記錄 */
  complaints: AftersalesCustomerComplaintRow[];
};

/**
 * 統一 alias — 人車檔案 detail page 一律呼叫這支。
 * 內部 6 連撈：customer / vehicles / repair_orders / customer_tags / followup_cases / pickup_notify。
 * 既有的 work_orders / appointments / models 也一起回傳（reuse 既有 bundle，避免兩套 type 漂移）。
 */
export async function getCustomerById(
  id: string,
): Promise<AftersalesCustomerFullBundle | null> {
  const base = await getAftersalesCustomerDetail(id);
  if (!base) return null;

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [roRes, tagsRes, fcRes, pickupRes, complaintsRes] = await Promise.all([
    supabase
      .from("repair_orders")
      .select(
        "id, ro_code, status, issue_date, opened_at, closed_at, mileage_in, vehicle_id, estimated_subtotal, lines_total, fee_allocation, assigned_sa_user_id",
      )
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("issue_date", { ascending: false })
      .limit(50),
    supabase
      .from("customer_tags")
      .select("id, label, code, color, emoji, description, sort_order")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    // followup_cases 沒有 customer_id 欄位，透過該客戶名下的 RO 反查
    supabase
      .from("repair_orders")
      .select("id")
      .eq("brand_id", brand)
      .eq("customer_id", id),
    supabase
      .from("business_rules")
      .select("config, updated_at")
      .eq("brand_id", brand)
      .eq("rule_kind", "aftersales_pickup_notify_template")
      .maybeSingle(),
    // 投訴歷史（含 F-3 關聯銷售訂單）
    supabase
      .from("complaints")
      .select("id, complaint_type, description, status, result, repair_order_id, related_sales_order_id, created_at")
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // 撈 SA 姓名（從 repair_orders.assigned_sa_user_id join employees）
  const roRawData = (roRes.data ?? []) as Array<{
    id: string;
    ro_code: string;
    status: string;
    issue_date: string;
    opened_at: string | null;
    closed_at: string | null;
    mileage_in: number | null;
    vehicle_id: string | null;
    estimated_subtotal: number | null;
    lines_total: number | null;
    fee_allocation: string | null;
    assigned_sa_user_id: string | null;
  }>;
  const saUserIds = Array.from(
    new Set(roRawData.map((r) => r.assigned_sa_user_id).filter((x): x is string => Boolean(x))),
  );
  const saNameMap = new Map<string, string>();
  if (saUserIds.length > 0) {
    const { data: empData } = await supabase
      .from("employees")
      .select("user_id, name")
      .in("user_id", saUserIds);
    for (const e of (empData ?? []) as Array<{ user_id: string; name: string }>) {
      saNameMap.set(e.user_id, e.name);
    }
  }

  const repairOrders: AftersalesRepairOrderRow[] = roRawData.map((r) => ({
    id: r.id,
    ro_code: r.ro_code,
    status: r.status,
    issue_date: r.issue_date,
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    mileage_in: r.mileage_in,
    vehicle_id: r.vehicle_id,
    estimated_subtotal: r.estimated_subtotal,
    lines_total: r.lines_total,
    fee_allocation: r.fee_allocation,
    sa_name: r.assigned_sa_user_id ? (saNameMap.get(r.assigned_sa_user_id) ?? null) : null,
  }));

  const officialTags = (tagsRes.data ?? []) as AftersalesOfficialTagRow[];

  // 投訴歷史 — 補 ro_code（若有關聯 RO）+ sales_order_no（F-3 關聯銷售訂單）
  const complaintsRaw = (complaintsRes.data ?? []) as Array<{
    id: string;
    complaint_type: string | null;
    description: string | null;
    status: string;
    result: string | null;
    repair_order_id: string | null;
    related_sales_order_id: string | null;
    created_at: string;
  }>;
  // 用已撈的 repairOrders 建 ro_code map，避免額外 round-trip
  const roCodeMapForComplaints = new Map(repairOrders.map((r) => [r.id, r.ro_code]));

  // 補撈關聯銷售訂單單號（一次撈，避免 N+1）
  const soIdsForComplaints = Array.from(
    new Set(complaintsRaw.map((c) => c.related_sales_order_id).filter((x): x is string => Boolean(x))),
  );
  const soNoMapForComplaints = new Map<string, string>();
  if (soIdsForComplaints.length > 0) {
    const { data: soData } = await supabase
      .from("sales_orders")
      .select("id, order_no")
      .in("id", soIdsForComplaints)
      .eq("brand_id", brand);
    for (const so of (soData ?? []) as Array<{ id: string; order_no: string }>) {
      soNoMapForComplaints.set(so.id, so.order_no);
    }
  }

  const complaints: AftersalesCustomerComplaintRow[] = complaintsRaw.map((c) => ({
    id: c.id,
    complaint_type: c.complaint_type,
    description: c.description,
    status: c.status,
    result: c.result,
    repair_order_id: c.repair_order_id,
    ro_code: c.repair_order_id ? (roCodeMapForComplaints.get(c.repair_order_id) ?? null) : null,
    related_sales_order_id: c.related_sales_order_id,
    sales_order_no: c.related_sales_order_id ? (soNoMapForComplaints.get(c.related_sales_order_id) ?? null) : null,
    created_at: c.created_at,
  }));

  // 透過 RO ids 反查 followup_cases
  const roIds = ((fcRes.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  let followups: AftersalesFollowupCaseRow[] = [];
  if (roIds.length > 0) {
    const { data: fcData } = await supabase
      .from("followup_cases")
      .select(
        "id, case_no, title, status, safety_level, estimated_fee, recovered_amount, next_contact_at, last_contacted_at, closed_at, source_ro_id, vehicle_license_plate, vehicle_model, created_at",
      )
      .eq("brand_id", brand)
      .in("source_ro_id", roIds)
      .order("created_at", { ascending: false })
      .limit(30);
    followups = (fcData ?? []) as AftersalesFollowupCaseRow[];
  }

  // 撈待處理項目：從該客戶名下所有車輛取 vehicle_pending_items（status=pending）
  const vehicleIds = base.vehicles.map((v) => v.id);
  let pendingItems: AftersalesCustomerPendingItem[] = [];
  if (vehicleIds.length > 0) {
    const { data: piData } = await supabase
      .from("vehicle_pending_items")
      .select("id, vehicle_id, item_desc, status, reason, created_at, metadata")
      .eq("brand_id", brand)
      .in("vehicle_id", vehicleIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    pendingItems = ((piData ?? []) as Array<{
      id: string;
      vehicle_id: string;
      item_desc: string;
      status: string;
      reason: string | null;
      created_at: string;
      metadata: unknown;
    }>).map((p) => {
      const meta = (p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata))
        ? p.metadata as Record<string, unknown>
        : {};
      const rawLevel = typeof meta.safety_level === "string" ? meta.safety_level : "";
      const safetyLevel: "緊急" | "警示" | "建議" =
        rawLevel === "緊急" || rawLevel === "警示" ? rawLevel : "建議";
      return {
        id: p.id,
        vehicle_id: p.vehicle_id,
        item_desc: p.item_desc,
        safety_level: safetyLevel,
        source: typeof meta.source === "string" ? meta.source : "addon_decision",
        reject_count: typeof meta.reject_count === "number" ? meta.reject_count : 0,
        reason: p.reason,
        created_at: p.created_at,
      };
    });
  }

  // pickup notify template
  const pickupRow = pickupRes.data as
    | { config: unknown; updated_at: string | null }
    | null;
  const pickupConfig = (pickupRow?.config ?? {}) as {
    line_template?: string;
    sms_template?: string;
    default_channels?: { line?: boolean; sms?: boolean; phone?: boolean };
  };
  const pickupNotify: AftersalesPickupNotifyTemplate = {
    has_template: Boolean(pickupRow),
    default_channels: {
      line: pickupConfig.default_channels?.line ?? true,
      sms: pickupConfig.default_channels?.sms ?? false,
      phone: pickupConfig.default_channels?.phone ?? false,
    },
    line_template: pickupConfig.line_template ?? null,
    sms_template: pickupConfig.sms_template ?? null,
    updated_at: pickupRow?.updated_at ?? null,
  };

  // ── 人車檔案 A 級新增：lifetime + npsSummary ──
  // Lifetime 從 base.workOrders 直接算（不另發 round-trip）
  const wos = base.workOrders;
  const visitCount = wos.length;
  const totalAmount = wos.reduce(
    (s, w) => s + (w.total_amount == null ? 0 : Number(w.total_amount)),
    0,
  );
  const openedDates = wos
    .map((w) => w.opened_at)
    .filter((x): x is string => Boolean(x))
    .sort();
  const firstVisitAt = openedDates[0] ?? null;
  const lastVisitAt = openedDates[openedDates.length - 1] ?? null;
  const nowTs = Date.now();
  const daysSinceLastVisit = lastVisitAt
    ? Math.round((nowTs - new Date(lastVisitAt).getTime()) / 86400000)
    : null;
  const lifetime: AftersalesCustomerLifetime = {
    visit_count: visitCount,
    total_amount: totalAmount,
    first_visit_at: firstVisitAt,
    last_visit_at: lastVisitAt,
    avg_amount: visitCount > 0 ? totalAmount / visitCount : 0,
    days_since_last_visit: daysSinceLastVisit,
  };

  // NPS 摘要（限 customer_id）
  const { data: npsAggData } = await supabase
    .from("nps_responses")
    .select("score")
    .eq("brand_id", brand)
    .eq("customer_id", id);
  const npsScores = ((npsAggData ?? []) as Array<{ score: number }>).map(
    (n) => n.score,
  );
  const promoter = npsScores.filter((s) => s >= 9).length;
  const passive = npsScores.filter((s) => s >= 7 && s <= 8).length;
  const detractor = npsScores.filter((s) => s <= 6).length;
  const npsAvg =
    npsScores.length > 0
      ? Math.round(
          (npsScores.reduce((s, n) => s + n, 0) / npsScores.length) * 10,
        ) / 10
      : null;
  const latestScore = npsScores.length > 0 ? npsScores[0] : null;
  const npsSummary: AftersalesNpsSummary = {
    total: npsScores.length,
    avg: npsAvg,
    latest_score: latestScore,
    promoter,
    passive,
    detractor,
  };

  return {
    ...base,
    repairOrders,
    officialTags,
    followups,
    pickupNotify,
    lifetime,
    npsSummary,
    pendingItems,
    complaints,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 360° Profile bundle — 售後客戶基盤詳情頁專用
// 在 getAftersalesCustomerDetail 之上加：
//   - npsResponses（最近 30 筆 aftersales kind）
//   - callTasks（最近 30 筆 aftersales kind，涵蓋電訪歷史）
//   - warrantySubscriptions（從車輛 warranty_until / insurance_until / desmo 衍生）
//   - lifetime（visit_count / total_amount / first_visit / last_visit / avg_amount）
//   - npsSummary（avg / promoter / passive / detractor count）
// 不開新表；全用 join。
// ──────────────────────────────────────────────────────────────────────────

export type AftersalesNpsResponseRow = {
  id: string;
  score: number;
  category: string | null;
  comment: string | null;
  responded_at: string;
  kind: string;
};

export type AftersalesCallTaskRow = {
  id: string;
  kind: string;
  status: string;
  call_result: string | null;
  scheduled_at: string | null;
  last_attempt_at: string | null;
  attempt_count: number | null;
  notes: string | null;
  call_type: string | null;
  created_at: string;
};

export type AftersalesWarrantyEntry = {
  vehicle_id: string;
  license_plate: string | null;
  model_name: string | null;
  /** 'warranty' = 原廠保固、'insurance' = 強制險、'desmo' = Desmo 服務（到期） */
  kind: "warranty" | "insurance" | "desmo";
  expires_at: string | null;
  days_left: number | null;
  /** valid / due_soon (≤30d) / expiring (≤60d) / expired / unknown */
  status: "valid" | "due_soon" | "expiring" | "expired" | "unknown";
};

export type AftersalesCustomerLifetime = {
  visit_count: number;
  total_amount: number;
  first_visit_at: string | null;
  last_visit_at: string | null;
  avg_amount: number;
  /** 距上次進廠天數（null 表從未進廠） */
  days_since_last_visit: number | null;
};

export type AftersalesNpsSummary = {
  total: number;
  avg: number | null;
  /** 最近一筆（responded_at desc）的 score */
  latest_score: number | null;
  promoter: number;
  passive: number;
  detractor: number;
};

export type AftersalesCustomerProfileBundle = AftersalesCustomerDetailBundle & {
  npsResponses: AftersalesNpsResponseRow[];
  callTasks: AftersalesCallTaskRow[];
  warrantySubscriptions: AftersalesWarrantyEntry[];
  lifetime: AftersalesCustomerLifetime;
  npsSummary: AftersalesNpsSummary;
  complaints: ComplaintRow[];
};

function deriveWarrantyStatus(
  expires: string | null,
  now: number,
): { status: AftersalesWarrantyEntry["status"]; days_left: number | null } {
  if (!expires) return { status: "unknown", days_left: null };
  const ts = new Date(expires).getTime();
  const days = Math.round((ts - now) / 86400000);
  if (days < 0) return { status: "expired", days_left: days };
  if (days <= 30) return { status: "due_soon", days_left: days };
  if (days <= 60) return { status: "expiring", days_left: days };
  return { status: "valid", days_left: days };
}

export async function getAftersalesCustomerProfile(
  id: string,
): Promise<AftersalesCustomerProfileBundle | null> {
  const base = await getAftersalesCustomerDetail(id);
  if (!base) return null;

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [npsRes, callRes, complaints] = await Promise.all([
    supabase
      .from("nps_responses")
      .select("id, score, category, comment, responded_at, kind")
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("responded_at", { ascending: false })
      .limit(30),
    supabase
      .from("call_tasks")
      .select(
        "id, kind, status, call_result, scheduled_at, last_attempt_at, attempt_count, notes, call_type, created_at",
      )
      .eq("brand_id", brand)
      .eq("customer_id", id)
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(30),
    listComplaintsByCustomer(id),
  ]);

  const npsResponses = (npsRes.data ?? []) as AftersalesNpsResponseRow[];
  const callTasks = (callRes.data ?? []) as AftersalesCallTaskRow[];

  // Lifetime metrics from workOrders
  const wos = base.workOrders;
  const visitCount = wos.length;
  const totalAmount = wos.reduce(
    (s, w) => s + (w.total_amount == null ? 0 : Number(w.total_amount)),
    0,
  );
  const openedDates = wos
    .map((w) => w.opened_at)
    .filter((x): x is string => Boolean(x))
    .sort();
  const firstVisitAt = openedDates[0] ?? null;
  const lastVisitAt = openedDates[openedDates.length - 1] ?? null;
  const now = Date.now();
  const daysSinceLastVisit = lastVisitAt
    ? Math.round((now - new Date(lastVisitAt).getTime()) / 86400000)
    : null;
  const lifetime: AftersalesCustomerLifetime = {
    visit_count: visitCount,
    total_amount: totalAmount,
    first_visit_at: firstVisitAt,
    last_visit_at: lastVisitAt,
    avg_amount: visitCount > 0 ? totalAmount / visitCount : 0,
    days_since_last_visit: daysSinceLastVisit,
  };

  // NPS summary
  const promoter = npsResponses.filter((n) => n.score >= 9).length;
  const passive = npsResponses.filter((n) => n.score >= 7 && n.score <= 8).length;
  const detractor = npsResponses.filter((n) => n.score <= 6).length;
  const npsAvg =
    npsResponses.length > 0
      ? npsResponses.reduce((s, n) => s + n.score, 0) / npsResponses.length
      : null;
  const npsSummary: AftersalesNpsSummary = {
    total: npsResponses.length,
    avg: npsAvg,
    latest_score: npsResponses[0]?.score ?? null,
    promoter,
    passive,
    detractor,
  };

  // Warranty entries — 每車三條（warranty / insurance / desmo），只列有日期的
  const modelMap = new Map(base.models.map((m) => [m.id, m.display_name]));
  const warrantySubscriptions: AftersalesWarrantyEntry[] = [];
  for (const v of base.vehicles) {
    const modelName = v.model_id ? (modelMap.get(v.model_id) ?? null) : null;
    if (v.warranty_until) {
      const ds = deriveWarrantyStatus(v.warranty_until, now);
      warrantySubscriptions.push({
        vehicle_id: v.id,
        license_plate: v.license_plate,
        model_name: modelName,
        kind: "warranty",
        expires_at: v.warranty_until,
        ...ds,
      });
    }
    const ins = (v as unknown as { insurance_until?: string | null }).insurance_until ?? null;
    if (ins) {
      const ds = deriveWarrantyStatus(ins, now);
      warrantySubscriptions.push({
        vehicle_id: v.id,
        license_plate: v.license_plate,
        model_name: modelName,
        kind: "insurance",
        expires_at: ins,
        ...ds,
      });
    }
    if (v.next_service_due_date) {
      const ds = deriveWarrantyStatus(v.next_service_due_date, now);
      warrantySubscriptions.push({
        vehicle_id: v.id,
        license_plate: v.license_plate,
        model_name: modelName,
        kind: "desmo",
        expires_at: v.next_service_due_date,
        ...ds,
      });
    }
  }

  return {
    ...base,
    npsResponses,
    callTasks,
    warrantySubscriptions,
    lifetime,
    npsSummary,
    complaints,
  };
}

export async function getAftersalesCustomerDetail(
  id: string,
): Promise<AftersalesCustomerDetailBundle | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select(
      "id, code, name, type, tax_id, national_id, phone, email, address, birthday, source_module, notes, is_active, avatar_url, created_at, updated_at, metadata, contact_restriction",
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
        "id, ro_no, status, opened_at, closed_at, mileage_in, customer_complaint, work_summary, total_amount, assigned_sa_user_id",
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
  const appointments = (apptRes.data ?? []) as AftersalesAppointmentRow[];

  // work_orders 補 SA 姓名
  const woRawData = (woRes.data ?? []) as Array<{
    id: string;
    ro_no: string;
    status: string;
    opened_at: string | null;
    closed_at: string | null;
    mileage_in: number | null;
    customer_complaint: string | null;
    work_summary: string | null;
    total_amount: number | null;
    assigned_sa_user_id: string | null;
  }>;
  const woSaUserIds = Array.from(
    new Set(woRawData.map((w) => w.assigned_sa_user_id).filter((x): x is string => Boolean(x))),
  );
  const woSaNameMap = new Map<string, string>();
  if (woSaUserIds.length > 0) {
    const { data: empData } = await supabase
      .from("employees")
      .select("user_id, name")
      .in("user_id", woSaUserIds);
    for (const e of (empData ?? []) as Array<{ user_id: string; name: string }>) {
      woSaNameMap.set(e.user_id, e.name);
    }
  }
  const workOrders: AftersalesWorkOrderRow[] = woRawData.map((w) => ({
    id: w.id,
    ro_no: w.ro_no,
    status: w.status,
    opened_at: w.opened_at,
    closed_at: w.closed_at,
    mileage_in: w.mileage_in,
    customer_complaint: w.customer_complaint,
    work_summary: w.work_summary,
    total_amount: w.total_amount,
    sa_name: w.assigned_sa_user_id ? (woSaNameMap.get(w.assigned_sa_user_id) ?? null) : null,
  }));

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

  // 解析 line_id（存於 metadata.line_id）
  const custMeta = (customer as unknown as { metadata?: unknown }).metadata;
  const lineId: string | null =
    custMeta && typeof custMeta === "object" && !Array.isArray(custMeta) &&
    typeof (custMeta as Record<string, unknown>).line_id === "string"
      ? ((custMeta as Record<string, unknown>).line_id as string)
      : null;

  const customerWithLineId: AftersalesCustomerDetail = {
    ...(customer as unknown as Omit<AftersalesCustomerDetail, "line_id">),
    line_id: lineId,
  };

  return {
    customer: customerWithLineId,
    vehicles,
    workOrders,
    appointments,
    models,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// CRM Board view（v2 design pattern：KPI 列 + sidebar + quick filter + 卡片 list）
// 第四輪 BDN Batch 1 Step 1（CRM01B 售後客戶基盤）落地新增。
//
// Types 定義已搬到 aftersales-customer-base.constants.ts（client-safe）；
// 本檔只保留 server-side query 邏輯。
// ──────────────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const NINETY_DAYS_MS_NEW = 1000 * 60 * 60 * 24 * 90;
const SIXTY_DAYS_WARRANTY_MS = 1000 * 60 * 60 * 24 * 60;

function deriveTraffic(
  nextDue: string | null,
  desmoDue: string | null,
  createdAt: string,
  lastVisit: string | null,
  now: number,
): AftersalesCustomerTraffic {
  // 紅：任一到期日已過
  if (nextDue && new Date(nextDue).getTime() < now) return "red";
  if (desmoDue && new Date(desmoDue).getTime() < now) return "red";
  // 黃：30 天內到期
  if (nextDue) {
    const d = new Date(nextDue).getTime();
    if (d - now <= THIRTY_DAYS_MS) return "amber";
  }
  if (desmoDue) {
    const d = new Date(desmoDue).getTime();
    if (d - now <= THIRTY_DAYS_MS) return "amber";
  }
  // 新客戶（90 天內建檔且尚未進廠）也算綠（無風險）
  if (!lastVisit) {
    const created = new Date(createdAt).getTime();
    if (now - created <= NINETY_DAYS_MS_NEW) return "green";
  }
  return "green";
}

function deriveSourceBadge(
  sourceModule: string | null,
): { badge: "rs05" | "walk" | "sa"; label: string } {
  if (sourceModule === "sales") return { badge: "rs05", label: "RS05 同步" };
  if (sourceModule === "aftersales") return { badge: "walk", label: "自行進廠" };
  return { badge: "sa", label: "SA 自建" };
}

function daysFromNow(d: string | null, now: number): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - now) / 86400000);
}

export async function listAftersalesCustomersForCrmBoard(
  filters: AftersalesCustomerCrmFilters,
): Promise<{
  rows: AftersalesCustomerCrmRow[];
  kpi: AftersalesCustomerCrmKpi;
  totalCount: number;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("customers")
    .select(
      "id, code, name, type, phone, email, is_active, avatar_url, source_module, assigned_sa_user_id, created_at",
    )
    .eq("brand_id", brand);

  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`code.ilike.%${t}%,name.ilike.%${t}%,phone.ilike.%${t}%`);
  }

  const [listRes, totalRes] = await Promise.all([
    q.order("code").limit(500),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);
  if (listRes.error)
    throw new Error(`aftersales crm list: ${listRes.error.message}`);

  const customers = (listRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    type: "individual" | "corporate";
    phone: string | null;
    email: string | null;
    is_active: boolean;
    source_module: string | null;
    assigned_sa_user_id: string | null;
    created_at: string;
  }>;

  if (customers.length === 0) {
    return {
      rows: [],
      kpi: {
        total: totalRes.count ?? 0,
        overdue: 0,
        due_soon: 0,
        this_month_visits: 0,
        rs05_synced: 0,
        new_this_month: 0,
        dormant: 0,
        warranty_due_30d: 0,
        avg_nps: null,
        promoter_rate: null,
      },
      totalCount: totalRes.count ?? 0,
    };
  }

  const ids = customers.map((c) => c.id);
  const saIds = Array.from(
    new Set(
      customers
        .map((c) => c.assigned_sa_user_id)
        .filter((x): x is string => Boolean(x)),
    ),
  );

  const [vehRes, woRes, saRes] = await Promise.all([
    supabase
      .from("customer_vehicles")
      .select(
        "id, customer_id, license_plate, current_mileage, manufactured_year, model_id, next_service_due_date, desmo_service_due_date, warranty_until, is_active, created_at",
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
    saIds.length > 0
      ? supabase
          .from("employees")
          .select("user_id, name")
          .in("user_id", saIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; name: string }> }),
  ]);

  // SA name map
  const saNameByUserId = new Map<string, string>();
  for (const e of (saRes.data ?? []) as Array<{ user_id: string; name: string }>) {
    saNameByUserId.set(e.user_id, e.name);
  }

  // 主車輛 + 聚合
  const firstVehicleByCustomer = new Map<
    string,
    {
      license_plate: string | null;
      mileage: number | null;
      year: number | null;
      model_id: string | null;
      desmo_due: string | null;
      warranty_until: string | null;
    }
  >();
  const vehicleCount = new Map<string, number>();
  const minNextDueByCustomer = new Map<string, string>();
  const minDesmoByCustomer = new Map<string, string>();
  const modelIdSet = new Set<string>();

  for (const v of (vehRes.data ?? []) as Array<{
    customer_id: string;
    license_plate: string | null;
    current_mileage: number | string | null;
    manufactured_year: number | null;
    model_id: string | null;
    next_service_due_date: string | null;
    desmo_service_due_date: string | null;
    warranty_until: string | null;
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
        year: v.manufactured_year,
        model_id: v.model_id,
        desmo_due: v.desmo_service_due_date,
        warranty_until: v.warranty_until,
      });
    }
    if (v.next_service_due_date) {
      const prev = minNextDueByCustomer.get(v.customer_id);
      if (!prev || v.next_service_due_date < prev)
        minNextDueByCustomer.set(v.customer_id, v.next_service_due_date);
    }
    if (v.desmo_service_due_date) {
      const prev = minDesmoByCustomer.get(v.customer_id);
      if (!prev || v.desmo_service_due_date < prev)
        minDesmoByCustomer.set(v.customer_id, v.desmo_service_due_date);
    }
    if (v.model_id) modelIdSet.add(v.model_id);
  }

  // 工單聚合
  const visitCount = new Map<string, number>();
  const lastVisitByCustomer = new Map<
    string,
    { opened_at: string; ro_no: string }
  >();
  for (const w of (woRes.data ?? []) as Array<{
    customer_id: string;
    ro_no: string;
    opened_at: string;
  }>) {
    visitCount.set(w.customer_id, (visitCount.get(w.customer_id) ?? 0) + 1);
    if (!lastVisitByCustomer.has(w.customer_id))
      lastVisitByCustomer.set(w.customer_id, {
        opened_at: w.opened_at,
        ro_no: w.ro_no,
      });
  }

  // 撈 model 顯示名
  let modelNameById = new Map<string, string>();
  if (modelIdSet.size > 0) {
    const { data: mData } = await supabase
      .from("vehicle_models")
      .select("id, display_name")
      .in("id", Array.from(modelIdSet));
    modelNameById = new Map(
      ((mData ?? []) as Array<{ id: string; display_name: string }>).map(
        (m) => [m.id, m.display_name],
      ),
    );
  }

  const now = Date.now();
  const monthStart = new Date(
    new Date(now).getFullYear(),
    new Date(now).getMonth(),
    1,
  ).getTime();

  let rows: AftersalesCustomerCrmRow[] = customers.map((c) => {
    const primary = firstVehicleByCustomer.get(c.id) ?? null;
    const lastVisit = lastVisitByCustomer.get(c.id) ?? null;
    const nextDue = minNextDueByCustomer.get(c.id) ?? null;
    const desmoDue = minDesmoByCustomer.get(c.id) ?? null;
    const warranty = primary?.warranty_until ?? null;
    const traffic = deriveTraffic(
      nextDue,
      desmoDue,
      c.created_at,
      lastVisit?.opened_at ?? null,
      now,
    );
    const status = deriveServiceStatus(lastVisit?.opened_at ?? null, nextDue, now);
    const src = deriveSourceBadge(c.source_module);

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      phone: c.phone,
      email: c.email,
      is_active: c.is_active,
      avatar_url: (c as { avatar_url?: string | null }).avatar_url ?? null,
      primary_license_plate: primary?.license_plate ?? null,
      primary_mileage: primary?.mileage ?? null,
      vehicle_count: vehicleCount.get(c.id) ?? 0,
      visit_count: visitCount.get(c.id) ?? 0,
      last_visit_at: lastVisit?.opened_at ?? null,
      last_ro_no: lastVisit?.ro_no ?? null,
      next_due_date: nextDue,
      traffic,
      service_status: status,
      days_until_next_due: daysFromNow(nextDue, now),
      days_until_desmo: daysFromNow(desmoDue, now),
      desmo_due_date: desmoDue,
      warranty_until: warranty,
      warranty_days_left: daysFromNow(warranty, now),
      source_module: c.source_module,
      source_label: src.label,
      source_badge: src.badge,
      assigned_sa_name: c.assigned_sa_user_id
        ? (saNameByUserId.get(c.assigned_sa_user_id) ?? null)
        : null,
      primary_model_name: primary?.model_id
        ? (modelNameById.get(primary.model_id) ?? null)
        : null,
      primary_year: primary?.year ?? null,
    };
  });

  // ── 篩選 ──
  if (filters.q.trim()) {
    const t = filters.q.trim().toUpperCase();
    rows = rows.filter(
      (r) =>
        r.code.toUpperCase().includes(t) ||
        r.name.toUpperCase().includes(t) ||
        (r.phone ?? "").toUpperCase().includes(t) ||
        (r.primary_license_plate ?? "").toUpperCase().includes(t),
    );
  }
  if (filters.source !== "all") {
    rows = rows.filter((r) => r.source_badge === filters.source);
  }
  if (filters.status !== "all") {
    if (filters.status === "new") {
      // new = 沒進廠且建檔 90 天內
      rows = rows.filter(
        (r) =>
          !r.last_visit_at &&
          customers.find((c) => c.id === r.id) &&
          Date.now() -
            new Date(
              customers.find((c) => c.id === r.id)!.created_at,
            ).getTime() <=
            NINETY_DAYS_MS_NEW,
      );
    } else {
      rows = rows.filter((r) => r.service_status === filters.status);
    }
  }
  if (filters.quick !== "all") {
    rows = rows.filter((r) => {
      switch (filters.quick) {
        case "overdue":
          return r.traffic === "red";
        case "due_soon":
          return (
            r.days_until_next_due != null &&
            r.days_until_next_due >= 0 &&
            r.days_until_next_due <= 30
          );
        case "warranty_soon":
          return (
            r.warranty_days_left != null &&
            r.warranty_days_left >= 0 &&
            r.warranty_days_left <= 60
          );
        case "desmo_soon":
          return (
            r.days_until_desmo != null && r.days_until_desmo <= 30
          );
        case "high_spend":
          return r.visit_count >= 3; // demo 簡化
        case "rs05":
          return r.source_badge === "rs05";
        default:
          return true;
      }
    });
  }

  // ── KPI（基於全集 customers + work_orders，不被 client filter 影響）──
  const allDerived = customers.map((c) => {
    const lastVisit = lastVisitByCustomer.get(c.id) ?? null;
    const nextDue = minNextDueByCustomer.get(c.id) ?? null;
    const desmoDue = minDesmoByCustomer.get(c.id) ?? null;
    return {
      traffic: deriveTraffic(
        nextDue,
        desmoDue,
        c.created_at,
        lastVisit?.opened_at ?? null,
        now,
      ),
      next_due_days: daysFromNow(nextDue, now),
      desmo_days: daysFromNow(desmoDue, now),
      source_module: c.source_module,
      last_visit_at: lastVisit?.opened_at ?? null,
    };
  });

  const thisMonthVisits = (woRes.data ?? []).filter(
    (w) => new Date(w.opened_at).getTime() >= monthStart,
  ).length;

  const newThisMonth = customers.filter(
    (c) => new Date(c.created_at).getTime() >= monthStart,
  ).length;

  // dormant: 超過 180 天未進廠（或從未進廠且建檔 > 90 天）
  const SIX_MO = 180 * 86400000;
  const dormantCount = customers.reduce((acc, c) => {
    const lv = lastVisitByCustomer.get(c.id)?.opened_at ?? null;
    if (lv) {
      if (now - new Date(lv).getTime() > SIX_MO) return acc + 1;
      return acc;
    }
    if (now - new Date(c.created_at).getTime() > 90 * 86400000) return acc + 1;
    return acc;
  }, 0);

  // warranty 30 天內到期：用主車輛 warranty_until
  const warrantyDue30dCount = customers.reduce((acc, c) => {
    const primary = firstVehicleByCustomer.get(c.id);
    if (!primary?.warranty_until) return acc;
    const left = daysFromNow(primary.warranty_until, now);
    if (left != null && left >= 0 && left <= 30) return acc + 1;
    return acc;
  }, 0);

  // 平均 NPS（最近 90 天 aftersales kind，撈全 brand）
  const nintyDaysAgo = new Date(now - 90 * 86400000).toISOString();
  const { data: npsAggData } = await supabase
    .from("nps_responses")
    .select("score")
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .gte("responded_at", nintyDaysAgo);
  const npsScores = ((npsAggData ?? []) as Array<{ score: number }>).map((r) => r.score);
  const avgNps =
    npsScores.length > 0
      ? Math.round((npsScores.reduce((s, n) => s + n, 0) / npsScores.length) * 10) / 10
      : null;
  const promoterRate =
    npsScores.length > 0
      ? Math.round((npsScores.filter((s) => s >= 9).length / npsScores.length) * 100)
      : null;

  const kpi: AftersalesCustomerCrmKpi = {
    total: totalRes.count ?? 0,
    overdue: allDerived.filter((d) => d.traffic === "red").length,
    due_soon: allDerived.filter(
      (d) =>
        (d.next_due_days != null && d.next_due_days >= 0 && d.next_due_days <= 30) ||
        (d.desmo_days != null && d.desmo_days >= 0 && d.desmo_days <= 30),
    ).length,
    this_month_visits: thisMonthVisits,
    rs05_synced: allDerived.filter((d) => d.source_module === "sales").length,
    new_this_month: newThisMonth,
    dormant: dormantCount,
    warranty_due_30d: warrantyDue30dCount,
    avg_nps: avgNps,
    promoter_rate: promoterRate,
  };

  return { rows, kpi, totalCount: totalRes.count ?? 0 };
}

void SIXTY_DAYS_WARRANTY_MS; // 保留 const for future use（warranty banner 60d 規則）

/**
 * 撈當前品牌所有啟用中的車型（供列表頁篩選下拉使用）。
 * 集中在 domain helper，保持 UI 零直連 Supabase 的天條。
 */
export async function getActiveVehicleModels(): Promise<ModelRef[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("vehicle_models")
    .select("id, display_name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("display_name", { ascending: true });
  return (data ?? []) as ModelRef[];
}
