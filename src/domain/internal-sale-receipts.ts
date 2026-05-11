"use server";

/**
 * Domain Helper — Internal Sale Receipts（內售入庫 §5.2）
 *
 * Readonly summary list — 沒有 CRUD action。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type InternalSaleReceiptRow = {
  id: string;
  doc_no: string;
  source_label: string | null;
  warehouse_label: string | null;
  receipt_date: string | null;
  status: string;
  qty_total: number;
  amount_total: number;
  notes: string | null;
};

export async function listInternalSaleReceipts(): Promise<InternalSaleReceiptRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("parts_internal_sale_receipts")
    .select(
      "id, doc_no, source_label, warehouse_label, receipt_date, status, qty_total, amount_total, notes",
    )
    .eq("brand_id", scope.brand_id)
    .order("sort_order");

  if (error) throw new Error(`internal-sale-receipts: ${error.message}`);

  return ((data ?? []) as unknown as InternalSaleReceiptRow[]).map((d) => ({
    ...d,
    qty_total: Number(d.qty_total),
    amount_total: Number(d.amount_total),
  }));
}

export async function getInternalSaleReceiptsPageData(): Promise<{
  rows: InternalSaleReceiptRow[];
  totalQty: number;
  totalAmount: number;
}> {
  const rows = await listInternalSaleReceipts();
  const totalQty = rows.reduce((s, r) => s + r.qty_total, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount_total, 0);
  return { rows, totalQty, totalAmount };
}
