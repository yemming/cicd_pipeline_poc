/**
 * Domain Helper — CSI Survey Responses（問卷派發 / 回填 instance）
 *
 * 對應頁面：
 *   - /csi/surveys/[id]/responses        （後台 list 派發紀錄）
 *   - /csi/surveys/respond/[token]       （公開存取，客戶填問卷）
 *
 * 設計重點：
 *   - 內部讀取走 createClient（brand-scoped RLS）
 *   - 公開 token 讀取走 service client（繞 RLS，但只回單筆 + 不回敏感欄位）
 *   - submit 走 service client（公開存取者沒登入、無 brand session）
 *
 * 寫入走 src/lib/csi/survey-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { SurveyTemplateRow } from "./sales-survey-templates.constants";
import type {
  SurveyResponseListRow,
  SurveyResponseRow,
  SurveyResponseSourceModule,
  SurveyResponseStatus,
} from "./surveys.constants";

export type { SurveyResponseListRow, SurveyResponseRow };

function normalizeRow(r: Record<string, unknown>): SurveyResponseRow {
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    template_id: r.template_id as string,
    target_customer_id: (r.target_customer_id as string | null) ?? null,
    target_user_id: (r.target_user_id as string | null) ?? null,
    token: r.token as string,
    status: r.status as SurveyResponseStatus,
    response_json: (r.response_json as Record<string, unknown>) ?? {},
    sent_at: r.sent_at as string,
    responded_at: (r.responded_at as string | null) ?? null,
    source_module: (r.source_module as SurveyResponseSourceModule | null) ?? null,
    source_id: (r.source_id as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// List：某問卷模板的派發紀錄
// ──────────────────────────────────────────────────────────────────────────

export async function listResponses(
  templateId: string,
): Promise<SurveyResponseListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 先撈 responses（brand-scoped RLS 會自動篩 brand）
  const { data, error } = await supabase
    .from("survey_responses")
    .select(
      "id, brand_id, template_id, target_customer_id, target_user_id, token, status, response_json, sent_at, responded_at, source_module, source_id, metadata, created_at, updated_at",
    )
    .eq("template_id", templateId)
    .eq("brand_id", brand)
    .order("sent_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`survey-responses list: ${error.message}`);
  const rows = (data ?? []).map((r) => normalizeRow(r as Record<string, unknown>));
  if (rows.length === 0) return [];

  // 批撈 customers + template 一次
  const customerIds = [
    ...new Set(rows.map((r) => r.target_customer_id).filter(Boolean) as string[]),
  ];
  const customerMap = new Map<
    string,
    { name: string; code: string; phone: string | null }
  >();
  if (customerIds.length > 0) {
    const { data: cs } = await supabase
      .from("customers")
      .select("id, name, code, phone")
      .in("id", customerIds);
    for (const c of cs ?? []) {
      customerMap.set(c.id as string, {
        name: (c.name as string) ?? "—",
        code: (c.code as string) ?? "—",
        phone: (c.phone as string | null) ?? null,
      });
    }
  }

  const { data: tplRow } = await supabase
    .from("survey_templates")
    .select("code, name, kind")
    .eq("id", templateId)
    .maybeSingle();
  const tplCode = (tplRow?.code as string) ?? "—";
  const tplName = (tplRow?.name as string) ?? "—";
  const tplKind = (tplRow?.kind as "sales" | "aftersales") ?? "sales";

  return rows.map((r) => {
    const c = r.target_customer_id ? customerMap.get(r.target_customer_id) : undefined;
    return {
      ...r,
      customer_name: c?.name ?? null,
      customer_code: c?.code ?? null,
      customer_phone: c?.phone ?? null,
      template_code: tplCode,
      template_name: tplName,
      template_kind: tplKind,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 公開：用 token 查單筆 response + 對應 template
// ──────────────────────────────────────────────────────────────────────────

export type PublicResponseView = {
  response: Pick<
    SurveyResponseRow,
    "id" | "token" | "status" | "response_json" | "sent_at" | "responded_at"
  >;
  template: Pick<
    SurveyTemplateRow,
    "id" | "code" | "name" | "description" | "questions" | "kind"
  >;
  customer: { name: string | null } | null;
};

export async function fetchResponseByToken(
  token: string,
): Promise<PublicResponseView | null> {
  if (!token || typeof token !== "string") return null;
  // 公開存取走 service client（繞 RLS，因為訪問者沒登入）
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("survey_responses")
    .select(
      "id, token, status, response_json, sent_at, responded_at, template_id, target_customer_id",
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;

  const { data: tpl } = await supabase
    .from("survey_templates")
    .select("id, code, name, description, questions, kind")
    .eq("id", data.template_id as string)
    .maybeSingle();
  if (!tpl) return null;

  let customer: { name: string | null } | null = null;
  if (data.target_customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("name")
      .eq("id", data.target_customer_id as string)
      .maybeSingle();
    customer = c ? { name: (c.name as string) ?? null } : null;
  }

  return {
    response: {
      id: data.id as string,
      token: data.token as string,
      status: data.status as SurveyResponseStatus,
      response_json: (data.response_json as Record<string, unknown>) ?? {},
      sent_at: data.sent_at as string,
      responded_at: (data.responded_at as string | null) ?? null,
    },
    template: {
      id: tpl.id as string,
      code: tpl.code as string,
      name: tpl.name as string,
      description: (tpl.description as string | null) ?? null,
      questions: (tpl.questions as SurveyTemplateRow["questions"]) ?? [],
      kind: tpl.kind as "sales" | "aftersales",
    },
    customer,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 內部呼叫的 fetch（給 server action / dispatch reuse）
// ──────────────────────────────────────────────────────────────────────────

/** brand-scoped fetch 單筆 — 用於後台 detail 顯示 */
export async function getResponseById(
  id: string,
): Promise<SurveyResponseRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("survey_responses")
    .select(
      "id, brand_id, template_id, target_customer_id, target_user_id, token, status, response_json, sent_at, responded_at, source_module, source_id, metadata, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeRow(data as Record<string, unknown>);
}
