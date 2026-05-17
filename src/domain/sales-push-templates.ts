/**
 * Domain Helper — CRM06A/B 推播範本管理
 *
 * - 銷售（kind='sales'）/ 售後（kind='aftersales'）共用 push_message_templates 表
 * - server-only：UI 一律從 src/domain/* 進入，禁止 page/component 直 import supabase
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type {
  PushKind,
  PushChannel,
  PushTemplateCategory,
  PushTemplateRow,
} from "@/domain/sales-push-templates.constants";
import type {
  PushKind,
  PushChannel,
  PushTemplateRow,
} from "@/domain/sales-push-templates.constants";

export async function listPushTemplates(kind: PushKind): Promise<PushTemplateRow[]> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_message_templates")
    .select(
      "id, brand_id, kind, category, name, channel, icon, body, buttons, used_count, open_rate, is_active, created_at, updated_at",
    )
    .eq("brand_id", brand)
    .eq("kind", kind)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[listPushTemplates] error", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    brand_id: r.brand_id as string,
    kind: r.kind as PushKind,
    category: (r.category as string) ?? "",
    name: (r.name as string) ?? "",
    channel: (r.channel as PushChannel) ?? "line",
    icon: (r.icon as string | null) ?? null,
    body: (r.body as string) ?? "",
    buttons: Array.isArray(r.buttons)
      ? (r.buttons as Array<{ label: string; url: string }>)
      : [],
    used_count: Number(r.used_count ?? 0),
    open_rate: r.open_rate === null ? null : Number(r.open_rate),
    is_active: r.is_active !== false,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

export async function getPushTemplateById(id: string): Promise<PushTemplateRow | null> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("push_message_templates")
    .select(
      "id, brand_id, kind, category, name, channel, icon, body, buttons, used_count, open_rate, is_active, created_at, updated_at",
    )
    .eq("brand_id", brand)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    brand_id: data.brand_id as string,
    kind: data.kind as PushKind,
    category: (data.category as string) ?? "",
    name: (data.name as string) ?? "",
    channel: (data.channel as PushChannel) ?? "line",
    icon: (data.icon as string | null) ?? null,
    body: (data.body as string) ?? "",
    buttons: Array.isArray(data.buttons)
      ? (data.buttons as Array<{ label: string; url: string }>)
      : [],
    used_count: Number(data.used_count ?? 0),
    open_rate: data.open_rate === null ? null : Number(data.open_rate),
    is_active: data.is_active !== false,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}
