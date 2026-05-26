/**
 * 中古車評估鑑價 domain helper — server-only。
 *
 * 服務：
 *   - /usedcar/evaluation（RS06 5-tab 評估單，建立與儲存）
 *   - /usedcar/evaluations（歷史評估列表）
 *   - /admin/approvals/tradein（簽核 in/out）
 *
 * 架構：Typed Core + JSONB Metadata pattern。
 * DB 表：used_car_evaluations（2026-05-17 migration）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createUsedCar } from "@/domain/used-car-inventory";
import type { CreateUsedCarInput } from "@/domain/used-car-inventory";

// 純常數抽到 .constants（無 server 相依），client component 可直接 import 那支；
// 此處 import 供本檔型別使用，並 re-export 讓既有 server 端 importer 不用改路徑。
import {
  EVAL_STATUSES,
  STATUS_LABELS,
  CONDITION_GRADES,
  type EvaluationStatus,
  type ConditionGrade,
} from "./used-car-evaluations.constants";

export { EVAL_STATUSES, STATUS_LABELS, CONDITION_GRADES };
export type { EvaluationStatus, ConditionGrade };

// ── Row 型別（對應 DB 欄位）──
export type UsedCarEvaluationRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  eval_no: string | null;
  vin: string | null;
  license_plate: string | null;
  brand_name: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  displacement: string | null;
  mileage: number | null;
  appraiser: string | null;
  evaluator_id: string | null;
  customer_id: string | null;
  condition_grade: ConditionGrade | null;
  estimated_value: number | null;
  decision: string | null;
  conclusion: string | null;
  status: EvaluationStatus;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  equipment_jsonb: Record<string, unknown>;
  pricing_jsonb: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// ── 帶 customer join 的 row（detail / list 用）──
export type UsedCarEvaluationWithCustomer = UsedCarEvaluationRow & {
  customer?: { id: string; name: string; phone: string | null } | null;
};

// ── Filter ──
export type EvaluationFilter = {
  brandId: string;
  status?: EvaluationStatus;
  grade?: ConditionGrade;
  search?: string;
};

// ── 列表查詢 ──
export async function listEvaluations(filter: EvaluationFilter): Promise<{
  rows: UsedCarEvaluationWithCustomer[];
  totalCount: number;
}> {
  const supabase = await createClient();
  let q = supabase
    .from("used_car_evaluations")
    .select("*, customer:customers(id,name,phone)", { count: "exact" })
    .eq("brand_id", filter.brandId)
    .order("created_at", { ascending: false });

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.grade) q = q.eq("condition_grade", filter.grade);
  if (filter.search) {
    const term = `%${filter.search}%`;
    q = q.or(`model.ilike.${term},vin.ilike.${term},license_plate.ilike.${term},eval_no.ilike.${term}`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(`listEvaluations: ${error.message}`);
  return {
    rows: (data ?? []) as UsedCarEvaluationWithCustomer[],
    totalCount: count ?? 0,
  };
}

// ── 單筆 ──
export async function fetchEvaluationById(
  id: string
): Promise<UsedCarEvaluationWithCustomer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_evaluations")
    .select("*, customer:customers(id,name,phone)")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as UsedCarEvaluationWithCustomer;
}

// ── Create input ──
export type CreateEvaluationInput = {
  brand_id: string;
  eval_no?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  brand_name?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  displacement?: string | null;
  mileage?: number | null;
  appraiser?: string | null;
  evaluator_id?: string | null;
  customer_id?: string | null;
  condition_grade?: ConditionGrade | null;
  estimated_value?: number | null;
  decision?: string | null;
  conclusion?: string | null;
  status?: EvaluationStatus;
  equipment_jsonb?: Record<string, unknown>;
  pricing_jsonb?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

// ── 建立 ──
export async function createEvaluation(
  input: CreateEvaluationInput
): Promise<{ id: string }> {
  const supabase = await createClient();
  const payload = { ...input, status: input.status ?? "draft" };
  const { data, error } = await supabase
    .from("used_car_evaluations")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(`createEvaluation: ${error.message}`);
  return data as { id: string };
}

// ── 更新（draft 時可改、submitted 後僅 admin 可改）──
export async function updateEvaluation(
  id: string,
  patch: Partial<CreateEvaluationInput>
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_evaluations")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(`updateEvaluation: ${error.message}`);
  return data as { id: string };
}

// ── 送簽（draft → submitted）──
export async function submitEvaluation(id: string): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_evaluations")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft") // 只有 draft 可送簽
    .select("id")
    .single();
  if (error) throw new Error(`submitEvaluation: ${error.message}`);
  if (!data) throw new Error("submitEvaluation: 評估單必須為 draft 才能送簽");
  return data as { id: string };
}

// ── 估價單 pricing_jsonb 數字解析 helper（字串 → number，空 / 非數回 0）──
function pNum(jsonb: Record<string, unknown> | null | undefined, key: string): number {
  const v = jsonb?.[key];
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 純函式：把估價單 row 映射成建立中古庫存的 input（§proposal §2 對映表）。
 *
 * 核心 3 條：estimated_value → acquisition_price、pricing_jsonb.pMarket → listing_price、
 * condition_grade 同 enum 直帶。cost = 收購價 + 整備規費；margin 只在 listing/cost 皆有才算否則 null。
 * 雙向關聯：metadata.source_evaluation_id = eval.id（兼任冪等鍵）。
 */
export function mapEvaluationToUsedCar(
  ev: UsedCarEvaluationRow,
  approverId: string | null
): CreateUsedCarInput {
  // acquisition_price = 收購估價
  const acquisitionPrice = ev.estimated_value ?? null;

  // 整備 / 規費聚合（pricing_jsonb 內的字串需 Number()）
  const pricing = ev.pricing_jsonb ?? null;
  const reconCost =
    pNum(pricing, "pComm") +
    pNum(pricing, "pAdmin") +
    pNum(pricing, "pTire") +
    pNum(pricing, "pPaint") +
    pNum(pricing, "pRepair") +
    pNum(pricing, "pWarranty");

  // cost = 收購價 + 整備規費；無 acquisition_price 時 cost 留 null（避免把純整備費當成本）
  const cost = acquisitionPrice != null ? acquisitionPrice + reconCost : null;

  // listing_price = 市場行情 pMarket（空 → null，待整備後人工定價）
  const pMarketRaw = pricing?.["pMarket"];
  const listingPrice =
    pMarketRaw == null || pMarketRaw === ""
      ? null
      : (() => {
          const n = Number(pMarketRaw);
          return Number.isFinite(n) ? n : null;
        })();

  // margin 只在 listing_price 與 cost 皆有時計算，否則 null（不亂塞 0）
  const margin =
    listingPrice != null && cost != null ? listingPrice - cost : null;

  // model_display_name NN：eval.model → brand_name + model → fallback
  const modelDisplayName =
    ev.model?.trim() ||
    [ev.brand_name?.trim(), "未指定車款"].filter(Boolean).join(" ") ||
    "（未指定）";

  return {
    brand_id: ev.brand_id,
    organization_id: ev.organization_id,
    vin: ev.vin?.trim() ? ev.vin : null, // 空則 null，避免空字串撞 vin unique
    license_plate: ev.license_plate,
    model_display_name: modelDisplayName,
    year: ev.year ?? new Date().getFullYear(),
    color: ev.color,
    mileage_km: ev.mileage ?? 0,
    acquisition_price: acquisitionPrice,
    listing_price: listingPrice,
    cost,
    margin,
    acquisition_source: "trade_in",
    acquisition_date: new Date().toISOString().slice(0, 10),
    listed_date: null, // 待整備完才上架
    status: "pending_inspection", // 整備中、不上架
    condition_grade: ev.condition_grade,
    note: ev.conclusion,
    created_by: approverId,
    metadata: {
      source_evaluation_id: ev.id,
      source_eval_no: ev.eval_no,
      generated_from: "eval_approval",
    },
  };
}

// ── 核准（submitted → approved）+ 同步衍生中古庫存（冪等）──
export async function approveEvaluation(
  id: string,
  approverId: string | null
): Promise<{ id: string; inventory_id?: string }> {
  const supabase = await createClient();

  // (1) 改 status submitted → approved，撈回完整 row 以組庫存 input
  const { data, error } = await supabase
    .from("used_car_evaluations")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approverId,
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("*")
    .single();
  if (error) throw new Error(`approveEvaluation: ${error.message}`);
  if (!data) throw new Error("approveEvaluation: 評估單必須為待簽核才能核准");

  const ev = data as UsedCarEvaluationRow;

  // (2) 衍生中古庫存 — 冪等兜底（含「approved 卻沒庫存」的孤兒補建）
  const inventoryId = await ensureInventoryFromEvaluation(supabase, ev, approverId);

  return { id: ev.id, inventory_id: inventoryId };
}

/**
 * 冪等地由估價單衍生一筆中古庫存：
 * 先用 metadata->>'source_evaluation_id' 邏輯鍵查重，命中則回現有 id（skip create），
 * 否則建立 pending_inspection 庫存並雙向回寫 eval.metadata.generated_inventory_id。
 *
 * 與 approveEvaluation 拆開：approve 第二次（status 已 approved）會在 (1) throw，
 * 但「approved 卻沒庫存」的孤兒可透過直接重跑此函式 / 重 approve 流程補建。
 */
async function ensureInventoryFromEvaluation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ev: UsedCarEvaluationRow,
  approverId: string | null
): Promise<string> {
  // 防重：同一估價單已建過庫存 → skip，回現有 id
  const { data: existing } = await supabase
    .from("used_car_inventory")
    .select("id")
    .eq("brand_id", ev.brand_id)
    .eq("metadata->>source_evaluation_id", ev.id)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // 建庫存
  const { id: inventoryId } = await createUsedCar(mapEvaluationToUsedCar(ev, approverId));

  // 雙向回寫：eval.metadata.generated_inventory_id（合併、不整碗覆蓋）
  const mergedMeta = {
    ...(ev.metadata ?? {}),
    generated_inventory_id: inventoryId,
  };
  const { error: backErr } = await supabase
    .from("used_car_evaluations")
    .update({ metadata: mergedMeta })
    .eq("id", ev.id);
  // 回寫失敗不回滾庫存（庫存才是主結果）；僅記錄
  if (backErr) {
    console.error(`approveEvaluation: 回寫 generated_inventory_id 失敗 — ${backErr.message}`);
  }

  return inventoryId;
}

// ── 駁回（submitted → rejected）──
export async function rejectEvaluation(
  id: string,
  approverId: string | null,
  reason: string
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_evaluations")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_by: approverId,
      rejection_reason: reason,
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id")
    .single();
  if (error) throw new Error(`rejectEvaluation: ${error.message}`);
  if (!data) throw new Error("rejectEvaluation: 評估單必須為待簽核才能駁回");
  return data as { id: string };
}

// ── 刪除（draft only）──
export async function deleteEvaluation(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("used_car_evaluations")
    .delete()
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw new Error(`deleteEvaluation: ${error.message}`);
}

// ── 列印用：join brand / subsidiary / customer / appraiser，回完整 print payload ──
export type UsedCarEvaluationForPrint = {
  id: string;
  eval_no: string | null;
  created_at: string;
  status: EvaluationStatus;
  brand: { key: string; displayName: string };
  seller: {
    legalName: string;
    taxId: string | null;
    address: string | null;
    phone: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
  };
  vehicle: {
    brand_name: string | null;
    model: string | null;
    year: number | null;
    vin: string | null;
    license_plate: string | null;
    displacement: string | null;
    color: string | null;
    mileage: number | null;
  };
  appraiser: string | null;
  condition_grade: ConditionGrade | null;
  decision: string | null;
  conclusion: string | null;
  estimated_value: number | null;
  pricing_jsonb: Record<string, unknown>;
};

const BRAND_DISPLAY_NAME: Record<string, string> = {
  ducati: "Ducati 杜卡迪",
  indian: "Indian Motorcycle 印地安",
};

export async function getEvaluationForPrint(
  id: string,
): Promise<UsedCarEvaluationForPrint | null> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("used_car_evaluations")
    .select("*, customer:customers(name, phone)")
    .eq("id", id)
    .single();
  if (error || !row) return null;

  // 撈所屬 subsidiary 作為列印 letterhead
  // 沒設 subsidiary_id 的單也要能列、抓 brand 預設第一個 subsidiary（容錯）
  const evalRow = row as UsedCarEvaluationWithCustomer & {
    subsidiary_id?: string | null;
  };
  type SubsidiaryLetterhead = {
    legal_name: string | null;
    tax_id: string | null;
    address: string | null;
    phone: string | null;
  };
  let subsidiaryRes: SubsidiaryLetterhead | null = null;
  if (evalRow.subsidiary_id) {
    const { data } = await supabase
      .from("subsidiaries")
      .select("legal_name, tax_id, address, phone")
      .eq("id", evalRow.subsidiary_id)
      .maybeSingle();
    subsidiaryRes = (data as unknown as SubsidiaryLetterhead) ?? null;
  }
  if (!subsidiaryRes) {
    const { data } = await supabase
      .from("subsidiaries")
      .select("legal_name, tax_id, address, phone")
      .eq("brand_id", evalRow.brand_id)
      .limit(1)
      .maybeSingle();
    subsidiaryRes = (data as unknown as SubsidiaryLetterhead) ?? null;
  }

  return {
    id: evalRow.id,
    eval_no: evalRow.eval_no,
    created_at: evalRow.created_at,
    status: evalRow.status,
    brand: {
      key: evalRow.brand_id,
      displayName: BRAND_DISPLAY_NAME[evalRow.brand_id] ?? evalRow.brand_id,
    },
    seller: {
      legalName: subsidiaryRes?.legal_name ?? "—",
      taxId: subsidiaryRes?.tax_id ?? null,
      address: subsidiaryRes?.address ?? null,
      phone: subsidiaryRes?.phone ?? null,
    },
    customer: {
      name: evalRow.customer?.name ?? "—",
      phone: evalRow.customer?.phone ?? null,
    },
    vehicle: {
      brand_name: evalRow.brand_name,
      model: evalRow.model,
      year: evalRow.year,
      vin: evalRow.vin,
      license_plate: evalRow.license_plate,
      displacement: evalRow.displacement,
      color: evalRow.color,
      mileage: evalRow.mileage,
    },
    appraiser: evalRow.appraiser,
    condition_grade: evalRow.condition_grade,
    decision: evalRow.decision,
    conclusion: evalRow.conclusion,
    estimated_value: evalRow.estimated_value,
    pricing_jsonb: evalRow.pricing_jsonb,
  };
}

// ── 產評估單號 ──
export function genEvalNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `EV-${ymd}-${rand}`;
}
