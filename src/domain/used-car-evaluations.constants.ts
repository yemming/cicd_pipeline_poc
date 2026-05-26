/**
 * 中古車評估鑑價 — 純常數 / 型別。
 *
 * ⚠️ 本檔**不得** import "server-only" 或任何 server 相依（supabase/server、next/headers…）。
 * 原因：列印頁等 client component 需要 STATUS_LABELS 這類 value，
 * 若放在 [used-car-evaluations.ts]（server-only）裡，client 一 import value 就把整個
 * server module 拖進 client bundle → Turbopack 報「'server-only' cannot be imported
 * from a Client Component module」。常數獨立成檔，client / server 都能安全共用。
 *
 * server helper（used-car-evaluations.ts）會 re-export 這些，既有 server 端 importer 不用改。
 */

// ── Status ──
export const EVAL_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type EvaluationStatus = (typeof EVAL_STATUSES)[number];

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  draft: "草稿",
  submitted: "待簽核",
  approved: "已核准",
  rejected: "已駁回",
};

// ── Condition grade ──
export const CONDITION_GRADES = ["S", "A", "B", "C", "D"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];
