"use server";

/**
 * Domain Helper — Sales Staff（RS 人員 / 業務部員工）
 *
 * 設計稿：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § Tab3
 * 路由：/sales/manager/staff
 * Proposal：docs/proposals/feature-rs-m3-staff-phase1.md
 *
 * 紀律：
 *  - 主表用 employees（與 aftersales-staff 共用）；不另建表
 *  - sales-only 屬性放 metadata.sales.{key}（aftersales root keys 不動）
 *  - 預設 filter 限定「業務部」（dept_code='SAL' / name 含「業務」「銷售」）
 *  - UI 永遠走本 helper，不直連 supabase
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { writeAuditLog } from "./audit-logs";

import {
  SALES_DEPT_CODES,
  SALES_DEPT_NAME_PATTERN,
  SALES_STAFF_PAGE_SIZE_DEFAULT,
  type SalesStaffMetadata,
  currentMonthRange,
  getResponsibleModels,
  writeResponsibleModels,
} from "./sales-staff.constants";

export type SalesStaffRow = {
  id: string;
  brand_id: string;
  emp_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  dept_id: string | null;
  dept_name: string | null;
  dept_code: string | null;
  position: string | null;
  user_id: string | null;
  is_active: boolean;
  responsible_models: string[];
  /** 接觸數（本月 sales_leads count by rs_name） */
  contacts_this_month: number;
  /** 成交數（本月 sales_leads where converted_customer_id is not null） */
  deals_this_month: number;
  /** 顯示用：metadata.system_account 或 email 取一 */
  account_display: string | null;
  metadata: SalesStaffMetadata;
  created_at: string | null;
  updated_at: string | null;
};

export type SalesDepartmentOption = {
  id: string;
  name: string;
  code: string | null;
};

export type SalesStaffFilters = {
  q?: string;
  status?: "all" | "active" | "inactive";
  /** 篩特定車系（只回 responsible_models 含此 series、或 responsible_models 為空=全車系 的人） */
  series?: string;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ────────────── helpers ────────────── */

function isSalesDept(d: { code: string | null; name: string }): boolean {
  if (d.code && (SALES_DEPT_CODES as readonly string[]).includes(d.code.toUpperCase())) {
    return true;
  }
  return SALES_DEPT_NAME_PATTERN.test(d.name);
}

function pickMetadata(meta: unknown): SalesStaffMetadata {
  if (!meta || typeof meta !== "object") return {};
  return meta as SalesStaffMetadata;
}

function rowFromDb(
  row: Record<string, unknown>,
  deptMap: Map<string, SalesDepartmentOption>,
  monthlyByName: Map<string, { contacts: number; deals: number }>,
): SalesStaffRow {
  const meta = pickMetadata(row.metadata);
  const dept = row.dept_id ? deptMap.get(row.dept_id as string) ?? null : null;
  const name = row.name as string;
  const monthly = monthlyByName.get(name) ?? { contacts: 0, deals: 0 };
  const responsible_models = getResponsibleModels(meta);
  const email = (row.email as string | null) ?? null;
  const systemAccount = (meta.system_account as string | null) ?? null;
  return {
    id: row.id as string,
    brand_id: row.brand_id as string,
    emp_code: row.emp_code as string,
    name,
    email,
    phone: (row.phone as string | null) ?? null,
    dept_id: (row.dept_id as string | null) ?? null,
    dept_name: dept?.name ?? null,
    dept_code: dept?.code ?? null,
    position: (row.position as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    is_active: Boolean(row.is_active ?? true),
    responsible_models,
    contacts_this_month: monthly.contacts,
    deals_this_month: monthly.deals,
    account_display: email ?? systemAccount,
    metadata: meta,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

/* ────────────── Read ────────────── */

/** 列出當前 brand 的業務部門（給 dept_id 解析用） */
export async function listSalesDepartments(): Promise<SalesDepartmentOption[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("brand_id", brand)
    .order("name");
  if (error) return [];
  return ((data ?? []) as Array<{ id: string; name: string; code: string | null }>)
    .filter(isSalesDept)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));
}

/**
 * 列出當前 brand 可用車系（distinct vehicle_models.series where is_active）
 * 給 filter / Modal multi-select 用。
 */
export async function listAvailableSeries(): Promise<string[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("series")
    .eq("brand_id", brand)
    .eq("is_active", true);
  if (error) return [];
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ series: string | null }>) {
    if (r.series) set.add(r.series);
  }
  return Array.from(set).sort();
}

/** 撈本月 sales_leads → 依 rs_name 聚合接觸數 / 成交數 */
async function fetchMonthlyMetricsByRsName(brand: string): Promise<
  Map<string, { contacts: number; deals: number }>
> {
  const supabase = await createClient();
  const { from, to } = currentMonthRange();
  // 一次撈本月該 brand 全部 leads，再 in-memory aggregate（量小、簡單）
  const { data, error } = await supabase
    .from("sales_dormant_leads")
    .select("rs_name, converted_customer_id, created_at")
    .eq("brand_id", brand)
    .gte("created_at", from)
    .lt("created_at", to);
  if (error) return new Map();

  const map = new Map<string, { contacts: number; deals: number }>();
  for (const r of (data ?? []) as Array<{
    rs_name: string | null;
    converted_customer_id: string | null;
  }>) {
    const key = (r.rs_name ?? "").trim();
    if (!key) continue;
    const slot = map.get(key) ?? { contacts: 0, deals: 0 };
    slot.contacts += 1;
    if (r.converted_customer_id) slot.deals += 1;
    map.set(key, slot);
  }
  return map;
}

/**
 * 列出 RS 人員。預設只回業務部員工。
 */
export async function listSalesStaff(
  filters: SalesStaffFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: SalesStaffRow[]; totalCount: number }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? SALES_STAFF_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const salesDepts = await listSalesDepartments();
  const salesDeptIds = new Set(salesDepts.map((d) => d.id));
  const deptMap = new Map(salesDepts.map((d) => [d.id, d]));

  if (salesDeptIds.size === 0) {
    return { rows: [], totalCount: 0 };
  }

  let q = supabase
    .from("employees")
    .select(
      "id, brand_id, emp_code, name, email, phone, dept_id, position, user_id, is_active, metadata, created_at, updated_at",
      { count: "exact" },
    )
    .eq("brand_id", brand)
    .in("dept_id", Array.from(salesDeptIds));

  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);

  if (filters.q?.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`name.ilike.%${t}%,emp_code.ilike.%${t}%,email.ilike.%${t}%,position.ilike.%${t}%`);
  }

  const { data, count, error } = await q
    .order("emp_code", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`listSalesStaff: ${error.message}`);

  const monthly = await fetchMonthlyMetricsByRsName(brand);
  let rows = (data ?? []).map((r) =>
    rowFromDb(r as Record<string, unknown>, deptMap, monthly),
  );

  // series filter 走 in-memory（responsible_models 在 jsonb 內、PostgREST 處理麻煩）
  if (filters.series && filters.series !== "all") {
    rows = rows.filter((r) => {
      // 「全車系」也算包含
      if (r.responsible_models.length === 0) return true;
      return r.responsible_models.includes(filters.series!);
    });
  }

  return { rows, totalCount: count ?? rows.length };
}

/* ────────────── Write ────────────── */

/**
 * 更新某 RS 的負責車系（multi-select）。
 * - models=[] 表示「全車系」（清空 responsible_models）
 * - 寫入前驗證每個 series 都在當前 brand 的 vehicle_models.series 集合內
 */
export async function updateResponsibleModelsAction(
  employeeId: string,
  models: string[],
): Promise<ActionResult<{ id: string }>> {
  if (!employeeId) return { ok: false, error: "缺少 employee id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 驗證 series 在當前 brand
  const available = await listAvailableSeries();
  const availableSet = new Set(available);
  const cleaned: string[] = [];
  for (const m of models) {
    const s = (m ?? "").trim();
    if (!s) continue;
    if (!availableSet.has(s)) {
      return { ok: false, error: `「${s}」不是當前品牌的車系` };
    }
    if (!cleaned.includes(s)) cleaned.push(s);
  }

  // 讀現有 metadata、merge
  const { data: cur, error: readErr } = await supabase
    .from("employees")
    .select("id, metadata")
    .eq("id", employeeId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr || !cur) {
    return { ok: false, error: readErr?.message ?? "找不到該員工" };
  }

  const nextMetadata = writeResponsibleModels(
    pickMetadata(cur.metadata),
    cleaned,
  );

  const { error: upErr } = await supabase
    .from("employees")
    .update({ metadata: nextMetadata })
    .eq("id", employeeId)
    .eq("brand_id", brand);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, data: { id: employeeId } };
}

/** 啟用 / 停用 RS */
export async function setSalesStaffActiveAction(
  employeeId: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  if (!employeeId) return { ok: false, error: "缺少 employee id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("employees")
    .update({ is_active: active })
    .eq("id", employeeId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: employeeId } };
}

/* ────────────── A-9 業務員離職批次轉移 ────────────── */

export type StaffTransferPreview = {
  from_name: string;
  to_name: string;
  open_orders: number;
  open_call_tasks: number;
  open_handcards: number;
};

async function resolveTransferNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brand: string,
  fromEmployeeId: string,
  toEmployeeId: string,
): Promise<{ fromName: string; toName: string } | null> {
  const { data: emps } = await supabase
    .from("employees")
    .select("id, name")
    .in("id", [fromEmployeeId, toEmployeeId])
    .eq("brand_id", brand);
  const fromName = (emps ?? []).find((e) => e.id === fromEmployeeId)?.name as string | undefined;
  const toName = (emps ?? []).find((e) => e.id === toEmployeeId)?.name as string | undefined;
  if (!fromName || !toName) return null;
  return { fromName, toName };
}

/** 預覽：離職業務員名下待轉移的訂單/任務/手卡各幾筆（批次轉移前先給主管看數量） */
export async function previewStaffTransfer(
  fromEmployeeId: string,
  toEmployeeId: string,
): Promise<ActionResult<StaffTransferPreview>> {
  if (!fromEmployeeId || !toEmployeeId) return { ok: false, error: "請選擇離職與接手人員" };
  if (fromEmployeeId === toEmployeeId) return { ok: false, error: "離職與接手人員不可相同" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const names = await resolveTransferNames(supabase, brand, fromEmployeeId, toEmployeeId);
  if (!names) return { ok: false, error: "找不到員工資料" };

  const [orderCount, taskCount, hcCount] = await Promise.all([
    supabase
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("rs_name", names.fromName)
      .not("status", "in", "(cancelled,fulfilled)")
      .then((r) => r.count ?? 0),
    supabase
      .from("call_tasks")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("assignee_id", fromEmployeeId)
      .in("status", ["pending", "in_progress"])
      .then((r) => r.count ?? 0),
    supabase
      .from("sales_handcards")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("assigned_rs_user_id", fromEmployeeId)
      .eq("status", "open")
      .then((r) => r.count ?? 0),
  ]);

  return {
    ok: true,
    data: {
      from_name: names.fromName,
      to_name: names.toName,
      open_orders: orderCount,
      open_call_tasks: taskCount,
      open_handcards: hcCount,
    },
  };
}

/**
 * 批次轉移：主管將離職業務員名下所有「未結案」訂單 + 未完成通話任務 + 未結案手卡
 * 一次全部轉給接手業務員。寫 audit_logs（含受影響的 record id 清單）。
 */
export async function transferDepartingStaffAction(
  fromEmployeeId: string,
  toEmployeeId: string,
  reason?: string,
): Promise<ActionResult<{ orders: number; call_tasks: number; handcards: number }>> {
  const canReassign = await hasPermission(PERMISSIONS.SALES_ORDER_REASSIGN);
  if (!canReassign) return { ok: false, error: "業務轉移需要主管權限" };

  if (!fromEmployeeId || !toEmployeeId) return { ok: false, error: "請選擇離職與接手人員" };
  if (fromEmployeeId === toEmployeeId) return { ok: false, error: "離職與接手人員不可相同" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const names = await resolveTransferNames(supabase, brand, fromEmployeeId, toEmployeeId);
  if (!names) return { ok: false, error: "找不到員工資料" };
  const { fromName, toName } = names;
  const nowIso = new Date().toISOString();

  // 1) sales_orders：未結案（非作廢/非交車完成）依 rs_name 轉移
  const { data: orderRows, error: orderErr } = await supabase
    .from("sales_orders")
    .update({
      rs_name: toName,
      reassigned_from: fromEmployeeId,
      reassigned_to: toEmployeeId,
      reassigned_at: nowIso,
      updated_by: user?.id ?? null,
    })
    .eq("brand_id", brand)
    .eq("rs_name", fromName)
    .not("status", "in", "(cancelled,fulfilled)")
    .select("id");
  if (orderErr) return { ok: false, error: `訂單轉移失敗：${orderErr.message}` };

  // 2) call_tasks：未完成的通話任務依 assignee_id 轉移
  const { data: taskRows, error: taskErr } = await supabase
    .from("call_tasks")
    .update({ assignee_id: toEmployeeId })
    .eq("brand_id", brand)
    .eq("assignee_id", fromEmployeeId)
    .in("status", ["pending", "in_progress"])
    .select("id, metadata");
  if (taskErr) return { ok: false, error: `任務轉移失敗：${taskErr.message}` };

  // metadata.rs_name 同步顯示（非阻塞、量小直接 await 即可）
  for (const t of taskRows ?? []) {
    const meta = (t.metadata as Record<string, unknown>) ?? {};
    await supabase
      .from("call_tasks")
      .update({ metadata: { ...meta, rs_name: toName, reassigned_by_manager_at: nowIso } })
      .eq("id", t.id);
  }

  // 3) sales_handcards：open 狀態依 assigned_rs_user_id 轉移
  const { data: hcRows, error: hcErr } = await supabase
    .from("sales_handcards")
    .update({ assigned_rs_name: toName, assigned_rs_user_id: toEmployeeId })
    .eq("brand_id", brand)
    .eq("assigned_rs_user_id", fromEmployeeId)
    .eq("status", "open")
    .select("id");
  if (hcErr) return { ok: false, error: `手卡轉移失敗：${hcErr.message}` };

  const orderIds = (orderRows ?? []).map((r) => r.id as string);
  const taskIds = (taskRows ?? []).map((r) => r.id as string);
  const hcIds = (hcRows ?? []).map((r) => r.id as string);

  await writeAuditLog({
    table_name: "employees",
    record_id: fromEmployeeId,
    action: "staff_departure_batch_transfer",
    actor_id: user?.id ?? null,
    brand_id: brand,
    before: { from_employee_id: fromEmployeeId, from_name: fromName },
    after: {
      to_employee_id: toEmployeeId,
      to_name: toName,
      reason: reason?.trim() || null,
      order_ids: orderIds,
      call_task_ids: taskIds,
      handcard_ids: hcIds,
    },
  });

  revalidatePath("/sales/orders");
  revalidatePath("/sales/manager/staff");

  return {
    ok: true,
    data: { orders: orderIds.length, call_tasks: taskIds.length, handcards: hcIds.length },
  };
}
