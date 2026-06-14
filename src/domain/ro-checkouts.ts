"use server";

/**
 * Domain Helper — 售後 結帳收款（RO Checkout）
 *
 * 對應頁面：/parts/aftersales/checkout（list + 4-step wizard）
 * Spec：08_結帳收款.html
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  CustomerSignature,
  FeeSummary,
  Invoice,
  Payment,
  RoCheckoutStatus,
} from "./ro-checkouts.constants";

export type RoCheckoutRow = {
  id: string;
  brand_id: string;
  repair_order_id: string;
  checkout_no: string;
  status: RoCheckoutStatus;
  fee_summary: FeeSummary | null;
  fees_confirmed_at: string | null;
  customer_signature: CustomerSignature | null;
  payment: Payment | null;
  invoice: Invoice | null;
  closed_at: string | null;
  receipt_printed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RoCheckoutListRow = RoCheckoutRow & {
  ro_code: string | null;
  ro_status: string | null;
  customer_name: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  payable: number | null;
};

export type RoCheckoutFilters = {
  status?: RoCheckoutStatus | "all";
  q?: string;
  /** 從工單詳情頁跳入時，只顯示該工單的結帳記錄 */
  roId?: string | null;
};

/* ──────────────── helpers (file-private) ──────────────── */

type RoMeta = {
  ro_code: string | null;
  ro_status: string | null;
  customer_name: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
};

async function loadRoMeta(roIds: string[]): Promise<Map<string, RoMeta>> {
  const map = new Map<string, RoMeta>();
  if (roIds.length === 0) return map;
  const supabase = await createClient();
  const { data: ros } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_id, vehicle_id")
    .in("id", roIds);
  const customerIds = Array.from(new Set((ros ?? []).map((r) => r.customer_id).filter(Boolean) as string[]));
  const vehicleIds = Array.from(new Set((ros ?? []).map((r) => r.vehicle_id).filter(Boolean) as string[]));
  const [custs, vehs] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    vehicleIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, model_id")
          .in("id", vehicleIds)
      : Promise.resolve({
          data: [] as { id: string; license_plate: string | null; model_id: string | null }[],
        }),
  ]);
  const cMap = new Map((custs.data ?? []).map((c) => [c.id, c.name]));

  // 用 model_id 批次查 vehicle_models 取 model_name
  const modelIds = Array.from(
    new Set((vehs.data ?? []).map((v) => v.model_id).filter(Boolean) as string[]),
  );
  const { data: models } = modelIds.length
    ? await supabase.from("vehicle_models").select("id, model_name").in("id", modelIds)
    : { data: [] as { id: string; model_name: string | null }[] };
  const modelMap = new Map((models ?? []).map((m) => [m.id, m.model_name]));

  const vMap = new Map(
    (vehs.data ?? []).map((v) => [
      v.id,
      {
        license_plate: v.license_plate,
        model_name: v.model_id ? (modelMap.get(v.model_id) ?? null) : null,
      },
    ]),
  );
  for (const r of ros ?? []) {
    const v = r.vehicle_id ? vMap.get(r.vehicle_id) : undefined;
    map.set(r.id, {
      ro_code: r.ro_code,
      ro_status: r.status,
      customer_name: r.customer_id ? cMap.get(r.customer_id) ?? null : null,
      vehicle_license_plate: v?.license_plate ?? null,
      vehicle_model_name: v?.model_name ?? null,
    });
  }
  return map;
}

/* ──────────────── KPI ──────────────── */

export type CheckoutKpis = {
  /** 今日（Asia/Taipei）已關單張數 */
  todayClosedCount: number;
  /** 今日已關單應收總額 */
  todayRevenue: number;
  /** 近 30 天平均客單（已關單） */
  avgTicket30d: number;
  /** 近 30 天「全部付清率」= completed / (in_progress + signed + paid + completed) */
  paidThroughRate: number;
  /** 進行中（含 in_progress + signed + paid 但未關單）張數 */
  openCount: number;
};

function startOfTaipeiDayIso(): string {
  const now = new Date();
  // 取台北時區 00:00 對應的 UTC ISO
  const tw = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  tw.setHours(0, 0, 0, 0);
  // 上面的 setHours 是本機時區的 0 點；換回正確的 Taipei 00:00：
  // 用 offset 推算：先取本機時區 offset、再加上 Taipei 與 UTC 的 +08:00。
  const offsetMin = tw.getTimezoneOffset(); // 本機相對 UTC 分鐘
  const utcMs = tw.getTime() - (offsetMin + 8 * 60) * 60 * 1000;
  return new Date(utcMs).toISOString();
}

export async function getCheckoutKpis(): Promise<CheckoutKpis> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const todayStart = startOfTaipeiDayIso();
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // 一次撈近 30 天的全部結帳，本地端統計（demo 量級 OK）
  const { data, error } = await supabase
    .from("ro_checkouts")
    .select("status, fee_summary, closed_at, created_at")
    .eq("brand_id", brand)
    .gte("created_at", thirtyAgo)
    .limit(2000);

  if (error || !data) {
    return {
      todayClosedCount: 0,
      todayRevenue: 0,
      avgTicket30d: 0,
      paidThroughRate: 0,
      openCount: 0,
    };
  }

  type Row = {
    status: RoCheckoutStatus;
    fee_summary: FeeSummary | null;
    closed_at: string | null;
    created_at: string | null;
  };
  const rows = data as Row[];

  let todayClosedCount = 0;
  let todayRevenue = 0;
  let completed30 = 0;
  let totalRevenue30 = 0;
  let openCount = 0;
  const total30 = rows.length;

  for (const r of rows) {
    const payable = Number(r.fee_summary?.payable ?? 0);
    if (r.status === "completed") {
      completed30 += 1;
      totalRevenue30 += payable;
      if (r.closed_at && r.closed_at >= todayStart) {
        todayClosedCount += 1;
        todayRevenue += payable;
      }
    } else {
      openCount += 1;
    }
  }

  const avgTicket30d = completed30 > 0 ? Math.round(totalRevenue30 / completed30) : 0;
  const paidThroughRate = total30 > 0 ? Math.round((completed30 / total30) * 100) : 0;

  return {
    todayClosedCount,
    todayRevenue,
    avgTicket30d,
    paidThroughRate,
    openCount,
  };
}

/* ──────────────── List ──────────────── */

export async function listRoCheckouts(
  filters: RoCheckoutFilters = {},
): Promise<RoCheckoutListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("ro_checkouts")
    .select("*")
    .eq("brand_id", brand)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.q && filters.q.trim()) {
    query = query.ilike("checkout_no", `%${filters.q.trim()}%`);
  }
  if (filters.roId) {
    query = query.eq("repair_order_id", filters.roId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as RoCheckoutRow[];
  const roIds = rows.map((r) => r.repair_order_id);
  const meta = await loadRoMeta(roIds);

  return rows.map((r) => {
    const m = meta.get(r.repair_order_id);
    return {
      ...r,
      ro_code: m?.ro_code ?? null,
      ro_status: m?.ro_status ?? null,
      customer_name: m?.customer_name ?? null,
      vehicle_license_plate: m?.vehicle_license_plate ?? null,
      vehicle_model_name: m?.vehicle_model_name ?? null,
      payable: r.fee_summary?.payable ?? null,
    };
  });
}

/* ──────────────── Candidates ──────────────── */

export type RoCandidate = {
  id: string;
  ro_code: string;
  status: string;
  customer_name: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  has_final_inspection: boolean;
};

/**
 * 可建立結帳的工單：status=待結帳 / 維修中（demo 寬鬆），且未建過 ro_checkouts。
 * （正式上線會收緊：必須 final_inspections.status=completed）
 */
export async function listRoCandidatesForCheckout(): Promise<RoCandidate[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ros, error } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_id, vehicle_id")
    .eq("brand_id", brand)
    .in("status", ["待結帳", "維修中", "進行中"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const roIds = (ros ?? []).map((r) => r.id);
  if (roIds.length === 0) return [];

  const [{ data: existing }, { data: fis }, meta] = await Promise.all([
    supabase.from("ro_checkouts").select("repair_order_id").in("repair_order_id", roIds),
    supabase.from("final_inspections").select("repair_order_id, status").in("repair_order_id", roIds),
    loadRoMeta(roIds),
  ]);
  const usedSet = new Set((existing ?? []).map((r) => r.repair_order_id));
  const fiMap = new Map((fis ?? []).map((f) => [f.repair_order_id, f.status]));

  return (ros ?? [])
    .filter((r) => !usedSet.has(r.id))
    .map((r) => {
      const m = meta.get(r.id);
      return {
        id: r.id,
        ro_code: r.ro_code,
        status: r.status,
        customer_name: m?.customer_name ?? null,
        vehicle_license_plate: m?.vehicle_license_plate ?? null,
        vehicle_model_name: m?.vehicle_model_name ?? null,
        has_final_inspection: !!fiMap.get(r.id),
      };
    });
}

/* ──────────────── Detail ──────────────── */

export type RoCheckoutDetail = RoCheckoutRow & {
  ro: {
    id: string;
    ro_code: string;
    status: string;
    customer_name: string | null;
    vehicle_license_plate: string | null;
    vehicle_model_name: string | null;
    sa_name: string | null;
  };
  final_inspection_status: string | null;
};

export async function getRoCheckoutById(id: string): Promise<RoCheckoutDetail | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("ro_checkouts")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as RoCheckoutRow;

  const meta = await loadRoMeta([row.repair_order_id]);
  const m = meta.get(row.repair_order_id);

  const { data: ro } = await supabase
    .from("repair_orders")
    .select("ro_code, status, sa_id")
    .eq("id", row.repair_order_id)
    .maybeSingle();
  let saName: string | null = null;
  if (ro?.sa_id) {
    const { data: sa } = await supabase
      .from("employees")
      .select("display_name, name")
      .eq("id", ro.sa_id)
      .maybeSingle();
    saName = (sa as { display_name?: string; name?: string } | null)?.display_name
      ?? (sa as { display_name?: string; name?: string } | null)?.name
      ?? null;
  }

  const { data: fi } = await supabase
    .from("final_inspections")
    .select("status")
    .eq("repair_order_id", row.repair_order_id)
    .maybeSingle();

  return {
    ...row,
    ro: {
      id: row.repair_order_id,
      ro_code: m?.ro_code ?? ro?.ro_code ?? "—",
      status: m?.ro_status ?? ro?.status ?? "—",
      customer_name: m?.customer_name ?? null,
      vehicle_license_plate: m?.vehicle_license_plate ?? null,
      vehicle_model_name: m?.vehicle_model_name ?? null,
      sa_name: saName,
    },
    final_inspection_status: (fi as { status?: string } | null)?.status ?? null,
  };
}

/* ──────────────── 撈 RO 的 lines + addons (server actions 用) ──────────────── */

export async function loadFeeSourceForRo(roId: string): Promise<{
  lines: Array<{
    id: string;
    line_no: number;
    kind: string;
    labor_name: string | null;
    part_name: string | null;
    labor_units: number | null;
    qty: number | null;
    unit_price: number | null;
    amount: number | null;
    is_warranty: boolean | null;
  }>;
  addons: Array<{
    id: string;
    addon_no: number;
    name: string;
    estimated_fee: number | null;
    customer_decision: string | null;
  }>;
}> {
  const supabase = await createClient();
  const [{ data: lines }, { data: addons }] = await Promise.all([
    supabase
      .from("repair_order_lines")
      .select("id, line_no, kind, labor_name, part_name, labor_units, qty, unit_price, amount, is_warranty")
      .eq("repair_order_id", roId)
      .order("line_no", { ascending: true }),
    supabase
      .from("repair_order_addons")
      .select("id, addon_no, name, estimated_fee, customer_decision")
      .eq("ro_id", roId)
      .order("addon_no", { ascending: true }),
  ]);
  return {
    lines: (lines ?? []) as Awaited<ReturnType<typeof loadFeeSourceForRo>>["lines"],
    addons: (addons ?? []) as Awaited<ReturnType<typeof loadFeeSourceForRo>>["addons"],
  };
}

/* ──────────────── 撈 RO 給「開立發票」prefill 用（P1-#10） ──────────────── */

export type RoInvoicePrefillItem = {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

export type RoInvoicePrefill = {
  ro_id: string;
  ro_code: string;
  checkout_no: string;
  total_amount: number;
  items: RoInvoicePrefillItem[];
  customer: {
    id: string | null;
    name: string | null;
    tax_id: string | null;
    email: string | null;
    phone: string | null;
  };
  invoice_kind: "cloud" | "carrier" | "company" | "donate" | null;
  invoice_tax_id: string | null;
};

/**
 * 給 /einvoice/issue?roId=<id> 用的 prefill helper。
 * 把 RO 結帳的 fee_summary lines / addons + customer 聯絡資訊
 * 整成 ManualIssueForm 直接 hydrate 的形狀。
 */
export async function fetchRoForInvoice(roId: string): Promise<RoInvoicePrefill | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) 撈結帳主檔（RO 必須有 ro_checkouts 才能開票）
  const { data: checkout } = await supabase
    .from("ro_checkouts")
    .select("id, repair_order_id, checkout_no, fee_summary, payment, invoice")
    .eq("repair_order_id", roId)
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!checkout) return null;

  const summary = (checkout.fee_summary ?? {}) as FeeSummary;
  const lines = summary.lines ?? [];
  const total = summary.payable ?? summary.total ?? 0;

  // 2) 撈 RO + 客戶
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("ro_code, customer_id")
    .eq("id", roId)
    .maybeSingle();

  let customer: RoInvoicePrefill["customer"] = {
    id: null,
    name: null,
    tax_id: null,
    email: null,
    phone: null,
  };
  if (ro?.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, name, tax_id, email, phone")
      .eq("id", ro.customer_id)
      .maybeSingle();
    if (cust) {
      customer = {
        id: cust.id,
        name: cust.name ?? null,
        tax_id: cust.tax_id ?? null,
        email: cust.email ?? null,
        phone: cust.phone ?? null,
      };
    }
  }

  // 3) FeeLine[] → EInvoiceItem 風格
  //    把 line 整列當一個 invoice item（label = labor/part 名稱、qty=1、unitPrice=subtotal）
  //    這樣 N 行 line/addon → N 個 invoice item、總額 = sum(items.amount) = summary.payable
  const items: RoInvoicePrefillItem[] = lines
    .filter((l) => (l.subtotal ?? 0) > 0)
    .map((l) => ({
      name: l.label || "維修費用",
      qty: 1,
      unitPrice: Math.round(l.subtotal ?? 0),
      amount: Math.round(l.subtotal ?? 0),
    }));

  // 若 lines 為空（罕見：summary.lines 沒帶但 payable 有值），給一筆 fallback
  if (items.length === 0 && total > 0) {
    items.push({
      name: `${ro?.ro_code ?? "RO"} 維修費用`,
      qty: 1,
      unitPrice: Math.round(total),
      amount: Math.round(total),
    });
  }

  // 4) 推 invoice_kind → ManualIssueForm 的 invoiceType（最佳猜測）
  const inv = (checkout.invoice ?? {}) as Invoice;
  let invoiceKind: RoInvoicePrefill["invoice_kind"] = inv.kind ?? null;
  if (!invoiceKind) {
    // 沒指定就照客戶有沒有統編判斷
    invoiceKind = customer.tax_id ? "company" : "cloud";
  }

  return {
    ro_id: roId,
    ro_code: ro?.ro_code ?? "—",
    checkout_no: checkout.checkout_no,
    total_amount: Math.round(total),
    items,
    customer,
    invoice_kind: invoiceKind,
    invoice_tax_id: inv.tax_id ?? customer.tax_id ?? null,
  };
}
