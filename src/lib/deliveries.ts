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

// ─────────────────────────────────────────────────────────────
// C-23：交車完成 → 建立 / 更新售後客戶檔 + 人車檔
//
// 交車是「售後客戶」的誕生點：把交車單上的車主 + 車輛資料落地成 customers /
// customer_vehicles，售後模組（保養提醒、維修履歷、CRM 360）才有對象。
// 屬加值副作用，永遠不擋交車流程：以 after() 包、任何錯誤吞掉只記 log。
// ─────────────────────────────────────────────────────────────

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-()]/g, '').trim();
  return cleaned || null;
}

async function genCustomerCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
): Promise<string> {
  const { data } = await supabase
    .from('customers')
    .select('code')
    .eq('brand_id', brandId)
    .ilike('code', 'C%')
    .order('code', { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of data ?? []) {
    const m = /^C(\d+)$/.exec((row as { code: string | null }).code ?? '');
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `C${String(max + 1).padStart(5, '0')}`;
}

/**
 * 交車完成後同步售後客戶檔 / 人車檔。回傳實際使用的 customer_id / vehicle_id
 * （新建或既有），並回填到 deliveries。失敗回 null 欄位、絕不 throw。
 */
export async function syncDeliveryToCustomerBase(
  row: DeliveryRow,
): Promise<{ customer_id: string | null; customer_vehicle_id: string | null }> {
  const supabase = await createClient();
  const brand = row.brand_id;
  const result: { customer_id: string | null; customer_vehicle_id: string | null } = {
    customer_id: row.customer_id ?? null,
    customer_vehicle_id: row.customer_vehicle_id ?? null,
  };

  try {
    // ── 1) 客戶：已連結就用；否則 phone→name find-or-create ──
    let customerId = row.customer_id ?? null;
    const name = row.customer_name?.trim() || null;
    const phone = normalizePhone(row.customer_phone);

    if (!customerId && (name || phone)) {
      if (phone) {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('brand_id', brand)
          .eq('phone', phone)
          .limit(1)
          .maybeSingle();
        if (data?.id) customerId = data.id;
      }
      if (!customerId && !phone && name) {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('brand_id', brand)
          .eq('name', name)
          .limit(1)
          .maybeSingle();
        if (data?.id) customerId = data.id;
      }
      if (!customerId && name) {
        const code = await genCustomerCode(supabase, brand);
        const { data: created, error } = await supabase
          .from('customers')
          .insert({
            brand_id: brand,
            subsidiary_id: row.subsidiary_id,
            code,
            name,
            type: 'individual',
            phone,
            email: row.customer_email?.trim() || null,
            address: row.customer_address?.trim() || null,
            birthday: row.customer_birthday || null,
            is_active: true,
            external_source: 'delivery',
            source_module: 'delivery',
            created_by: row.created_by,
          })
          .select('id')
          .single();
        if (error) {
          console.error('[C-23 交車建客] 失敗（不影響交車）', error.message);
        } else {
          customerId = created.id;
        }
      }
    }
    result.customer_id = customerId;
    if (!customerId) return result; // 沒客戶就不建車（customer_vehicles.customer_id NOT NULL）

    // ── 2) 人車檔：已連結就更新里程；否則 VIN→車牌 find-or-create ──
    let vehicleId = row.customer_vehicle_id ?? null;
    const vin = row.vin?.trim() || null;
    const plate = row.plate_no?.trim() || null;

    if (!vehicleId && vin) {
      const { data } = await supabase
        .from('customer_vehicles')
        .select('id')
        .eq('brand_id', brand)
        .eq('vin', vin)
        .limit(1)
        .maybeSingle();
      if (data?.id) vehicleId = data.id;
    }
    if (!vehicleId && !vin && plate) {
      const { data } = await supabase
        .from('customer_vehicles')
        .select('id')
        .eq('brand_id', brand)
        .eq('license_plate', plate)
        .limit(1)
        .maybeSingle();
      if (data?.id) vehicleId = data.id;
    }

    if (vehicleId) {
      // 既有車：確保歸戶正確 + 補車牌 / 顏色
      const patch: Record<string, unknown> = {
        customer_id: customerId,
        updated_at: new Date().toISOString(),
      };
      if (plate) patch.license_plate = plate;
      if (row.vehicle_color) patch.color = row.vehicle_color;
      if (row.vehicle_model_id) patch.model_id = row.vehicle_model_id;
      await supabase.from('customer_vehicles').update(patch).eq('id', vehicleId).eq('brand_id', brand);
    } else {
      const { data: createdVeh, error: vehErr } = await supabase
        .from('customer_vehicles')
        .insert({
          brand_id: brand,
          subsidiary_id: row.subsidiary_id,
          customer_id: customerId,
          model_id: row.vehicle_model_id,
          vin,
          license_plate: plate,
          color: row.vehicle_color,
          acquired_from: 'new',
          is_active: true,
          external_source: 'delivery',
        })
        .select('id')
        .single();
      if (vehErr) {
        console.error('[C-23 交車建車] 失敗（不影響交車）', vehErr.message);
      } else {
        vehicleId = createdVeh.id;
      }
    }
    result.customer_vehicle_id = vehicleId;

    // ── 3) 回填 deliveries（新建客戶 / 車輛時）──
    if (
      (customerId && customerId !== row.customer_id) ||
      (vehicleId && vehicleId !== row.customer_vehicle_id)
    ) {
      await supabase
        .from('deliveries')
        .update({
          customer_id: customerId,
          customer_vehicle_id: vehicleId,
        })
        .eq('id', row.id);
    }
  } catch (e) {
    console.error('[C-23 交車→售後客戶檔] 例外（不影響交車）', e);
  }

  return result;
}
