/**
 * M04L-12 client-safe constants & types for parts-warranty-used-parts.
 *
 * client component 從這裡 import；server-only 的 query/mutation 留在 .ts。
 */

export type LifecycleStage =
  | "removed"
  | "staged"
  | "under_review"
  | "return_to_oem"
  | "destroyed"
  | "recycled";

export type LifecycleTone =
  | "blue"
  | "teal"
  | "amber"
  | "red"
  | "purple"
  | "green"
  | "gray";

export const LIFECYCLE_STAGES: {
  key: LifecycleStage;
  label: string;
  tone: LifecycleTone;
}[] = [
  { key: "removed", label: "拆件取下", tone: "blue" },
  { key: "staged", label: "暫存倉入庫", tone: "teal" },
  { key: "under_review", label: "原廠審讀", tone: "amber" },
  { key: "return_to_oem", label: "退回原廠", tone: "purple" },
  { key: "destroyed", label: "銷毀", tone: "red" },
  { key: "recycled", label: "回收改派", tone: "green" },
];

export type LifecycleRuleRow = {
  id: string;
  brand_id: string;
  stage: LifecycleStage;
  action_label: string;
  sla_days: number | null;
  requires_approval: boolean;
  channel: string | null;
  target_role: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LifecycleStageStats = {
  stage: LifecycleStage;
  label: string;
  tone: LifecycleTone;
  count: number;
  avgStayDays: number | null;
  rulesActive: number;
  rulesTotal: number;
};

export type UsedPartsKpis = {
  totalItems: number;
  staged: number;
  awaitingOem: number;
  destroyed: number;
};
