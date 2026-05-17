/**
 * Domain Helper — 電訪工作檯（/crm/sales/call-tasks / /crm/aftersales/call-tasks）
 *
 * - 銷售（成交追蹤）/ 售後（保養回訪）共用 call_tasks 表，用 `kind` 區分。
 * - v2（CRM03A/B spec）：支援日期導覽 + tab pills（call_type） + KPI 卡 + 卡片視圖。
 * - 寫入走 src/lib/sales/call-tasks-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  SurveyKind,
  SurveyQuestion,
} from "@/domain/sales-survey-templates";

// 業務 type / display constants 拆到 client-safe 檔
export type {
  CallTaskStatus,
  CallTaskResult,
  CallTaskType,
  CallTaskDerivedStatus,
  CallTaskBoardRow,
  CallTaskBoardKpi,
  CallTaskBoardFilters,
  CallTaskWorkOrderInfo,
} from "@/domain/sales-call-tasks.constants";
import type {
  CallTaskStatus,
  CallTaskResult,
  CallTaskType,
  CallTaskBoardRow,
  CallTaskBoardKpi,
  CallTaskBoardFilters,
  CallTaskDerivedStatus,
  CallTaskWorkOrderInfo,
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
  status: string;
  assignee: string;
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
  call_type?: string | null;
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
  "id, brand_id, kind, customer_id, survey_template_id, assignee_id, scheduled_at, status, call_result, attempt_count, last_attempt_at, answers, notes, metadata, created_by, created_at, updated_at, call_type, customer:customers!call_tasks_customer_id_fkey ( code, name, phone ), survey_template:survey_templates!call_tasks_survey_template_id_fkey ( code, name )";

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
// v2 board data — 日期導覽 + tab pills + KPI 卡 + 卡片視圖
// ──────────────────────────────────────────────────────────────────────────

function readStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function derivedStatus(
  status: CallTaskStatus,
  scheduledAt: string | null,
  todayIso: string,
): CallTaskDerivedStatus {
  if (status === "completed") return "done";
  if (status === "skipped") return "skipped";
  if (!scheduledAt) return "scheduled";
  const day = scheduledAt.slice(0, 10);
  if (day < todayIso) return "overdue";
  if (day === todayIso) return "today";
  return "scheduled";
}

function todayIsoTaipei(): string {
  // Asia/Taipei = UTC+8
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().slice(0, 10);
}

function readNum(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

function shapeBoardRow(
  r: RawRow,
  todayIso: string,
  workOrderById: Map<string, CallTaskWorkOrderInfo>,
): CallTaskBoardRow {
  const meta =
    r.metadata && typeof r.metadata === "object"
      ? (r.metadata as Record<string, unknown>)
      : {};
  const woId =
    typeof meta["work_order_id"] === "string"
      ? (meta["work_order_id"] as string)
      : null;
  const wo = woId ? (workOrderById.get(woId) ?? null) : null;
  return {
    id: r.id,
    brand_id: r.brand_id,
    kind: r.kind as SurveyKind,
    call_type: (r.call_type as CallTaskType | null) ?? null,
    customer_id: r.customer_id,
    customer_code: r.customer?.code ?? null,
    customer_name: r.customer?.name ?? null,
    customer_phone: r.customer?.phone ?? null,
    survey_template_id: r.survey_template_id,
    survey_code: r.survey_template?.code ?? null,
    survey_name: r.survey_template?.name ?? null,
    assignee_id: r.assignee_id,
    rs_name: readStr(meta, "rs_name"),
    scheduled_at: r.scheduled_at,
    status: r.status as CallTaskStatus,
    derived_status: derivedStatus(
      r.status as CallTaskStatus,
      r.scheduled_at,
      todayIso,
    ),
    call_result: (r.call_result as CallTaskResult | null) ?? null,
    attempt_count: r.attempt_count,
    last_attempt_at: r.last_attempt_at,
    notes: r.notes,
    goal: readStr(meta, "goal"),
    competitor_brand: readStr(meta, "competitor_brand"),
    next_followup_date: readStr(meta, "next_followup_date"),
    nps_score: readNum(meta, "nps_score"),
    metadata: meta,
    work_order: wo,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export type CallTaskBoardData = {
  rows: CallTaskBoardRow[];
  /** KPI 永遠相對 today、不被選取日污染 */
  kpi: CallTaskBoardKpi;
  /** call_type 分組 count（給 sidebar / tab badge 用） */
  by_call_type: Record<string, number>;
  /** 選取日的總筆數 */
  date_total: number;
};

export async function getCallTaskBoardData(
  filters: CallTaskBoardFilters,
  currentUserId: string | null,
): Promise<CallTaskBoardData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const today = todayIsoTaipei();
  const selectedDate = filters.date || today;

  // 撈整個 kind 的最近 60 天資料一次（給卡片 list + KPI + counts 共用）
  // — 量級 < 500 row、避免 N+1 query
  const fromDate = new Date(`${selectedDate}T00:00:00+08:00`);
  fromDate.setDate(fromDate.getDate() - 14);
  const toDate = new Date(`${selectedDate}T00:00:00+08:00`);
  toDate.setDate(toDate.getDate() + 30);

  const baseQuery = supabase
    .from("call_tasks")
    .select(SELECT_FIELDS)
    .eq("brand_id", brand)
    .eq("kind", filters.kind)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(1000);

  const { data, error } = await baseQuery;
  if (error) throw new Error(`call-tasks board: ${error.message}`);

  const rawRows = (data ?? []) as unknown as RawRow[];

  // ── 售後專屬：批撈 work_orders（aftersales 才查、sales 不打網路） ──
  const workOrderById = new Map<string, CallTaskWorkOrderInfo>();
  if (filters.kind === "aftersales") {
    const woIds = Array.from(
      new Set(
        rawRows
          .map((r) => {
            const meta =
              r.metadata && typeof r.metadata === "object"
                ? (r.metadata as Record<string, unknown>)
                : {};
            const v = meta["work_order_id"];
            return typeof v === "string" ? v : null;
          })
          .filter((v): v is string => !!v),
      ),
    );
    if (woIds.length > 0) {
      const { data: woRows } = await supabase
        .from("work_orders")
        .select(
          "id, ro_no, opened_at, closed_at, mileage_in, total_amount, status",
        )
        .eq("brand_id", brand)
        .in("id", woIds);
      for (const wo of (woRows ?? []) as Array<{
        id: string;
        ro_no: string;
        opened_at: string | null;
        closed_at: string | null;
        mileage_in: string | number | null;
        total_amount: string | number | null;
        status: string | null;
      }>) {
        workOrderById.set(wo.id, {
          id: wo.id,
          ro_no: wo.ro_no,
          opened_at: wo.opened_at,
          closed_at: wo.closed_at,
          mileage_in:
            wo.mileage_in == null
              ? null
              : typeof wo.mileage_in === "string"
                ? Number(wo.mileage_in)
                : wo.mileage_in,
          total_amount:
            wo.total_amount == null
              ? null
              : typeof wo.total_amount === "string"
                ? Number(wo.total_amount)
                : wo.total_amount,
          status: wo.status,
        });
      }
    }
  }

  const allRows = rawRows.map((r) => shapeBoardRow(r, today, workOrderById));

  // ── 售後專屬：本月 NPS 均分（responded_at >= 月初） ──
  let npsAvg: number | null = null;
  let npsCount = 0;
  if (filters.kind === "aftersales") {
    const monthStart = today.slice(0, 7) + "-01T00:00:00+08:00";
    const { data: npsRows } = await supabase
      .from("nps_responses")
      .select("score")
      .eq("brand_id", brand)
      .eq("kind", "aftersales")
      .gte("responded_at", monthStart);
    const scores = ((npsRows ?? []) as Array<{ score: number | null }>)
      .map((r) => r.score)
      .filter((s): s is number => typeof s === "number");
    npsCount = scores.length;
    if (scores.length > 0) {
      npsAvg =
        Math.round(
          (scores.reduce((a, b) => a + b, 0) / scores.length) * 10,
        ) / 10;
    }
  }

  // ── KPI（相對 today，與選取日無關） ──
  const kpi: CallTaskBoardKpi = {
    total: allRows.length,
    overdue: allRows.filter((r) => r.derived_status === "overdue").length,
    today: allRows.filter((r) => r.derived_status === "today").length,
    done_today: allRows.filter(
      (r) =>
        r.derived_status === "done" &&
        (r.last_attempt_at ?? r.updated_at).slice(0, 10) === today,
    ).length,
    scheduled: allRows.filter((r) => r.derived_status === "scheduled").length,
    nps_monthly_avg: npsAvg,
    nps_monthly_count: npsCount,
  };

  // ── call_type 分組（選取日 + 全部時段都算入） ──
  const by_call_type: Record<string, number> = {};
  for (const r of allRows) {
    const key = r.call_type ?? "custom";
    by_call_type[key] = (by_call_type[key] ?? 0) + 1;
  }

  // ── 套用 filter 篩 rows ──
  let rows = allRows;

  // 日期：只顯示「選取日當天 + overdue（任何日子）」
  rows = rows.filter((r) => {
    if (r.derived_status === "overdue") return true; // overdue 永遠顯示
    if (!r.scheduled_at) return false;
    return r.scheduled_at.slice(0, 10) === selectedDate;
  });

  const dateTotal = rows.length;

  if (filters.status !== "all") {
    rows = rows.filter((r) => r.derived_status === filters.status);
  }
  if (filters.call_type !== "all") {
    rows = rows.filter((r) => r.call_type === filters.call_type);
  }
  if (filters.assignee === "mine" && currentUserId) {
    rows = rows.filter((r) => r.assignee_id === currentUserId);
  } else if (filters.assignee === "unassigned") {
    rows = rows.filter((r) => r.assignee_id == null);
  }

  // overdue 排最前面、其次照 scheduled_at 升序
  rows.sort((a, b) => {
    if (a.derived_status === "overdue" && b.derived_status !== "overdue")
      return -1;
    if (b.derived_status === "overdue" && a.derived_status !== "overdue")
      return 1;
    return (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "");
  });

  return {
    rows,
    kpi,
    by_call_type,
    date_total: dateTotal,
  };
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
  "id, brand_id, kind, customer_id, survey_template_id, assignee_id, scheduled_at, status, call_result, attempt_count, last_attempt_at, answers, notes, metadata, created_by, created_at, updated_at, call_type, customer:customers!call_tasks_customer_id_fkey ( code, name, phone, email, type ), survey_template:survey_templates!call_tasks_survey_template_id_fkey ( code, name, questions )";

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

/** 撈某客戶最近 N 筆 call_tasks（給卡片展開區的「歷史接觸記錄」用） */
export type CallTaskHistoryEntry = {
  id: string;
  date: string;
  call_type: CallTaskType | null;
  status: CallTaskStatus;
  call_result: CallTaskResult | null;
  notes: string | null;
};

export async function getCallTaskHistoryByCustomerIds(
  customerIds: string[],
  excludeTaskIds: string[] = [],
  limit = 5,
): Promise<Record<string, CallTaskHistoryEntry[]>> {
  if (customerIds.length === 0) return {};
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("call_tasks")
    .select(
      "id, customer_id, call_type, status, call_result, notes, last_attempt_at, scheduled_at, updated_at",
    )
    .eq("brand_id", brand)
    .in("customer_id", customerIds)
    .order("updated_at", { ascending: false })
    .limit(customerIds.length * (limit + 2));
  if (error) return {};

  const out: Record<string, CallTaskHistoryEntry[]> = {};
  for (const r of (data ?? []) as Array<{
    id: string;
    customer_id: string;
    call_type: string | null;
    status: string;
    call_result: string | null;
    notes: string | null;
    last_attempt_at: string | null;
    scheduled_at: string | null;
    updated_at: string;
  }>) {
    if (excludeTaskIds.includes(r.id)) continue;
    const list = (out[r.customer_id] ??= []);
    if (list.length >= limit) continue;
    list.push({
      id: r.id,
      date: (r.last_attempt_at ?? r.scheduled_at ?? r.updated_at).slice(0, 10),
      call_type: (r.call_type as CallTaskType | null) ?? null,
      status: r.status as CallTaskStatus,
      call_result: (r.call_result as CallTaskResult | null) ?? null,
      notes: r.notes,
    });
  }
  return out;
}
