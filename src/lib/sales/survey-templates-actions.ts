"use server";

/**
 * Server Actions — 電訪問卷模板（/sales/crm/survey-templates）
 *
 * - 沿用 PERMISSIONS.CUSTOMER_VIEW / CUSTOMER_EDIT（CRM 模組共用權限，問卷模板屬於 CRM 設定範疇）
 * - Result 型別、不 redirect、由 client 自決導航
 * - kind = 'sales' | 'aftersales'；同一支 action 兩個業務頁面共用
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  AFTERSALES_TIMING_ORDER,
  SALES_TIMING_ORDER,
  type ApplicableTiming,
  type SurveyHabcTarget,
  type SurveyKind,
  type SurveyMetadata,
  type SurveyQuestion,
  type SurveyVersionEntry,
} from "@/domain/sales-survey-templates.constants";

const VALID_TIMINGS = new Set<ApplicableTiming>([
  ...SALES_TIMING_ORDER,
  ...AFTERSALES_TIMING_ORDER,
]);

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SurveyTemplateInput = {
  /** 留空 → 自動產生 SST001 / AST001 ... */
  code?: string;
  name: string;
  kind: SurveyKind;
  description?: string | null;
  target_segment?: string | null;
  questions: SurveyQuestion[];
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  /** v2 開始：metadata 直接從 client 帶上來（applicable_timing / target_habc / status / icon） */
  metadata?: SurveyMetadata | null;
};

/**
 * 同一份問卷 schema 同時被 /sales/crm/survey-templates 與 /aftersales/crm/survey-templates 兩條路徑掛載。
 * revalidate 同時打兩條（kind 只是 filter，路徑前綴 router cache 看的是 pathname），保守 invalidate。
 */
function listPaths(kind: SurveyKind): string[] {
  return [
    `/sales/crm/survey-templates?kind=${kind}`,
    `/aftersales/crm/survey-templates?kind=${kind}`,
  ];
}

function detailPaths(id: string): string[] {
  return [
    `/sales/crm/survey-templates/${id}`,
    `/aftersales/crm/survey-templates/${id}`,
  ];
}

function revalidateAll(paths: string[]): void {
  for (const p of paths) revalidatePath(p);
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    if (error.message.includes("survey_templates_brand_kind_code_uniq"))
      return "問卷代碼已存在（同品牌、同類型下不可重複）";
    return "資料重複（unique constraint）";
  }
  if (error.code === "23514") {
    if (error.message.includes("survey_templates_kind_check"))
      return "問卷類型不合法（只接受 sales / aftersales）";
  }
  return `儲存失敗：${error.message}`;
}

async function genCode(kind: SurveyKind): Promise<string> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const prefix = kind === "sales" ? "SST" : "AST";
  const { data } = await supabase
    .from("survey_templates")
    .select("code")
    .eq("brand_id", brand)
    .eq("kind", kind)
    .ilike("code", `${prefix}%`)
    .order("code", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of data ?? []) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(row.code);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function sanitizeQuestions(qs: SurveyQuestion[]): SurveyQuestion[] {
  return (qs ?? []).map((q, idx) => {
    const id = (q.id ?? "").trim() || `q${idx + 1}`;
    const label = (q.label ?? "").trim();
    const type =
      q.type === "single" ||
      q.type === "multi" ||
      q.type === "rating" ||
      q.type === "text"
        ? q.type
        : "text";
    const required = Boolean(q.required);
    const options =
      type === "single" || type === "multi" || type === "rating"
        ? (q.options ?? []).map((o) => String(o).trim()).filter(Boolean)
        : undefined;
    const hint =
      typeof q.hint === "string" && q.hint.trim() ? q.hint.trim() : undefined;
    const base: SurveyQuestion = { id, label, type, required };
    if (options !== undefined) base.options = options;
    if (hint !== undefined) base.hint = hint;
    return base;
  });
}

function sanitizeMetadata(meta: SurveyMetadata | null | undefined): SurveyMetadata {
  if (!meta || typeof meta !== "object") return {};
  const next: SurveyMetadata = {};
  const t = meta.applicable_timing;
  if (typeof t === "string" && VALID_TIMINGS.has(t as ApplicableTiming))
    next.applicable_timing = t as ApplicableTiming;
  if (Array.isArray(meta.target_habc)) {
    next.target_habc = meta.target_habc.filter(
      (x): x is SurveyHabcTarget =>
        x === "H" || x === "A" || x === "B" || x === "C",
    );
  }
  const s = meta.status;
  if (s === "active" || s === "draft" || s === "archived") next.status = s;
  if (typeof meta.icon === "string" && meta.icon.trim()) next.icon = meta.icon;
  if (Array.isArray(meta.versions)) next.versions = meta.versions;
  if (typeof meta.sa_script === "string") next.sa_script = meta.sa_script;
  if (Array.isArray(meta.timing_tags)) {
    next.timing_tags = meta.timing_tags.filter((x): x is ApplicableTiming =>
      typeof x === "string" && VALID_TIMINGS.has(x as ApplicableTiming),
    );
  }
  return next;
}

function payloadFromInput(input: SurveyTemplateInput) {
  return {
    name: input.name.trim(),
    description: trim(input.description ?? null),
    target_segment: trim(input.target_segment ?? null),
    questions: sanitizeQuestions(input.questions),
    effective_from: trim(input.effective_from ?? null),
    effective_to: trim(input.effective_to ?? null),
    ...(input.metadata !== undefined
      ? { metadata: sanitizeMetadata(input.metadata) }
      : {}),
  };
}

export async function createSurveyTemplateAction(
  input: SurveyTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };
  if (!input.name?.trim()) return { ok: false, error: "問卷名稱必填" };
  if (input.kind !== "sales" && input.kind !== "aftersales")
    return { ok: false, error: "問卷類型不合法" };

  const code = input.code?.trim() || (await genCode(input.kind));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("survey_templates")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      kind: input.kind,
      code,
      ...payloadFromInput(input),
      is_active: input.is_active ?? true,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(listPaths(input.kind));
  return { ok: true, data: { id: data.id } };
}

export async function updateSurveyTemplateAction(
  id: string,
  input: SurveyTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  if (!input.name?.trim()) return { ok: false, error: "問卷名稱必填" };
  if (!input.code?.trim()) return { ok: false, error: "問卷代碼必填" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("survey_templates")
    .update({
      code: input.code.trim(),
      ...payloadFromInput(input),
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);

  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(listPaths(input.kind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

export async function setSurveyTemplateActiveAction(
  id: string,
  next: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("survey_templates")
    .update({ is_active: next })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .select("kind")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };
  if (data?.kind) revalidateAll(listPaths(data.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 重新排序題目（拖曳後寫入）— orderedIds 應該與目前 questions 的 id set 完全一致。
 * 未在 orderedIds 中的題目會被附加到尾端（safety net，避免 client / server race 漏題）。
 */
export async function reorderQuestionsAction(
  id: string,
  orderedIds: string[],
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  if (!Array.isArray(orderedIds))
    return { ok: false, error: "orderedIds 必須是陣列" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error: readErr } = await supabase
    .from("survey_templates")
    .select("kind, questions")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr) return { ok: false, error: mapDbError(readErr) };
  if (!row) return { ok: false, error: "問卷不存在" };

  const current = Array.isArray(row.questions)
    ? (row.questions as SurveyQuestion[])
    : [];
  const map = new Map(current.map((q) => [q.id, q]));
  const next: SurveyQuestion[] = [];
  const seen = new Set<string>();
  for (const qid of orderedIds) {
    const q = map.get(qid);
    if (q) {
      next.push(q);
      seen.add(qid);
    }
  }
  for (const q of current) if (!seen.has(q.id)) next.push(q);

  const { error } = await supabase
    .from("survey_templates")
    .update({ questions: next })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateAll(detailPaths(id));
  if (row.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  return { ok: true, data: { id } };
}

/**
 * 更新 metadata（適用時機 / HABC / 狀態 / icon），不動 questions。
 * 為 detail view 的 HABC chip grid + 適用時機 select 提供獨立 save 點。
 */
export async function updateSurveyMetadataAction(
  id: string,
  patch: Partial<SurveyMetadata>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error: readErr } = await supabase
    .from("survey_templates")
    .select("kind, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr) return { ok: false, error: mapDbError(readErr) };
  if (!row) return { ok: false, error: "問卷不存在" };

  const current = (row.metadata as SurveyMetadata) ?? {};
  const merged: SurveyMetadata = sanitizeMetadata({ ...current, ...patch });

  const { error } = await supabase
    .from("survey_templates")
    .update({ metadata: merged })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  if (row.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 封存當前版本：把 versions[0]（current）的 archived_at 設為今天、
 * 並 prepend 一筆新草稿版本；舊版同時記錄當下 questions / sa_script 快照供「還原此版」使用。
 */
export async function archiveSurveyVersionAction(
  id: string,
  note?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error: readErr } = await supabase
    .from("survey_templates")
    .select("kind, metadata, questions")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr) return { ok: false, error: mapDbError(readErr) };
  if (!row) return { ok: false, error: "問卷不存在" };

  const today = new Date().toISOString().slice(0, 10);
  const meta = (row.metadata as SurveyMetadata) ?? {};
  const prev = Array.isArray(meta.versions) ? meta.versions : [];
  const cur: SurveyVersionEntry | null = prev[0] ?? null;
  const currentQuestions = Array.isArray(row.questions)
    ? (row.questions as SurveyQuestion[])
    : [];
  const archived: SurveyVersionEntry | null = cur
    ? {
        ...cur,
        archived_at: today,
        snapshot: cur.snapshot ?? {
          questions: currentQuestions,
          sa_script: meta.sa_script ?? "",
        },
      }
    : null;
  const newVer: SurveyVersionEntry = {
    ver: nextVersionLabel(cur?.ver),
    date: today,
    note: (note ?? "").trim() || "封存舊版、開新草稿",
    archived_at: null,
  };
  const versions = [newVer, ...(archived ? [archived] : []), ...prev.slice(1)];
  const nextMeta: SurveyMetadata = sanitizeMetadata({
    ...meta,
    versions,
  });

  const { error } = await supabase
    .from("survey_templates")
    .update({ metadata: nextMeta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  if (row.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 另存新版（CRM02B spec § 版本記錄 - 另存新版本）
 * - 把當前 questions + sa_script 整包打成新版的 snapshot
 * - 不動 questions / sa_script 本身（user 仍在編輯當前版）
 * - 跟 archiveSurveyVersion 不同：本 action 不會把當前版本標記為「封存」
 */
export async function saveAsNewSurveyVersionAction(
  id: string,
  note?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error: readErr } = await supabase
    .from("survey_templates")
    .select("kind, metadata, questions")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr) return { ok: false, error: mapDbError(readErr) };
  if (!row) return { ok: false, error: "問卷不存在" };

  const today = new Date().toISOString().slice(0, 10);
  const meta = (row.metadata as SurveyMetadata) ?? {};
  const prev = Array.isArray(meta.versions) ? meta.versions : [];
  const cur: SurveyVersionEntry | null = prev[0] ?? null;
  const currentQuestions = Array.isArray(row.questions)
    ? (row.questions as SurveyQuestion[])
    : [];

  const snapshot: SurveyVersionEntry = {
    ver: nextVersionLabel(cur?.ver),
    date: today,
    note: (note ?? "").trim() || "另存為新版草稿",
    archived_at: null,
    snapshot: { questions: currentQuestions, sa_script: meta.sa_script ?? "" },
  };
  // 舊版 cur 自動標記為「已封存」（保留歷史 + 帶上快照）
  const archivedCur: SurveyVersionEntry | null = cur
    ? {
        ...cur,
        archived_at: today,
        snapshot: cur.snapshot ?? {
          questions: currentQuestions,
          sa_script: meta.sa_script ?? "",
        },
      }
    : null;
  const versions = [
    snapshot,
    ...(archivedCur ? [archivedCur] : []),
    ...prev.slice(1),
  ];
  const nextMeta: SurveyMetadata = sanitizeMetadata({ ...meta, versions });

  const { error } = await supabase
    .from("survey_templates")
    .update({ metadata: nextMeta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  if (row.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 還原某個歷史版本（CRM02B spec § 版本記錄 - 還原此版）
 * - 把選定版本的 snapshot.questions / sa_script 回填到 typed columns / metadata.sa_script
 * - 同時 prepend 一筆新版本（標註「還原自 vX」），讓還原動作本身留下版本軌跡
 * - status 強制改成 draft（剛還原的內容請 user 檢視後再決定上線）
 */
export async function restoreSurveyVersionAction(
  id: string,
  versionLabel: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  if (!versionLabel) return { ok: false, error: "缺少版本號" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error: readErr } = await supabase
    .from("survey_templates")
    .select("kind, metadata, questions")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr) return { ok: false, error: mapDbError(readErr) };
  if (!row) return { ok: false, error: "問卷不存在" };

  const meta = (row.metadata as SurveyMetadata) ?? {};
  const prev = Array.isArray(meta.versions) ? meta.versions : [];
  const target = prev.find((v) => v.ver === versionLabel);
  if (!target)
    return { ok: false, error: `找不到版本 ${versionLabel}` };
  const snap = target.snapshot;
  if (!snap || !Array.isArray(snap.questions))
    return {
      ok: false,
      error: `版本 ${versionLabel} 沒有快照可還原（舊資料未保存題目內容）`,
    };

  const today = new Date().toISOString().slice(0, 10);
  const cur: SurveyVersionEntry | null = prev[0] ?? null;
  const currentQuestions = Array.isArray(row.questions)
    ? (row.questions as SurveyQuestion[])
    : [];
  const archivedCur: SurveyVersionEntry | null = cur
    ? {
        ...cur,
        archived_at: today,
        snapshot: cur.snapshot ?? {
          questions: currentQuestions,
          sa_script: meta.sa_script ?? "",
        },
      }
    : null;
  const restoreVer: SurveyVersionEntry = {
    ver: nextVersionLabel(cur?.ver),
    date: today,
    note: `還原自 ${versionLabel}`,
    archived_at: null,
  };
  const versions = [
    restoreVer,
    ...(archivedCur ? [archivedCur] : []),
    ...prev.slice(1),
  ];
  const nextMeta: SurveyMetadata = sanitizeMetadata({
    ...meta,
    versions,
    status: "draft",
    sa_script: snap.sa_script ?? "",
  });

  const restoredQuestions = sanitizeQuestions(snap.questions);
  const { error } = await supabase
    .from("survey_templates")
    .update({ questions: restoredQuestions, metadata: nextMeta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  if (row.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

/**
 * 更新整份問卷的 SA 建議話術腳本（CRM02B 售後專用）
 * 獨立 action 是為了讓 detail view 的「💡 SA 建議話術」textarea 可以單獨 blur-save、
 * 不必每改一個字就觸發整份問卷的 update。
 */
export async function updateSurveySaScriptAction(
  id: string,
  saScript: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 survey id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row, error: readErr } = await supabase
    .from("survey_templates")
    .select("kind, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (readErr) return { ok: false, error: mapDbError(readErr) };
  if (!row) return { ok: false, error: "問卷不存在" };

  const meta = (row.metadata as SurveyMetadata) ?? {};
  const nextMeta = sanitizeMetadata({ ...meta, sa_script: saScript ?? "" });

  const { error } = await supabase
    .from("survey_templates")
    .update({ metadata: nextMeta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  if (row.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  revalidateAll(detailPaths(id));
  return { ok: true, data: { id } };
}

function nextVersionLabel(prev: string | undefined): string {
  // 簡單版本號遞增；prev = 'v3' → 'v4'；無 prev → 'v1'
  if (!prev) return "v1";
  const m = /^v(\d+)$/.exec(prev.trim());
  if (m) return `v${parseInt(m[1], 10) + 1}`;
  return `${prev}+`;
}

export async function deleteSurveyTemplateAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("survey_templates")
    .select("kind")
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .maybeSingle();

  const { error } = await supabase
    .from("survey_templates")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) {
    if (error.code === "23503")
      return {
        ok: false,
        error: "此問卷已被電訪紀錄引用，無法刪除。建議改用「停用」保留歷史。",
      };
    return { ok: false, error: mapDbError(error) };
  }
  if (row?.kind) revalidateAll(listPaths(row.kind as SurveyKind));
  return { ok: true, data: { id } };
}
