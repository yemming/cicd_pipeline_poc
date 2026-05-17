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
