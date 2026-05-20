"use server";

/**
 * Domain Helper — Aftersales 取車通知設定
 *
 * 單張 business_rules row（per brand），rule_kind='aftersales_pickup_notify_template'，
 * config jsonb 儲存 LINE / SMS 範本 + 預設通知方式。
 *
 * 對應頁面：/parts/aftersales/settings/pickup-notify
 * 設計稿：docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/11_取車通知設定.html
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { notifications } from "@/lib/notifications";

const RULE_KIND = "aftersales_pickup_notify_template";
const REVALIDATE_PATH = "/parts/aftersales/settings/pickup-notify";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PickupNotifyChannels = {
  line: boolean;
  sms: boolean;
  phone: boolean;
};

export type PickupNotifyConfig = {
  line_template: string;
  sms_template: string;
  default_channels: PickupNotifyChannels;
};

export type PickupNotifySettings = {
  id: string | null; // null = 該 brand 尚未建立過 row（會在第一次儲存時 insert）
  config: PickupNotifyConfig;
  updated_at: string | null;
};

const DEFAULT_LINE_TEMPLATE = `親愛的 {車主姓名} 您好，
您的 {車型} ({車牌}) 維修作業已完成，
請您方便時前來取車。

DUCATI 台北直營店 敬上`;

const DEFAULT_SMS_TEMPLATE = `{車主姓名} 您好，您的{車型}({車牌})已完修，請取車。DUCATI台北`;

const DEFAULTS: PickupNotifyConfig = {
  line_template: DEFAULT_LINE_TEMPLATE,
  sms_template: DEFAULT_SMS_TEMPLATE,
  default_channels: { line: true, sms: false, phone: false },
};

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "資料衝突：取車通知設定已存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

function normalizeConfig(raw: unknown): PickupNotifyConfig {
  const r = (raw ?? {}) as Partial<PickupNotifyConfig>;
  const ch = (r.default_channels ?? {}) as Partial<PickupNotifyChannels>;
  return {
    line_template:
      typeof r.line_template === "string" && r.line_template.trim()
        ? r.line_template
        : DEFAULTS.line_template,
    sms_template:
      typeof r.sms_template === "string" && r.sms_template.trim()
        ? r.sms_template
        : DEFAULTS.sms_template,
    default_channels: {
      line: typeof ch.line === "boolean" ? ch.line : DEFAULTS.default_channels.line,
      sms: typeof ch.sms === "boolean" ? ch.sms : DEFAULTS.default_channels.sms,
      phone: typeof ch.phone === "boolean" ? ch.phone : DEFAULTS.default_channels.phone,
    },
  };
}

export async function getPickupNotifySettings(): Promise<PickupNotifySettings> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("business_rules")
    .select("id, config, updated_at")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", RULE_KIND)
    .is("scope_store_id", null)
    .is("scope_subsidiary_id", null)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  if (!data) {
    return {
      id: null,
      config: { ...DEFAULTS, default_channels: { ...DEFAULTS.default_channels } },
      updated_at: null,
    };
  }

  return {
    id: data.id,
    config: normalizeConfig(data.config),
    updated_at: data.updated_at ?? null,
  };
}

export type PickupNotifyInput = {
  line_template: string;
  sms_template: string;
  default_channels: PickupNotifyChannels;
};

export async function updatePickupNotifySettings(
  input: PickupNotifyInput,
): Promise<Result<{ id: string }>> {
  const lineT = (input.line_template ?? "").trim();
  const smsT = (input.sms_template ?? "").trim();
  if (!lineT) return { ok: false, error: "LINE 通知範本不可空白" };
  if (!smsT) return { ok: false, error: "簡訊通知範本不可空白" };
  if (lineT.length > 600) return { ok: false, error: "LINE 範本不可超過 600 字" };
  if (smsT.length > 70) return { ok: false, error: "簡訊範本不可超過 70 字（單則 SMS 上限）" };

  const ch = input.default_channels ?? { line: false, sms: false, phone: false };
  if (!ch.line && !ch.sms && !ch.phone) {
    return { ok: false, error: "請至少勾選一種預設通知方式" };
  }

  const config: PickupNotifyConfig = {
    line_template: lineT,
    sms_template: smsT,
    default_channels: {
      line: !!ch.line,
      sms: !!ch.sms,
      phone: !!ch.phone,
    },
  };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 先查現有 row
  const { data: existing } = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", RULE_KIND)
    .is("scope_store_id", null)
    .is("scope_subsidiary_id", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("business_rules")
      .update({ config, is_active: true })
      .eq("id", existing.id);
    if (error) return { ok: false, error: mapDbError(error, "儲存失敗") };
    revalidatePath(REVALIDATE_PATH);
    return { ok: true, data: { id: existing.id } };
  }

  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: scope.brand_id,
      rule_kind: RULE_KIND,
      config,
      is_active: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立失敗") };
  revalidatePath(REVALIDATE_PATH);
  return { ok: true, data: { id: data.id } };
}

// ============================================================================
// P1-3 第十輪：多範本 + 排程 機制（pickup_notification_templates / _schedules）
// 取代上面的單一 settings row 模式；舊 API 暫時保留避免破壞既有 imports。
// ============================================================================

export type NotifChannel = "line" | "sms" | "email";
export type TriggerEvent =
  | "ro_completed"
  | "pickup_24h_before"
  | "pickup_2h_before"
  | "pickup_overdue";
export type TargetRole = "customer" | "sa" | "manager";

export type TemplateVariable = {
  name: string;
  label: string;
  example: string;
};

export type PickupNotificationTemplate = {
  id: string;
  brand_id: string;
  name: string;
  channel: NotifChannel;
  subject: string | null;
  body_template: string;
  variables: TemplateVariable[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PickupNotificationSchedule = {
  id: string;
  brand_id: string;
  template_id: string;
  trigger_event: TriggerEvent;
  offset_minutes: number;
  target_role: TargetRole | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  is_active: boolean;
  created_at: string;
  // 從 join 帶出來的範本資訊（給列表顯示用）
  template_name?: string | null;
  template_channel?: NotifChannel | null;
};

const TPL_REVALIDATE = "/parts/aftersales/settings/pickup-notify";

export async function listPickupTemplates(): Promise<PickupNotificationTemplate[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("pickup_notification_templates")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    variables: Array.isArray(r.variables) ? (r.variables as TemplateVariable[]) : [],
  })) as PickupNotificationTemplate[];
}

export async function listPickupSchedules(): Promise<PickupNotificationSchedule[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("pickup_notification_schedules")
    .select(
      "id, brand_id, template_id, trigger_event, offset_minutes, target_role, quiet_hours_start, quiet_hours_end, is_active, created_at, template:pickup_notification_templates(name, channel)",
    )
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const tpl = (r.template ?? null) as { name?: string; channel?: NotifChannel } | null;
    return {
      id: r.id as string,
      brand_id: r.brand_id as string,
      template_id: r.template_id as string,
      trigger_event: r.trigger_event as TriggerEvent,
      offset_minutes: r.offset_minutes as number,
      target_role: (r.target_role ?? null) as TargetRole | null,
      quiet_hours_start: (r.quiet_hours_start ?? null) as string | null,
      quiet_hours_end: (r.quiet_hours_end ?? null) as string | null,
      is_active: r.is_active as boolean,
      created_at: r.created_at as string,
      template_name: tpl?.name ?? null,
      template_channel: tpl?.channel ?? null,
    };
  });
}

export type UpsertTemplateInput = {
  id?: string;
  name: string;
  channel: NotifChannel;
  subject?: string | null;
  body_template: string;
  variables: TemplateVariable[];
  is_active: boolean;
};

export async function upsertTemplate(input: UpsertTemplateInput): Promise<Result<{ id: string }>> {
  const name = (input.name ?? "").trim();
  const body = (input.body_template ?? "").trim();
  if (!name) return { ok: false, error: "範本名稱不可空白" };
  if (!body) return { ok: false, error: "範本內容不可空白" };
  if (input.channel === "sms" && body.length > 70) {
    return { ok: false, error: "簡訊範本不可超過 70 字" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const row = {
    brand_id: scope.brand_id,
    name,
    channel: input.channel,
    subject: input.channel === "email" ? (input.subject ?? "").trim() || null : null,
    body_template: body,
    variables: input.variables ?? [],
    is_active: input.is_active,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase
      .from("pickup_notification_templates")
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: mapDbError(error, "儲存失敗") };
    revalidatePath(TPL_REVALIDATE);
    return { ok: true, data: { id: input.id } };
  }
  const { data, error } = await supabase
    .from("pickup_notification_templates")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立失敗") };
  revalidatePath(TPL_REVALIDATE);
  return { ok: true, data: { id: data.id } };
}

export async function setTemplateActive(id: string, active: boolean): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pickup_notification_templates")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "切換失敗") };
  revalidatePath(TPL_REVALIDATE);
  return { ok: true, data: { id } };
}

export async function deleteTemplate(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("pickup_notification_templates").delete().eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "刪除失敗") };
  revalidatePath(TPL_REVALIDATE);
  return { ok: true, data: { id } };
}

export async function previewWithVariables(
  id: string,
  vars: Record<string, string>,
): Promise<Result<{ subject: string | null; body: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pickup_notification_templates")
    .select("subject, body_template")
    .eq("id", id)
    .single();
  if (error) return { ok: false, error: mapDbError(error, "讀取範本失敗") };
  const subject = data.subject ? renderTemplate(data.subject, vars) : null;
  const body = renderTemplate(data.body_template, vars);
  return { ok: true, data: { subject, body } };
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export async function dispatchTestNotification(
  id: string,
  vars: Record<string, string>,
): Promise<Result<{ deliveredTo: string }>> {
  const preview = await previewWithVariables(id, vars);
  if (!preview.ok) return preview;
  const supabase = await createClient();
  const { data: tpl } = await supabase
    .from("pickup_notification_templates")
    .select("id, name, channel")
    .eq("id", id)
    .single();
  if (!tpl) return { ok: false, error: "找不到範本" };
  after(async () => {
    await notifications.dispatch({
      code: "pickup_notification.test",
      payload: {
        templateId: tpl.id,
        templateName: tpl.name,
        channel: tpl.channel,
        subject: preview.data.subject ?? "",
        body: preview.data.body,
        triggeredBy: "system",
      },
    });
  });
  return { ok: true, data: { deliveredTo: "已派入 Notification Hub" } };
}

export type UpsertScheduleInput = {
  id?: string;
  template_id: string;
  trigger_event: TriggerEvent;
  offset_minutes: number;
  target_role: TargetRole | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  is_active: boolean;
};

export async function upsertSchedule(input: UpsertScheduleInput): Promise<Result<{ id: string }>> {
  if (!input.template_id) return { ok: false, error: "請選擇要使用的範本" };
  const supabase = await createClient();
  const scope = await getActiveScope();
  const row = {
    brand_id: scope.brand_id,
    template_id: input.template_id,
    trigger_event: input.trigger_event,
    offset_minutes: input.offset_minutes,
    target_role: input.target_role,
    quiet_hours_start: input.quiet_hours_start,
    quiet_hours_end: input.quiet_hours_end,
    is_active: input.is_active,
  };
  if (input.id) {
    const { error } = await supabase
      .from("pickup_notification_schedules")
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: mapDbError(error, "儲存失敗") };
    revalidatePath(TPL_REVALIDATE);
    return { ok: true, data: { id: input.id } };
  }
  const { data, error } = await supabase
    .from("pickup_notification_schedules")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立失敗") };
  revalidatePath(TPL_REVALIDATE);
  return { ok: true, data: { id: data.id } };
}

export async function setScheduleActive(id: string, active: boolean): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pickup_notification_schedules")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "切換失敗") };
  revalidatePath(TPL_REVALIDATE);
  return { ok: true, data: { id } };
}

export async function deleteSchedule(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("pickup_notification_schedules").delete().eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "刪除失敗") };
  revalidatePath(TPL_REVALIDATE);
  return { ok: true, data: { id } };
}
