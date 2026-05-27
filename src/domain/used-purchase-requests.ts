/**
 * 中古車收購申請 domain helper — server-only。
 *
 * 服務：
 *   - /sales/inventory/used-purchase（RS_INV05 直購收購申請 list / wizard / detail）
 *   - /usedcar/evaluations/[id]（RS06 置換收購決策的真實觸發）共用本檔的觸發函式
 *
 * 架構：Typed Core + JSONB Metadata pattern。
 * DB 表：used_purchase_requests（T0 已建 + RLS）。
 *
 * ⭐ 本檔最重要的東西是 `triggerUsedCarAcquisition()`：
 *    「確認收購 → 建中古車主檔（pending_recon）+ 觸發 PD-UC 整備工單」的單一入口。
 *    T10（直購，acquisition_source='direct_buy'）與 T12（置換，acquisition_source='trade_in'）
 *    都呼叫它，確保兩條鏈衍生出來的中古車主檔 / 整備工單形狀完全一致。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createUsedCar } from "@/domain/used-car-inventory";
import type {
  UsedCarConditionGrade,
  UsedCarAcquisitionSource,
} from "@/domain/used-car-inventory.constants";

// ── Re-export client-safe 型別 + label 常數（client component 改 import from .constants）──
import type {
  UsedPurchaseSourceType,
  UsedPurchaseDecision,
  UsedPurchaseRequestRow,
} from "./used-purchase-requests.constants";
export type {
  UsedPurchaseSourceType,
  UsedPurchaseDecision,
  UsedPurchaseRequestRow,
} from "./used-purchase-requests.constants";
export { SOURCE_TYPE_LABELS, DECISION_LABELS } from "./used-purchase-requests.constants";

// ─────────────────────────────────────────────────────────────────────
// Filter / List
// ─────────────────────────────────────────────────────────────────────

export type UsedPurchaseFilter = {
  brandId: string;
  sourceType?: string;
  decision?: string;
  search?: string;
};

export type UsedPurchaseListData = {
  rows: UsedPurchaseRequestRow[];
  totalCount: number;
};

export async function listUsedPurchaseRequests(
  filter: UsedPurchaseFilter,
): Promise<UsedPurchaseListData> {
  const supabase = await createClient();
  let q = supabase
    .from("used_purchase_requests")
    .select("*", { count: "exact" })
    .eq("brand_id", filter.brandId)
    .order("created_at", { ascending: false });

  if (filter.sourceType) q = q.eq("source_type", filter.sourceType);
  if (filter.decision) {
    if (filter.decision === "pending") {
      q = q.is("decision", null);
    } else {
      q = q.eq("decision", filter.decision);
    }
  }
  if (filter.search) {
    const term = `%${filter.search}%`;
    q = q.or(
      `application_no.ilike.${term},vin.ilike.${term},seller_name.ilike.${term}`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw new Error(`listUsedPurchaseRequests: ${error.message}`);
  return {
    rows: (data ?? []) as UsedPurchaseRequestRow[],
    totalCount: count ?? 0,
  };
}

export async function getUsedPurchaseRequestById(
  id: string,
): Promise<UsedPurchaseRequestRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_purchase_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as UsedPurchaseRequestRow;
}

/** 抓目前登入者的 brand_id（fallback 'indian'）— 與 used-car-inventory 同邏輯。 */
export async function getUsedPurchaseBrandId(): Promise<string> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return "indian";
  const { data } = await supabase
    .from("profile_brands")
    .select("brand_id")
    .eq("user_id", userId)
    .limit(1)
    .single();
  return data?.brand_id ?? "indian";
}

/**
 * 產收購申請單號 BUY-YYYYMM-NNN（per brand 流水）。
 * 查同 brand 同月份的最大序號 +1。
 */
export async function nextApplicationNo(brandId: string): Promise<string> {
  const supabase = await createClient();
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const ym = `${tz.getFullYear()}${String(tz.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `BUY-${ym}-`;
  const { data } = await supabase
    .from("used_purchase_requests")
    .select("application_no")
    .eq("brand_id", brandId)
    .ilike("application_no", `${prefix}%`)
    .order("application_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { application_no: string } | undefined;
  let seq = 1;
  if (top?.application_no) {
    const tail = top.application_no.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────
// Create / Update 申請單（draft）
// ─────────────────────────────────────────────────────────────────────

export type UsedPurchaseInput = {
  brand_id: string;
  application_no?: string;
  source_type?: UsedPurchaseSourceType | null;
  seller_name?: string | null;
  seller_phone?: string | null;
  seller_id_no?: string | null;
  vin?: string | null;
  vehicle_model_id?: string | null;
  year?: number | null;
  color?: string | null;
  mileage_km?: number | null;
  grade_ext?: UsedCarConditionGrade | null;
  grade_mech?: UsedCarConditionGrade | null;
  market_ref_price?: number | null;
  recon_estimate?: number | null;
  suggested_price?: number | null;
  actual_price?: number | null;
  decision?: UsedPurchaseDecision | null;
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
  // 車輛顯示名（非 DB column，會塞進 metadata.vehicle_model_name 給觸發函式用）
  vehicle_model_name?: string | null;
};

const META_ONLY_KEYS = new Set(["vehicle_model_name"]);

/** 把 input 拆成 typed columns + 合併 metadata。 */
function splitPayload(input: Partial<UsedPurchaseInput>) {
  const { metadata, vehicle_model_name, ...rest } = input;
  const mergedMeta: Record<string, unknown> = { ...(metadata ?? {}) };
  if (vehicle_model_name != null) mergedMeta.vehicle_model_name = vehicle_model_name;
  // 過濾掉 meta-only key（理論上已被解構移除，保險起見）
  const cols: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!META_ONLY_KEYS.has(k)) cols[k] = v;
  }
  return { cols, mergedMeta };
}

export async function createUsedPurchaseRequest(
  input: UsedPurchaseInput,
): Promise<{ id: string; application_no: string }> {
  const supabase = await createClient();
  const applicationNo =
    input.application_no ?? (await nextApplicationNo(input.brand_id));
  const { cols, mergedMeta } = splitPayload(input);

  const { data, error } = await supabase
    .from("used_purchase_requests")
    .insert({
      ...cols,
      application_no: applicationNo,
      metadata: mergedMeta,
    })
    .select("id, application_no")
    .single();
  if (error) throw new Error(`createUsedPurchaseRequest: ${error.message}`);
  return data as { id: string; application_no: string };
}

export async function updateUsedPurchaseRequest(
  id: string,
  patch: Partial<UsedPurchaseInput>,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { cols, mergedMeta } = splitPayload(patch);
  // metadata 只在 patch 真的帶了 metadata/vehicle_model_name 時才覆蓋（避免整碗清空）
  const update: Record<string, unknown> = { ...cols };
  if (patch.metadata != null || patch.vehicle_model_name != null) {
    // 合併既有 metadata
    const { data: existing } = await supabase
      .from("used_purchase_requests")
      .select("metadata")
      .eq("id", id)
      .single();
    const prevMeta = ((existing?.metadata ?? {}) as Record<string, unknown>) || {};
    update.metadata = { ...prevMeta, ...mergedMeta };
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("used_purchase_requests")
    .update(update)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(`updateUsedPurchaseRequest: ${error.message}`);
  return data as { id: string };
}

export async function deleteUsedPurchaseRequest(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("used_purchase_requests")
    .delete()
    .eq("id", id)
    .is("decision", null); // 已決策（已建主檔）的不准刪
  if (error) throw new Error(`deleteUsedPurchaseRequest: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────
// ⭐ 共用觸發函式：確認收購 → 建中古車主檔 + 觸發 PD-UC 整備工單
// ─────────────────────────────────────────────────────────────────────

/** 產 PD-UC 整備工單號 PD-UC-YYMMDD-NNN（per brand 當日流水）。 */
async function nextPdUcRoCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  issueDate: string,
): Promise<{ roCode: string; sequence: number }> {
  const yymmdd = issueDate.replace(/-/g, "").slice(2);
  const prefix = `PD-UC-${yymmdd}-`;
  const { data } = await supabase
    .from("repair_orders")
    .select("ro_code")
    .eq("brand_id", brandId)
    .ilike("ro_code", `${prefix}%`)
    .order("ro_code", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { ro_code: string } | undefined;
  let seq = 1;
  if (top?.ro_code) {
    const tail = top.ro_code.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return { roCode: `${prefix}${String(seq).padStart(3, "0")}`, sequence: seq };
}

function todayTaipeiIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 觸發函式輸入：收購一台中古車所需的最小欄位集合。 */
export type AcquireUsedCarInput = {
  brand_id: string;
  /** 中古車主檔顯示名（NOT NULL，組不出時 caller 給 fallback） */
  model_display_name: string;
  /** 出廠年份（NOT NULL，組不出時 caller 給 fallback，例如今年） */
  year: number;
  /** 收購來源：direct_buy（T10 直購）/ trade_in（T12 置換）/ auction / other */
  acquisition_source: UsedCarAcquisitionSource;
  /** 收購金額（actual_price / estimated_value） */
  acquisition_price?: number | null;
  vin?: string | null;
  license_plate?: string | null;
  color?: string | null;
  mileage_km?: number | null;
  condition_grade?: UsedCarConditionGrade | null;
  vehicle_model_id?: string | null;
  organization_id?: string | null;
  /** 整備預估費（寫進主檔 metadata + 工單 estimated_subtotal，供 T11 整備工單參考） */
  recon_estimate?: number | null;
  note?: string | null;
  created_by?: string | null;
  /** 由哪條鏈觸發（used_purchase_request / evaluation）+ 來源單 id，寫進雙方 metadata 供追溯 */
  source_kind: "used_purchase_request" | "evaluation";
  source_id: string;
  source_no?: string | null;
  /** 是否「條件收購（整備後重評）」— 寫進工單 metadata 標記 */
  conditional?: boolean;
};

export type AcquireUsedCarResult = {
  used_car_id: string;
  recon_workorder_id: string;
  ro_code: string;
};

/**
 * ⭐ 確認收購 → 建中古車主檔 + 觸發 PD-UC 整備工單。T10 / T12 共用。
 *
 * 步驟：
 *   1. used_car_inventory 建一筆 status='pending_recon' 的 row
 *      （model_display_name / year 必填；acquisition_source 依 caller 帶）
 *   2. repair_orders 建一張 PD-UC 整備工單
 *      （prefix_p1='PD' / prefix_p2='IN' / ro_code='PD-UC-YYMMDD-NNN' /
 *        fee_allocation='vehicle_cost' / related_used_car_id=新建車 id / status='進行中'）
 *   3. 回寫 used_car_inventory.recon_workorder_id = 工單 id
 *   4. 回傳 { used_car_id, recon_workorder_id, ro_code }
 *
 * 不在這裡擋權限 — 由呼叫端 server action 先 requirePermission。
 */
export async function triggerUsedCarAcquisition(
  input: AcquireUsedCarInput,
): Promise<AcquireUsedCarResult> {
  const supabase = await createClient();
  const issueDate = todayTaipeiIsoDate();

  // ── 1. 建中古車主檔（待整備）──
  const { id: usedCarId } = await createUsedCar({
    brand_id: input.brand_id,
    organization_id: input.organization_id ?? null,
    vehicle_model_id: input.vehicle_model_id ?? null,
    model_display_name: input.model_display_name,
    year: input.year,
    vin: input.vin?.trim() ? input.vin.trim() : null,
    license_plate: input.license_plate ?? null,
    color: input.color ?? null,
    mileage_km: input.mileage_km ?? 0,
    acquisition_price: input.acquisition_price ?? null,
    acquisition_source: input.acquisition_source,
    acquisition_date: issueDate,
    listed_date: null, // 整備後才上架
    status: "pending_recon",
    condition_grade: input.condition_grade ?? null,
    note: input.note ?? null,
    created_by: input.created_by ?? null,
    metadata: {
      acquired_via: input.source_kind,
      source_request_id:
        input.source_kind === "used_purchase_request" ? input.source_id : undefined,
      source_evaluation_id:
        input.source_kind === "evaluation" ? input.source_id : undefined,
      source_no: input.source_no ?? null,
      recon_estimate: input.recon_estimate ?? null,
      conditional: input.conditional ?? false,
    },
  });

  // ── 2. 建 PD-UC 整備工單（簡單 retry on unique violation）──
  let roCode = "";
  let roId = "";
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { roCode: code, sequence } = await nextPdUcRoCode(
      supabase,
      input.brand_id,
      issueDate,
    );
    const { data: ro, error: roErr } = await supabase
      .from("repair_orders")
      .insert({
        brand_id: input.brand_id,
        ro_code: code,
        prefix_p1: "PD",
        prefix_p2: "IN",
        issue_date: issueDate,
        sequence_no: sequence,
        status: "進行中",
        opened_at: new Date().toISOString(),
        fee_allocation: "vehicle_cost",
        related_used_car_id: usedCarId,
        store_id: input.organization_id ?? null,
        mileage_in: input.mileage_km ?? null,
        estimated_subtotal: input.recon_estimate ?? null,
        metadata: {
          ro_kind: "PD-UC", // 中古車整備（區別於新車 PD-IN）
          created_via: "trigger_used_car_acquisition",
          acquisition_source: input.acquisition_source,
          conditional: input.conditional ?? false,
          source_kind: input.source_kind,
          source_id: input.source_id,
        },
      })
      .select("id, ro_code")
      .single();
    if (!roErr && ro) {
      roId = ro.id as string;
      roCode = ro.ro_code as string;
      break;
    }
    lastErr = roErr?.message ?? "unknown";
    // 23505 unique violation = 撞號 → retry；其他 error 直接 break
    if (!lastErr.includes("duplicate") && !lastErr.includes("unique")) break;
  }
  if (!roId) {
    throw new Error(`triggerUsedCarAcquisition: 建立整備工單失敗 — ${lastErr}`);
  }

  // ── 3. 回寫 used_car_inventory.recon_workorder_id ──
  const { error: backErr } = await supabase
    .from("used_car_inventory")
    .update({ recon_workorder_id: roId })
    .eq("id", usedCarId)
    .eq("brand_id", input.brand_id);
  if (backErr) {
    // 工單已建出（主結果），回填失敗只記錄不回滾
    console.error(
      `triggerUsedCarAcquisition: 回填 recon_workorder_id 失敗（不影響工單）— ${backErr.message}`,
    );
  }

  return { used_car_id: usedCarId, recon_workorder_id: roId, ro_code: roCode };
}
