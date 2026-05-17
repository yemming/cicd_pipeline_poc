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

// ── Status ──
export const EVAL_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type EvaluationStatus = (typeof EVAL_STATUSES)[number];

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  draft: "草稿",
  submitted: "待簽核",
  approved: "已核准",
  rejected: "已駁回",
};

// ── Condition grade ──
export const CONDITION_GRADES = ["S", "A", "B", "C", "D"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

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

// ── 核准（submitted → approved）──
export async function approveEvaluation(
  id: string,
  approverId: string | null
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_evaluations")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approverId,
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id")
    .single();
  if (error) throw new Error(`approveEvaluation: ${error.message}`);
  if (!data) throw new Error("approveEvaluation: 評估單必須為待簽核才能核准");
  return data as { id: string };
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

// ── 產評估單號 ──
export function genEvalNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `EV-${ymd}-${rand}`;
}
