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
} from "@/domain/sales-dormant-leads.constants";

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
  const supabase = await createClient();
  const { count } = await supabase
    .from("sales_leads")
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
  const code = await genLeadCode(brand, kind);

  const { data, error } = await supabase
    .from("sales_leads")
    .insert({
      brand_id: brand,
      kind,
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
  const { error } = await supabase
    .from("sales_leads")
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
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: row } = await supabase
    .from("sales_leads")
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
    .from("sales_leads")
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

/** 標記為戰敗 */
export async function markLeadLostAction(
  id: string,
  reason: LostReason,
  competitorBrand: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("sales_leads")
    .update({
      dormancy_status: "lost",
      lost_reason: reason,
      competitor_brand: trim(competitorBrand),
      lost_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateBoth(id);
  return { ok: true, data: { id } };
}

export async function deleteDormantLeadAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.CUSTOMER_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("sales_leads")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: mapDbError(error) };
  revalidateBoth(id);
  return { ok: true, data: { id } };
}
