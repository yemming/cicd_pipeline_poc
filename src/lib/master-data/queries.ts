/**
 * Master-data 跨模組查詢 — server-only。
 *
 * 53 頁 WMS 共用的 dropdown / lookup 來源都收斂到這裡。
 * 不要在 page / action 裡直接打 supabase 查主檔 — 一律走這裡，
 * 之後接 NetSuite 同步、cache 策略、brand 切換才有單點可改。
 *
 * 規則：
 *   - 一律用 createClient（吃 RLS）— 主檔 brand 隔離靠 user_has_brand()
 *   - 不顯式 .eq('brand_id') — RLS 自動過濾
 *   - 預設只回 is_active = true（要含停用版另寫 *Including*）
 *   - 大型表（items / customer_vehicles）必帶 limit / search 條件，禁止 SELECT 全表
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  Customer,
  Department,
  DocumentNumberRule,
  Employee,
  Item,
  MotorcycleModel,
  Organization,
  Supplier,
  Warehouse,
  WarehouseBin,
  WarehouseZone,
} from "@/lib/parts/types";

// ──────────────────────────────────────────────────────────
// 客戶
// ──────────────────────────────────────────────────────────

export async function listCustomers(opts?: {
  search?: string;
  type?: string;
  limit?: number;
}): Promise<Customer[]> {
  const supabase = await createClient();
  let q = supabase
    .from("customers")
    .select("*")
    .eq("is_active", true)
    .order("name");
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
}): Promise<Supplier[]> {
  const supabase = await createClient();
  let q = supabase.from("suppliers").select("*").eq("is_active", true).order("code");
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
  let q = supabase.from("items").select("*").eq("is_active", true).order("code");
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
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getItemById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 機車車型
// ──────────────────────────────────────────────────────────

export async function listMotorcycleModels(opts?: {
  series?: string;
  search?: string;
}): Promise<MotorcycleModel[]> {
  const supabase = await createClient();
  let q = supabase
    .from("motorcycle_models")
    .select("*")
    .eq("is_active", true)
    .order("series")
    .order("model_name");
  if (opts?.series) q = q.eq("series", opts.series);
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`display_name.ilike.%${s}%,model_name.ilike.%${s}%,series.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listMotorcycleModels: ${error.message}`);
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
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`listWarehouses: ${error.message}`);
  return data ?? [];
}

export async function listWarehouseZones(warehouseId?: string): Promise<WarehouseZone[]> {
  const supabase = await createClient();
  let q = supabase.from("warehouse_zones").select("*").eq("is_active", true).order("code");
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
  let q = supabase.from("warehouse_bins").select("*").eq("is_active", true).order("code");
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

export async function listAccounts(opts?: { acctType?: string }): Promise<Account[]> {
  const supabase = await createClient();
  let q = supabase.from("accounts").select("*").eq("is_inactive", false).order("acct_no");
  if (opts?.acctType) q = q.eq("acct_type", opts.acctType);
  const { data, error } = await q;
  if (error) throw new Error(`listAccounts: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 員工 / 部門
// ──────────────────────────────────────────────────────────

export async function listDepartments(opts?: { search?: string }): Promise<Department[]> {
  const supabase = await createClient();
  let q = supabase
    .from("departments")
    .select("*")
    .eq("is_active", true)
    .order("code");
  if (opts?.search) {
    const s = opts.search.trim();
    q = q.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listDepartments: ${error.message}`);
  return data ?? [];
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
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getEmployeeById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 單據編號規則
// ──────────────────────────────────────────────────────────

export async function listDocumentNumberRules(): Promise<DocumentNumberRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_number_rules")
    .select("*")
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
    .eq("is_active", true)
    .order("type")
    .order("code");
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) throw new Error(`listClassifications: ${error.message}`);
  return (data ?? []) as Classification[];
}
