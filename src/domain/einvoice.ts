"use server";

/**
 * Domain Helper — E-Invoice（電子發票）
 *
 * 對應頁面：
 *   - /einvoice           list
 *   - /einvoice/[id]      detail（含 allowances / voids）
 *   - /einvoice/allowances 折讓單清單
 *   - /einvoice/number-pools 字軌與發票號碼
 *   - /einvoice/voids     作廢紀錄
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { EInvoiceRow } from "@/app/(workspace)/einvoice/_components/einvoice-board";
import type {
  EInvoiceFull,
  AllowanceRow,
  VoidRow,
} from "@/app/(workspace)/einvoice/[id]/_components/einvoice-detail-view";

// ─────────────────────────── /einvoice ───────────────────────────

export type EInvoiceFilters = {
  status: string;
  source: string;
  type: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

export interface EInvoicesListPageData {
  rows: EInvoiceRow[];
  totalCount: number;
}

export async function getEinvoicesListPageData(
  filters: EInvoiceFilters,
): Promise<EInvoicesListPageData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("einvoices")
    .select(
      "id, source_module, source_ref, ecpay_invoice_no, ecpay_invoice_date, ecpay_status, invoice_type, carrier_code, tax_id, buyer_name, total_amount, items, issued_at, created_at",
    )
    .eq("brand_id", brand);

  if (filters.status !== "all") q = q.eq("ecpay_status", filters.status);
  if (filters.source !== "all") q = q.eq("source_module", filters.source);
  if (filters.type !== "all") q = q.eq("invoice_type", filters.type);
  if (filters.dateFrom) q = q.gte("ecpay_invoice_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("ecpay_invoice_date", filters.dateTo);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(
      `ecpay_invoice_no.ilike.%${t}%,source_ref.ilike.%${t}%,tax_id.ilike.%${t}%,buyer_name.ilike.%${t}%,carrier_code.ilike.%${t}%`,
    );
  }

  const [iRes, totalRes] = await Promise.all([
    q.order("created_at", { ascending: false }).limit(500),
    supabase
      .from("einvoices")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
  ]);
  if (iRes.error) throw new Error(`einvoices: ${iRes.error.message}`);

  return {
    rows: (iRes.data ?? []) as unknown as EInvoiceRow[],
    totalCount: totalRes.count ?? 0,
  };
}

// ─────────────────────────── /einvoice/[id] ───────────────────────────

export interface EInvoiceDetailPageData {
  einvoice: EInvoiceFull;
  allowances: AllowanceRow[];
  voids: VoidRow[];
}

export async function getEinvoiceDetailPageData(
  id: string,
): Promise<EInvoiceDetailPageData | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [eRes, aRes, vRes] = await Promise.all([
    supabase
      .from("einvoices")
      .select(
        "id, brand_id, source_module, source_id, source_ref, ecpay_invoice_no, ecpay_invoice_date, ecpay_random_number, ecpay_status, ecpay_error_msg, invoice_type, carrier_type, carrier_code, tax_id, buyer_name, buyer_address, buyer_email, buyer_phone, donation_code, total_amount, tax_amount, items, remark, issued_at, created_at",
      )
      .eq("id", id)
      .eq("brand_id", brand)
      .single(),
    supabase
      .from("einvoice_allowances")
      .select(
        "id, ecpay_allowance_no, total_amount, tax_amount, items, reason, status, ecpay_error_msg, notify_method, notify_target, issued_at, created_at",
      )
      .eq("einvoice_id", id)
      .eq("brand_id", brand)
      .order("created_at", { ascending: false }),
    supabase
      .from("einvoice_voids")
      .select("id, reason, voided_at, voided_by")
      .eq("einvoice_id", id)
      .eq("brand_id", brand)
      .order("voided_at", { ascending: false }),
  ]);
  if (eRes.error || !eRes.data) return null;
  return {
    einvoice: eRes.data as unknown as EInvoiceFull,
    allowances: (aRes.data ?? []) as unknown as AllowanceRow[],
    voids: (vRes.data ?? []) as unknown as VoidRow[],
  };
}

// ─────────────────────────── /einvoice/allowances ───────────────────────────

export type AllowanceListFilters = {
  status: string;
  dateFrom: string;
  dateTo: string;
};

export interface AllowanceListRow {
  id: string;
  einvoice_id: string;
  ecpay_allowance_no: string | null;
  total_amount: number;
  status: string;
  reason: string | null;
  ecpay_error_msg: string | null;
  notify_method: string | null;
  created_at: string;
  einvoice: { ecpay_invoice_no: string | null } | null;
}

export async function getEinvoiceAllowancesPageData(
  filters: AllowanceListFilters,
): Promise<AllowanceListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("einvoice_allowances")
    .select(
      "id, einvoice_id, ecpay_allowance_no, total_amount, status, reason, ecpay_error_msg, notify_method, created_at, einvoice:einvoices(ecpay_invoice_no)",
    )
    .eq("brand_id", brand);

  if (filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("created_at", filters.dateFrom);
  if (filters.dateTo) q = q.lte("created_at", `${filters.dateTo}T23:59:59`);

  const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(`einvoice_allowances: ${error.message}`);
  return (data ?? []) as unknown as AllowanceListRow[];
}

// ─────────────────────────── /einvoice/number-pools ───────────────────────────

export interface NumberPoolRow {
  id: string;
  period: string;
  prefix: string;
  start_no: number;
  end_no: number;
  used_count: number;
  is_active: boolean;
  synced_at: string | null;
  created_at: string;
}

export async function getEinvoiceNumberPoolsPageData(): Promise<NumberPoolRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("einvoice_number_pools")
    .select(
      "id, period, prefix, start_no, end_no, used_count, is_active, synced_at, created_at",
    )
    .eq("brand_id", brand)
    .order("period", { ascending: false })
    .order("prefix");
  if (error) throw new Error(`einvoice_number_pools: ${error.message}`);
  return (data ?? []) as NumberPoolRow[];
}

// ─────────────────────────── /einvoice/voids ───────────────────────────

export type VoidListFilters = {
  dateFrom: string;
  dateTo: string;
};

export interface VoidListRow {
  id: string;
  einvoice_id: string;
  reason: string;
  voided_at: string;
  voided_by: string | null;
  einvoice: {
    ecpay_invoice_no: string | null;
    total_amount: number;
    invoice_type: string;
  } | null;
}

export async function getEinvoiceVoidsPageData(
  filters: VoidListFilters,
): Promise<VoidListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("einvoice_voids")
    .select(
      "id, einvoice_id, reason, voided_at, voided_by, einvoice:einvoices(ecpay_invoice_no, total_amount, invoice_type)",
    )
    .eq("brand_id", brand);
  if (filters.dateFrom) q = q.gte("voided_at", filters.dateFrom);
  if (filters.dateTo) q = q.lte("voided_at", `${filters.dateTo}T23:59:59`);

  const { data, error } = await q.order("voided_at", { ascending: false }).limit(500);
  if (error) throw new Error(`einvoice_voids: ${error.message}`);
  return (data ?? []) as unknown as VoidListRow[];
}
