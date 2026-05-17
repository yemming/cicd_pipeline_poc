/**
 * Client-safe constants — CRM06B 自動化規則 toggle 區塊
 */

import type { PushChannel, PushKind } from "./sales-push-templates.constants";

export type AutomationRuleRow = {
  id: string;
  brand_id: string;
  kind: PushKind;
  name: string;
  trigger_event: string;
  trigger_config: Record<string, number | string | boolean>;
  channel: PushChannel;
  template_id: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * 觸發事件 → 中文 caption 顯示用（自動化規則卡片副標的 fallback）
 */
export const AUTOMATION_TRIGGER_LABEL: Record<string, string> = {
  desmo_due_in_days: "Desmo 大保養到期前 N 天",
  warranty_due_in_days: "保固到期前 N 天",
  d3_after_pickup: "取車後第 N 天",
  maintenance_due_in_days: "定期保養到期前 N 天",
  delivery_followup: "新車交付後第 N 天",
};
