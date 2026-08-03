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
import { canCreateCallTask } from "@/lib/crm/call-task-guard";
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
  CallTaskBoardRange,
  CallTaskWorkOrderInfo,
} from "@/domain/sales-call-tasks.constants";
import type {
  CallTaskStatus,
  CallTaskResult,
  CallTaskType,
  CallTaskBoardRow,
  CallTaskBoardKpi,
  CallTaskBoardFilters,
  CallTaskBoardRange,
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
  /** 選取視窗的總筆數（依 range 計算） */
  date_total: number;
  /** range 視窗摘要：給 UI 顯示「本週 (5/12 - 5/18)」字樣 */
  range_label: string;
  /** range 視窗起訖 ISO 日期（YYYY-MM-DD），便於 client 渲染 */
  range_start: string;
  range_end: string;
};

/**
 * 從 ISO date string + 偏移天計算結束日（包含起始日）。
 */
function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 依 range 解析視窗起訖（Asia/Taipei 視角）。
 * - 1d: anchor 當天
 * - 7d: anchor 當天起 7 天（含當天）
 * - week: 本週一到週日（不論 anchor 是星期幾，取 anchor 所屬的那一週）
 * - month: anchor 所屬月的 1 號到月底
 */
function resolveRange(
  anchor: string,
  range: CallTaskBoardRange,
): { start: string; end: string; label: string } {
  const d = new Date(`${anchor}T00:00:00+08:00`);
  if (range === "1d") {
    return { start: anchor, end: anchor, label: anchor };
  }
  if (range === "7d") {
    const end = shiftIsoDate(anchor, 6);
    return { start: anchor, end, label: `近 7 天 (${anchor} ~ ${end})` };
  }
  if (range === "week") {
    // ISO 週：星期一為起點（Sun=0, Mon=1, ... 在 Date.getDay 是這樣）
    const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const start = shiftIsoDate(anchor, offsetToMonday);
    const end = shiftIsoDate(start, 6);
    return { start, end, label: `本週 (${start} ~ ${end})` };
  }
  // month
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const startDate = new Date(Date.UTC(y, m, 1));
  const endDate = new Date(Date.UTC(y, m + 1, 0));
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, label: `本月 (${start} ~ ${end})` };
}

/**
 * 查最近一個「有任務的日期」（從今日往未來找 forwardDays 天，再往前找 backwardDays 天）
 * 用於 UI 預設不空白 — 今日沒任務時自動跳到最近一天有任務的日期。
 * 找不到回 null，caller 自行 fallback 到 today。
 */
export async function getNearestCallTaskDate(
  kind: SurveyKind,
  opts: { forwardDays?: number; backwardDays?: number } = {},
): Promise<string | null> {
  const forward = opts.forwardDays ?? 30;
  const backward = opts.backwardDays ?? 14;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const today = todayIsoTaipei();
  const fromDate = shiftIsoDate(today, -backward);
  const toDate = shiftIsoDate(today, forward);

  const { data, error } = await supabase
    .from("call_tasks")
    .select("scheduled_at")
    .eq("brand_id", brand)
    .eq("kind", kind)
    .neq("status", "completed")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", `${fromDate}T00:00:00+08:00`)
    .lte("scheduled_at", `${toDate}T23:59:59+08:00`)
    .order("scheduled_at", { ascending: true })
    .limit(500);

  if (error || !data || data.length === 0) return null;

  // 先看今日是否有任務
  const todayMatch = data.some(
    (r) =>
      typeof r.scheduled_at === "string" &&
      r.scheduled_at.slice(0, 10) === today,
  );
  if (todayMatch) return today;

  // 沒今日 → 找今日 *之後* 最近的日期；都沒未來才回往前最近的
  const future = data.find(
    (r) =>
      typeof r.scheduled_at === "string" &&
      r.scheduled_at.slice(0, 10) >= today,
  );
  if (future && typeof future.scheduled_at === "string") {
    return future.scheduled_at.slice(0, 10);
  }
  // 全在過去 → 取最近一筆（data 已 asc 排序，要拿最後一筆 = 最接近今天）
  const last = data[data.length - 1];
  if (last && typeof last.scheduled_at === "string") {
    return last.scheduled_at.slice(0, 10);
  }
  return null;
}

export async function getCallTaskBoardData(
  filters: CallTaskBoardFilters,
  currentUserId: string | null,
): Promise<CallTaskBoardData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const today = todayIsoTaipei();
  const selectedDate = filters.date || today;
  const range: CallTaskBoardRange = filters.range ?? "1d";
  const { start: rangeStart, end: rangeEnd, label: rangeLabel } = resolveRange(
    selectedDate,
    range,
  );

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

  // 日期：依 range 篩選 — 視窗內所有任務 + overdue（任何日子永遠帶出）
  rows = rows.filter((r) => {
    if (r.derived_status === "overdue") return true;
    if (!r.scheduled_at) return false;
    const day = r.scheduled_at.slice(0, 10);
    return day >= rangeStart && day <= rangeEnd;
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
    range_label: rangeLabel,
    range_start: rangeStart,
    range_end: rangeEnd,
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

// ──────────────────────────────────────────────────────────────────────────
// Aftersales 專屬：售後維運洞察（給 CRM03B 工作台上方 insight panel 用）
// ──────────────────────────────────────────────────────────────────────────

export type AftersalesNpsAggregate = {
  promoter: number;
  passive: number;
  detractor: number;
  total: number;
  avg: number | null;
  nps_score: number | null; // 標準 NPS = %promoter - %detractor (-100..100)
};

export type AftersalesCallTaskInsights = {
  /** 過去 7 天 NPS 每日平均（含 0）— SparkLine 用 */
  nps_trend_7d: Array<{ date: string; avg: number | null }>;
  /** 近 14 天每日完成數 — BarChart 用 */
  completion_14d: Array<{ date: string; done: number; total: number }>;
  /** call_type 分佈（取 scheduled_at 在過去 30 天 ~ 未來 30 天） — DonutChart 用 */
  call_type_distribution: Array<{
    call_type: string;
    label: string;
    count: number;
  }>;
  /** 本月 NPS 聚合（含 promoter/passive/detractor） */
  nps_monthly: AftersalesNpsAggregate;
};

/**
 * 取得售後電訪工作台 insight panel 所需的維運洞察數據。
 *
 * 只用於 aftersales kind 的工作台；sales 那側不會呼叫此函式。
 * 一次撈完三個視角的資料：NPS 7 日趨勢、call_type 分佈、14 日完成率。
 */
export async function getAftersalesCallTaskInsights(): Promise<AftersalesCallTaskInsights> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const today = todayIsoTaipei();

  // ── 1. NPS 過去 7 天每日平均 ──
  const npsFrom = shiftIsoDate(today, -6); // 含今天共 7 天
  const npsFromTs = `${npsFrom}T00:00:00+08:00`;
  const monthStart = `${today.slice(0, 7)}-01T00:00:00+08:00`;
  const { data: npsRows } = await supabase
    .from("nps_responses")
    .select("score, responded_at")
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .gte("responded_at", npsFromTs);

  // bucket 進每日
  const npsByDay = new Map<string, number[]>();
  for (const r of (npsRows ?? []) as Array<{
    score: number | null;
    responded_at: string | null;
  }>) {
    if (r.score == null || !r.responded_at) continue;
    const d = new Date(r.responded_at);
    const taipei = new Date(d.getTime() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    if (!npsByDay.has(taipei)) npsByDay.set(taipei, []);
    npsByDay.get(taipei)!.push(r.score);
  }
  const nps_trend_7d: Array<{ date: string; avg: number | null }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = shiftIsoDate(today, -i);
    const scores = npsByDay.get(d) ?? [];
    nps_trend_7d.push({
      date: d,
      avg:
        scores.length > 0
          ? Math.round(
              (scores.reduce((a, b) => a + b, 0) / scores.length) * 10,
            ) / 10
          : null,
    });
  }

  // ── 2. 本月 NPS 聚合 ──
  const { data: npsMonth } = await supabase
    .from("nps_responses")
    .select("score")
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .gte("responded_at", monthStart);
  const monthScores = ((npsMonth ?? []) as Array<{ score: number | null }>)
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number");
  const promoter = monthScores.filter((s) => s >= 9).length;
  const passive = monthScores.filter((s) => s >= 7 && s <= 8).length;
  const detractor = monthScores.filter((s) => s <= 6).length;
  const total = monthScores.length;
  const avg =
    total > 0
      ? Math.round((monthScores.reduce((a, b) => a + b, 0) / total) * 10) / 10
      : null;
  const nps_score =
    total > 0
      ? Math.round(((promoter - detractor) / total) * 100)
      : null;

  // ── 3. call_type 分佈（過去 30 天到未來 30 天） ──
  const distFrom = `${shiftIsoDate(today, -30)}T00:00:00+08:00`;
  const distTo = `${shiftIsoDate(today, 30)}T23:59:59+08:00`;
  const { data: distRows } = await supabase
    .from("call_tasks")
    .select("call_type")
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", distFrom)
    .lte("scheduled_at", distTo);

  const distByType = new Map<string, number>();
  for (const r of (distRows ?? []) as Array<{ call_type: string | null }>) {
    const k = r.call_type ?? "custom";
    distByType.set(k, (distByType.get(k) ?? 0) + 1);
  }
  const callTypeLabels: Record<string, string> = {
    aftersales_d3: "D+3 滿意",
    aftersales_d7: "D+7 確認",
    maintenance_reminder: "保養提醒",
    warranty_reminder: "保固提醒",
    desmo_reminder: "Desmo",
    nps_interview: "NPS 訪談",
    custom: "自訂",
  };
  const call_type_distribution = Array.from(distByType.entries())
    .map(([k, v]) => ({
      call_type: k,
      label: callTypeLabels[k] ?? k,
      count: v,
    }))
    .sort((a, b) => b.count - a.count);

  // ── 4. 近 14 天每日完成率（completed 數 / 排程數） ──
  const compFrom = shiftIsoDate(today, -13);
  const compFromTs = `${compFrom}T00:00:00+08:00`;
  const compToTs = `${today}T23:59:59+08:00`;
  const { data: compRows } = await supabase
    .from("call_tasks")
    .select("status, scheduled_at, last_attempt_at")
    .eq("brand_id", brand)
    .eq("kind", "aftersales")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", compFromTs)
    .lte("scheduled_at", compToTs);
  const totalByDay = new Map<string, number>();
  const doneByDay = new Map<string, number>();
  for (const r of (compRows ?? []) as Array<{
    status: string;
    scheduled_at: string | null;
    last_attempt_at: string | null;
  }>) {
    if (!r.scheduled_at) continue;
    const day = r.scheduled_at.slice(0, 10);
    totalByDay.set(day, (totalByDay.get(day) ?? 0) + 1);
    if (r.status === "completed") {
      doneByDay.set(day, (doneByDay.get(day) ?? 0) + 1);
    }
  }
  const completion_14d: Array<{
    date: string;
    done: number;
    total: number;
  }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = shiftIsoDate(today, -i);
    completion_14d.push({
      date: d,
      done: doneByDay.get(d) ?? 0,
      total: totalByDay.get(d) ?? 0,
    });
  }

  return {
    nps_trend_7d,
    completion_14d,
    call_type_distribution,
    nps_monthly: {
      promoter,
      passive,
      detractor,
      total,
      avg,
      nps_score,
    },
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

// ─────────────────────────────────────────────────────────────
// 跨模組 hook 用：自動建立回訪 / NPS 任務（第十一輪 C1-C3a）
//
// 共用入口：#1 建客→回訪（kind=sales / call_type=d3_followup）、
//          #7 關單→NPS（kind=aftersales / call_type=nps_interview）。
//
// ⚠️ 這是「系統副作用」helper，不是 user-facing action：
//   - 不做 requirePermission（觸發它的上游 action 已驗過權限）
//   - 仍綁 getActiveScope().brand_id → RLS 雙 brand 隔離不破
//   - 內建冪等：同 customer + 同 call_type 已有 pending 任務（或 metadata.source_ro 命中）→ skip
//   - 失敗只回 { ok:false }，由 caller 的 after() try/catch 吞掉、不炸主流程
// ─────────────────────────────────────────────────────────────

export type CreateFollowUpTaskInput = {
  customer_id: string;
  kind: "sales" | "aftersales";
  /** call_tasks.call_type，需符合 CHECK（d3_followup / nps_interview / …） */
  call_type: string;
  /** 排程日（ISO timestamptz）；不給則用「現在 + days_from_now 天」 */
  scheduled_at?: string | null;
  /** scheduled_at 未給時，從現在往後推幾天（預設 3 天） */
  days_from_now?: number;
  assignee_id?: string | null;
  notes?: string | null;
  /**
   * 建立者 user_id。call_tasks SELECT RLS 要求 created_by=auth.uid()（或 overseer/assignee）
   * 才看得到 row；INSERT...RETURNING 的 .select() 會被此政策過濾。系統 hook 建立時務必帶入
   * 當前操作者 id，否則 RETURNING 撈不到 row、回報成 RLS 失敗。
   */
  created_by?: string | null;
  /** 額外塞進 call_tasks.metadata（如 { source_ro, source_order } 供冪等查重） */
  metadata?: Record<string, unknown>;
  /**
   * 防重鍵：用 metadata 的某個 key 做冪等查重（例 'source_ro'）。
   * 給了就查「同 customer + 同 call_type + metadata->>dedupeMetaKey = 該值」是否已存在；
   * 不給就退回查「同 customer + 同 call_type + status=pending」是否已存在。
   */
  dedupeMetaKey?: string;
};

export type CreateFollowUpTaskResult =
  | { ok: true; data: { id: string } | { skipped: true } }
  | { ok: false; error: string };

export async function createFollowUpTask(
  input: CreateFollowUpTaskInput,
): Promise<CreateFollowUpTaskResult> {
  if (!input.customer_id) return { ok: false, error: "缺少 customer_id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 缺口四：客戶標記請勿聯繫/已故 → 不建任務，但視為成功（自動任務不該讓上層流程失敗）
  const guard = await canCreateCallTask(input.customer_id, brand);
  if (!guard.allowed) return { ok: true, data: { skipped: true } };

  // ── 冪等：先查是否已有對應任務 ──
  let dupQuery = supabase
    .from("call_tasks")
    .select("id")
    .eq("brand_id", brand)
    .eq("customer_id", input.customer_id)
    .eq("call_type", input.call_type)
    .limit(1);

  const dedupeKey = input.dedupeMetaKey;
  const dedupeVal = dedupeKey ? input.metadata?.[dedupeKey] : undefined;
  if (dedupeKey && dedupeVal != null) {
    // 以 metadata 某 key（如 source_ro）查重 → 同來源不重複建
    dupQuery = dupQuery.eq(`metadata->>${dedupeKey}`, String(dedupeVal));
  } else {
    // 退回：同 customer + 同 call_type 已有 pending 任務就 skip
    dupQuery = dupQuery.eq("status", "pending");
  }

  const { data: existing, error: dupErr } = await dupQuery.maybeSingle();
  if (dupErr) return { ok: false, error: dupErr.message };
  if (existing) return { ok: true, data: { skipped: true } };

  // ── 排程日 ──
  let scheduledAt = input.scheduled_at ?? null;
  if (!scheduledAt) {
    const days = input.days_from_now ?? 3;
    const d = new Date();
    d.setDate(d.getDate() + days);
    scheduledAt = d.toISOString();
  }

  const { data, error } = await supabase
    .from("call_tasks")
    .insert({
      brand_id: brand,
      kind: input.kind,
      customer_id: input.customer_id,
      call_type: input.call_type,
      status: "pending",
      scheduled_at: scheduledAt,
      assignee_id: input.assignee_id ?? null,
      notes: input.notes ?? null,
      created_by: input.created_by ?? null,
      metadata: (input.metadata ?? {}) as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}
