/**
 * Domain Helper — CRM06B 自動化規則（notification_automation_rules）
 *
 * 用途：列出 / toggle 自動化規則。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { AutomationRuleRow } from "./sales-push-automation.constants";
export type { AutomationRuleRow } from "./sales-push-automation.constants";
import type { PushKind, PushChannel } from "./sales-push-templates.constants";

export async function listAutomationRules(kind: PushKind): Promise<AutomationRuleRow[]> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_automation_rules")
    .select(
      "id, brand_id, kind, name, trigger_event, trigger_config, channel, template_id, description, is_active, created_at, updated_at",
    )
    .eq("brand_id", brand)
    .eq("kind", kind)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[listAutomationRules] error", error);
    return [];
  }
  type RawRow = Omit<AutomationRuleRow, "trigger_config" | "channel"> & {
    trigger_config: unknown;
    channel: string;
  };
  return ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    channel: r.channel as PushChannel,
    trigger_config:
      (r.trigger_config as AutomationRuleRow["trigger_config"]) ?? {},
  }));
}

export async function setAutomationRuleActive(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_automation_rules")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("brand_id", brand)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
