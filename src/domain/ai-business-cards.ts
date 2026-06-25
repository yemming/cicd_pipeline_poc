'use server';

/**
 * Domain Helper — AI 拍名片 → 客戶主檔
 *
 * 流程：
 *   scanBusinessCard(formData)      Storage 上傳 + Gemini Vision + insert row + 去重檢查
 *   saveReviewedBusinessCard(...)   建客戶 / 連結到既有客戶 + 寫 customer.metadata
 *   deleteBusinessCardScan(id)      刪 row + 刪 storage 檔
 *   listRecentBusinessCardScans()   給 /ai-curve/business-card idle state 列表
 */

import 'server-only';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { getCurrentUserContext, requirePermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { ingestRecordInternal, removeFromRag } from '@/domain/rag-ingest';
import {
  extractBusinessCard,
  type BusinessCardSuggestions,
} from '@/lib/ai/business-card';
import {
  createCustomerAction,
  type CustomerInput,
} from '@/lib/master-data/customer-actions';

const BUCKET = 'business-cards';
// signed URL 給足 10 年（POC）— 客戶詳情頁讀的時候會自己再簽一次新的
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type DuplicateCustomerCandidate = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  match_field: 'phone' | 'email' | 'both';
};

export type BusinessCardScanResult = {
  scanId: string;
  suggestions: BusinessCardSuggestions;
  imageSignedUrl: string;
  latencyMs: number;
  sizeBytes: number;
  mimeType: string;
  tokensIn: number;
  tokensOut: number;
  duplicateCandidates: DuplicateCustomerCandidate[];
};

/** 業務 review 後最終確認的 9 欄名片值 */
export type ReviewedBusinessCardValues = {
  name: string;
  company: string;
  title: string;
  phone_mobile: string;
  phone_office: string;
  email: string;
  address: string;
  line_id: string;
  notes: string;
};

export type BusinessCardScanListItem = {
  id: string;
  size_bytes: number | null;
  mime_type: string;
  ai_suggestions: BusinessCardSuggestions;
  reviewed_values: ReviewedBusinessCardValues | null;
  reviewed_at: string | null;
  ai_latency_ms: number | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  duplicate_of_customer_id: string | null;
  imageSignedUrl: string;
};

// ─── 拍名片 → AI → 入庫 → 去重 ──────────────────────────────────

export async function scanBusinessCard(
  formData: FormData,
): Promise<Result<BusinessCardScanResult>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);

  const image = formData.get('image');
  if (!(image instanceof File)) return { ok: false, error: '缺 image file' };

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: '未登入' };

  const arrayBuf = await image.arrayBuffer();
  const imgBuffer = Buffer.from(arrayBuf);
  const sizeBytes = imgBuffer.byteLength;
  const mimeType = image.type || 'image/jpeg';
  const ext = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
      ? 'webp'
      : mimeType.includes('heic')
        ? 'heic'
        : 'jpg';

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${brandId}/${ts}-${rand}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, imgBuffer, { contentType: mimeType, upsert: false });
  if (upErr) return { ok: false, error: `Storage 上傳失敗：${upErr.message}` };

  let ai;
  try {
    ai = await extractBusinessCard(imgBuffer, mimeType);
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `AI 失敗：${(e as Error).message}` };
  }

  const { data: row, error: insErr } = await supabase
    .from('business_card_scans')
    .insert({
      brand_id: brandId,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      ai_suggestions: ai.suggestions as unknown as Record<string, unknown>,
      ai_processed_at: new Date().toISOString(),
      ai_latency_ms: ai.latencyMs,
      ai_tokens_in: ai.tokensIn,
      ai_tokens_out: ai.tokensOut,
      created_by: ctx.userId,
    })
    .select('id')
    .single();

  if (insErr || !row) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `寫 DB 失敗：${insErr?.message ?? 'unknown'}` };
  }

  const phone =
    ai.suggestions.phone_mobile.value?.trim() ||
    ai.suggestions.phone_office.value?.trim() ||
    '';
  const email = ai.suggestions.email.value?.trim() || '';
  const duplicateCandidates = await findDuplicateCustomers(brandId, phone, email);

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  return {
    ok: true,
    data: {
      scanId: row.id,
      suggestions: ai.suggestions,
      imageSignedUrl: signed?.signedUrl ?? '',
      latencyMs: ai.latencyMs,
      sizeBytes,
      mimeType,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      duplicateCandidates,
    },
  };
}

async function findDuplicateCustomers(
  brandId: string,
  phone: string,
  email: string,
): Promise<DuplicateCustomerCandidate[]> {
  if (!phone && !email) return [];
  const supabase = await createClient();
  const ors: string[] = [];
  if (phone) ors.push(`phone.eq.${phone}`);
  if (email) ors.push(`email.eq.${email}`);

  const { data } = await supabase
    .from('customers')
    .select('id, code, name, phone, email, created_at')
    .eq('brand_id', brandId)
    .or(ors.join(','))
    .limit(5);

  return (data ?? []).map((row) => {
    const matchPhone = !!(phone && row.phone === phone);
    const matchEmail = !!(email && row.email === email);
    const match_field: 'phone' | 'email' | 'both' =
      matchPhone && matchEmail ? 'both' : matchPhone ? 'phone' : 'email';
    return {
      id: row.id as string,
      code: row.code as string,
      name: row.name as string,
      phone: row.phone as string | null,
      email: row.email as string | null,
      created_at: row.created_at as string,
      match_field,
    };
  });
}

// ─── 業務 review 完儲存 ──────────────────────────────────────────

export async function saveReviewedBusinessCard(
  scanId: string,
  values: ReviewedBusinessCardValues,
  options: { linkToExistingCustomerId?: string; alsoOpenLead?: boolean } = {},
): Promise<Result<{ customerId: string; leadId: string | null; isNew: boolean }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const reviewedAt = new Date().toISOString();

  // (A) 連結到既有客戶
  if (options.linkToExistingCustomerId) {
    const customerId = options.linkToExistingCustomerId;
    const { error: updateScanErr } = await supabase
      .from('business_card_scans')
      .update({
        reviewed_decisions: values as unknown as Record<string, unknown>,
        reviewed_at: reviewedAt,
        duplicate_of_customer_id: customerId,
      })
      .eq('id', scanId)
      .eq('brand_id', brandId);
    if (updateScanErr) {
      return { ok: false, error: `寫掃描紀錄失敗：${updateScanErr.message}` };
    }

    await appendScanToCustomerMetadata(customerId, scanId);

    // 連結到既有客戶時也可以順手加一張商機（業務情境：老客戶換新名片＋有新需求）
    let leadId: string | null = null;
    if (options.alsoOpenLead) {
      const ctx = await getCurrentUserContext();
      const r = await createLeadForCustomer(
        customerId,
        values,
        ctx.userId ?? null,
      );
      if (r.ok) leadId = r.leadId;
    }

    after(() => ingestRecordInternal('business_card', scanId));
    after(() => ingestRecordInternal('customer', customerId));
    if (leadId) after(() => ingestRecordInternal('sales_lead', leadId));
    revalidatePath(`/admin/master-data/customers/${customerId}`);
    return { ok: true, data: { customerId, leadId, isNew: false } };
  }

  // (B) 建新客戶
  if (!values.name?.trim()) return { ok: false, error: '客戶姓名必填' };

  // 名片上 company 有寫 → 認定 corporate（公司客戶），否則 individual
  const isCorporate = !!values.company.trim();

  // notes 把名片上沒對應到 customers core column 的欄位整理成多行文字塞進去
  const notesLines = [
    isCorporate ? `公司：${values.company.trim()}` : '',
    values.title.trim() ? `職稱：${values.title.trim()}` : '',
    values.phone_office.trim() && values.phone_office.trim() !== values.phone_mobile.trim()
      ? `公司電話：${values.phone_office.trim()}`
      : '',
    values.line_id.trim() ? `LINE：${values.line_id.trim()}` : '',
    values.notes.trim(),
  ].filter(Boolean);

  const customerInput: CustomerInput = {
    name: values.name.trim(),
    type: isCorporate ? 'corporate' : 'individual',
    phone: values.phone_mobile.trim() || values.phone_office.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    notes: notesLines.length > 0 ? notesLines.join('\n') : null,
    source_module: 'business_card_scan',
    is_active: true,
  };

  const created = await createCustomerAction(customerInput);
  if (!created.ok) return { ok: false, error: created.error };
  const customerId = created.data.id;

  // 撈 storage_path，回填到 customer.metadata
  const { data: scanRow } = await supabase
    .from('business_card_scans')
    .select('storage_path')
    .eq('id', scanId)
    .single();

  const meta: Record<string, unknown> = {
    business_card_storage_path: scanRow?.storage_path ?? null,
    business_card_scans: [scanId],
    business_card_extra: {
      company: values.company.trim() || null,
      title: values.title.trim() || null,
      line_id: values.line_id.trim() || null,
      phone_office: values.phone_office.trim() || null,
    },
  };

  const { error: updCustErr } = await supabase
    .from('customers')
    .update({ metadata: meta })
    .eq('id', customerId)
    .eq('brand_id', brandId);
  if (updCustErr) {
    console.warn(
      '[business-card] update customer metadata 失敗:',
      updCustErr.message,
    );
  }

  const { error: updScanErr } = await supabase
    .from('business_card_scans')
    .update({
      reviewed_decisions: values as unknown as Record<string, unknown>,
      reviewed_at: reviewedAt,
      customer_id: customerId,
    })
    .eq('id', scanId)
    .eq('brand_id', brandId);
  if (updScanErr) {
    console.warn('[business-card] update scan 失敗:', updScanErr.message);
  }

  let leadId: string | null = null;
  if (options.alsoOpenLead) {
    const ctx = await getCurrentUserContext();
    const r = await createLeadForCustomer(
      customerId,
      values,
      ctx.userId ?? null,
    );
    if (r.ok) leadId = r.leadId;
    // 建商機失敗不擋客戶建立、frontend 自己決定要不要提示
  }

  after(() => ingestRecordInternal('business_card', scanId));
  after(() => ingestRecordInternal('customer', customerId));
  if (leadId) after(() => ingestRecordInternal('sales_lead', leadId));

  revalidatePath('/admin/master-data/customers');
  revalidatePath(`/admin/master-data/customers/${customerId}`);
  return { ok: true, data: { customerId, leadId, isNew: true } };
}

// ─── 建 sales_leads row（從名片建客戶後順手開商機） ────────────

async function createLeadForCustomer(
  customerId: string,
  values: ReviewedBusinessCardValues,
  userId: string | null,
): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  // 沿用 sales-dormant-leads-actions.ts 的 code pattern：L{YYYYMMDD}{seq}
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const prefix = `L${y}${m}${d}`;
  const { count } = await supabase
    .from('sales_dormant_leads')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .like('code', `${prefix}%`);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const code = `${prefix}${seq}`;

  const noteLines = [
    values.company.trim() ? `名片公司：${values.company.trim()}` : '',
    values.title.trim() ? `職稱：${values.title.trim()}` : '',
    values.line_id.trim() ? `LINE：${values.line_id.trim()}` : '',
    values.notes.trim() || '',
  ].filter(Boolean);

  const { data, error } = await supabase
    .from('sales_dormant_leads')
    .insert({
      brand_id: brandId,
      code,
      name: values.name.trim(),
      phone: values.phone_mobile.trim() || values.phone_office.trim() || null,
      email: values.email.trim() || null,
      habc: 'B', // 預設 B 級（業務後續可在 lead 詳情頁調）
      source: 'showroom', // 展廳接待名片場景
      // kind 欄已移除（sales_dormant_leads 是 sales 專表）
      converted_customer_id: customerId,
      note: noteLines.length > 0 ? noteLines.join('\n') : null,
      is_active: true,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'unknown' };
  }
  return { ok: true, leadId: data.id as string };
}

async function appendScanToCustomerMetadata(
  customerId: string,
  scanId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('customers')
    .select('metadata')
    .eq('id', customerId)
    .single();

  const existing = (data?.metadata as Record<string, unknown> | null) ?? {};
  const rawScans = existing.business_card_scans;
  const scans = Array.isArray(rawScans) ? (rawScans as string[]) : [];
  if (scans.includes(scanId)) return;
  scans.push(scanId);
  await supabase
    .from('customers')
    .update({ metadata: { ...existing, business_card_scans: scans } })
    .eq('id', customerId);
}

// ─── 刪除 ────────────────────────────────────────────────────────

export async function deleteBusinessCardScan(
  scanId: string,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data: row, error: fetchErr } = await supabase
    .from('business_card_scans')
    .select('id, storage_path')
    .eq('id', scanId)
    .eq('brand_id', brandId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: `查 scan 失敗：${fetchErr.message}` };
  if (!row) return { ok: false, error: '找不到該名片紀錄' };

  if (row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }

  const { error: delErr } = await supabase
    .from('business_card_scans')
    .delete()
    .eq('id', scanId)
    .eq('brand_id', brandId);

  if (delErr) return { ok: false, error: `刪 DB 失敗：${delErr.message}` };
  after(() => removeFromRag('business_card', scanId));
  return { ok: true, data: { id: scanId } };
}

// ─── 列表 ────────────────────────────────────────────────────────

export async function listRecentBusinessCardScans(
  limit = 5,
): Promise<BusinessCardScanListItem[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data, error } = await supabase
    .from('business_card_scans')
    .select(
      'id, storage_path, mime_type, size_bytes, ai_suggestions, reviewed_decisions, reviewed_at, ai_latency_ms, created_at, customer_id, duplicate_of_customer_id',
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // 補撈客戶名稱（customer_id 或 duplicate_of_customer_id 都算）
  const customerIds = Array.from(
    new Set(
      data
        .flatMap((r) => [r.customer_id, r.duplicate_of_customer_id])
        .filter((v): v is string => !!v),
    ),
  );
  const customerMap: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds);
    for (const c of customers ?? []) customerMap[c.id as string] = c.name as string;
  }

  const items: BusinessCardScanListItem[] = [];
  for (const row of data) {
    const rd = row.reviewed_decisions as unknown;
    const reviewed_values =
      rd && typeof rd === 'object' && Object.keys(rd as object).length > 0
        ? (rd as ReviewedBusinessCardValues)
        : null;
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL);
    const linkedId =
      (row.customer_id as string | null) ??
      (row.duplicate_of_customer_id as string | null);
    items.push({
      id: row.id as string,
      size_bytes: row.size_bytes as number | null,
      mime_type: row.mime_type as string,
      ai_suggestions: row.ai_suggestions as unknown as BusinessCardSuggestions,
      reviewed_values,
      reviewed_at: row.reviewed_at as string | null,
      ai_latency_ms: row.ai_latency_ms as number | null,
      created_at: row.created_at as string,
      customer_id: row.customer_id as string | null,
      customer_name: linkedId ? (customerMap[linkedId] ?? null) : null,
      duplicate_of_customer_id: row.duplicate_of_customer_id as string | null,
      imageSignedUrl: signed?.signedUrl ?? '',
    });
  }
  return items;
}
