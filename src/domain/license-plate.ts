'use server';

/**
 * 車辨 Phase A — 拍照 → Gemini Vision OCR → 查 customer_vehicles → 回客戶資料
 */

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getActiveScope } from '@/lib/scope/active-scope';
import { getCurrentUserContext, requirePermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import {
  recognizeLicensePlate,
  normalizePlate,
} from '@/lib/ai/license-plate';
import { getDesmoStatus, type DesmoStatus } from '@/domain/desmo.constants';

const BUCKET = 'license-plates';
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type MatchedVehicleInfo = {
  vehicle_id: string;
  customer_id: string;
  license_plate: string;
  vin: string | null;
  vehicle_model_name: string | null;
  manufactured_year: number | null;
  current_mileage: number | null;
  last_service_date: string | null;
  next_service_due_date: string | null;
  /** C-26 Desmo 汽門保養到期 */
  desmo_service_due_date: string | null;
  desmo_service_due_mileage: number | null;
  desmo_status: DesmoStatus | null;
  warranty_until: string | null;
  insurance_until: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  /** 近 3 筆工單摘要 */
  recent_ros: { ro_code: string; issue_date: string | null; status: string; total: number | null }[];
};

export type ScanLicensePlateResult = {
  scanId: string;
  plate: string;
  plateNormalized: string;
  confidence: number;
  evidence: string;
  imageSignedUrl: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  matched: MatchedVehicleInfo | null;
  ambiguous: MatchedVehicleInfo[]; // 同車牌多筆（極少見）
};

export type LicensePlateScanListItem = {
  id: string;
  ai_plate: string | null;
  ai_plate_normalized: string | null;
  ai_confidence: number | null;
  matched_customer_id: string | null;
  matched_vehicle_id: string | null;
  matched_customer_name: string | null;
  ai_latency_ms: number | null;
  created_at: string;
  imageSignedUrl: string;
};

// ─── scan ───────────────────────────────────────────────────

export async function scanLicensePlate(
  formData: FormData,
): Promise<Result<ScanLicensePlateResult>> {
  await requirePermission(PERMISSIONS.CUSTOMER_VIEW);

  const image = formData.get('image');
  if (!(image instanceof File)) return { ok: false, error: '缺 image file' };

  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: '未登入' };

  const buf = Buffer.from(await image.arrayBuffer());
  const sizeBytes = buf.byteLength;
  const mimeType = image.type || 'image/jpeg';
  const ext = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
      ? 'webp'
      : 'jpg';

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${brandId}/${ts}-${rand}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, { contentType: mimeType, upsert: false });
  if (upErr) return { ok: false, error: `Storage 上傳失敗：${upErr.message}` };

  // Gemini OCR
  let ai;
  try {
    ai = await recognizeLicensePlate(buf, mimeType);
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `AI 失敗：${(e as Error).message}` };
  }

  const plateNorm = normalizePlate(ai.plate);

  // 查 customer_vehicles — 用 normalized 比對（容忍 dash / 空格不同）
  // pg_trgm 模糊比對：直接 ILIKE %X% 也行、但 normalized eq 最準
  let matched: MatchedVehicleInfo | null = null;
  let ambiguous: MatchedVehicleInfo[] = [];
  if (plateNorm.length >= 4) {
    // 撈所有車輛、JS 端 normalize 比對（DB 沒 normalized column 存著、現算）
    const { data: candidates } = await supabase
      .from('customer_vehicles')
      .select(
        'id, customer_id, license_plate, vin, manufactured_year, current_mileage, last_service_date, next_service_due_date, desmo_service_due_date, desmo_service_due_mileage, warranty_until, insurance_until, model_id, customers!inner(name, phone, email)',
      )
      .eq('brand_id', brandId)
      .not('license_plate', 'is', null);

    type Cand = {
      id: string;
      customer_id: string;
      license_plate: string;
      vin: string | null;
      manufactured_year: number | null;
      current_mileage: number | null;
      last_service_date: string | null;
      next_service_due_date: string | null;
      desmo_service_due_date: string | null;
      desmo_service_due_mileage: number | null;
      warranty_until: string | null;
      insurance_until: string | null;
      model_id: string | null;
      customers: { name: string; phone: string | null; email: string | null };
    };
    const matches = ((candidates ?? []) as unknown as Cand[]).filter(
      (c) => normalizePlate(c.license_plate ?? '') === plateNorm,
    );

    if (matches.length > 0) {
      // 補車型 + 近 3 筆 RO
      const modelIds = Array.from(
        new Set(matches.map((m) => m.model_id).filter(Boolean) as string[]),
      );
      const modelMap: Record<string, string> = {};
      if (modelIds.length > 0) {
        const { data: models } = await supabase
          .from('vehicle_models')
          .select('id, display_name')
          .in('id', modelIds);
        for (const m of models ?? [])
          modelMap[m.id as string] = m.display_name as string;
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const enriched: MatchedVehicleInfo[] = await Promise.all(
        matches.map(async (m) => {
          const { data: ros } = await supabase
            .from('repair_orders')
            .select('ro_code, issue_date, status, lines_total')
            .eq('vehicle_id', m.id)
            .order('issue_date', { ascending: false })
            .limit(3);
          return {
            vehicle_id: m.id,
            customer_id: m.customer_id,
            license_plate: m.license_plate ?? '',
            vin: m.vin,
            vehicle_model_name: m.model_id ? (modelMap[m.model_id] ?? null) : null,
            manufactured_year: m.manufactured_year,
            current_mileage: m.current_mileage,
            last_service_date: m.last_service_date,
            next_service_due_date: m.next_service_due_date,
            desmo_service_due_date: m.desmo_service_due_date,
            desmo_service_due_mileage:
              m.desmo_service_due_mileage != null
                ? Number(m.desmo_service_due_mileage)
                : null,
            desmo_status: getDesmoStatus({
              dueDate: m.desmo_service_due_date,
              dueMileage:
                m.desmo_service_due_mileage != null
                  ? Number(m.desmo_service_due_mileage)
                  : null,
              currentMileage: m.current_mileage,
              todayStr,
            }),
            warranty_until: m.warranty_until,
            insurance_until: m.insurance_until,
            customer_name: m.customers.name,
            customer_phone: m.customers.phone,
            customer_email: m.customers.email,
            recent_ros: (ros ?? []).map((r) => ({
              ro_code: r.ro_code as string,
              issue_date: r.issue_date as string | null,
              status: r.status as string,
              total: r.lines_total as number | null,
            })),
          };
        }),
      );

      if (enriched.length === 1) matched = enriched[0];
      else {
        matched = enriched[0];
        ambiguous = enriched.slice(1);
      }
    }
  }

  // 寫 DB
  const { data: row, error: insErr } = await supabase
    .from('license_plate_scans')
    .insert({
      brand_id: brandId,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      ai_plate: ai.plate,
      ai_plate_normalized: plateNorm,
      ai_confidence: ai.confidence,
      ai_latency_ms: ai.latencyMs,
      ai_tokens_in: ai.tokensIn,
      ai_tokens_out: ai.tokensOut,
      matched_vehicle_id: matched?.vehicle_id ?? null,
      matched_customer_id: matched?.customer_id ?? null,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (insErr || !row) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: `寫 DB 失敗：${insErr?.message ?? 'unknown'}` };
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  return {
    ok: true,
    data: {
      scanId: row.id as string,
      plate: ai.plate,
      plateNormalized: plateNorm,
      confidence: ai.confidence,
      evidence: ai.evidence,
      imageSignedUrl: signed?.signedUrl ?? '',
      latencyMs: ai.latencyMs,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      matched,
      ambiguous,
    },
  };
}

// ─── 重新載入歷史 scan（給「最近辨識」點擊重看結果用） ────

export async function loadScanResult(
  scanId: string,
): Promise<Result<ScanLicensePlateResult>> {
  await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data: row } = await supabase
    .from('license_plate_scans')
    .select(
      'id, storage_path, ai_plate, ai_plate_normalized, ai_confidence, ai_latency_ms, ai_tokens_in, ai_tokens_out, matched_vehicle_id',
    )
    .eq('id', scanId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!row) return { ok: false, error: '找不到該掃描' };

  // 重新撈 matched info（reproduce ScanLicensePlateResult 結構）
  let matched: MatchedVehicleInfo | null = null;
  if (row.matched_vehicle_id) {
    const { data: v } = await supabase
      .from('customer_vehicles')
      .select(
        'id, customer_id, license_plate, vin, manufactured_year, current_mileage, last_service_date, next_service_due_date, desmo_service_due_date, desmo_service_due_mileage, warranty_until, insurance_until, model_id, customers!inner(name, phone, email)',
      )
      .eq('id', row.matched_vehicle_id as string)
      .maybeSingle();

    type Cand = {
      id: string;
      customer_id: string;
      license_plate: string;
      vin: string | null;
      manufactured_year: number | null;
      current_mileage: number | null;
      last_service_date: string | null;
      next_service_due_date: string | null;
      desmo_service_due_date: string | null;
      desmo_service_due_mileage: number | null;
      warranty_until: string | null;
      insurance_until: string | null;
      model_id: string | null;
      customers: { name: string; phone: string | null; email: string | null };
    };
    const candidate = v as unknown as Cand | null;

    if (candidate) {
      let modelName: string | null = null;
      if (candidate.model_id) {
        const { data: m } = await supabase
          .from('vehicle_models')
          .select('display_name')
          .eq('id', candidate.model_id)
          .maybeSingle();
        modelName = (m?.display_name as string) ?? null;
      }
      const { data: ros } = await supabase
        .from('repair_orders')
        .select('ro_code, issue_date, status, lines_total')
        .eq('vehicle_id', candidate.id)
        .order('issue_date', { ascending: false })
        .limit(3);

      matched = {
        vehicle_id: candidate.id,
        customer_id: candidate.customer_id,
        license_plate: candidate.license_plate,
        vin: candidate.vin,
        vehicle_model_name: modelName,
        manufactured_year: candidate.manufactured_year,
        current_mileage: candidate.current_mileage,
        last_service_date: candidate.last_service_date,
        next_service_due_date: candidate.next_service_due_date,
        desmo_service_due_date: candidate.desmo_service_due_date,
        desmo_service_due_mileage:
          candidate.desmo_service_due_mileage != null
            ? Number(candidate.desmo_service_due_mileage)
            : null,
        desmo_status: getDesmoStatus({
          dueDate: candidate.desmo_service_due_date,
          dueMileage:
            candidate.desmo_service_due_mileage != null
              ? Number(candidate.desmo_service_due_mileage)
              : null,
          currentMileage: candidate.current_mileage,
          todayStr: new Date().toISOString().slice(0, 10),
        }),
        warranty_until: candidate.warranty_until,
        insurance_until: candidate.insurance_until,
        customer_name: candidate.customers.name,
        customer_phone: candidate.customers.phone,
        customer_email: candidate.customers.email,
        recent_ros: (ros ?? []).map((r) => ({
          ro_code: r.ro_code as string,
          issue_date: r.issue_date as string | null,
          status: r.status as string,
          total: r.lines_total as number | null,
        })),
      };
    }
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL);

  return {
    ok: true,
    data: {
      scanId: row.id as string,
      plate: (row.ai_plate as string | null) ?? '',
      plateNormalized: (row.ai_plate_normalized as string | null) ?? '',
      confidence: Number(row.ai_confidence ?? 0),
      evidence: '（歷史紀錄、無原始 evidence 描述）',
      imageSignedUrl: signed?.signedUrl ?? '',
      latencyMs: (row.ai_latency_ms as number | null) ?? 0,
      tokensIn: (row.ai_tokens_in as number | null) ?? 0,
      tokensOut: (row.ai_tokens_out as number | null) ?? 0,
      matched,
      ambiguous: [],
    },
  };
}

// ─── list ─────────────────────────────────────────────────

export async function listRecentLicensePlateScans(
  limit = 10,
): Promise<LicensePlateScanListItem[]> {
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data } = await supabase
    .from('license_plate_scans')
    .select(
      'id, storage_path, ai_plate, ai_plate_normalized, ai_confidence, matched_customer_id, matched_vehicle_id, ai_latency_ms, created_at',
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as Array<{
    id: string;
    storage_path: string;
    ai_plate: string | null;
    ai_plate_normalized: string | null;
    ai_confidence: number | null;
    matched_customer_id: string | null;
    matched_vehicle_id: string | null;
    ai_latency_ms: number | null;
    created_at: string;
  }>;

  // 補客戶名
  const customerIds = Array.from(
    new Set(rows.map((r) => r.matched_customer_id).filter(Boolean) as string[]),
  );
  const nameMap: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds);
    for (const c of customers ?? []) nameMap[c.id as string] = c.name as string;
  }

  const items: LicensePlateScanListItem[] = [];
  for (const r of rows) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(r.storage_path, SIGNED_URL_TTL);
    items.push({
      id: r.id,
      ai_plate: r.ai_plate,
      ai_plate_normalized: r.ai_plate_normalized,
      ai_confidence: r.ai_confidence,
      matched_customer_id: r.matched_customer_id,
      matched_vehicle_id: r.matched_vehicle_id,
      matched_customer_name: r.matched_customer_id
        ? (nameMap[r.matched_customer_id] ?? null)
        : null,
      ai_latency_ms: r.ai_latency_ms,
      created_at: r.created_at,
      imageSignedUrl: signed?.signedUrl ?? '',
    });
  }
  return items;
}

// ─── delete ───────────────────────────────────────────────

export async function deleteLicensePlateScan(
  id: string,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { brand_id: brandId } = await getActiveScope();

  const { data: row } = await supabase
    .from('license_plate_scans')
    .select('storage_path')
    .eq('id', id)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (!row) return { ok: false, error: '找不到該掃描' };

  if (row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path as string]);
  }
  const { error } = await supabase
    .from('license_plate_scans')
    .delete()
    .eq('id', id)
    .eq('brand_id', brandId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}
