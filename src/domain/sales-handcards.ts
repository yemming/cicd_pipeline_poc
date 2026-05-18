/**
 * Domain Helper — 接待手卡（sales_handcards）
 *
 * RS 在展廳接待客戶時填寫的快速紀錄，可轉成 sales_lead。
 * UI 禁直連 supabase，一律走這裡。
 */

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import type {
  HandcardStatus,
  HandcardLeadGrade,
  HandcardIdentity,
  HandcardPurchaseTiming,
  HandcardTrialStatus,
  HandcardReceptionPeriod,
} from '@/domain/sales-handcards.constants';

export type {
  HandcardStatus,
  HandcardLeadGrade,
  HandcardIdentity,
  HandcardPurchaseTiming,
  HandcardTrialStatus,
  HandcardReceptionPeriod,
} from '@/domain/sales-handcards.constants';

// ── Row 型別 ──────────────────────────────────────────────────────────────
export type HandcardRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  reception_date: string;
  reception_period: HandcardReceptionPeriod | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_identity: HandcardIdentity | null;
  customer_id: string | null;
  lead_id: string | null;
  assigned_rs_name: string | null;
  assigned_rs_user_id: string | null;
  lead_grade: HandcardLeadGrade | null;
  intent_level: number | null;
  purchase_timing: HandcardPurchaseTiming | null;
  intended_models: string[] | null;
  trial_status: HandcardTrialStatus | null;
  competitor_brand: string | null;
  competitor_model: string | null;
  quoted_amount: number | null;
  quote_remark: string | null;
  notes: string | null;
  status: HandcardStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

// ── Filter 型別 ───────────────────────────────────────────────────────────
export type HandcardFilters = {
  status: string;       // 'all' | HandcardStatus
  lead_grade: string;   // 'all' | HandcardLeadGrade
  q: string;
  date_from?: string;
  date_to?: string;
};

// ── Input 型別（寫入用）───────────────────────────────────────────────────
export type HandcardInput = {
  reception_date: string;
  reception_period?: HandcardReceptionPeriod | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_identity?: HandcardIdentity | null;
  customer_id?: string | null;
  assigned_rs_name?: string | null;
  assigned_rs_user_id?: string | null;
  lead_grade?: HandcardLeadGrade | null;
  intent_level?: number | null;
  purchase_timing?: HandcardPurchaseTiming | null;
  intended_models?: string[] | null;
  trial_status?: HandcardTrialStatus | null;
  competitor_brand?: string | null;
  competitor_model?: string | null;
  quoted_amount?: number | null;
  quote_remark?: string | null;
  notes?: string | null;
  status?: HandcardStatus;
  organization_id?: string | null;
  metadata?: Record<string, unknown>;
};

// ── 列表查詢 ──────────────────────────────────────────────────────────────
export async function listHandcards(
  filters: HandcardFilters,
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: HandcardRow[]; totalCount: number }> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from('sales_handcards')
    .select('*', { count: 'exact' })
    .eq('brand_id', brandId)
    .order('reception_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status);
  }
  if (filters.lead_grade && filters.lead_grade !== 'all') {
    q = q.eq('lead_grade', filters.lead_grade);
  }
  if (filters.date_from) {
    q = q.gte('reception_date', filters.date_from);
  }
  if (filters.date_to) {
    q = q.lte('reception_date', filters.date_to);
  }
  if (filters.q.trim()) {
    const term = `%${filters.q.trim()}%`;
    q = q.or(`customer_name.ilike.${term},customer_phone.ilike.${term},assigned_rs_name.ilike.${term}`);
  }

  const { data, count, error } = await q.range(from, to);
  if (error) throw error;

  return { rows: (data ?? []) as HandcardRow[], totalCount: count ?? 0 };
}

// ── 單筆查詢 ──────────────────────────────────────────────────────────────
export async function getHandcardById(id: string): Promise<HandcardRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from('sales_handcards')
    .select('*')
    .eq('id', id)
    .eq('brand_id', scope.brand_id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as HandcardRow;
}

// ── 新增 ──────────────────────────────────────────────────────────────────
export async function createHandcard(
  input: HandcardInput,
  userId: string,
): Promise<HandcardRow> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from('sales_handcards')
    .insert({
      brand_id: scope.brand_id,
      created_by: userId,
      updated_by: userId,
      status: 'open',
      ...input,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as HandcardRow;
}

// ── 更新 ──────────────────────────────────────────────────────────────────
export async function updateHandcard(
  id: string,
  patch: Partial<HandcardInput>,
  userId: string,
): Promise<HandcardRow> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from('sales_handcards')
    .update({ ...patch, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('brand_id', scope.brand_id)
    .select('*')
    .single();

  if (error) throw error;
  return data as HandcardRow;
}

// ── 刪除 ──────────────────────────────────────────────────────────────────
export async function deleteHandcard(id: string): Promise<void> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { error } = await supabase
    .from('sales_handcards')
    .delete()
    .eq('id', id)
    .eq('brand_id', scope.brand_id);

  if (error) throw error;
}

// ── 轉成 sales_lead ───────────────────────────────────────────────────────
export async function convertHandcardToLead(
  id: string,
  userId: string,
): Promise<{ leadId: string }> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1. 撈手卡資料
  const { data: hc, error: hcErr } = await supabase
    .from('sales_handcards')
    .select('*')
    .eq('id', id)
    .eq('brand_id', scope.brand_id)
    .single();

  if (hcErr || !hc) throw hcErr ?? new Error('手卡不存在');

  // 2. 建 lead
  const { data: lead, error: leadErr } = await supabase
    .from('sales_leads')
    .insert({
      brand_id: scope.brand_id,
      name: hc.customer_name,
      phone: hc.customer_phone,
      email: hc.customer_email,
      habc: hc.lead_grade,
      intent_model: (hc.intended_models ?? []).join('、') || null,
      rs_name: hc.assigned_rs_name,
      last_visit_at: hc.reception_date,
      note: hc.notes,
      competitor_brand: hc.competitor_brand,
      source: 'showroom',
      is_active: true,
      created_by: userId,
      assignee_id: hc.assigned_rs_user_id,
    })
    .select('id')
    .single();

  if (leadErr || !lead) throw leadErr ?? new Error('建立 lead 失敗');

  // 3. 更新手卡狀態
  const { error: updErr } = await supabase
    .from('sales_handcards')
    .update({
      status: 'converted_to_lead',
      lead_id: lead.id,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('brand_id', scope.brand_id);

  if (updErr) throw updErr;

  return { leadId: lead.id };
}

// ── Picker queries（給 detail wizard 用的「潛客再訪 / 老車主」候選清單） ──────

export type RevisitCandidate = {
  id: string;
  reception_date: string;
  customer_name: string;
  customer_phone: string | null;
  lead_grade: HandcardLeadGrade | null;
  assigned_rs_name: string | null;
  intended_models: string[] | null;
  status: HandcardStatus;
};

export async function listRevisitCandidates(opts: {
  excludeId?: string;
  q?: string;
  limit?: number;
} = {}): Promise<RevisitCandidate[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const limit = opts.limit ?? 50;

  let q = supabase
    .from('sales_handcards')
    .select(
      'id, reception_date, customer_name, customer_phone, lead_grade, assigned_rs_name, intended_models, status',
    )
    .eq('brand_id', brand)
    .order('reception_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.excludeId) q = q.neq('id', opts.excludeId);
  if (opts.q?.trim()) {
    const t = opts.q.trim().replace(/[%,]/g, '');
    q = q.or(`customer_name.ilike.%${t}%,customer_phone.ilike.%${t}%`);
  }

  const { data } = await q;
  return (data ?? []) as RevisitCandidate[];
}

export type OwnerCandidate = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  primary_vehicle: {
    license_plate: string | null;
    model_name: string | null;
    purchase_date: string | null;
    current_mileage: number | null;
  } | null;
};

export async function listOwnerCandidates(opts: {
  q?: string;
  limit?: number;
} = {}): Promise<OwnerCandidate[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const limit = opts.limit ?? 50;

  let cq = supabase
    .from('customers')
    .select('id, code, name, phone')
    .eq('brand_id', brand)
    .eq('is_active', true)
    .order('code')
    .limit(limit);

  if (opts.q?.trim()) {
    const t = opts.q.trim().replace(/[%,]/g, '');
    cq = cq.or(`name.ilike.%${t}%,phone.ilike.%${t}%,code.ilike.%${t}%`);
  }

  const { data: customers } = await cq;
  if (!customers || customers.length === 0) return [];

  const ids = customers.map((c) => c.id);
  const { data: vehicles } = await supabase
    .from('customer_vehicles')
    .select('customer_id, license_plate, manufactured_year, current_mileage, last_service_date, model_id, created_at')
    .eq('brand_id', brand)
    .in('customer_id', ids)
    .order('created_at', { ascending: false });

  const modelIds = Array.from(
    new Set((vehicles ?? []).map((v) => v.model_id).filter((x): x is string => Boolean(x))),
  );
  const modelMap = new Map<string, string>();
  if (modelIds.length > 0) {
    const { data: models } = await supabase
      .from('vehicle_models')
      .select('id, display_name')
      .in('id', modelIds);
    for (const m of models ?? []) modelMap.set(m.id, m.display_name as string);
  }

  const firstVehicleByCustomer = new Map<string, OwnerCandidate['primary_vehicle']>();
  for (const v of vehicles ?? []) {
    if (firstVehicleByCustomer.has(v.customer_id)) continue;
    firstVehicleByCustomer.set(v.customer_id, {
      license_plate: v.license_plate,
      model_name: v.model_id ? modelMap.get(v.model_id) ?? null : null,
      purchase_date: v.last_service_date,
      current_mileage: v.current_mileage,
    });
  }

  return customers.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone,
    primary_vehicle: firstVehicleByCustomer.get(c.id) ?? null,
  }));
}
