/**
 * Domain Helper — 電訪工作檯（/sales/crm/call-tasks）
 *
 * 角色：銷售（成交追蹤）/ 售後（保養回訪）兩條業務線共用同一張 call_tasks 表。
 *   - kind = 'sales' | 'aftersales'；預設給銷售側用，未來售後頁面（1d7161d0）可 reuse。
 *   - 任務 = 客戶 × 問卷模板 × 預定撥打時間，業務人員上班開工作檯逐筆撥打、填答、結案。
 *   - questions 來自 survey_templates.questions（jsonb）；answers 用同一份 schema 對應 q.id → 答案。
 *
 * 寫入走 src/lib/sales/call-tasks-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  SurveyKind,
  SurveyQuestion,
} from "@/domain/sales-survey-templates";

// 業務 type / display constants 拆到 client-safe 檔（避免 client bundle 拉到 server-only）
export type {
  CallTaskStatus,
  CallTaskResult,
} from "@/domain/sales-call-tasks.constants";
import type {
  CallTaskStatus,
  CallTaskResult,
} from "@/domain/sales-call-tasks.constants";

export type CallTaskRow = {
  id: string;
  brand_id: string;
  kind: SurveyKind;
  customer_id: string;
  survey_template_id: string | null;
  assignee_id: string | null;
  scheduled_at: string | null;
  status: CallTaskStatus;
  call_result: CallTaskResult | null;
  attempt_count: number;
  last_attempt_at: string | null;
  answers: Record<string, unknown>;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  survey_code: string | null;
  survey_name: string | null;
};

export type CallTaskFilters = {
  kind: SurveyKind;
  /** all | pending | in_progress | completed | skipped */
  status: string;
  /** all | mine（指派給我）| unassigned（尚未指派） */
  assignee: string;
  /** 7d | 30d | all */
  range: string;
  q: string;
};

export type CallTaskListResult = {
  rows: CallTaskRow[];
  totalCount: number;
};

type RawRow = {
  id: string;
  brand_id: string;
  kind: string;
  customer_id: string;
  survey_template_id: string | null;
  assignee_id: string | null;
  scheduled_at: string | null;
  status: string;
  call_result: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  answers: unknown;
  notes: string | null;
  metadata: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer: { code: string | null; name: string | null; phone: string | null } | null;
  survey_template: { code: string | null; name: string | null } | null;
};

function shapeRow(r: RawRow): CallTaskRow {
  return {
    id: r.id,
    brand_id: r.brand_id,
    kind: r.kind as SurveyKind,
    customer_id: r.customer_id,
    survey_template_id: r.survey_template_id,
    assignee_id: r.assignee_id,
    scheduled_at: r.scheduled_at,
    status: r.status as CallTaskStatus,
    call_result: (r.call_result as CallTaskResult | null) ?? null,
    attempt_count: r.attempt_count,
    last_attempt_at: r.last_attempt_at,
    answers:
      r.answers && typeof r.answers === "object"
        ? (r.answers as Record<string, unknown>)
        : {},
    notes: r.notes,
    metadata:
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {},
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    customer_code: r.customer?.code ?? null,
    customer_name: r.customer?.name ?? null,
    customer_phone: r.customer?.phone ?? null,
    survey_code: r.survey_template?.code ?? null,
    survey_name: r.survey_template?.name ?? null,
  };
}

const SELECT_FIELDS =
  "id, brand_id, kind, customer_id, survey_template_id, assignee_id, scheduled_at, status, call_result, attempt_count, last_attempt_at, answers, notes, metadata, created_by, created_at, updated_at, customer:customers!call_tasks_customer_id_fkey ( code, name, phone ), survey_template:survey_templates!call_tasks_survey_template_id_fkey ( code, name )";

export async function getCallTaskListPageData(
  filters: CallTaskFilters,
  currentUserId: string | null,
): Promise<CallTaskListResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("call_tasks")
    .select(SELECT_FIELDS)
    .eq("brand_id", brand)
    .eq("kind", filters.kind);

  if (filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.assignee === "mine" && currentUserId)
    q = q.eq("assignee_id", currentUserId);
  if (filters.assignee === "unassigned") q = q.is("assignee_id", null);

  if (filters.range === "7d") {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    q = q.gte("scheduled_at", from.toISOString());
  } else if (filters.range === "30d") {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    q = q.gte("scheduled_at", from.toISOString());
  }

  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`notes.ilike.%${t}%`);
  }

  const [listRes, totalRes] = await Promise.all([
    q.order("scheduled_at", { ascending: true, nullsFirst: false }).limit(500),
    supabase
      .from("call_tasks")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("kind", filters.kind),
  ]);

  if (listRes.error) throw new Error(`call-tasks list: ${listRes.error.message}`);

  const rows = ((listRes.data ?? []) as unknown as RawRow[]).map(shapeRow);
  return { rows, totalCount: totalRes.count ?? 0 };
}

// ──────────────────────────────────────────────────────────────────────────
// Detail
// ──────────────────────────────────────────────────────────────────────────

export type CallTaskDetail = CallTaskRow & {
  survey_questions: SurveyQuestion[];
  customer_email: string | null;
  customer_type: string | null;
};

const DETAIL_SELECT_FIELDS =
  "id, brand_id, kind, customer_id, survey_template_id, assignee_id, scheduled_at, status, call_result, attempt_count, last_attempt_at, answers, notes, metadata, created_by, created_at, updated_at, customer:customers!call_tasks_customer_id_fkey ( code, name, phone, email, type ), survey_template:survey_templates!call_tasks_survey_template_id_fkey ( code, name, questions )";

export async function getCallTaskDetail(
  id: string,
): Promise<CallTaskDetail | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("call_tasks")
    .select(DETAIL_SELECT_FIELDS)
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (error || !data) return null;

  type DetailRaw = Omit<RawRow, "customer" | "survey_template"> & {
    customer: {
      code: string | null;
      name: string | null;
      phone: string | null;
      email: string | null;
      type: string | null;
    } | null;
    survey_template: {
      code: string | null;
      name: string | null;
      questions: unknown;
    } | null;
  };
  const raw = data as unknown as DetailRaw;

  const base = shapeRow({
    ...raw,
    customer: raw.customer
      ? {
          code: raw.customer.code,
          name: raw.customer.name,
          phone: raw.customer.phone,
        }
      : null,
    survey_template: raw.survey_template
      ? { code: raw.survey_template.code, name: raw.survey_template.name }
      : null,
  });
  const questions = Array.isArray(raw.survey_template?.questions)
    ? (raw.survey_template!.questions as SurveyQuestion[])
    : [];

  return {
    ...base,
    survey_questions: questions,
    customer_email: raw.customer?.email ?? null,
    customer_type: raw.customer?.type ?? null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Lookups（for filter dropdowns / create form）
// ──────────────────────────────────────────────────────────────────────────

export type CustomerLookup = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
};

export type SurveyLookup = {
  id: string;
  code: string;
  name: string;
};

export async function getCallTaskLookups(kind: SurveyKind): Promise<{
  customers: CustomerLookup[];
  surveys: SurveyLookup[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [custRes, survRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name, phone")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(500),
    supabase
      .from("survey_templates")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("kind", kind)
      .eq("is_active", true)
      .order("code"),
  ]);

  return {
    customers: (custRes.data ?? []) as CustomerLookup[],
    surveys: (survRes.data ?? []) as SurveyLookup[],
  };
}

// Display constants 已移到 sales-call-tasks.constants.ts（client-safe）。
