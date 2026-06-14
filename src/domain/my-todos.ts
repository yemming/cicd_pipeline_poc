"use server";

/**
 * Domain Helper — RP8 今日待辦清單
 *
 * 從既有表（無 DDL）彙整當前登入 user 的待辦事項：
 *
 * 類型 | 來源 | 收件角色
 * ─────|──────|─────────
 * pending_approval_decision  | repair_orders.metadata.approvals[] status=pending | 主管（has is_dept_manager / is_cross_admin）
 * pending_approval_requested | repair_orders.metadata.approvals[] status=pending | SA（申請人）
 * ro_rework                  | repair_orders status='退回重工'  lead_technician_id | 技師
 * ro_parts_waiting           | repair_orders status IN('待料','待料-車輛已還')     | 倉管
 * ro_checkout_pending        | repair_orders status='待結帳' sa_id              | SA
 *
 * 策略：
 *   - 根據 auth.uid() 找對應的 employees row
 *   - 依 role_codes 決定要拉哪些 todo 種類
 *   - 最多各撈 30 筆，total 不超過 50 筆
 *
 * TODO（Phase 2 needs DDL）：
 *   - T02 等待客戶授權 > 2hr：需獨立 pending_auth 時間欄位或 cron 標記
 *   - Realtime 推送取代輪詢
 */

import { createClient } from "@/lib/supabase/server";
import { type TodoItem } from "./my-todos.constants";

// ─────────────────────────────────────────────────────────────
// 主 API
// ─────────────────────────────────────────────────────────────

/**
 * 傳回當前 user 的今日待辦清單（最多 50 筆）。
 * 失敗時回傳空陣列（不丟例外）。
 */
export async function getMyTodos(): Promise<TodoItem[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return [];

    // 找 employees row（此 user_id 綁定的員工）
    const { data: emp } = await supabase
      .from("employees")
      .select("id, name, brand_id, role_codes, is_dept_manager, is_cross_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!emp) return []; // 此 user 無對應員工，無待辦

    const brandId = (emp.brand_id as string) ?? null;
    if (!brandId) return [];

    const roles = (emp.role_codes ?? []) as string[];
    const isManager = Boolean(emp.is_dept_manager) || Boolean(emp.is_cross_admin);
    const isTechnician = roles.includes("technician");
    const isWarehouse = roles.includes("warehouse");
    // SA：role_codes 含 'sa' 或 'service_advisor'
    const isSA = roles.some((r) => r === "sa" || r === "service_advisor" || r === "aftersales_sa");

    const todos: TodoItem[] = [];

    // ── 1. 主管：待核准的授權申請 ──────────────────────────────
    if (isManager) {
      const { data: rosPendingApproval } = await supabase
        .from("repair_orders")
        .select("id, ro_code, metadata")
        .eq("brand_id", brandId)
        .not("metadata", "is", null)
        .limit(60);

      for (const ro of rosPendingApproval ?? []) {
        const meta = (ro.metadata ?? {}) as Record<string, unknown>;
        const approvals = Array.isArray(meta.approvals) ? meta.approvals : [];
        for (const appr of approvals as Array<Record<string, unknown>>) {
          if (appr.status !== "pending") continue;
          todos.push({
            id: `appr_decision_${appr.id ?? ro.id}`,
            kind: "pending_approval_decision",
            title: `待核准：${String(appr.scenario_label ?? appr.scenario ?? "授權申請")}`,
            body: `工單 ${ro.ro_code ?? ""} 有待核准的授權申請。${appr.notes ? `備註：${String(appr.notes).slice(0, 60)}` : ""}`,
            href: `/parts/aftersales/approvals/${ro.id}`,
            priority: "red",
            ro_code: ro.ro_code ?? undefined,
            ro_id: ro.id,
            created_at: typeof appr.requested_at === "string" ? appr.requested_at : undefined,
          });
          if (todos.length >= 50) break;
        }
        if (todos.length >= 50) break;
      }
    }

    // ── 2. SA：我送審等待中（我是申請人）──────────────────────
    if (isSA) {
      const { data: rosMySent } = await supabase
        .from("repair_orders")
        .select("id, ro_code, metadata, sa_id")
        .eq("brand_id", brandId)
        .eq("sa_id", emp.id)
        .not("metadata", "is", null)
        .limit(30);

      for (const ro of rosMySent ?? []) {
        if (todos.length >= 50) break;
        const meta = (ro.metadata ?? {}) as Record<string, unknown>;
        const approvals = Array.isArray(meta.approvals) ? meta.approvals : [];
        for (const appr of approvals as Array<Record<string, unknown>>) {
          if (appr.status !== "pending") continue;
          todos.push({
            id: `appr_req_${appr.id ?? ro.id}`,
            kind: "pending_approval_requested",
            title: `授權等待中：${String(appr.scenario_label ?? appr.scenario ?? "送審")}`,
            body: `工單 ${ro.ro_code ?? ""} 的授權申請等待主管核准中。`,
            href: `/parts/aftersales/approvals/${ro.id}`,
            priority: "orange",
            ro_code: ro.ro_code ?? undefined,
            ro_id: ro.id,
            created_at: typeof appr.requested_at === "string" ? appr.requested_at : undefined,
          });
          if (todos.length >= 50) break;
        }
      }
    }

    // ── 3. 技師：被退回重工的工單 ──────────────────────────────
    if (isTechnician) {
      const { data: reworkROs } = await supabase
        .from("repair_orders")
        .select("id, ro_code, metadata, updated_at")
        .eq("brand_id", brandId)
        .eq("lead_technician_id", emp.id)
        .eq("status", "退回重工")
        .order("updated_at", { ascending: false })
        .limit(20);

      for (const ro of reworkROs ?? []) {
        if (todos.length >= 50) break;
        const meta = (ro.metadata ?? {}) as Record<string, unknown>;
        const count = typeof meta.rework_count === "number" ? meta.rework_count : 1;
        todos.push({
          id: `rework_${ro.id}`,
          kind: "ro_rework",
          title: `退回重工（第 ${count} 次）— ${ro.ro_code ?? ""}`,
          body: `此工單已被複檢退回，請確認退回原因並重新維修。`,
          href: `/parts/aftersales/repair-orders/${ro.id}`,
          priority: "red",
          ro_code: ro.ro_code ?? undefined,
          ro_id: ro.id,
          created_at: ro.updated_at ?? undefined,
        });
      }
    }

    // ── 4. 倉管：待料工單 ──────────────────────────────────────
    if (isWarehouse) {
      const { data: waitingROs } = await supabase
        .from("repair_orders")
        .select("id, ro_code, status, updated_at")
        .eq("brand_id", brandId)
        .in("status", ["待料", "待料-車輛已還"])
        .order("updated_at", { ascending: false })
        .limit(20);

      for (const ro of waitingROs ?? []) {
        if (todos.length >= 50) break;
        todos.push({
          id: `parts_waiting_${ro.id}`,
          kind: "ro_parts_waiting",
          title: `待料備件 — ${ro.ro_code ?? ""}（${ro.status ?? "待料"}）`,
          body: `此工單正在等待零件，請確認庫存並備料。`,
          href: `/parts/aftersales/repair-orders/${ro.id}`,
          priority: "orange",
          ro_code: ro.ro_code ?? undefined,
          ro_id: ro.id,
          created_at: ro.updated_at ?? undefined,
        });
      }
    }

    // ── 5. SA：待結帳工單 ──────────────────────────────────────
    if (isSA) {
      const { data: checkoutROs } = await supabase
        .from("repair_orders")
        .select("id, ro_code, updated_at")
        .eq("brand_id", brandId)
        .eq("sa_id", emp.id)
        .eq("status", "待結帳")
        .order("updated_at", { ascending: false })
        .limit(15);

      for (const ro of checkoutROs ?? []) {
        if (todos.length >= 50) break;
        todos.push({
          id: `checkout_${ro.id}`,
          kind: "ro_checkout_pending",
          title: `待結帳 — ${ro.ro_code ?? ""}`,
          body: `此工單已通過複檢，請盡快完成結帳程序。`,
          href: `/parts/aftersales/checkout/${ro.id}`,
          priority: "orange",
          ro_code: ro.ro_code ?? undefined,
          ro_id: ro.id,
          created_at: ro.updated_at ?? undefined,
        });
      }
    }

    // 依優先級排序（red → orange → grey）再按時間
    const priorityOrder: Record<string, number> = { red: 0, orange: 1, grey: 2 };
    todos.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      // 同優先級：越新越上面
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return todos.slice(0, 50);
  } catch (e) {
    console.error("[getMyTodos] 例外（傳回空陣列）", e);
    return [];
  }
}
