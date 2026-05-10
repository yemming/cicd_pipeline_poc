"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/contracts";

export type ContractInput = {
  supplier_id: string;
  contract_no: string;
  effective_from?: string;
  effective_to?: string;
  payment_terms?: string;
  min_order_amount?: number | null;
  notes?: string;
  status?: string;
  document_url?: string;
};

export async function createContractAction(
  input: ContractInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!input.supplier_id) return { ok: false, error: "供應商必選" };
  if (!input.contract_no?.trim()) return { ok: false, error: "合約號必填" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_contracts")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      supplier_id: input.supplier_id,
      contract_no: input.contract_no.trim(),
      effective_from: input.effective_from || null,
      effective_to: input.effective_to || null,
      payment_terms: input.payment_terms?.trim() || null,
      min_order_amount: input.min_order_amount ?? null,
      notes: input.notes?.trim() || null,
      status: input.status ?? "active",
      document_url: input.document_url?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateContractAction(
  id: string,
  patch: Partial<ContractInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  if (patch.supplier_id !== undefined) upd.supplier_id = patch.supplier_id;
  if (patch.contract_no !== undefined) upd.contract_no = patch.contract_no.trim();
  if (patch.effective_from !== undefined)
    upd.effective_from = patch.effective_from || null;
  if (patch.effective_to !== undefined) upd.effective_to = patch.effective_to || null;
  if (patch.payment_terms !== undefined)
    upd.payment_terms = patch.payment_terms?.trim() || null;
  if (patch.min_order_amount !== undefined)
    upd.min_order_amount = patch.min_order_amount ?? null;
  if (patch.notes !== undefined) upd.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.document_url !== undefined)
    upd.document_url = patch.document_url?.trim() || null;
  const { error } = await supabase
    .from("supplier_contracts")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function deleteContractAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_contracts")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}
