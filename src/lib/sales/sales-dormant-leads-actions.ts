"use server";

/**
 * Server actions — 休眠戰敗管理（/sales/crm/dormant-leads）
 *
 * 對 sales_leads 表的 dormancy 欄位做寫入。Result 型別、不 redirect、client 自決導航。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  DormancyStatus,
  DormantLeadKind,
  LostReason,
  LostReasonB9,
} from "@/domain/sales-dormant-leads.constants";
import {
  mapLostReasonB9ToDb,
  REACTIVATION_DUE_DAYS,
} from "@/domain/sales-dormant-leads.constants";
import type { AftersalesLostReason } from "@/domain/crm-aftersales-dormant.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type DormantLeadInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  habc?: string | null;
  intent_model?: string | null;
  source?: string | null;
  rs_name?: string | null;
  dormancy_status: DormancyStatus;
  lost_reason?: LostReason | null;
  competitor_brand?: string | null;
  lost_at?: string | null;
  last_visit_at?: string | null;
  next_revive_at?: string | null;
  note?: string | null;
  /** 預設 'sales'；aftersales 流失走 'aftersales' */
  kind?: DormantLeadKind;
};

// LostReasonB9 import-only（不在此 "use server" 檔 re-export，
// 避免 Turbopack 誤把 type-only re-export 當 runtime 值炸模組）
// client component 直接從 "@/domain/sales-dormant-leads.constants" import。

const SALES_LIST_PATH = "/sales/crm/dormant-leads";
const AFTERSALES_LIST_PATH = "/aftersales/crm/dormant-customers";

/** 雙路徑都 revalidate（lead 可能在兩個 nav 入口看到，保險起見） */
function revalidateBoth(id?: string) {
  revalidatePath(SALES_LIST_PATH);
  revalidatePath(AFTERSALES_LIST_PATH);
  if (id) {
    revalidatePath(`${SALES_LIST_PATH}/${id}`);
    revalidatePath(`${AFTERSALES_LIST_PATH}/${id}`);
  }
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "代碼已存在（brand + code 必須唯一）";
  if (error.code === "23514") {
    if (error.message.includes("dormancy_status"))
      return "休眠狀態值不合法";
    if (error.message.includes("lost_reason"))
      return "戰敗原因值不合法";
  }
  if (error.code === "23503") return "外鍵錯誤";
  return `儲存失敗：${error.message}`;
}

function payloadFromInput(input: DormantLeadInput) {
  // habc 是 sales_leads 表 NOT NULL（給 銷售客戶基盤 排序用）— 沒填預設 'B'
  const habc = trim(input.habc ?? null) ?? "B";
  return {
    name: input.name.trim(),
    phone: trim(input.phone ?? null),
    email: trim(input.email ?? null),
    habc,
    intent_model: trim(input.intent_model ?? null),
    source: trim(input.source ?? null),
    rs_name: trim(input.rs_name ?? null),
    dormancy_status: input.dormancy_status,
    lost_reason: input.lost_reason ?? null,
    competitor_brand: trim(input.competitor_brand ?? null),
    lost_at: trim(input.lost_at ?? null),
    last_visit_at: trim(input.last_visit_at ?? null),
    next_revive_at: trim(input.next_revive_at ?? null),
    note: trim(input.note ?? null),
  };
}

async function genLeadCode(
  brand: string,
  kind: DormantLeadKind,
): Promise<string> {
  // 以日期 + 序號 簡單生成（POC）；aftersales 用 'AL' 前綴避免跟 sales lead 撞 code
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const prefix = `${kind === "aftersales" ? "AL" : "L"}${y}${m}${d}`;
  const table = kind === "aftersales" ? "aftersales_dormant_leads" : "sales_dormant_leads";
  const supabase = await createClient();
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand)
    .like("code", `${prefix}%`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function createDormantLeadAction(
  input: DormantLeadInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };
  if (!input.name?.trim()) return { ok: false, error: "客戶姓名必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const kind: DormantLeadKind = input.kind ?? "sales";
  const table = kind === "aftersales" ? "aftersales_dormant_leads" : "sales_dormant_leads";
  const code = await genLeadCode(brand, kind);

  const { data, error } = await supabase
    .from(table)
    .insert({
      brand_id: brand,
      code,
      ...payloadFromInput(input),
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateBoth();
  return { ok: true, data: { id: data.id } };
}

export async function updateDormantLeadAction(
  id: string,
  input: DormantLeadInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  if (!id) return { ok: false, error: "缺少 lead id" };
  if (!input.name?.trim()) return { ok: false, error: "客戶姓名必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const kind: DormantLeadKind = input.kind ?? "sales";
  const table = kind === "aftersales" ? "aftersales_dormant_leads" : "sales_dormant_leads";
  const { error } = await supabase
    .from(table)
    .update(payloadFromInput(input))
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateBoth(id);
  return { ok: true, data: { id } };
}

/** 喚醒一次（按鈕用）— revive_attempt_count +1、last_revive_at = now、status → revived（如果先前是 lost / dormant） */
export async function reviveDormantLeadAction(
  id: string,
  kind: DormantLeadKind = "sales",
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const table = kind === "aftersales" ? "aftersales_dormant_leads" : "sales_dormant_leads";
  const { data: row } = await supabase
    .from(table)
    .select("revive_attempt_count, dormancy_status")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!row) return { ok: false, error: "找不到 lead" };
  const nextStatus =
    row.dormancy_status === "active" || row.dormancy_status === "converted"
      ? row.dormancy_status
      : "revived";
  const { error } = await supabase
    .from(table)
    .update({
      revive_attempt_count: (row.revive_attempt_count ?? 0) + 1,
      last_revive_at: new Date().toISOString(),
      dormancy_status: nextStatus,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateBoth(id);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// 輪11-2 輔助：pickAnyCustomerId
// call_tasks.customer_id 有 FK → customers；dormant lead 通常還不是 customer，
// 沿用 sales-recontact-actions 的 fallback 策略：拿 brand 任一 customer id 讓
// FK 通過，真實客戶身份記在 metadata.lead_id / display_name。
// ──────────────────────────────────────────────────────────────────────────
async function pickAnyCustomerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brand: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("brand_id", brand)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * 標記為戰敗 / 流失（裁示三）
 *
 * - kind='sales'：接受 8 類 B9 UI 原因（`LostReasonB9`），寫入 `lost_reason`；
 * - kind='aftersales'：接受 6 類售後原因（`AftersalesLostReason`），寫入 `aftersales_lost_reason`；
 * - `competitor` 原因（sales only）時 `competitorBrand` 必填；
 * - 寫入後自動建立 `call_tasks` 喚醒任務（`call_type='dormant_reactivation'`）；
 *   建立失敗不阻主流程，但回報警告。
 */
export async function markLeadLostAction(
  id: string,
  reasonRaw: LostReasonB9 | AftersalesLostReason | string,
  competitorBrand: string | null,
  kind: DormantLeadKind = "sales",
): Promise<ActionResult<{ id: string; callTaskCreated: boolean; callTaskError?: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);

  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const table = kind === "aftersales" ? "aftersales_dormant_leads" : "sales_dormant_leads";

  // 讀取 lead name（不再依賴 sales_leads.kind 欄位，kind 由 caller 傳入）
  const { data: lead } = await supabase
    .from(table)
    .select("id, name")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!lead) return { ok: false, error: "找不到 lead" };

  const leadKind: DormantLeadKind = kind;
  const now = new Date().toISOString();

  let updatePayload: Record<string, unknown>;

  if (leadKind === "aftersales") {
    // 裁示三：售後流失 → 寫 aftersales_lost_reason，不動 lost_reason
    const aftersalesReason = reasonRaw as AftersalesLostReason;
    updatePayload = {
      dormancy_status: "lost",
      aftersales_lost_reason: aftersalesReason,
      lost_at: now,
    };
  } else {
    // 銷售戰敗 → 對映 B9 UI 原因 → DB 值，寫 lost_reason
    const reasonB9 = reasonRaw as LostReasonB9;
    // 輪11-4：competitor 必填競品品牌
    if (reasonB9 === "competitor" && !trim(competitorBrand)) {
      return { ok: false, error: "選擇「流失至競品」時，競品品牌必填" };
    }
    const dbReason: LostReason = mapLostReasonB9ToDb(reasonB9);
    updatePayload = {
      dormancy_status: "lost",
      lost_reason: dbReason,
      competitor_brand: trim(competitorBrand),
      lost_at: now,
    };
  }

  const { error } = await supabase
    .from(table)
    .update(updatePayload)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateBoth(id);

  // ──────────────────────────────────────────────────────────────────────
  // 輪11-2 push 模式：自動建立喚醒 call_task（sales only；aftersales 無固定喚醒天數表）
  // ──────────────────────────────────────────────────────────────────────
  let callTaskCreated = false;
  let callTaskError: string | undefined;
  try {
    const customerId = await pickAnyCustomerId(supabase, brand);
    if (customerId) {
      // aftersales 無固定 REACTIVATION_DUE_DAYS，預設 90 天
      const salesReasonB9 = leadKind === "sales" ? (reasonRaw as LostReasonB9) : null;
      const dueDays = salesReasonB9 ? (REACTIVATION_DUE_DAYS[salesReasonB9] ?? 90) : 90;
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + dueDays);
      // 排在 09:00 Taipei
      const scheduledAt = new Date(
        `${dueDate.toISOString().slice(0, 10)}T09:00:00+08:00`,
      ).toISOString();

      const taskMeta: Record<string, unknown> = {
        subkind: "dormant_reactivation",
        lead_id: lead.id,
        display_name: lead.name,
        due_days: dueDays,
      };
      if (leadKind === "sales") {
        taskMeta.lost_reason_b9 = salesReasonB9;
        taskMeta.lost_reason_db = updatePayload.lost_reason;
        taskMeta.competitor_brand = trim(competitorBrand) ?? null;
      } else {
        taskMeta.aftersales_lost_reason = reasonRaw;
      }

      const { error: ctErr } = await supabase.from("call_tasks").insert({
        brand_id: brand,
        kind: leadKind,
        customer_id: customerId,
        call_type: "dormant_reactivation",
        scheduled_at: scheduledAt,
        status: "pending",
        attempt_count: 0,
        answers: {},
        metadata: taskMeta,
        created_by: ctx.userId,
      });
      if (ctErr) {
        callTaskError = ctErr.message;
        console.warn(`[markLeadLostAction] call_task 建立失敗（不擋主流程）：${ctErr.message}`);
      } else {
        callTaskCreated = true;
        // revalidate call-tasks 清單
        revalidatePath("/crm/sales/call-tasks");
        revalidatePath("/sales/crm/call-tasks");
      }
    } else {
      callTaskError = "brand 無可用 customer，跳過自動建任務";
    }
  } catch (e: unknown) {
    callTaskError = e instanceof Error ? e.message : String(e);
    console.warn(`[markLeadLostAction] call_task 建立例外（不擋主流程）：${callTaskError}`);
  }

  return { ok: true, data: { id, callTaskCreated, callTaskError } };
}

export async function deleteDormantLeadAction(
  id: string,
  kind: DormantLeadKind = "sales",
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const table = kind === "aftersales" ? "aftersales_dormant_leads" : "sales_dormant_leads";
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateBoth(id);
  return { ok: true, data: { id } };
}
