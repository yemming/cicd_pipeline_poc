/**
 * Client-safe constants & types for parts-alerts-escalation domain.
 *
 * 不 import server-only 模組，UI client component 可以 import。
 */

// ---- Types ---------------------------------------------------------------

export type AlertEscalationRow = {
  id: string;
  brand_id: string;
  alert_type: string;
  alert_label: string;
  alert_priority: "low" | "mid" | "high";
  alert_icon: string | null;
  trigger_desc: string | null;
  tier: number;
  tier_label: string;
  delay_minutes: number;
  recipient_label: string | null;
  channel_push: boolean;
  channel_sms: boolean;
  channel_email: boolean;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AlertTypeMeta = {
  alert_type: string;
  alert_label: string;
  alert_priority: "low" | "mid" | "high";
  alert_icon: string | null;
  trigger_desc: string | null;
  tier_count: number;
};

export type EscalationInput = {
  alert_type: string;
  alert_label: string;
  alert_priority?: "low" | "mid" | "high";
  alert_icon?: string | null;
  trigger_desc?: string | null;
  tier: number;
  tier_label: string;
  delay_minutes: number;
  recipient_label?: string | null;
  channel_push?: boolean;
  channel_sms?: boolean;
  channel_email?: boolean;
  is_active?: boolean;
  sort_order?: number;
};

export type SimulationStep = {
  tier: number;
  tier_label: string;
  fire_at_minutes: number;
  fire_at_label: string;
  recipient_label: string | null;
  channels: ("push" | "sms" | "email")[];
};

// ---- Constants -----------------------------------------------------------

export const ALERT_PRIORITY_TONE: Record<
  "low" | "mid" | "high",
  { chip: string; label: string }
> = {
  low: { chip: "bg-tone-gray-50 text-tone-gray-700 border-tone-gray-100", label: "低" },
  mid: { chip: "bg-tone-amber-50 text-tone-amber-700 border-tone-amber-100", label: "中" },
  high: { chip: "bg-tone-red-50 text-tone-red-700 border-tone-red-100", label: "高" },
};

export const TIER_TONE: Record<number, "blue" | "amber" | "red" | "purple"> = {
  1: "blue",
  2: "amber",
  3: "red",
  4: "purple",
};

// ---- Pure helpers --------------------------------------------------------

export function formatMinutes(min: number): string {
  if (min <= 0) return "立即";
  if (min % 1440 === 0) return `${min / 1440} 天後`;
  if (min % 60 === 0) return `${min / 60} 小時後`;
  return `${min} 分鐘後`;
}

export function validateEscalationInput(input: EscalationInput): string | null {
  if (!input.alert_type?.trim()) return "告警類型必填";
  if (!input.alert_label?.trim()) return "告警標籤必填";
  if (!input.tier_label?.trim()) return "層級名稱必填";
  if (!Number.isFinite(input.tier) || input.tier < 1) return "tier 必須 ≥ 1";
  if (!Number.isFinite(input.delay_minutes) || input.delay_minutes < 0)
    return "延遲分鐘數必須 ≥ 0";
  return null;
}
