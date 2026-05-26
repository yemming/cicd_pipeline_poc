'use server';

/**
 * Domain Helper — AI 拍駕照 → 客戶主檔 + 試駕 prefill
 *
 * 流程：
 *   scanDrivingLicense(formData)        Storage 上傳 + Gemini Vision + insert row + 同名警示
 *   saveReviewedDrivingLicense(...)     建客戶 / 連結到既有客戶 + 寫 customer.metadata.driving_license
 *   deleteDrivingLicenseScan(id)        刪 row + 刪 storage 檔
 *   listRecentDrivingLicenseScans()     給 /ai-curve/driving-license idle state 列表
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
  extractDrivingLicense,
  type DrivingLicenseSuggestions,
} from '@/lib/ai/driving-license';
import {
  createCustomerAction,
  type CustomerInput,
} from '@/lib/master-data/customer-actions';

const BUCKET = 'driving-licenses';
// signed URL 給足 10 年（POC）— 客戶詳情頁讀的時候會自己再簽一次新的
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type DuplicateCustomerCandidate = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  national_id: string | null;
  created_at: string;
  match_field: 'name' | 'national_id';
};

export type DrivingLicenseScanResult = {
  scanId: string;
  suggestions: DrivingLicenseSuggestions;
  imageSignedUrl: string;
  latencyMs: number;
  sizeBytes: number;
  mimeType: string;
  tokensIn: number;
  tokensOut: number;
  duplicateCandidates: DuplicateCustomerCandidate[];
};

/** 業務 review 後最終確認的 8 欄駕照值 */
export type ReviewedDrivingLicenseValues = {
  name: string;
  license_no: string;
  license_class: string;
  birthday: string;       // 原樣保留（民國 / 西元）；存入 customer.birthday 時會轉成 YYYY-MM-DD
  expires_at: string;     // 原樣保留；存入 customer.metadata.driving_license.expires_at
  gender: string;
  address: string;
  issued_by: string;
};

export type DrivingLicenseScanListItem = {
  id: string;
  size_bytes: number | null;
  mime_type: string;
  ai_suggestions: DrivingLicenseSuggestions;
  reviewed_values: ReviewedDrivingLicenseValues | null;
  reviewed_at: string | null;
  ai_latency_ms: number | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  duplicate_of_customer_id: string | null;
  imageSignedUrl: string;
};

// ─── 民國 / 西元日期轉 ISO ──────────────────────────────────────

/**
 * 把駕照上的日期字串轉成 ISO 'YYYY-MM-DD'，認不出回 null
 * 接受：
 *   "民國 80年01月15日" / "80/01/15" / "080.01.15"  → 民國 → +1911
 *   "1991/01/15" / "1991-01-15" / "西元1991年1月15日" → 西元
 */
function parseTaiwanDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.replace(/[年月]/g, '/').replace(/日/g, '').trim();
  // 抓三組數字
  const m = s.match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  let year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  // < 200 → 民國年
  if (year < 200) year += 1911;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// ─── 拍駕照 → AI → 入庫 → 同名警示 ──────────────────────────────

export async function scanDrivingLicense(
  formData: FormData,
): Promise<Result<DrivingLicenseScanResult>> {
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
    ai = await extractDrivingLicense(imgBuffer, mimeType);
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `AI 失敗：${(e as Error).message}` };
  }

  const { data: row, error: insErr } = await supabase
    .from('driving_license_scans')
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

  const name = ai.suggestions.name.value?.trim() || '';
  const duplicateCandidates = await findDuplicateCustomers(brandId, name);

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
  name: string,
): Promise<DuplicateCustomerCandidate[]> {
  if (!name) return [];
  const supabase = await createClient();

  const { data } = await supabase
    .from('customers')
    .select('id, code, name, phone, national_id, created_at')
    .eq('brand_id', brandId)
    .eq('name', name)
    .limit(5);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    phone: row.phone as string | null,
    national_id: row.national_id as string | null,
    created_at: row.created_at as string,
    match_field: 'name' as const,
  }));
}

// ─── 業務 review 完儲存 ──────────────────────────────────────────

export async function saveReviewedDrivingLicense(
  scanId: string,
  values: ReviewedDrivingLicenseValues,
  options: { linkToExistingCustomerId?: string } = {},
): Promise<Result<{ customerId: string; isNew: boolean }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const reviewedAt = new Date().toISOString();

  // (A) 連結到既有客戶
  if (options.linkToExistingCustomerId) {
    const customerId = options.linkToExistingCustomerId;
    const { error: updateScanErr } = await supabase
      .from('driving_license_scans')
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

    await appendDrivingLicenseToCustomerMetadata(customerId, scanId, values);
    after(() => ingestRecordInternal('customer', customerId));
    revalidatePath(`/admin/master-data/customers/${customerId}`);
    return { ok: true, data: { customerId, isNew: false } };
  }

  // (B) 建新客戶
  if (!values.name?.trim()) return { ok: false, error: '客戶姓名必填' };

  const birthdayISO = parseTaiwanDate(values.birthday);
  // 駕照上有的資訊塞 notes，方便沒打開 metadata 也看得到
  const noteLines = [
    values.license_class.trim() ? `駕照種類：${values.license_class.trim()}` : '',
    values.license_no.trim() ? `駕照號碼：${values.license_no.trim()}` : '',
    values.expires_at.trim() ? `駕照有效期：${values.expires_at.trim()}` : '',
    values.issued_by.trim() ? `發照單位：${values.issued_by.trim()}` : '',
  ].filter(Boolean);

  const customerInput: CustomerInput = {
    name: values.name.trim(),
    type: 'individual',
    phone: null, // 駕照沒有電話
    email: null,
    address: values.address.trim() || null,
    birthday: birthdayISO,
    notes: noteLines.length > 0 ? noteLines.join('\n') : null,
    source_module: 'driving_license_scan',
    is_active: true,
  };

  const created = await createCustomerAction(customerInput);
  if (!created.ok) return { ok: false, error: created.error };
  const customerId = created.data.id;

  // 撈 storage_path，回填到 customer.metadata
  const { data: scanRow } = await supabase
    .from('driving_license_scans')
    .select('storage_path')
    .eq('id', scanId)
    .single();

  const meta: Record<string, unknown> = {
    driving_license_storage_path: scanRow?.storage_path ?? null,
    driving_license_scans: [scanId],
    driving_license: {
      license_no: values.license_no.trim() || null,
      license_class: values.license_class.trim() || null,
      birthday_raw: values.birthday.trim() || null,
      expires_at: values.expires_at.trim() || null,
      gender: values.gender.trim() || null,
      issued_by: values.issued_by.trim() || null,
    },
  };

  const { error: updCustErr } = await supabase
    .from('customers')
    .update({ metadata: meta })
    .eq('id', customerId)
    .eq('brand_id', brandId);
  if (updCustErr) {
    console.warn(
      '[driving-license] update customer metadata 失敗:',
      updCustErr.message,
    );
  }

  const { error: updScanErr } = await supabase
    .from('driving_license_scans')
    .update({
      reviewed_decisions: values as unknown as Record<string, unknown>,
      reviewed_at: reviewedAt,
      customer_id: customerId,
    })
    .eq('id', scanId)
    .eq('brand_id', brandId);
  if (updScanErr) {
    console.warn('[driving-license] update scan 失敗:', updScanErr.message);
  }

  after(() => ingestRecordInternal('customer', customerId));
  revalidatePath('/admin/master-data/customers');
  revalidatePath(`/admin/master-data/customers/${customerId}`);
  return { ok: true, data: { customerId, isNew: true } };
}

async function appendDrivingLicenseToCustomerMetadata(
  customerId: string,
  scanId: string,
  values: ReviewedDrivingLicenseValues,
): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('customers')
    .select('metadata')
    .eq('id', customerId)
    .single();

  const existing = (data?.metadata as Record<string, unknown> | null) ?? {};
  const rawScans = existing.driving_license_scans;
  const scans = Array.isArray(rawScans) ? (rawScans as string[]) : [];
  if (!scans.includes(scanId)) scans.push(scanId);

  // 駕照資訊覆蓋（連到既有客戶通常是更新駕照）
  const next: Record<string, unknown> = {
    ...existing,
    driving_license_scans: scans,
    driving_license: {
      license_no: values.license_no.trim() || null,
      license_class: values.license_class.trim() || null,
      birthday_raw: values.birthday.trim() || null,
      expires_at: values.expires_at.trim() || null,
      gender: values.gender.trim() || null,
      issued_by: values.issued_by.trim() || null,
    },
  };

  await supabase.from('customers').update({ metadata: next }).eq('id', customerId);
}

// ─── 刪除 ────────────────────────────────────────────────────────

export async function deleteDrivingLicenseScan(
  scanId: string,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data: row, error: fetchErr } = await supabase
    .from('driving_license_scans')
    .select('id, storage_path')
    .eq('id', scanId)
    .eq('brand_id', brandId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: `查 scan 失敗：${fetchErr.message}` };
  if (!row) return { ok: false, error: '找不到該駕照紀錄' };

  if (row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }

  const { error: delErr } = await supabase
    .from('driving_license_scans')
    .delete()
    .eq('id', scanId)
    .eq('brand_id', brandId);

  if (delErr) return { ok: false, error: `刪 DB 失敗：${delErr.message}` };
  after(() => removeFromRag('driving_license', scanId));
  return { ok: true, data: { id: scanId } };
}

// ─── 列表 ────────────────────────────────────────────────────────

export async function listRecentDrivingLicenseScans(
  limit = 5,
): Promise<DrivingLicenseScanListItem[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data, error } = await supabase
    .from('driving_license_scans')
    .select(
      'id, storage_path, mime_type, size_bytes, ai_suggestions, reviewed_decisions, reviewed_at, ai_latency_ms, created_at, customer_id, duplicate_of_customer_id',
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // 補撈客戶名稱
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

  const items: DrivingLicenseScanListItem[] = [];
  for (const row of data) {
    const rd = row.reviewed_decisions as unknown;
    const reviewed_values =
      rd && typeof rd === 'object' && Object.keys(rd as object).length > 0
        ? (rd as ReviewedDrivingLicenseValues)
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
      ai_suggestions: row.ai_suggestions as unknown as DrivingLicenseSuggestions,
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
