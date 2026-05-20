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

// ── KPI 統計（列表頂部用）─────────────────────────────────────────────────
export type HandcardKpis = {
  month_total: number;        // 本月新增手卡
  open_count: number;         // 目前接待中
  pending_followup: number;   // 待跟進（open + 設定了 followup_date 且尚未過）
  converted_count: number;    // 本月已轉 Lead
};

export async function getHandcardKpis(): Promise<HandcardKpis> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  // 取本月起始日
  const now = new Date();
  const ymStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const baseSel = supabase
    .from('sales_handcards')
    .select('id, status, reception_date, metadata', { count: 'exact', head: false })
    .eq('brand_id', brandId);

  // 一次撈當月手卡 → JS aggregate（量級 OK：單一品牌、月份範圍）
  const { data: monthRows, error: monthErr } = await baseSel.gte('reception_date', ymStart);
  if (monthErr) throw monthErr;

  // open / pending followup 需看全部（不限月）
  const { data: allOpen, error: openErr } = await supabase
    .from('sales_handcards')
    .select('id, status, metadata')
    .eq('brand_id', brandId)
    .eq('status', 'open');
  if (openErr) throw openErr;

  const todayStr = now.toISOString().slice(0, 10);
  const pendingFollowup = (allOpen ?? []).filter((r) => {
    const md = (r.metadata ?? {}) as Record<string, unknown>;
    const fd = typeof md.followup_date === 'string' ? md.followup_date : null;
    return fd && fd >= todayStr;
  }).length;

  const monthTotal = (monthRows ?? []).length;
  const convertedCount = (monthRows ?? []).filter((r) => r.status === 'converted_to_lead').length;

  return {
    month_total: monthTotal,
    open_count: (allOpen ?? []).length,
    pending_followup: pendingFollowup,
    converted_count: convertedCount,
  };
}

// ── 來源分佈（DonutChart 用）— 取自 metadata.arrival_source ─────────────
export type HandcardSourceDatum = { name: string; value: number };

export async function getHandcardSourceDistribution(opts: {
  monthsBack?: number;   // 預設 3 個月
} = {}): Promise<HandcardSourceDatum[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const months = opts.monthsBack ?? 3;
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('sales_handcards')
    .select('metadata, customer_identity')
    .eq('brand_id', brandId)
    .gte('reception_date', sinceStr);
  if (error) throw error;

  // 計算來源 — 優先吃 metadata.arrival_source，沒有時 fallback 用身份標籤
  const counter = new Map<string, number>();
  for (const row of data ?? []) {
    const md = (row.metadata ?? {}) as Record<string, unknown>;
    const raw =
      (typeof md.arrival_source === 'string' && md.arrival_source.trim()) ||
      (row.customer_identity === 'revisit' ? '潛客再訪' :
       row.customer_identity === 'owner' ? '老車主回廠' :
       row.customer_identity === 'switcher' ? '他牌換購' :
       row.customer_identity === 'new' ? '首次來訪' : '未分類');
    counter.set(raw, (counter.get(raw) ?? 0) + 1);
  }

  return Array.from(counter.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
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
