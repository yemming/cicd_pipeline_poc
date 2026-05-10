export type ReplenishmentPolicyFieldKey =
  | "warehouse_id"
  | "frequency"
  | "horizon_days"
  | "auto_create_pr_for_urgent"
  | "include_forecast"
  | "notes";

export type ReplenishmentPolicyFormState = {
  error?: string;
  fieldErrors?: Partial<Record<ReplenishmentPolicyFieldKey, string>>;
};

export const EMPTY_REPLENISHMENT_POLICY_FORM_STATE: ReplenishmentPolicyFormState = {};

export type ReplenishmentPolicyRow = {
  id: string;
  brand_id: string;
  warehouse_id: string | null;
  frequency: "weekly_mon" | "biweekly" | "monthly_1" | "manual";
  horizon_days: number;
  auto_create_pr_for_urgent: boolean;
  include_forecast: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const FREQUENCY_LABEL: Record<string, string> = {
  weekly_mon: "每週一",
  biweekly: "每兩週",
  monthly_1: "每月一日",
  manual: "手動觸發",
};
