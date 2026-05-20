/**
 * Domain helper — Parts Alerts Escalation（M04L-6 告警階層）
 *
 * 接 `parts_alert_escalation_rules` 表。RLS 已啟用、走 user_has_brand(brand_id)。
 *
 * UI 唯一入口：list / upsert / delete / reorder / simulate。
 *
 * Client-safe 的 types / constants / pure helpers 在
 *   `./parts-alerts-escalation.constants.ts`，client component 應從那邊 import。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  type AlertEscalationRow,
  type AlertTypeMeta,
  type SimulationStep,
  formatMinutes,
} from "./parts-alerts-escalation.constants";

// Re-export constants 供 server-side caller 使用
export {
  ALERT_PRIORITY_TONE,
  TIER_TONE,
  formatMinutes,
  validateEscalationInput,
} from "./parts-alerts-escalation.constants";
export type {
  AlertEscalationRow,
  AlertTypeMeta,
  EscalationInput,
  SimulationStep,
} from "./parts-alerts-escalation.constants";

// ---- Queries -------------------------------------------------------------

export type EscalationListFilter = {
  alert_type?: string;
};

export async function listEscalations(
  filter: EscalationListFilter = {},
): Promise<AlertEscalationRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  let q = supabase
    .from("parts_alert_escalation_rules")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("alert_type", { ascending: true })
    .order("tier", { ascending: true })
    .order("sort_order", { ascending: true });
  if (filter.alert_type) q = q.eq("alert_type", filter.alert_type);
  const { data, error } = await q;
  if (error) throw new Error(`listEscalations failed: ${error.message}`);
  return (data ?? []) as AlertEscalationRow[];
}

export async function listAlertTypes(): Promise<AlertTypeMeta[]> {
  const rows = await listEscalations();
  const map = new Map<string, AlertTypeMeta>();
  for (const r of rows) {
    const existing = map.get(r.alert_type);
    if (!existing) {
      map.set(r.alert_type, {
        alert_type: r.alert_type,
        alert_label: r.alert_label,
        alert_priority: r.alert_priority,
        alert_icon: r.alert_icon,
        trigger_desc: r.trigger_desc,
        tier_count: 1,
      });
    } else {
      existing.tier_count += 1;
      if (
        r.alert_priority === "high" ||
        (r.alert_priority === "mid" && existing.alert_priority === "low")
      ) {
        existing.alert_priority = r.alert_priority;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const pri = { high: 0, mid: 1, low: 2 };
    if (pri[a.alert_priority] !== pri[b.alert_priority])
      return pri[a.alert_priority] - pri[b.alert_priority];
    return a.alert_type.localeCompare(b.alert_type);
  });
}

export async function getEscalationById(
  id: string,
): Promise<AlertEscalationRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("parts_alert_escalation_rules")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as AlertEscalationRow | null;
}

// ---- Simulation ----------------------------------------------------------

export async function simulateEscalation(
  alert_type: string,
): Promise<{ alert_label: string; trigger_desc: string | null; steps: SimulationStep[] }> {
  const rows = (await listEscalations({ alert_type })).filter((r) => r.is_active);
  rows.sort((a, b) => a.tier - b.tier);
  let cumulative = 0;
  const steps: SimulationStep[] = rows.map((r) => {
    cumulative += r.delay_minutes;
    return {
      tier: r.tier,
      tier_label: r.tier_label,
      fire_at_minutes: cumulative,
      fire_at_label: formatMinutes(cumulative),
      recipient_label: r.recipient_label,
      channels: pickChannels(r),
    };
  });
  return {
    alert_label: rows[0]?.alert_label ?? alert_type,
    trigger_desc: rows[0]?.trigger_desc ?? null,
    steps,
  };
}

function pickChannels(r: AlertEscalationRow): ("push" | "sms" | "email")[] {
  const out: ("push" | "sms" | "email")[] = [];
  if (r.channel_push) out.push("push");
  if (r.channel_sms) out.push("sms");
  if (r.channel_email) out.push("email");
  return out;
}
