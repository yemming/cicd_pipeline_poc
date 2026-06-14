/**
 * Constants — Aftersales Approvals（client + server 共用）
 *
 * 不能放在 src/domain/aftersales-approvals.ts，因為該檔是 "use server"，
 * 不能 export 非 async 的 object。
 */

export type ApprovalScenario =
  | "warranty_grace"
  | "discount_exceed"
  | "fee_unlock"
  | "cancel_order"
  | "reinspect_exceed";

export const SCENARIO_LABEL: Record<ApprovalScenario, string> = {
  warranty_grace:    "保固期限通融",
  discount_exceed:   "折扣超出 SA 授權範圍",
  fee_unlock:        "費用鎖定後修改",
  cancel_order:      "工單中途取消",
  reinspect_exceed:  "複檢退回重工超過 2 次",
};

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalRecord = {
  /** UUID */
  id: string;
  scenario: ApprovalScenario;
  /** 申請人 user_id */
  requester_id: string | null;
  /** 申請人顯示名（快照） */
  requester_name: string | null;
  /** 申請時間（server UTC） */
  requested_at: string;
  /** 申請說明 */
  notes: string | null;
  /** 情境專用額外資料 */
  context: Record<string, unknown>;
  status: ApprovalStatus;
  /** 決定人 user_id */
  decider_id: string | null;
  /** 決定人顯示名（快照） */
  decider_name: string | null;
  /** 決定時間 */
  decided_at: string | null;
  /** 決定說明（必填） */
  decision_reason: string | null;
};

export type DecideApprovalInput = {
  ro_id: string;
  approval_id: string;
  decision: "approved" | "rejected";
  reason: string;
};
