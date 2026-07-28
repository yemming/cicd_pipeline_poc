"use server";

/**
 * Server Actions — 庫存報廢單 (inventory_writeoffs)
 *
 * 三級審批：
 *   total_loss < APPROVAL_THRESHOLD        → approval_tier='self'   → status='approved'（倉管自批）
 *   APPROVAL_THRESHOLD ≤ total_loss < SENIOR → approval_tier='manager'      → status='pending'
 *   total_loss ≥ SENIOR_APPROVAL_THRESHOLD  → approval_tier='store_manager' → status='pending'
 *
 * Result<T> pattern：client 自己 router.push / 顯示 banner；不在 action 內 redirect。
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { writeAuditLog } from "@/domain/audit-logs";
import { createInappNotifications } from "@/domain/user-notifications";
import { getCurrentUserDepartment } from "@/lib/rbac/department";
import { SENIOR_APPROVAL_THRESHOLD } from "@/domain/loss-overflow.constants";
import {
  type WriteoffApprovalTier,
  type WriteoffInput,
  calcApprovalTier,
} from "./writeoff-core";

type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────
// 內部 helper：查該品牌所有部門主管 user_id
// ─────────────────────────────────────────────────

async function findManagerUserIds(
  brandId: string,
  tier: "manager" | "store_manager",
): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase
    .from("employees")
    .select("user_id")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .not("user_id", "is", null)
    .limit(10);

  if (tier === "store_manager") {
    // 店長層：is_cross_admin 或 role_codes 含 store_manager
    q = q.or("is_cross_admin.eq.true,role_codes.cs.{store_manager}");
  } else {
    // 部門主管層：is_dept_manager（含任何 manager role）
    q = q.eq("is_dept_manager", true);
  }

  const { data } = await q;
  return ((data ?? []) as { user_id: string | null }[])
    .map((m) => m.user_id)
    .filter(Boolean) as string[];
}

// ─────────────────────────────────────────────────
// createInventoryWriteoffAction — 建立報廢單
// ─────────────────────────────────────────────────

export async function createInventoryWriteoffAction(
  input: WriteoffInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.COUNT_ADJUST);

  if (!input.item_id) return { ok: false, error: "料件 item_id 必填" };
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "報廢數量必須為正數" };
  const unitCost = Number(input.unit_cost);
  if (!Number.isFinite(unitCost) || unitCost < 0) return { ok: false, error: "單位成本不可為負數" };
  if (!input.writeoff_reason?.trim()) return { ok: false, error: "報廢原因必填" };

  const scope = await getActiveScope();
  const brand = input.brand_id ?? scope.brand_id;
  const totalLoss = qty * unitCost;
  const tier = calcApprovalTier(totalLoss);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const requestedBy = user?.id ?? null;
  const now = new Date().toISOString();

  const status = tier === "self" ? "approved" : "pending";

  const { data, error } = await supabase
    .from("inventory_writeoffs")
    .insert({
      brand_id: brand,
      item_id: input.item_id,
      qty,
      unit_cost: unitCost,
      total_loss: totalLoss,
      writeoff_reason: input.writeoff_reason.trim(),
      source: input.source ?? "manual",
      workorder_id: input.workorder_id ?? null,
      store_id: input.store_id ?? scope.store_id ?? null,
      status,
      approval_tier: tier,
      requested_by: requestedBy,
      requested_at: now,
      approved_by: tier === "self" ? requestedBy : null,
      approved_at: tier === "self" ? now : null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: `建立報廢單失敗：${error.message}` };

  const writeoffId = data.id;

  // ── 非阻塞副作用 ──
  after(async () => {
    // 1. 寫稽核日誌
    await writeAuditLog({
      table_name: "inventory_writeoffs",
      record_id: writeoffId,
      action: "writeoff_created",
      actor_id: requestedBy,
      brand_id: brand,
      after: { status, approval_tier: tier, total_loss: totalLoss },
    });

    // 2. 若需要審批，推站內通知給對應層主管
    if (status === "pending" && tier !== "self") {
      try {
        const recipientIds = await findManagerUserIds(brand, tier);
        // 也通知申請人自己（確認已送出）
        if (requestedBy && !recipientIds.includes(requestedBy)) {
          recipientIds.push(requestedBy);
        }
        if (recipientIds.length > 0) {
          const tierLabel = tier === "store_manager" ? "店長" : "主管";
          await createInappNotifications(
            recipientIds.map((uid) => ({
              recipient_user_id: uid,
              event_code: "writeoff.pending_approval",
              title: `報廢單待審：NT$ ${totalLoss.toLocaleString()}`,
              body: `有一筆報廢單（金額 NT$${totalLoss.toLocaleString()}）需要${tierLabel}審批，請儘速處理。`,
              href: "/parts/count/writeoffs",
              priority: "orange" as const,
              brand_id: brand,
            })),
          );
        }
      } catch (e) {
        console.error("[createInventoryWriteoffAction] 通知推播失敗（不影響報廢建立）", e);
      }
    }
  });

  revalidatePath("/parts/count/writeoffs");
  return { ok: true, data: { id: writeoffId } };
}

// ─────────────────────────────────────────────────
// approveInventoryWriteoffAction — 審批通過
// ─────────────────────────────────────────────────

export async function approveInventoryWriteoffAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  await requirePermission(PERMISSIONS.COUNT_ADJUST);

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brand = scope.brand_id;

  const { data: cur, error: getErr } = await supabase
    .from("inventory_writeoffs")
    .select("status, approval_tier, total_loss")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (getErr || !cur) {
    return { ok: false, error: `找不到報廢單：${getErr?.message ?? "no row"}` };
  }
  if (cur.status !== "pending") {
    return { ok: false, error: `狀態 ${cur.status} 不可審批` };
  }

  // store_manager tier：需店長旗標（is_dept_manager + role_codes 含 store_manager、或 is_cross_admin）
  const tier = cur.approval_tier as WriteoffApprovalTier;
  if (tier === "store_manager") {
    const dept = await getCurrentUserDepartment();
    const isStoreManager =
      dept.is_cross_admin ||
      dept.role_codes.includes("store_manager");
    if (!isStoreManager) {
      return {
        ok: false,
        error:
          `此報廢單金額 NT$${(cur.total_loss ?? 0).toLocaleString()} 超過 ${SENIOR_APPROVAL_THRESHOLD.toLocaleString()}，` +
          "需要店長（store_manager role 或跨部門管理員）審批",
      };
    }
  }
  // manager tier：COUNT_ADJUST 已在上方 requirePermission 檢查過，無需額外驗

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const approverId = user?.id ?? null;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("inventory_writeoffs")
    .update({ status: "approved", approved_by: approverId, approved_at: now })
    .eq("id", id)
    .eq("brand_id", brand);

  if (error) return { ok: false, error: `審批失敗：${error.message}` };

  // ⚠️ 稽核日誌改同步寫入（不用 after()）。
  // after() 在本專案 Next.js 16 + Zeabur 部署環境實測不可靠（同一顆雷已在
  // ro-checkout-actions.ts「修補二」「包F」、parts/actions/index.ts 高價盤差通知
  // 踩過並改同步解決）——這裡的 after() 區塊部署後實測 audit_logs 從未真正寫入過
  // 任何一筆 WRITEOFF 相關記錄（全表掃描 SELECT DISTINCT action 25 種既有值裡完全
  // 沒有任何 writeoff 字串）。比照既有解法改同步執行，try/catch 吞錯不擋審批主流程。
  try {
    await writeAuditLog({
      table_name: "inventory_writeoffs",
      record_id: id,
      action: "writeoff_approved",
      actor_id: approverId,
      brand_id: brand,
      after: { status: "approved", total_loss: cur.total_loss, approval_tier: tier },
    });
  } catch (e) {
    console.error("[approveInventoryWriteoffAction] 稽核日誌寫入失敗（不影響審批主流程）", e);
  }

  revalidatePath("/parts/count/writeoffs");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────
// rejectInventoryWriteoffAction — 審批駁回
// ─────────────────────────────────────────────────

export async function rejectInventoryWriteoffAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!reason?.trim()) return { ok: false, error: "請填寫駁回原因" };
  await requirePermission(PERMISSIONS.COUNT_ADJUST);

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brand = scope.brand_id;

  const { data: cur, error: getErr } = await supabase
    .from("inventory_writeoffs")
    .select("status, approval_tier, total_loss, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (getErr || !cur) {
    return { ok: false, error: `找不到報廢單：${getErr?.message ?? "no row"}` };
  }
  if (cur.status !== "pending") {
    return { ok: false, error: `狀態 ${cur.status} 不可駁回` };
  }

  const tier = cur.approval_tier as WriteoffApprovalTier;
  if (tier === "store_manager") {
    const dept = await getCurrentUserDepartment();
    const isStoreManager = dept.is_cross_admin || dept.role_codes.includes("store_manager");
    if (!isStoreManager) {
      return {
        ok: false,
        error: "此報廢單需要店長才能駁回",
      };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const approverId = user?.id ?? null;
  const now = new Date().toISOString();
  const prevMeta = ((cur.metadata ?? {}) as Record<string, unknown>);

  const { error } = await supabase
    .from("inventory_writeoffs")
    .update({
      status: "rejected",
      approved_by: approverId,
      approved_at: now,
      metadata: { ...prevMeta, reject_reason: reason.trim() },
    })
    .eq("id", id)
    .eq("brand_id", brand);

  if (error) return { ok: false, error: `駁回失敗：${error.message}` };

  after(async () => {
    await writeAuditLog({
      table_name: "inventory_writeoffs",
      record_id: id,
      action: "writeoff_rejected",
      actor_id: approverId,
      brand_id: brand,
      after: { status: "rejected", reason: reason.trim() },
    });
  });

  revalidatePath("/parts/count/writeoffs");
  return { ok: true, data: { id } };
}

