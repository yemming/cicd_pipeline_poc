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
  HandcardDefeatCategory,
} from '@/domain/sales-handcards.constants';

export type {
  HandcardStatus,
  HandcardLeadGrade,
  HandcardIdentity,
  HandcardPurchaseTiming,
  HandcardTrialStatus,
  HandcardReceptionPeriod,
  HandcardDefeatCategory,
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
  // 輪1-5：戰敗分類（typed column）
  defeat_category: HandcardDefeatCategory | null;
  // A-10：缺貨候補登記（typed columns）
  backorder_model: string | null;       // 舊自由文字欄位（保留 DB 欄但 UI 停止寫入）
  backorder_color: string | null;
  backorder_registered_at: string | null;
  // 域C：候補車型改用 UUID FK 精確比對
  backorder_vehicle_model_id: string | null;
  // LINE：多管道聯絡方式（LINE / 手機 / email 任一非空即有效）
  line_user_id: string | null;
  /** DB generated column：customer_phone / customer_email / line_user_id 任一非空則 true（唯讀，不可寫入） */
  has_valid_contact: boolean;
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
  // 輪1-5：戰敗分類
  defeat_category?: HandcardDefeatCategory | null;
  // A-10：缺貨候補登記
  backorder_model?: string | null;           // 舊自由文字（保留欄位，UI 已停止寫入）
  backorder_color?: string | null;
  backorder_registered_at?: string | null;
  // 域C：候補車型 UUID FK（新，取代 backorder_model 自由文字）
  backorder_vehicle_model_id?: string | null;
  // LINE：多管道聯絡方式
  line_user_id?: string | null;
};

// ── 輪1-2：來源管道選項型別 ────────────────────────────────────────────────
export type LeadSourceOption = {
  code: string;
  label: string;
};

// ── Russell 最在意：手卡建立時的手機查重（軟擋，非硬唯一約束）────────────────
export type HandcardPhoneDuplicateHit = {
  id: string;
  customer_name: string;
  assigned_rs_name: string | null;
  reception_date: string;
};

// ── 輪1-3：手機查重結果型別 ────────────────────────────────────────────────
export type CustomerPhoneHit = {
  id: string;
  code: string;
  name: string;
  phone: string;
};

// ── 輪1-2：從 sales_dictionary 讀來源管道清單 ──────────────────────────────
/**
 * 回傳目前 brand 下的啟用線索來源清單，依 sort_order 排序。
 * UI 若無 DB 資料則 fallback 到 hardcoded 預設清單。
 */
export async function listLeadSourceOptions(): Promise<LeadSourceOption[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data } = await supabase
    .from('sales_dictionary')
    .select('code, label')
    .eq('brand_id', brandId)
    .eq('kind', 'lead_source')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (!data || data.length === 0) {
    // fallback 靜態清單（管理員尚未設定時仍可用）
    return [
      { code: 'showroom_visit', label: '展廳到訪' },
      { code: 'motor_show', label: '車展活動' },
      { code: 'social_media', label: 'FB／IG 社群' },
      { code: 'referral', label: '老車主轉介紹' },
      { code: 'dspot_app', label: 'DSPOT App' },
      { code: 'dre_event', label: '活動現場（DRE）' },
      { code: 'other', label: '其他' },
    ];
  }

  return data as LeadSourceOption[];
}

// ── 輪1-3：依手機號查詢既有客戶（phone onBlur 查重用）─────────────────────
/**
 * 依手機號（清洗後完整比對）查詢同 brand 客戶，上限 5 筆。
 * 空白或清洗後空字串直接回空陣列，不打 DB。
 */
export async function lookupCustomersByPhone(
  rawPhone: string,
): Promise<CustomerPhoneHit[]> {
  if (!rawPhone?.trim()) return [];

  const cleaned = rawPhone.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return [];

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data } = await supabase
    .from('customers')
    .select('id, code, name, phone')
    .eq('brand_id', brandId)
    .eq('phone', cleaned)
    .eq('is_active', true)
    .limit(5);

  return (data ?? []) as CustomerPhoneHit[];
}

/**
 * Russell 最在意的手機查重：查同 brand 是否已有「接待中（open）」的手卡用同支手機號。
 * 只擋 open 狀態（已轉 Lead / 已結案 / 未到訪的舊手卡不算重複，避免誤擋回頭客）。
 * 純查詢，不拋錯，呼叫端決定要不要要求二次確認。
 */
export async function checkOpenHandcardDuplicateByPhone(
  rawPhone: string,
  excludeId?: string,
): Promise<HandcardPhoneDuplicateHit[]> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return [];

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  let q = supabase
    .from('sales_handcards')
    .select('id, customer_name, assigned_rs_name, reception_date')
    .eq('brand_id', brandId)
    .eq('customer_phone', phone)
    .eq('status', 'open')
    .limit(5);
  if (excludeId) q = q.neq('id', excludeId);

  const { data, error } = await q;
  if (error) {
    console.error('[手卡查重] 查詢失敗（不擋建立）', error.message);
    return [];
  }
  return (data ?? []) as HandcardPhoneDuplicateHit[];
}

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

// ── 客戶建檔（C-21：手卡→查無客戶→自動建檔）─────────────────────────────────
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-()]/g, '').trim();
  return cleaned || null;
}

/** 沿用 master-data/customer-actions 的 C##### 流水碼慣例 */
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
    const m = /^C(\d+)$/.exec(row.code ?? '');
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `C${String(max + 1).padStart(5, '0')}`;
}

/**
 * C-21：依手卡客戶資訊 find-or-create 客戶主檔，回傳 customer_id。
 *  - 先用 phone（同 brand）找；找不到再用完整 name 找（無 phone 時的 fallback）
 *  - 都找不到 → INSERT 新客戶（external_source='sales_handcard'）
 * 連結客戶屬「加值」副作用，永遠不擋手卡建立：任何錯誤吞掉回 null。
 */
async function findOrCreateCustomerForHandcard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: Awaited<ReturnType<typeof getActiveScope>>,
  input: HandcardInput,
  userId: string,
): Promise<string | null> {
  try {
    const brand = scope.brand_id;
    const name = input.customer_name?.trim() || null;
    const phone = normalizePhone(input.customer_phone);
    if (!name && !phone) return null;

    // 1) phone 優先
    if (phone) {
      const { data } = await supabase
        .from('customers')
        .select('id')
        .eq('brand_id', brand)
        .eq('phone', phone)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    // 2) name fallback（僅在沒帶 phone 時，避免同名誤併）
    if (!phone && name) {
      const { data } = await supabase
        .from('customers')
        .select('id')
        .eq('brand_id', brand)
        .eq('name', name)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    // 3) 查無 → 自動建檔
    if (!name) return null; // 沒名字不建（customers.name NOT NULL）
    const code = await genCustomerCode(supabase, brand);
    const { data: created, error } = await supabase
      .from('customers')
      .insert({
        brand_id: brand,
        subsidiary_id: scope.subsidiary_id,
        code,
        name,
        type: 'individual',
        phone,
        email: input.customer_email?.trim() || null,
        is_active: true,
        external_source: 'sales_handcard',
        source_module: 'sales_handcard',
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[C-21 手卡建客] 自動建檔失敗（不影響手卡）', error.message);
      return null;
    }
    return created.id;
  } catch (e) {
    console.error('[C-21 手卡建客] 例外（不影響手卡）', e);
    return null;
  }
}

// ── 新增 ──────────────────────────────────────────────────────────────────
export async function createHandcard(
  input: HandcardInput,
  userId: string,
): Promise<HandcardRow> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // C-21：手卡建立時連動客戶主檔（查無則自動建檔），回填 customer_id。
  const customerId =
    input.customer_id ??
    (await findOrCreateCustomerForHandcard(supabase, scope, input, userId));

  const { data, error } = await supabase
    .from('sales_handcards')
    .insert({
      brand_id: scope.brand_id,
      created_by: userId,
      updated_by: userId,
      status: 'open',
      ...input,
      customer_id: customerId,
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

  // 2. 建 lead（手卡升格 → 銷售端，寫 sales_dormant_leads）
  const { data: lead, error: leadErr } = await supabase
    .from('sales_dormant_leads')
    .insert({
      brand_id: scope.brand_id,
      name: hc.customer_name,
      phone: hc.customer_phone,
      email: hc.customer_email,
      // LINE：繼承手卡的 line_user_id，讓休眠喚醒任務可以用 LINE 聯絡
      line_user_id: hc.line_user_id ?? null,
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
