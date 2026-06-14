"use server";

/**
 * Domain Helper — RP5 主管授權工作流（Aftersales Approvals）
 *
 * 五情境（本波次實作 ① 保固通融 + ② 折扣超 SA 上限）：
 *   ① warranty_grace   — 保固期限通融（SA 申請，主管批准方可免費保固）
 *   ② discount_exceed  — 折扣超出 SA 授權範圍（結帳 applyDiscountAction 觸發）
 *   ③ fee_unlock       — 費用鎖定後需修改（預留）
 *   ④ cancel_order     — 工單中途取消（預留）
 *   ⑤ reinspect_exceed — 複檢退回重工超過 2 次（預留）
 *
 * 資料存 repair_orders.metadata.approvals[]（jsonb append）
 * TODO promote to typed table `repair_order_approvals` (needs DDL)
 *
 * 授權鏈（台灣商業環境）：
 *   第一順位：售後主管（is_dept_manager && dept_code=SVC）
 *   第二順位：店長（is_dept_manager 最高層，或 cross_admin）
 *   30 分鐘未處理 → 升級通知店長（cron route 骨架，待啟用）
 */

import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getCurrentUserDepartment } from "@/lib/rbac/department";
import { appendRepairOrderEvent } from "@/domain/repair-orders";
import { notifications } from "@/lib/notifications";
// RP8 站內通知
import { createInappNotifications } from "@/domain/user-notifications";

// 型別 / 常數從 .constants.ts 引入（不能直接放在 "use server" 檔，否則 const export 違規）
export type {
  ApprovalScenario,
  ApprovalStatus,
  ApprovalRecord,
  DecideApprovalInput,
} from "./aftersales-approvals.constants";
import { SCENARIO_LABEL } from "./aftersales-approvals.constants";
import type {
  ApprovalScenario,
  ApprovalRecord,
  DecideApprovalInput,
} from "./aftersales-approvals.constants";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ──────────────────────────────────────────────────────────────────────────
// 內部工具
// ──────────────────────────────────────────────────────────────────────────

/** 讀 repair_orders.metadata.approvals[]，不存在回 [] */
async function loadApprovals(roId: string): Promise<{ meta: Record<string, unknown>; approvals: ApprovalRecord[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repair_orders")
    .select("metadata")
    .eq("id", roId)
    .maybeSingle();
  if (error) throw error;
  const meta = ((data?.metadata ?? {}) as Record<string, unknown>);
  const approvals = Array.isArray(meta.approvals)
    ? (meta.approvals as ApprovalRecord[])
    : [];
  return { meta, approvals };
}

/** 把 approvals[] 更新回 jsonb（append-only 語意）*/
async function saveApprovals(
  roId: string,
  meta: Record<string, unknown>,
  approvals: ApprovalRecord[],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("repair_orders")
    .update({
      metadata: { ...meta, approvals },
      updated_at: new Date().toISOString(),
    })
    .eq("id", roId);
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────

/**
 * 取某張 RO 的所有授權記錄（永久保存，append-only）。
 * 呼叫方需有 AFTERSALES_APPROVAL_VIEW 或 RO_VIEW。
 */
export async function getApprovalsByRo(roId: string): Promise<ApprovalRecord[]> {
  await requirePermission(PERMISSIONS.RO_VIEW);
  const { approvals } = await loadApprovals(roId);
  // 最新在前
  return [...approvals].sort(
    (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
  );
}

/**
 * 取一筆授權記錄（by approvalId）。
 * 回 null 表示找不到。
 */
export async function getApprovalById(
  roId: string,
  approvalId: string,
): Promise<ApprovalRecord | null> {
  await requirePermission(PERMISSIONS.RO_VIEW);
  const { approvals } = await loadApprovals(roId);
  return approvals.find((a) => a.id === approvalId) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE — 申請授權
// ──────────────────────────────────────────────────────────────────────────

export type RequestApprovalInput = {
  ro_id: string;
  scenario: ApprovalScenario;
  notes?: string | null;
  /** 情境專用額外資料 */
  context?: Record<string, unknown>;
};

/**
 * requestApproval — SA 送出授權申請。
 *
 * 一張 RO 同情境只能有一筆 pending（重複送審回 error）。
 * 申請後：
 *   1. append ApprovalRecord(status=pending) 到 metadata.approvals[]
 *   2. appendRepairOrderEvent(approval_requested)
 *   3. after() dispatch aftersales_approval.requested → 推播主管
 */
export async function requestApproval(
  input: RequestApprovalInput,
): Promise<Result<{ approval_id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);  // SA 持有 RO_CLOSE 即可申請

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { email } = await getCurrentUserAndAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;

  // 取申請人顯示名
  let requesterName: string | null = email ?? null;
  if (actorId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("name")
      .eq("brand_id", scope.brand_id)
      .ilike("email", email ?? "")
      .maybeSingle();
    if (emp?.name) requesterName = emp.name;
  }

  // 驗重複 pending
  const { meta, approvals } = await loadApprovals(input.ro_id);
  const hasPending = approvals.some(
    (a) => a.scenario === input.scenario && a.status === "pending",
  );
  if (hasPending) {
    return {
      ok: false,
      error: `${SCENARIO_LABEL[input.scenario]} 已有待審申請，請等候主管處理`,
    };
  }

  // 取工單基本資料（通知主管用）
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("ro_code, customer_id, metadata")
    .eq("id", input.ro_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!ro) return { ok: false, error: "找不到工單" };

  // 取客戶名（通知用快照）
  let customerName: string | null = null;
  if (ro.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("name")
      .eq("id", ro.customer_id)
      .maybeSingle();
    customerName = cust?.name ?? null;
  }

  const approvalId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newRecord: ApprovalRecord = {
    id: approvalId,
    scenario: input.scenario,
    requester_id: actorId,
    requester_name: requesterName,
    requested_at: now,
    notes: input.notes?.trim() || null,
    context: input.context ?? {},
    status: "pending",
    decider_id: null,
    decider_name: null,
    decided_at: null,
    decision_reason: null,
  };

  await saveApprovals(input.ro_id, meta, [...approvals, newRecord]);

  // RP4 事件時間軸
  after(async () => {
    await appendRepairOrderEvent(
      input.ro_id,
      {
        action: "approval_requested",
        payload: {
          approval_id: approvalId,
          scenario: input.scenario,
          notes: newRecord.notes,
          context: newRecord.context,
        },
      },
      actorId,
    );
  });

  // Notification Hub → 推播主管（對外 LINE）
  const actionUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/parts/aftersales/approvals/${input.ro_id}?approval=${approvalId}`;
  after(async () => {
    try {
      await notifications.dispatch({
        code: "aftersales_approval.requested",
        payload: {
          approvalId,
          scenario: input.scenario,
          scenarioLabel: SCENARIO_LABEL[input.scenario],
          roCode: ro.ro_code ?? "",
          customerName: customerName ?? "（未知客戶）",
          saName: requesterName ?? "SA",
          notes: newRecord.notes ?? "",
          context: JSON.stringify(newRecord.context),
          actionUrl,
          brandId: scope.brand_id,
        },
        actorId: actorId ?? undefined,
      });
    } catch (e) {
      console.error("[RP5 requestApproval] 通知推播失敗（不影響申請）", e);
    }
  });

  // RP8 站內通知：授權申請 → 通知主管 + 自己（SA）
  after(async () => {
    try {
      const sb = await createClient();

      // 找主管（is_dept_manager=true, dept_code=SVC）的 user_id
      const { data: managers } = await sb
        .from("employees")
        .select("user_id")
        .eq("brand_id", scope.brand_id)
        .eq("is_dept_manager", true)
        .eq("is_active", true)
        .not("user_id", "is", null)
        .limit(5);

      const recipientIds = (managers ?? [])
        .map((m) => (m as { user_id: string | null }).user_id)
        .filter(Boolean) as string[];

      // 也通知 SA 自己（確認申請已送出）
      if (actorId && !recipientIds.includes(actorId)) {
        recipientIds.push(actorId);
      }

      const scenarioLabel = SCENARIO_LABEL[input.scenario] ?? input.scenario;
      await createInappNotifications(
        recipientIds.map((userId) => ({
          recipient_user_id: userId,
          event_code: "aftersales.approval.requested",
          title: `授權申請：${scenarioLabel}`,
          body: `工單 ${ro.ro_code ?? ""} ${customerName ? `（${customerName}）` : ""} — ${requesterName ?? "SA"} 申請${scenarioLabel}，請儘速審核。`,
          href: actionUrl,
          priority: "red" as const,
          source_ro_id: input.ro_id,
          source_ro_code: ro.ro_code ?? undefined,
          brand_id: scope.brand_id,
        })),
      );
    } catch (e) {
      console.error("[RP8 requestApproval 站內通知] 副作用例外（不影響申請）", e);
    }
  });

  return { ok: true, data: { approval_id: approvalId } };
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE — 主管核准 / 拒絕
// ──────────────────────────────────────────────────────────────────────────
// DecideApprovalInput 型別定義在 aftersales-approvals.constants.ts（re-exported 上方）

/**
 * decideApproval — 主管本人批准或拒絕授權申請。
 *
 * 守門條件：
 *   - 呼叫者必須是 is_dept_manager（售後主管）或 is_cross_admin（店長/管理員）
 *   - 申請必須是 pending 狀態
 *   - reason 必填（稽核）
 *
 * 決定後：
 *   1. 更新 ApprovalRecord.status / decider_* / decided_at / decision_reason
 *   2. appendRepairOrderEvent(approval_approved / approval_rejected)
 *   3. after() dispatch aftersales_approval.resolved → 推播 SA
 */
export async function decideApproval(
  input: DecideApprovalInput,
): Promise<Result<{ approval_id: string }>> {
  await requirePermission(PERMISSIONS.AFTERSALES_APPROVAL_DECIDE);

  // 主管身份驗證（本人登入才能 decide，不能 SA 代操）
  const dept = await getCurrentUserDepartment();
  const isSupervisor = dept.is_dept_manager || dept.is_cross_admin;
  if (!isSupervisor) {
    return {
      ok: false,
      error: "只有售後主管或店長可以批准 / 拒絕授權申請",
    };
  }

  if (!input.reason?.trim()) {
    return { ok: false, error: "請填寫決定說明（稽核記錄，必填）" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { email } = await getCurrentUserAndAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;

  // 取決定人顯示名
  let deciderName: string | null = email ?? null;
  if (actorId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("name")
      .eq("brand_id", scope.brand_id)
      .ilike("email", email ?? "")
      .maybeSingle();
    if (emp?.name) deciderName = emp.name;
  }

  const { meta, approvals } = await loadApprovals(input.ro_id);
  const idx = approvals.findIndex((a) => a.id === input.approval_id);
  if (idx === -1) return { ok: false, error: "找不到授權記錄" };

  const record = approvals[idx];
  if (record.status !== "pending") {
    return { ok: false, error: "此授權申請已處理，無法重複決定" };
  }

  const now = new Date().toISOString();
  const updated: ApprovalRecord = {
    ...record,
    status: input.decision,
    decider_id: actorId,
    decider_name: deciderName,
    decided_at: now,
    decision_reason: input.reason.trim(),
  };

  const newApprovals = [
    ...approvals.slice(0, idx),
    updated,
    ...approvals.slice(idx + 1),
  ];
  await saveApprovals(input.ro_id, meta, newApprovals);

  // RP4 事件時間軸
  const eventAction = input.decision === "approved" ? "approval_approved" : "approval_rejected";
  after(async () => {
    await appendRepairOrderEvent(
      input.ro_id,
      {
        action: eventAction,
        payload: {
          approval_id: input.approval_id,
          scenario: record.scenario,
          decision: input.decision,
          reason: input.reason.trim(),
        },
      },
      actorId,
    );
  });

  // 取工單 + 客戶資訊（通知 SA 用）
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("ro_code, customer_id")
    .eq("id", input.ro_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  let customerName: string | null = null;
  if (ro?.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("name")
      .eq("id", ro.customer_id)
      .maybeSingle();
    customerName = cust?.name ?? null;
  }

  // Notification Hub → 推播 SA（申請人，對外 LINE）
  const actionUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/parts/aftersales/approvals/${input.ro_id}?approval=${input.approval_id}`;
  after(async () => {
    try {
      await notifications.dispatch({
        code: "aftersales_approval.resolved",
        payload: {
          approvalId: input.approval_id,
          scenario: record.scenario,
          scenarioLabel: SCENARIO_LABEL[record.scenario],
          roCode: ro?.ro_code ?? "",
          customerName: customerName ?? "（未知客戶）",
          decision: input.decision,
          decisionLabel: input.decision === "approved" ? "核准" : "拒絕",
          reason: input.reason.trim(),
          deciderName: deciderName ?? "主管",
          actionUrl,
          brandId: scope.brand_id,
        },
        actorId: actorId ?? undefined,
      });
    } catch (e) {
      console.error("[RP5 decideApproval] 通知推播失敗（不影響決定）", e);
    }
  });

  // RP8 站內通知：授權結果 → 通知 SA（申請人）
  after(async () => {
    try {
      if (!record.requester_id) return;
      const scenarioLabel = SCENARIO_LABEL[record.scenario] ?? record.scenario;
      const decisionLabel = input.decision === "approved" ? "✅ 核准" : "❌ 拒絕";
      await createInappNotifications([
        {
          recipient_user_id: record.requester_id,
          event_code: "aftersales.approval.resolved",
          title: `授權結果：${scenarioLabel} ${decisionLabel}`,
          body: `工單 ${ro?.ro_code ?? ""} ${customerName ? `（${customerName}）` : ""} — ${decisionLabel}。${input.reason.trim()}`,
          href: actionUrl,
          priority: input.decision === "approved" ? ("orange" as const) : ("red" as const),
          source_ro_id: input.ro_id,
          source_ro_code: ro?.ro_code ?? undefined,
          brand_id: scope.brand_id,
        },
      ]);
    } catch (e) {
      console.error("[RP8 decideApproval 站內通知] 副作用例外（不影響決定）", e);
    }
  });

  return { ok: true, data: { approval_id: input.approval_id } };
}

// ──────────────────────────────────────────────────────────────────────────
// 工具：檢查某情境是否有已批准的授權（結帳 applyDiscountAction 超限時查詢）
// ──────────────────────────────────────────────────────────────────────────

/**
 * hasApprovedApproval — 確認某 RO 某情境已有核准的授權記錄。
 * 供 applyDiscountAction 等業務動作判斷「是否可超限執行」。
 *
 * @returns true 若存在 status=approved 的授權記錄
 */
export async function hasApprovedApproval(
  roId: string,
  scenario: ApprovalScenario,
): Promise<boolean> {
  const { approvals } = await loadApprovals(roId);
  return approvals.some((a) => a.scenario === scenario && a.status === "approved");
}

/**
 * getPendingApproval — 取某 RO 某情境的 pending 授權記錄（若有）。
 */
export async function getPendingApproval(
  roId: string,
  scenario: ApprovalScenario,
): Promise<ApprovalRecord | null> {
  const { approvals } = await loadApprovals(roId);
  return approvals.find((a) => a.scenario === scenario && a.status === "pending") ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// READ — 授權頁面資料（供 page.tsx server component 使用，避免 UI 直連 supabase）
// ──────────────────────────────────────────────────────────────────────────

export type ApprovalsPageData = {
  ro: { id: string; ro_code: string; brand_id: string } | null;
  customerName: string | null;
  approvals: ApprovalRecord[];
};

/**
 * getApprovalsPageData — 一次撈授權頁需要的全部資料。
 * 供 /parts/aftersales/approvals/[roId]/page.tsx server component 使用，
 * 讓 UI 不需直接 import @/lib/supabase。
 */
export async function getApprovalsPageData(roId: string): Promise<ApprovalsPageData> {
  await requirePermission(PERMISSIONS.RO_VIEW);

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: ro } = await supabase
    .from("repair_orders")
    .select("id, ro_code, brand_id, customer_id")
    .eq("id", roId)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (!ro) return { ro: null, customerName: null, approvals: [] };

  let customerName: string | null = null;
  if (ro.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("name")
      .eq("id", ro.customer_id)
      .maybeSingle();
    customerName = cust?.name ?? null;
  }

  const { approvals } = await loadApprovals(roId);
  const sorted = [...approvals].sort(
    (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
  );

  return {
    ro: { id: ro.id, ro_code: ro.ro_code, brand_id: ro.brand_id },
    customerName,
    approvals: sorted,
  };
}
