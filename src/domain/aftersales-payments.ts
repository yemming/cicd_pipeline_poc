/**
 * Domain helper — 售後結帳收款記錄（aftersales_payments）
 *
 * 修補四：前台（售後結帳）→ 中台（財會）的數據通路。
 * 售後結帳產生的每一筆金額，落地到結構清晰、欄位完整的獨立收款記錄表，
 * 隨時可透過 GET /api/aftersales/payments 標準 API 輸出給外部財務系統（正航 / ECPay / 門市收銀）。
 *
 * 注意：`payments` 表名已被會計 AP（廠商付款）模組佔用，售後收款用 aftersales_payments。
 *
 * 天條：UI / API route 一律走此 helper，不直連 supabase。
 */
import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type AftersalesPaymentInput = {
  ro_id: string;
  ro_number: string;
  prefix_p1: string;
  checkout_id?: string | null;
  subtotal_labor?: number | null;
  subtotal_parts?: number | null;
  subtotal_misc?: number | null;
  discount_amount?: number | null;
  total_amount: number;
  payment_method: string;
  payment_reference?: string | null;
  external_invoice_no?: string | null;
  store_id?: string | null;
  brand_id: string;
  created_by?: string | null;
};

export type RecordPaymentResult =
  | { ok: true; data: { id: string; skipped?: boolean } }
  | { ok: false; error: string };

/**
 * 寫入一筆售後收款記錄。
 * 冪等：同一 checkout_id 已存在則跳過（回 skipped），避免重跑關單重複落帳。
 */
export async function recordAftersalesPayment(
  input: AftersalesPaymentInput,
): Promise<RecordPaymentResult> {
  if (!input.ro_id) return { ok: false, error: "缺少工單 id" };
  if (!input.brand_id) return { ok: false, error: "缺少 brand_id" };
  const supabase = await createClient();

  // 冪等：同一結帳單只落一筆
  if (input.checkout_id) {
    const { data: existed } = await supabase
      .from("aftersales_payments")
      .select("id")
      .eq("brand_id", input.brand_id)
      .eq("checkout_id", input.checkout_id)
      .maybeSingle();
    if (existed?.id) return { ok: true, data: { id: existed.id as string, skipped: true } };
  }

  const { data, error } = await supabase
    .from("aftersales_payments")
    .insert({
      ro_id: input.ro_id,
      ro_number: input.ro_number,
      prefix_p1: input.prefix_p1,
      checkout_id: input.checkout_id ?? null,
      subtotal_labor: input.subtotal_labor ?? null,
      subtotal_parts: input.subtotal_parts ?? null,
      subtotal_misc: input.subtotal_misc ?? null,
      discount_amount: input.discount_amount ?? 0,
      total_amount: input.total_amount,
      payment_method: input.payment_method,
      payment_reference: input.payment_reference ?? null,
      external_invoice_no: input.external_invoice_no ?? null,
      store_id: input.store_id ?? null,
      brand_id: input.brand_id,
      created_by: input.created_by ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "收款記錄寫入失敗" };
  }
  return { ok: true, data: { id: data.id as string } };
}

export type AftersalesPaymentRow = {
  id: string;
  ro_number: string;
  prefix_p1: string;
  subtotal_labor: number | null;
  subtotal_parts: number | null;
  subtotal_misc: number | null;
  discount_amount: number | null;
  total_amount: number;
  payment_method: string;
  paid_at: string;
};

export type ListAftersalesPaymentsFilters = {
  store_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  prefix_p1?: string | null;
};

/**
 * 對外輸出用：列出收款記錄（供財會系統對接）。
 * RLS 已按 brand 隔離；這裡再依 store / 期間 / 業務類型過濾。
 */
export async function listAftersalesPayments(
  filters: ListAftersalesPaymentsFilters = {},
): Promise<{ rows: AftersalesPaymentRow[]; total: number }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("aftersales_payments")
    .select(
      "id, ro_number, prefix_p1, subtotal_labor, subtotal_parts, subtotal_misc, discount_amount, total_amount, payment_method, paid_at",
    )
    .eq("brand_id", brand)
    .order("paid_at", { ascending: false })
    .limit(1000);

  if (filters.store_id) query = query.eq("store_id", filters.store_id);
  if (filters.prefix_p1 && filters.prefix_p1 !== "all")
    query = query.eq("prefix_p1", filters.prefix_p1);
  if (filters.date_from) query = query.gte("paid_at", filters.date_from);
  if (filters.date_to) query = query.lte("paid_at", filters.date_to);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as AftersalesPaymentRow[];
  const total = rows.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);
  return { rows, total };
}
