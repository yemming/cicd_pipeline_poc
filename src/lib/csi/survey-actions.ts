"use server";

/**
 * Server Actions — CSI Survey Dispatch / Submit（P1-#5）
 *
 * 兩條主要動作：
 *   - dispatchSurveyAction(template_id, targets[]) → 寫 survey_responses 多 row + LINE 通知（非阻塞）
 *   - submitResponseAction(token, response_json)   → 公開存取者填完問卷後回寫（走 service-role 繞 RLS）
 *
 * Result 型別、不 redirect、client 自決導航。
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { notifications } from "@/lib/notifications";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ──────────────────────────────────────────────────────────────────────────
// dispatchSurveyAction：把模板派發給 N 個 target
// ──────────────────────────────────────────────────────────────────────────

export type DispatchTarget = {
  /** customer.id（必填；如果想派給內部 user 之後再擴 target_user_id） */
  customer_id: string;
  /** 來源：'service' = 售後 RO、'sales' = 銷售訂單、'manual' = 後台手動 */
  source_module?: "service" | "sales" | "manual";
  /** 來源實體 id（RO id / order id） */
  source_id?: string | null;
};

export type DispatchSurveyResult = {
  inserted: number;
  response_ids: string[];
};

export async function dispatchSurveyAction(
  template_id: string,
  targets: DispatchTarget[],
): Promise<ActionResult<DispatchSurveyResult>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };
  if (!template_id) return { ok: false, error: "缺少 template_id" };
  if (!Array.isArray(targets) || targets.length === 0)
    return { ok: false, error: "至少要選一個派發對象" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 驗證 template 存在 + 同 brand
  const { data: tpl, error: tplErr } = await supabase
    .from("survey_templates")
    .select("id, name, kind, code")
    .eq("id", template_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (tplErr) return { ok: false, error: `查模板失敗：${tplErr.message}` };
  if (!tpl) return { ok: false, error: "問卷模板不存在或不屬於此品牌" };

  // 過濾重複 customer_id（同一輪派發不重複發給同一個人）
  const seenCust = new Set<string>();
  const cleanTargets: DispatchTarget[] = [];
  for (const t of targets) {
    if (!t.customer_id || seenCust.has(t.customer_id)) continue;
    seenCust.add(t.customer_id);
    cleanTargets.push(t);
  }
  if (cleanTargets.length === 0) return { ok: false, error: "沒有有效的派發對象" };

  // bulk insert
  const rows = cleanTargets.map((t) => ({
    template_id,
    target_customer_id: t.customer_id,
    token: randomBytes(20).toString("hex"),
    status: "sent",
    response_json: {},
    sent_at: new Date().toISOString(),
    source_module: t.source_module ?? "manual",
    source_id: t.source_id ?? null,
    brand_id: brand,
    metadata: { dispatched_by: ctx.userId },
    created_by: ctx.userId,
  }));

  const { data: inserted, error } = await supabase
    .from("survey_responses")
    .insert(rows)
    .select("id, token, target_customer_id");
  if (error) return { ok: false, error: `派發失敗：${error.message}` };
  const insertedRows = inserted ?? [];

  // 非阻塞推 LINE 通知
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");
  after(async () => {
    for (const row of insertedRows) {
      try {
        await notifications.dispatch({
          code: "survey.dispatched",
          payload: {
            template_id,
            template_code: tpl.code,
            template_name: tpl.name,
            template_kind: tpl.kind,
            response_id: row.id,
            customer_id: row.target_customer_id ?? "",
            response_url: `${appUrl}/csi/surveys/respond/${row.token}`,
          },
        });
      } catch (e) {
        // dispatch 失敗不影響本次派發（已寫進 survey_responses）
        console.error(
          "[csi/dispatch] notification dispatch 失敗（不影響派發本身）",
          e,
        );
      }
    }
  });

  revalidatePath(`/csi/surveys/${template_id}/responses`);
  return {
    ok: true,
    data: {
      inserted: insertedRows.length,
      response_ids: insertedRows.map((r) => r.id as string),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// submitResponseAction：公開存取者（用 token 訪問）填完問卷後回寫
// 不檢查 brand / 不檢查 user — token 本身就是「持有即可」的存取憑證
// 走 service client 繞 RLS（提交者沒登入、沒 brand session）
// ──────────────────────────────────────────────────────────────────────────

export async function submitResponseAction(
  token: string,
  response_json: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  if (!token || typeof token !== "string")
    return { ok: false, error: "缺少 token" };
  if (!response_json || typeof response_json !== "object")
    return { ok: false, error: "回填內容格式錯誤" };

  const supabase = createServiceClient();

  const { data: existing, error: readErr } = await supabase
    .from("survey_responses")
    .select("id, status, brand_id, template_id")
    .eq("token", token)
    .maybeSingle();
  if (readErr) return { ok: false, error: `查問卷失敗：${readErr.message}` };
  if (!existing) return { ok: false, error: "問卷連結無效或已失效" };
  if (existing.status === "responded")
    return { ok: false, error: "此問卷已填寫過，無法重複提交" };
  if (existing.status === "expired")
    return { ok: false, error: "此問卷已過期" };

  const { error } = await supabase
    .from("survey_responses")
    .update({
      status: "responded",
      response_json,
      responded_at: new Date().toISOString(),
    })
    .eq("id", existing.id as string);
  if (error) return { ok: false, error: `回填失敗：${error.message}` };

  // 重整 list（如果有人在後台正在看）
  revalidatePath(`/csi/surveys/${existing.template_id}/responses`);
  return { ok: true, data: { id: existing.id as string } };
}
