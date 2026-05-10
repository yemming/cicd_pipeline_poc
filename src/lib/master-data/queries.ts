/**
 * Master-data 跨模組查詢 — server-only。
 *
 * 53 頁 WMS 共用的 dropdown / lookup 來源都收斂到這裡。
 * 不要在 page / action 裡直接打 supabase 查主檔 — 一律走這裡，
 * 之後接 NetSuite 同步、cache 策略、brand 切換才有單點可改。
 *
 * 規則：
 *   - 一律用 createClient（吃 RLS）— 但 RLS 是 user 維度，雙 brand 帳號會穿透；
 *     deployment 鎖死的 brand 由 (await getActiveScope()).brand_id 強制過濾，不仰賴 RLS。
 *   - 所有 list* / get* 都帶 .eq("brand_id", (await getActiveScope()).brand_id) — 冗餘但安全。
 *   - 預設只回 is_active = true（要含停用版另寫 *Including*）
 *   - 大型表（items / customer_vehicles）必帶 limit / search 條件，禁止 SELECT 全表
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  Customer,
  CustomerContact,
  CustomerVehicle,
  Department,
  DocumentNumberRule,
  Employee,
  InspectionFinding,
  InspectionRecord,
  Item,
  WarrantyClaim,
  WarrantyClaimLine,
  VehicleModel,
  Organization,
  ServiceAppointment,
  Supplier,
  Warehouse,
  WarehouseBin,
  WarehouseZone,
  WorkOrder,
} from "@/lib/parts/types";
import type { SupplierPricingRow } from "./supplier-pricing-form-types";
import type { ReplenishmentPolicyRow } from "./replenishment-policy-form-types";

import { getActiveScope } from "@/lib/scope/active-scope";
// ──────────────────────────────────────────────────────────
// 客戶
// ──────────────────────────────────────────────────────────

export async function listCustomers(opts?: {
  search?: string;
  type?: string;
  limit?: number;
  activeOnly?: boolean;
}): Promise<Customer[]> {
  const supabase = await createClient();
  let q = supabase
    .from("customers")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("name");
  // 預設只回啟用中，admin 列表頁傳 activeOnly: false 看全部
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  if (opts?.type) q = q.eq("type", opts.type);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,phone.ilike.%${s}%,tax_id.ilike.%${s}%`);
  }
  q = q.limit(opts?.limit ?? 50);
  const { data, error } = await q;
  if (error) throw new Error(`listCustomers: ${error.message}`);
  return data ?? [];
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCustomerById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 供應商
// ──────────────────────────────────────────────────────────

export async function listSuppliers(opts?: {
  search?: string;
  type?: string;
  activeOnly?: boolean;
}): Promise<Supplier[]> {
  const supabase = await createClient();
  let q = supabase
    .from("suppliers")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("code");
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  if (opts?.type) q = q.eq("type", opts.type);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,tax_id.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listSuppliers: ${error.message}`);
  return data ?? [];
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSupplierById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 料號 / 商品
// ──────────────────────────────────────────────────────────

export async function listItems(opts?: {
  search?: string;
  category?: string;
  controlType?: "serial" | "lot" | "qty";
  limit?: number;
}): Promise<Item[]> {
  const supabase = await createClient();
  let q = supabase
    .from("items")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.controlType) q = q.eq("control_type", opts.controlType);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`code.ilike.%${s}%,name.ilike.%${s}%,name_en.ilike.%${s}%`);
  }
  q = q.limit(opts?.limit ?? 50);
  const { data, error } = await q;
  if (error) throw new Error(`listItems: ${error.message}`);
  return data ?? [];
}

export async function getItemById(id: string): Promise<Item | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getItemById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 車輛車型
// ──────────────────────────────────────────────────────────

export async function listVehicleModels(opts?: {
  series?: string;
  search?: string;
}): Promise<VehicleModel[]> {
  const supabase = await createClient();
  let q = supabase
    .from("vehicle_models")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("series")
    .order("model_name");
  if (opts?.series) q = q.eq("series", opts.series);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`display_name.ilike.%${s}%,model_name.ilike.%${s}%,series.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listVehicleModels: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 組織 / 部門（樹狀）
// ──────────────────────────────────────────────────────────

export async function listOrganizations(opts?: { type?: string }): Promise<Organization[]> {
  const supabase = await createClient();
  let q = supabase
    .from("organizations")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("level")
    .order("code");
  if (opts?.type) q = q.eq("type", opts.type);
  const { data, error } = await q;
  if (error) throw new Error(`listOrganizations: ${error.message}`);
  return data ?? [];
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getOrganizationById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 倉儲（warehouse → zone → bin 三層）
// ──────────────────────────────────────────────────────────

export async function listWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`listWarehouses: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// Supplier × Item pricing（MRP 採購參數）
// ──────────────────────────────────────────────────────────

export async function listSupplierPricing(opts?: {
  supplierId?: string;
  itemId?: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<SupplierPricingRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("supplier_item_pricing")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("updated_at", { ascending: false });
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  if (opts?.supplierId) q = q.eq("supplier_id", opts.supplierId);
  if (opts?.itemId) q = q.eq("item_id", opts.itemId);
  q = q.limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw new Error(`listSupplierPricing: ${error.message}`);
  return (data ?? []) as unknown as SupplierPricingRow[];
}

export async function getSupplierPricingById(
  id: string,
): Promise<SupplierPricingRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_item_pricing")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSupplierPricingById: ${error.message}`);
  return data as unknown as SupplierPricingRow | null;
}

// ──────────────────────────────────────────────────────────
// Replenishment policies（補貨計畫設定）
// ──────────────────────────────────────────────────────────

export async function listReplenishmentPolicies(): Promise<ReplenishmentPolicyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("replenishment_policies")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("warehouse_id", { ascending: true, nullsFirst: true });
  if (error) throw new Error(`listReplenishmentPolicies: ${error.message}`);
  return (data ?? []) as unknown as ReplenishmentPolicyRow[];
}

export async function getReplenishmentPolicyById(
  id: string,
): Promise<ReplenishmentPolicyRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("replenishment_policies")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getReplenishmentPolicyById: ${error.message}`);
  return data as unknown as ReplenishmentPolicyRow | null;
}

export async function getActiveReplenishmentPolicy(
  warehouseId: string | null,
): Promise<ReplenishmentPolicyRow | null> {
  const supabase = await createClient();
  let q = supabase
    .from("replenishment_policies")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .limit(1);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  else q = q.is("warehouse_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`getActiveReplenishmentPolicy: ${error.message}`);
  return data as unknown as ReplenishmentPolicyRow | null;
}

export async function listWarehouseZones(warehouseId?: string): Promise<WarehouseZone[]> {
  const supabase = await createClient();
  let q = supabase
    .from("warehouse_zones")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q;
  if (error) throw new Error(`listWarehouseZones: ${error.message}`);
  return data ?? [];
}

export async function listWarehouseBins(opts?: {
  warehouseId?: string;
  zoneId?: string;
  search?: string;
}): Promise<WarehouseBin[]> {
  const supabase = await createClient();
  let q = supabase
    .from("warehouse_bins")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (opts?.warehouseId) q = q.eq("warehouse_id", opts.warehouseId);
  if (opts?.zoneId) q = q.eq("zone_id", opts.zoneId);
  if (opts?.search) q = q.ilike("code", `%${opts.search.trim()}%`);
  q = q.limit(200);
  const { data, error } = await q;
  if (error) throw new Error(`listWarehouseBins: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 帳務
// ──────────────────────────────────────────────────────────

export async function listAccounts(opts?: { l1Category?: string }): Promise<Account[]> {
  const supabase = await createClient();
  let q = supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("is_active", true)
    .eq("is_postable", true)
    .order("account_code");
  if (opts?.l1Category) q = q.eq("l1_category", opts.l1Category);
  const { data, error } = await q;
  if (error) throw new Error(`listAccounts: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 員工 / 部門
// ──────────────────────────────────────────────────────────

export async function listDepartments(opts?: {
  search?: string;
  activeOnly?: boolean;
}): Promise<Department[]> {
  const supabase = await createClient();
  let q = supabase
    .from("departments")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("code");
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listDepartments: ${error.message}`);
  return data ?? [];
}

export async function getDepartmentById(id: string): Promise<Department | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getDepartmentById: ${error.message}`);
  return data;
}

export async function listEmployees(opts?: {
  search?: string;
  deptId?: string;
  status?: "active" | "on_leave" | "terminated" | "retired";
  limit?: number;
}): Promise<Employee[]> {
  const supabase = await createClient();
  let q = supabase
    .from("employees")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("emp_code");
  if (opts?.deptId) q = q.eq("dept_id", opts.deptId);
  if (opts?.status) q = q.eq("employment_status", opts.status);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(
      `emp_code.ilike.%${s}%,name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`
    );
  }
  q = q.limit(opts?.limit ?? 100);
  const { data, error } = await q;
  if (error) throw new Error(`listEmployees: ${error.message}`);
  return data ?? [];
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getEmployeeById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 客戶車輛 / 聯絡人（Wave 1.3）
// ──────────────────────────────────────────────────────────

export async function listCustomerVehicles(opts?: {
  customerId?: string;
  search?: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<CustomerVehicle[]> {
  const supabase = await createClient();
  let q = supabase
    .from("customer_vehicles")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("updated_at", { ascending: false });
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(
      `license_plate.ilike.%${s}%,vin.ilike.%${s}%,engine_no.ilike.%${s}%`
    );
  }
  q = q.limit(opts?.limit ?? 100);
  const { data, error } = await q;
  if (error) throw new Error(`listCustomerVehicles: ${error.message}`);
  return data ?? [];
}

export async function getCustomerVehicleById(
  id: string,
): Promise<CustomerVehicle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_vehicles")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCustomerVehicleById: ${error.message}`);
  return data;
}

export async function listCustomerContacts(opts?: {
  customerId?: string;
  role?: string;
  activeOnly?: boolean;
}): Promise<CustomerContact[]> {
  const supabase = await createClient();
  let q = supabase
    .from("customer_contacts")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("role")
    .order("name");
  if (opts?.activeOnly !== false) q = q.eq("is_active", true);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.role) q = q.eq("role", opts.role);
  const { data, error } = await q;
  if (error) throw new Error(`listCustomerContacts: ${error.message}`);
  return data ?? [];
}

export async function getCustomerContactById(
  id: string,
): Promise<CustomerContact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_contacts")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCustomerContactById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// Service / 維修（Wave 2.0）
// ──────────────────────────────────────────────────────────

export async function listServiceAppointments(opts?: {
  status?: string;
  customerId?: string;
  vehicleId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<ServiceAppointment[]> {
  const supabase = await createClient();
  let q = supabase
    .from("service_appointments")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("scheduled_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.vehicleId) q = q.eq("vehicle_id", opts.vehicleId);
  if (opts?.fromDate) q = q.gte("scheduled_at", opts.fromDate);
  if (opts?.toDate) q = q.lte("scheduled_at", opts.toDate);
  q = q.limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw new Error(`listServiceAppointments: ${error.message}`);
  return data ?? [];
}

export async function getServiceAppointmentById(
  id: string,
): Promise<ServiceAppointment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_appointments")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getServiceAppointmentById: ${error.message}`);
  return data;
}

export async function listWorkOrders(opts?: {
  status?: string;
  customerId?: string;
  vehicleId?: string;
  limit?: number;
}): Promise<WorkOrder[]> {
  const supabase = await createClient();
  let q = supabase
    .from("work_orders")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("opened_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.vehicleId) q = q.eq("vehicle_id", opts.vehicleId);
  q = q.limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw new Error(`listWorkOrders: ${error.message}`);
  return data ?? [];
}

export async function getWorkOrderById(id: string): Promise<WorkOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_orders")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getWorkOrderById: ${error.message}`);
  return data;
}

export async function listInspectionRecords(opts?: {
  vehicleId?: string;
  workOrderId?: string;
  kind?: "PI" | "PDI";
  limit?: number;
}): Promise<InspectionRecord[]> {
  const supabase = await createClient();
  let q = supabase
    .from("inspection_records")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("inspected_at", { ascending: false });
  if (opts?.vehicleId) q = q.eq("vehicle_id", opts.vehicleId);
  if (opts?.workOrderId) q = q.eq("work_order_id", opts.workOrderId);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  q = q.limit(opts?.limit ?? 100);
  const { data, error } = await q;
  if (error) throw new Error(`listInspectionRecords: ${error.message}`);
  return data ?? [];
}

export async function getInspectionRecordById(
  id: string,
): Promise<InspectionRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inspection_records")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getInspectionRecordById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 保固索賠（Wave 2.x）
// ──────────────────────────────────────────────────────────

export async function listWarrantyClaims(opts?: {
  status?: string;
  claimType?: string;
  customerId?: string;
  roId?: string;
  limit?: number;
}): Promise<WarrantyClaim[]> {
  const supabase = await createClient();
  let q = supabase
    .from("warranty_claims")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("claim_date", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.claimType) q = q.eq("claim_type", opts.claimType);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.roId) q = q.eq("ro_id", opts.roId);
  q = q.limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw new Error(`listWarrantyClaims: ${error.message}`);
  return data ?? [];
}

export async function getWarrantyClaimById(
  id: string,
): Promise<WarrantyClaim | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warranty_claims")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getWarrantyClaimById: ${error.message}`);
  return data;
}

export async function listWarrantyClaimLines(
  claimId: string,
): Promise<WarrantyClaimLine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warranty_claim_lines")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("cl_id", claimId)
    .order("line_no");
  if (error) throw new Error(`listWarrantyClaimLines: ${error.message}`);
  return data ?? [];
}

export async function listInspectionFindings(
  inspectionId: string,
): Promise<InspectionFinding[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inspection_findings")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("inspection_id", inspectionId)
    .order("category")
    .order("item_label");
  if (error) throw new Error(`listInspectionFindings: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 單據編號規則
// ──────────────────────────────────────────────────────────

export async function listDocumentNumberRules(): Promise<DocumentNumberRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_number_rules")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("doc_type");
  if (error) throw new Error(`listDocumentNumberRules: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 分類（共用 lookup）— Wave 1 之後可能拆成具名表
// ──────────────────────────────────────────────────────────

export type Classification = {
  id: string;
  brand_id: string;
  type: string | null;
  code: string;
  name: string;
  is_active: boolean;
};

export async function listClassifications(type?: string): Promise<Classification[]> {
  const supabase = await createClient();
  let q = supabase
    .from("classifications")
    .select("id,brand_id,type,code,name,is_active")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("type")
    .order("code");
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) throw new Error(`listClassifications: ${error.message}`);
  return (data ?? []) as Classification[];
}
