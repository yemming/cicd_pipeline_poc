/**
 * Domain helper — 交車作業（deliveries）
 *
 * UI 禁止直接 import supabase，所有讀寫透過此 helper。
 */

import { createClient } from '@/lib/supabase/server';
import type { DeliveryStatus, DeliveryStepName } from './deliveries.constants';

export type DeliveryRow = {
  id: string;
  brand_id: string;
  subsidiary_id: string | null;
  organization_id: string | null;
  delivery_no: string;
  sales_order_id: string | null;
  customer_id: string | null;
  customer_vehicle_id: string | null;
  vehicle_model_id: string | null;
  vehicle_model_name: string | null;
  vehicle_color: string | null;
  vin: string | null;
  scheduled_delivery_date: string | null;
  actual_delivery_date: string | null;
  status: DeliveryStatus;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_birthday: string | null;
  rs_name: string | null;
  step_completion: Record<string, unknown>;
  pdi_work_order_no: string | null;
  pdi_checklist: number[];
  accessories_list: string[];
  accessories_note: string | null;
  delivery_checklist: number[];
  plate_no: string | null;
  plate_date: string | null;
  warranty_receive_date: string | null;
  warranty_start_date: string | null;
  warranty_registered: boolean;
  warranty_registered_at: string | null;
  warranty_no: string | null;
  warranty_consents: Record<string, boolean>;
  warranty_checklist: number[];
  sig_technician: string | null;
  sig_rs: string | null;
  sig_customer: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  received_by_customer_name: string | null;
  ceremony_photos: string[];
  handover_docs_checklist: unknown[];
  keys_count: number;
  keys_delivered_at: string | null;
  customer_doc_signature: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type DeliveryFilters = {
  status?: string;
  q?: string;
  scheduled_date_from?: string;
  scheduled_date_to?: string;
};

export type DeliveryInput = {
  brand_id: string;
  subsidiary_id?: string | null;
  organization_id?: string | null;
  delivery_no: string;
  sales_order_id?: string | null;
  customer_id?: string | null;
  customer_vehicle_id?: string | null;
  vehicle_model_id?: string | null;
  vehicle_model_name?: string | null;
  vehicle_color?: string | null;
  vin?: string | null;
  scheduled_delivery_date?: string | null;
  status?: DeliveryStatus;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  customer_birthday?: string | null;
  rs_name?: string | null;
  notes?: string | null;
};

export type DeliveryStepPayload = Partial<{
  // Step 1
  confirmedOrder: boolean;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  vehicle_model_name: string;
  vehicle_color: string;
  vin: string;
  rs_name: string;
  scheduled_delivery_date: string;
  // Step 2
  pdi_work_order_no: string;
  pdi_checklist: number[];
  // Step 3
  accessories_list: string[];
  accessories_note: string;
  // Step 4
  delivery_checklist: number[];
  // Step 5
  plate_no: string;
  plate_date: string;
  warranty_receive_date: string;
  warranty_start_date: string;
  warranty_consents: Record<string, boolean>;
  warranty_checklist: number[];
  sig_technician: string | null;
  sig_rs: string | null;
  sig_customer: string | null;
  // Step 6
  delivered_at: string;
  ceremony_photos: string[];
  handover_docs_checklist: unknown[];
  keys_count: number;
  keys_delivered_at: string;
  customer_doc_signature: string;
}>;

const PAGE_SIZE = 30;

export async function listDeliveries(
  filters: DeliveryFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: DeliveryRow[]; totalCount: number }> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from('deliveries')
    .select('*', { count: 'exact' })
    .order('scheduled_delivery_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (filters.status) q = q.eq('status', filters.status);
  if (filters.q) {
    q = q.or(
      `customer_name.ilike.%${filters.q}%,delivery_no.ilike.%${filters.q}%,vehicle_model_name.ilike.%${filters.q}%`,
    );
  }
  if (filters.scheduled_date_from) q = q.gte('scheduled_delivery_date', filters.scheduled_date_from);
  if (filters.scheduled_date_to) q = q.lte('scheduled_delivery_date', filters.scheduled_date_to);

  const { data, count, error } = await q.range(from, to);
  if (error) throw error;
  return { rows: (data ?? []) as DeliveryRow[], totalCount: count ?? 0 };
}

export async function getDeliveryById(id: string): Promise<DeliveryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as DeliveryRow;
}

export async function createDelivery(input: DeliveryInput): Promise<DeliveryRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as DeliveryRow;
}

export async function updateDelivery(
  id: string,
  patch: Partial<DeliveryInput>,
): Promise<DeliveryRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DeliveryRow;
}

/** 更新單一 wizard step 的欄位，並記錄 step_completion timestamp */
export async function updateDeliveryStep(
  id: string,
  step: DeliveryStepName,
  payload: DeliveryStepPayload,
  newStatus?: DeliveryStatus,
): Promise<DeliveryRow> {
  const supabase = await createClient();

  // 先讀現有 step_completion
  const { data: current } = await supabase
    .from('deliveries')
    .select('step_completion')
    .eq('id', id)
    .single();

  const stepCompletion = {
    ...((current?.step_completion as Record<string, unknown>) ?? {}),
    [step]: { completed_at: new Date().toISOString() },
  };

  // confirmedOrder 是 UI 層旗標、deliveries 無此欄位（其語意已由 step_completion.confirm1 表達）；
  // 剝掉避免 spread 進 UPDATE 造成「column does not exist」。
  const { confirmedOrder: _confirmedOrder, ...dbPayload } = payload;
  void _confirmedOrder;

  const patch: Record<string, unknown> = {
    ...dbPayload,
    step_completion: stepCompletion,
  };

  if (newStatus) patch.status = newStatus;

  const { data, error } = await supabase
    .from('deliveries')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DeliveryRow;
}

export async function setDeliveryStatus(
  id: string,
  status: DeliveryStatus,
): Promise<DeliveryRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliveries')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DeliveryRow;
}

export async function deleteDelivery(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('deliveries').delete().eq('id', id);
  if (error) throw error;
}
