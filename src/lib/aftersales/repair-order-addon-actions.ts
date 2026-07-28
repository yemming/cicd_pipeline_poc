"use server";

/**
 * Server actions — repair_order_addons CRUD + decideAddon
 *
 * Result<T> pattern。Spec：04_追加項目記錄.html
 *  - createAddonAction
 *  - updateAddonAction（pending 才允許）
 *  - cancelAddonAction
 *  - decideAddonAction（agreed / deferred / rejected）
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { appendRepairOrderEvent } from "@/domain/repair-orders";
// RP4 Layer1 稽核日誌
import { writeAuditLog } from "@/domain/audit-logs";
// RP8 站內通知
import { createInappNotification } from "@/domain/user-notifications";
// 退料閉環：取消追加 → 建退料待確認（不立即回補庫存）
import { createReturnRequestsBatch } from "@/domain/parts-return-requests";
import { getTodayClosingTime } from "@/domain/aftersales-settings";
// B3：客戶自帶零件確認書 — 簽名圖檔存 Storage（沿用試乘 Wizard / RO 結帳既有的簽名上傳 helper）
import { uploadSignatureDataUrl } from "@/lib/aftersales/signature-upload";
import {
  CUSTOMER_SUPPLIED_SUFFIX,
  type CustomerSuppliedWaiver,
  type CustomerSuppliedWaiverRole,
} from "@/domain/repair-order-addons.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AddonType = "labor" | "parts" | "labor_and_parts";
export type SafetyLevel = "normal" | "safety_related" | "safety_critical";
export type ConfirmMethod = "phone" | "onsite" | "line";
export type CustomerDecision = "agreed" | "deferred" | "rejected";

export type AddonInput = {
  ro_id: string;
  name: string;
  addon_type: AddonType;
  safety_level: SafetyLevel;
  estimated_fee: number;
  tech_reason?: string | null;
  confirm_method?: ConfirmMethod | null;
};

const PAGE = "/parts/aftersales/addons";

async function ensureRoOwned(
  roId: string,
): Promise<{ ok: true; brand: string } | { ok: false; error: string }> {
  if (!roId) return { ok: false, error: "缺少工單 ID" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "找不到該工單或無權存取" };
  return { ok: true, brand };
}

async function nextAddonNo(roId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repair_order_addons")
    .select("addon_no")
    .eq("ro_id", roId)
    .order("addon_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { addon_no: number } | undefined;
  return (top?.addon_no ?? 0) + 1;
}

function validateInput(input: AddonInput): string | null {
  if (!input.name?.trim()) return "請填寫項目名稱";
  if (!input.addon_type) return "請選擇類型";
  if (!input.safety_level) return "請選擇安全等級";
  if (!Number.isFinite(input.estimated_fee) || input.estimated_fee < 0)
    return "估計費用需為大於等於 0 的數字";
  if (input.estimated_fee > 999999) return "估計費用過大";
  return null;
}

export async function createAddonAction(
  input: AddonInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const valid = validateInput(input);
  if (valid) return { ok: false, error: valid };

  const owned = await ensureRoOwned(input.ro_id);
  if (!owned.ok) return owned;

  const supabase = await createClient();
  const addonNo = await nextAddonNo(input.ro_id);

  const { data, error } = await supabase
    .from("repair_order_addons")
    .insert({
      brand_id: owned.brand,
      ro_id: input.ro_id,
      addon_no: addonNo,
      name: input.name.trim(),
      addon_type: input.addon_type,
      safety_level: input.safety_level,
      estimated_fee: input.estimated_fee,
      tech_reason: input.tech_reason?.trim() || null,
      confirm_method: input.confirm_method ?? null,
      customer_decision: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[addon-actions] createAddon error", error);
    return { ok: false, error: error?.message ?? "建立追加項目失敗" };
  }

  revalidatePath(PAGE);
  return { ok: true, data: { id: data.id } };
}

export async function updateAddonAction(
  id: string,
  patch: Partial<AddonInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 ID" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: cur } = await supabase
    .from("repair_order_addons")
    .select("id, customer_decision")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!cur) return { ok: false, error: "找不到追加項目" };
  if (cur.customer_decision !== "pending")
    return { ok: false, error: "已決策的追加項目不可修改，請取消後新建" };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.addon_type !== undefined) update.addon_type = patch.addon_type;
  if (patch.safety_level !== undefined) update.safety_level = patch.safety_level;
  if (patch.estimated_fee !== undefined) update.estimated_fee = patch.estimated_fee;
  if (patch.tech_reason !== undefined) update.tech_reason = patch.tech_reason?.trim() || null;
  if (patch.confirm_method !== undefined) update.confirm_method = patch.confirm_method ?? null;

  const { error } = await supabase
    .from("repair_order_addons")
    .update(update)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

/**
 * RP3 退料模式：
 *  - full_return    : 完整退料（庫存預留釋放 + 已出庫 stock_items 退回 + RO lines 費用移除）
 *  - damage_writeoff: 損耗核銷（庫存不退、費用保留、記錄至 metadata 供稽核）
 *  - mid_install    : 安裝中（暫時先記錄狀態、不動庫存、不移除費用，後續人工處理）
 *
 * pending 狀態的 addon 仍可用 cancelMode=full_return（等同原先無庫存的取消）。
 * agreed 狀態才需要三選一；pending 強制走 full_return（不需要展示 modal）。
 */
export type AddonCancelMode = "full_return" | "damage_writeoff" | "mid_install";

export type CancelAddonInput = {
  /** 退料模式：agreed 追加必填；pending 追加省略時預設 full_return */
  cancel_mode?: AddonCancelMode;
  /** 損耗核銷或安裝中的原因描述（供稽核）；damage_writeoff 必填 */
  cancel_reason?: string | null;
  /** 損耗核銷：主管授權人 ID（記錄稽核，POC 階段選填）*/
  supervisor_id?: string | null;
};

export async function cancelAddonAction(
  id: string,
  input: CancelAddonInput = {},
): Promise<ActionResult<{ id: string; removed_line_ids: string[]; reservation_released: boolean }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 ID" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const now = new Date().toISOString();

  // ── 1. 載入 addon ──
  const { data: cur, error: loadErr } = await supabase
    .from("repair_order_addons")
    .select("id, ro_id, name, addon_type, customer_decision, reserved_at, estimated_fee, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (loadErr || !cur) return { ok: false, error: "找不到追加項目" };
  if (cur.customer_decision === "cancelled")
    return { ok: false, error: "追加項目已取消，無需重複操作" };
  if (!["pending", "agreed"].includes(cur.customer_decision))
    return { ok: false, error: `當前決策狀態「${cur.customer_decision}」不支援取消退料` };

  // ── 2. 決定 cancelMode ──
  const cancelMode: AddonCancelMode =
    cur.customer_decision === "pending"
      ? "full_return" // pending → 無庫存問題，直接完整退料
      : (input.cancel_mode ?? "full_return");

  // damage_writeoff 必須填原因
  if (cancelMode === "damage_writeoff" && !input.cancel_reason?.trim()) {
    return { ok: false, error: "損耗核銷必須填寫原因" };
  }

  const removed_line_ids: string[] = [];
  let reservation_released = false;

  // ── 3. full_return：釋放預留 + 退回已出庫 stock_items + 移除 RO lines ──
  if (cancelMode === "full_return") {
    // 3a. 釋放 inventory_reservations（active 狀態的）
    const { data: activeReservations } = await supabase
      .from("inventory_reservations")
      .select("id, status")
      .eq("brand_id", brand)
      .eq("source_type", "repair_order_addon")
      .eq("source_id", id)
      .eq("status", "active");

    for (const res of activeReservations ?? []) {
      const { error: relErr } = await supabase
        .from("inventory_reservations")
        .update({
          status: "cancelled",
          released_at: now,
          release_reason: "cancelled_by_user",
          updated_at: now,
        })
        .eq("id", res.id)
        .eq("brand_id", brand)
        .eq("status", "active");
      if (relErr) {
        console.error("[cancelAddon] release reservation error", relErr);
        // 非致命：記錄但繼續（預留已被消耗或已釋放時可能失敗）
      } else {
        reservation_released = true;
      }
    }

    // 3b. 退料閉環（取代「翻舊 issued stock_item 改回 available」）：
    //     從 repair_order_lines(kind='part') 推導已領出的零件，建立退料待確認記錄。
    //     庫存「不立即回補」——倉管在 return-in Tab B 實物核對後確認才回補。
    //     （delta：出庫 persistPick 未寫 stock_items.metadata.source_addon_id，無法可靠
    //       回溯具體 lot，故改以工單零件明細為退料來源，確認時 insert available 回補。）
    const { data: addonLines, error: linesFetchErr } = await supabase
      .from("repair_order_lines")
      .select("id, kind, part_name, qty, item_id, part_code, unit_price")
      .eq("brand_id", brand)
      .eq("source", "addon")
      .eq("source_ref_id", id);

    if (linesFetchErr) {
      console.error("[cancelAddon] fetch ro_lines error", linesFetchErr);
      return { ok: false, error: `讀取工單明細失敗：${linesFetchErr.message}` };
    }

    const lines = (addonLines ?? []) as Array<{
      id: string;
      kind: string;
      part_name: string | null;
      qty: number | null;
      item_id: string | null;
      part_code: string | null;
      unit_price: number | null;
    }>;

    // 僅零件需要退料；工時行直接隨費用移除
    const partLines = lines.filter((l) => l.kind === "part" && Number(l.qty ?? 0) > 0);
    if (partLines.length > 0) {
      const dueBy = await getTodayClosingTime();
      const { data: { user: reqUser } } = await supabase.auth.getUser();
      await createReturnRequestsBatch(
        partLines.map((l) => ({
          source_type: "addon_cancel" as const,
          source_ro_id: cur.ro_id as string,
          source_addon_id: id,
          source_line_id: l.id,
          item_id: l.item_id,
          part_name: l.part_name || (cur.name as string),
          part_code: l.part_code,
          qty_requested: Number(l.qty ?? 0),
          return_reason: `追加項目「${cur.name}」取消退料`,
          requested_by: reqUser?.id ?? null,
          unit_cost: Number(l.unit_price ?? 0),
        })),
        { brand, due_by: dueBy },
      );
    }

    // 3c. 移除 repair_order_lines（費用立即從工單移除，庫存與費用分開處理）
    if (lines.length > 0) {
      const lineIds = lines.map((l) => l.id);
      const { error: delErr } = await supabase
        .from("repair_order_lines")
        .delete()
        .in("id", lineIds)
        .eq("brand_id", brand);
      if (delErr) {
        console.error("[cancelAddon] delete ro_lines error", delErr);
        return { ok: false, error: `移除工單費用明細失敗：${delErr.message}` };
      }
      removed_line_ids.push(...lineIds);
    }
  }

  // ── 4. 更新 addon envelope ──
  const prevMeta = ((cur.metadata ?? {}) as Record<string, unknown>);
  const { data: { user } } = await supabase.auth.getUser();

  const cancelRecord: Record<string, unknown> = {
    cancel_mode: cancelMode,
    cancelled_at: now,
    cancelled_by: user?.id ?? null,
    cancel_reason: input.cancel_reason?.trim() || null,
    supervisor_id: input.supervisor_id ?? null,
    removed_line_count: removed_line_ids.length,
    reservation_released,
  };

  const newMeta: Record<string, unknown> = {
    ...prevMeta,
    cancel_record: cancelRecord, // RP3 損耗核銷稽核記錄
    // TODO promote cancel_record to typed table repair_order_addon_cancellations (needs DDL)
  };

  const { error: updateErr } = await supabase
    .from("repair_order_addons")
    .update({
      customer_decision: "cancelled",
      updated_at: now,
      metadata: newMeta,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (updateErr) return { ok: false, error: updateErr.message };

  // ── 5. RP4 事件時間軸（非阻塞）──
  {
    const roId = cur.ro_id as string;
    const actorId = user?.id ?? null;
    after(async () => {
      await appendRepairOrderEvent(
        roId,
        {
          action: "addon_cancelled",
          payload: {
            addon_id: id,
            addon_name: cur.name,
            cancel_mode: cancelMode,
            cancel_reason: input.cancel_reason?.trim() || null,
            removed_line_count: removed_line_ids.length,
            reservation_released,
            estimated_fee: cur.estimated_fee,
          },
        },
        actorId,
      );
    });
  }

  // ── 6. RP4 Layer1 稽核日誌（非阻塞）──
  {
    const actorId = user?.id ?? null;
    const addonBrandId = (cur as Record<string, unknown>).brand_id as string | null ?? brand;
    after(async () => {
      await writeAuditLog({
        table_name: "repair_order_addons",
        record_id: id,
        action: "addon_cancelled",
        actor_id: actorId,
        brand_id: addonBrandId,
        before: {
          customer_decision: cur.customer_decision,
          estimated_fee: cur.estimated_fee,
          addon_name: cur.name,
        },
        after: {
          customer_decision: "cancelled",
          cancel_mode: cancelMode,
          cancel_reason: input.cancel_reason?.trim() || null,
          removed_line_count: removed_line_ids.length,
          reservation_released,
        },
      });
    });
  }

  revalidatePath(PAGE);
  revalidatePath(`/parts/aftersales/repair-orders/${cur.ro_id}/lines`);
  return { ok: true, data: { id, removed_line_ids, reservation_released } };
}

/**
 * 退料閉環 — 追加項目「部分取消（逐行）」。
 *
 * SA 勾選 agreed 追加項目下的特定明細行取消，其餘明細保持施工。
 *  - 零件行（kind='part'）→ 建立退料待確認記錄（庫存不立即回補）
 *  - 工時行（kind='labor'）→ 直接移除費用
 *  - 取消的明細行從 repair_order_lines 刪除（費用移除）；未勾選的不動。
 *
 * 操作對象是 repair_order_lines（明細行層），與整筆 cancelAddonAction 互補。
 */
export async function partialCancelAddonLineAction(
  lineIds: string[],
  reasons: Record<string, string> = {},
): Promise<ActionResult<{ created_rts_ids: string[]; removed_line_ids: string[] }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!lineIds || lineIds.length === 0)
    return { ok: false, error: "請至少勾選一筆明細行取消" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const now = new Date().toISOString();

  const { data: lineRows, error: loadErr } = await supabase
    .from("repair_order_lines")
    .select("id, repair_order_id, kind, part_name, labor_name, qty, item_id, part_code, unit_price, source, source_ref_id")
    .in("id", lineIds)
    .eq("brand_id", brand);
  if (loadErr) return { ok: false, error: `讀取明細行失敗：${loadErr.message}` };
  const lines = (lineRows ?? []) as Array<{
    id: string;
    repair_order_id: string;
    kind: string;
    part_name: string | null;
    labor_name: string | null;
    qty: number | null;
    item_id: string | null;
    part_code: string | null;
    unit_price: number | null;
    source: string | null;
    source_ref_id: string | null;
  }>;
  if (lines.length === 0) return { ok: false, error: "找不到指定的明細行" };

  const roId = lines[0].repair_order_id;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 零件行 → 建退料待確認
  const partLines = lines.filter((l) => l.kind === "part" && Number(l.qty ?? 0) > 0);
  let created_rts_ids: string[] = [];
  if (partLines.length > 0) {
    const dueBy = await getTodayClosingTime();
    const { ids } = await createReturnRequestsBatch(
      partLines.map((l) => ({
        source_type: "addon_partial" as const,
        source_ro_id: l.repair_order_id,
        source_addon_id: l.source_ref_id,
        source_line_id: l.id,
        item_id: l.item_id,
        part_name: l.part_name || "未命名零件",
        part_code: l.part_code,
        qty_requested: Number(l.qty ?? 0),
        return_reason: reasons[l.id]?.trim() || "追加項目部分取消退料",
        requested_by: user?.id ?? null,
        unit_cost: Number(l.unit_price ?? 0),
      })),
      { brand, due_by: dueBy },
    );
    created_rts_ids = ids;
  }

  // 移除被取消的明細行（費用移除）
  const { error: delErr } = await supabase
    .from("repair_order_lines")
    .delete()
    .in("id", lines.map((l) => l.id))
    .eq("brand_id", brand);
  if (delErr) return { ok: false, error: `移除明細行失敗：${delErr.message}` };

  // 稽核日誌（非阻塞）
  {
    const actorId = user?.id ?? null;
    after(async () => {
      await writeAuditLog({
        table_name: "repair_order_lines",
        record_id: roId,
        action: "addon_line_partial_cancelled",
        actor_id: actorId,
        brand_id: brand,
        after: {
          cancelled_line_ids: lines.map((l) => l.id),
          created_rts_count: created_rts_ids.length,
          cancelled_at: now,
        },
      });
    });
  }

  revalidatePath(PAGE);
  revalidatePath(`/parts/aftersales/repair-orders/${roId}/addons`);
  revalidatePath(`/parts/aftersales/repair-orders/${roId}/lines`);
  return { ok: true, data: { created_rts_ids, removed_line_ids: lines.map((l) => l.id) } };
}

export type RejectionReason =
  | "price"
  | "time"
  | "unnecessary"
  | "consider"
  | "other";

export type DecideInput = {
  customer_decision: CustomerDecision;
  confirm_method?: ConfirmMethod | null;
  decision_note?: string | null;
  /** B-23：拒絕時的結構化原因（五選一），存 metadata.rejection_reason */
  rejection_reason?: RejectionReason | null;
};

const REJECTION_REASONS: ReadonlyArray<RejectionReason> = [
  "price",
  "time",
  "unnecessary",
  "consider",
  "other",
];

/**
 * RP7 待處理項目安全等級升級規則：
 *  normal → safety_related → safety_critical
 * 二次拒絕同項目（item_desc 相同）自動升一級
 */
const SAFETY_LEVEL_UPGRADE: Record<string, string> = {
  normal: "safety_related",
  safety_related: "safety_critical",
  safety_critical: "safety_critical", // 已最高不再升
};

/**
 * RP7 工具：把 addon safety_level（"normal" | "safety_related" | "safety_critical"）
 * 對映到 vehicle_pending_items.metadata.safety_level（"建議" | "警示" | "緊急"）
 */
function addonSafetyToDisplayLevel(safetyLevel: string): string {
  switch (safetyLevel) {
    case "safety_critical":
      return "緊急";
    case "safety_related":
      return "警示";
    default:
      return "建議";
  }
}

/**
 * decideAddon — 三向分支
 *  - agreed   → INSERT repair_order_lines (source='addon', source_ref_id=addon.id)
 *               依 addon_type 拆 1 或 2 條 line
 *               metadata.reserved_at 標記庫存預留時點（庫存實扣交給領料模組）
 *  - deferred → 更新 envelope；RP7：寫入 vehicle_pending_items（含 safety_level）
 *  - rejected → 更新 envelope；RP7：寫入 vehicle_pending_items（含 safety_level + reject_count，二次拒絕升級）
 *
 * RP7：不再只標 metadata.requires_followup=true，改真寫 vehicle_pending_items。
 */
export async function decideAddonAction(
  id: string,
  decision: DecideInput,
): Promise<ActionResult<{ id: string; created_line_ids: string[] }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 ID" };
  if (!["agreed", "deferred", "rejected"].includes(decision.customer_decision))
    return { ok: false, error: "決策值不合法" };
  // B-23：拒絕必須帶結構化原因（漏斗分析的關鍵數據）
  if (decision.customer_decision === "rejected") {
    if (!decision.rejection_reason)
      return { ok: false, error: "請選擇拒絕原因" };
    if (!REJECTION_REASONS.includes(decision.rejection_reason))
      return { ok: false, error: "拒絕原因不合法" };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: addon, error: loadErr } = await supabase
    .from("repair_order_addons")
    .select(
      "id, ro_id, name, addon_type, safety_level, estimated_fee, customer_decision, metadata",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (loadErr || !addon) return { ok: false, error: "找不到追加項目" };
  if (addon.customer_decision !== "pending")
    return { ok: false, error: "已決策過的追加項目不可重複決策" };

  const now = new Date().toISOString();
  const meta = ((addon.metadata ?? {}) as Record<string, unknown>) || {};
  const created_line_ids: string[] = [];

  // === agreed → 寫 ro_lines ===
  if (decision.customer_decision === "agreed") {
    const fee = Number(addon.estimated_fee ?? 0);
    // labor_and_parts 預設拆 50/50，UI 之後可以由 metadata.pricing_breakdown 覆蓋
    const breakdown =
      (meta.pricing_breakdown as { labor_fee?: number; parts_fee?: number } | undefined) ?? {};

    const linesToInsert: Array<{
      kind: "labor" | "part";
      labor_name?: string;
      labor_units?: number;
      part_name?: string;
      qty?: number;
      unit_price: number;
      amount: number;
    }> = [];

    if (addon.addon_type === "labor") {
      linesToInsert.push({
        kind: "labor",
        labor_name: addon.name,
        labor_units: 1,
        unit_price: fee,
        amount: fee,
      });
    } else if (addon.addon_type === "parts") {
      linesToInsert.push({
        kind: "part",
        part_name: addon.name,
        qty: 1,
        unit_price: fee,
        amount: fee,
      });
    } else if (addon.addon_type === "labor_and_parts") {
      const laborFee = Number(breakdown.labor_fee ?? Math.round(fee / 2));
      const partsFee = Math.max(0, fee - laborFee);
      linesToInsert.push({
        kind: "labor",
        labor_name: `${addon.name}（工資）`,
        labor_units: 1,
        unit_price: laborFee,
        amount: laborFee,
      });
      linesToInsert.push({
        kind: "part",
        part_name: `${addon.name}（零件）`,
        qty: 1,
        unit_price: partsFee,
        amount: partsFee,
      });
    }

    // line_no 從現有最大值往後排
    const { data: maxRow } = await supabase
      .from("repair_order_lines")
      .select("line_no")
      .eq("repair_order_id", addon.ro_id)
      .order("line_no", { ascending: false })
      .limit(1);
    let nextLineNo = ((maxRow?.[0]?.line_no as number | undefined) ?? 0) + 1;

    // B3：客戶自帶零件確認書 — 若 addon 提報時已標記客戶自備料，寫入 ro_lines 時
    // 附註品名「（客戶自備）」+ 回填標記/切結書快照，供「維修明細」頁顯示鎖定狀態。
    // 不建立庫存預留（提報當下已在 addAddon() 擋下），本段純粹是顯示與稽核用途。
    const customerSupplied = Boolean(meta.customer_supplied);
    const waiverSnapshot = (meta.customer_supplied_waiver ?? null) as CustomerSuppliedWaiver | null;

    for (const l of linesToInsert) {
      const isCustomerSuppliedPart = customerSupplied && l.kind === "part";
      const { data: inserted, error: insErr } = await supabase
        .from("repair_order_lines")
        .insert({
          repair_order_id: addon.ro_id,
          brand_id: brand,
          line_no: nextLineNo,
          kind: l.kind,
          labor_name: l.labor_name ?? null,
          labor_units: l.labor_units ?? null,
          part_name: isCustomerSuppliedPart && l.part_name
            ? `${l.part_name}${CUSTOMER_SUPPLIED_SUFFIX}`
            : l.part_name ?? null,
          qty: l.qty ?? null,
          unit_price: l.unit_price,
          amount: l.amount,
          source: "addon",
          source_ref_id: addon.id,
          ...(isCustomerSuppliedPart
            ? { metadata: { customer_supplied: true, customer_supplied_waiver: waiverSnapshot } }
            : {}),
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        console.error("[addon-actions] decideAddon insert line error", insErr);
        return { ok: false, error: insErr?.message ?? "寫入維修明細失敗" };
      }
      created_line_ids.push(inserted.id);
      nextLineNo += 1;
    }
  }

  // 更新 envelope
  const requiresFollowup = decision.customer_decision !== "agreed";
  const newMeta: Record<string, unknown> = { ...meta };
  if (requiresFollowup) newMeta.requires_followup = true;
  // B-23：把結構化拒絕原因落地 metadata，供 B-24 圓餅圖 / SA 轉化率聚合
  if (decision.customer_decision === "rejected" && decision.rejection_reason) {
    newMeta.rejection_reason = decision.rejection_reason;
  }

  // ── RP7：拒絕/暫緩 → 真寫 vehicle_pending_items（含 safety_level + reject_count）──
  // 須從 RO 找到 vehicle_id，無則跳過（Walk-in 未建車輛主檔時）
  if (decision.customer_decision !== "agreed") {
    try {
      const { data: roRow } = await supabase
        .from("repair_orders")
        .select("vehicle_id")
        .eq("id", addon.ro_id as string)
        .eq("brand_id", brand)
        .maybeSingle();

      const vehicleId = (roRow as { vehicle_id?: string | null } | null)?.vehicle_id ?? null;

      if (vehicleId) {
        const displayLevel = addonSafetyToDisplayLevel(addon.safety_level as string ?? "normal");

        // 找同車同 item_desc 上次的 pending item（計算 reject_count + 升級）
        const { data: existing } = await supabase
          .from("vehicle_pending_items")
          .select("id, status, metadata")
          .eq("brand_id", brand)
          .eq("vehicle_id", vehicleId)
          .eq("item_desc", addon.name)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const existingMeta = existing?.metadata as Record<string, unknown> | null;
        const prevRejectCount = typeof existingMeta?.reject_count === "number"
          ? existingMeta.reject_count
          : 0;
        const newRejectCount = prevRejectCount + 1;

        // 二次拒絕同項目 → 安全等級自動升一級
        const baseLevel = (existingMeta?.safety_level as string) ?? displayLevel;
        const escalatedLevel = newRejectCount >= 2
          ? SAFETY_LEVEL_UPGRADE[baseLevel] ?? baseLevel
          : baseLevel;

        const pendingMeta: Record<string, unknown> = {
          safety_level: escalatedLevel,
          reject_count: newRejectCount,
          decision: decision.customer_decision,
          estimated_fee: addon.estimated_fee,
          addon_type: addon.addon_type,
          source_addon_id: id,
          source_ro_id: addon.ro_id,
        };

        if (existing?.id) {
          // 已有 pending item → 更新 reject_count + 可能的升級 safety_level
          await supabase
            .from("vehicle_pending_items")
            .update({
              metadata: pendingMeta,
              reason: decision.decision_note?.trim() || null,
              updated_at: now,
            } as Record<string, unknown>)
            .eq("id", existing.id)
            .eq("brand_id", brand);
        } else {
          // 新建 pending item
          await supabase.from("vehicle_pending_items").insert({
            brand_id: brand,
            vehicle_id: vehicleId,
            item_desc: addon.name as string,
            reason: decision.decision_note?.trim() || null,
            status: "pending",
            metadata: pendingMeta,
          });
        }
      }
    } catch (e) {
      // RP7 寫入失敗不阻塞主流程（addon decision 已完成）
      console.error("[RP7 decideAddon] vehicle_pending_items upsert 失敗（非致命）", e);
    }
  }
  // TODO promote: vehicle_pending_items.metadata → typed columns safety_level/reject_count (needs DDL)

  const update: Record<string, unknown> = {
    customer_decision: decision.customer_decision,
    customer_decision_at: now,
    confirm_method: decision.confirm_method ?? undefined,
    decision_note: decision.decision_note?.trim() || null,
    metadata: newMeta,
    updated_at: now,
  };
  if (decision.customer_decision === "agreed") update.reserved_at = now;
  // 移除 undefined（避免 supabase 把 confirm_method 變 null）
  if (update.confirm_method === undefined) delete update.confirm_method;

  const { error: upErr } = await supabase
    .from("repair_order_addons")
    .update(update)
    .eq("id", id)
    .eq("brand_id", brand);
  if (upErr) {
    console.error("[addon-actions] decideAddon update envelope error", upErr);
    return { ok: false, error: upErr.message };
  }

  // ── RP4 事件時間軸：記錄追加決策（非阻塞） ──
  {
    const {
      data: { user: _addonUser },
    } = await supabase.auth.getUser();
    const addonActorId = _addonUser?.id ?? null;
    const addonRoId = addon.ro_id as string;
    after(async () => {
      await appendRepairOrderEvent(
        addonRoId,
        {
          action: "addon_decision",
          payload: {
            addon_id: id,
            addon_name: addon.name,
            customer_decision: decision.customer_decision,
            estimated_fee: addon.estimated_fee,
            safety_level: addon.safety_level,
            confirm_method: decision.confirm_method ?? null,
            rejection_reason: decision.rejection_reason ?? null,
          },
        },
        addonActorId,
      );
    });
  }

  // ── RP8 站內通知：追加項目拒絕 → 通知對應 SA（非阻塞）──
  // 情境：客戶拒絕追加 → SA 收到通知、可確認並決定後續處理。
  if (decision.customer_decision === "rejected") {
    const addonRoId = addon.ro_id as string;
    const brand = (await getActiveScope()).brand_id;
    after(async () => {
      try {
        const sb = await createClient();
        // 取工單的 SA（=sa_id 對應的 user_id）
        const { data: ro } = await sb
          .from("repair_orders")
          .select("ro_code, sa_id")
          .eq("id", addonRoId)
          .eq("brand_id", brand)
          .maybeSingle();
        if (!ro?.sa_id) return;

        // 找 SA 的 auth user_id（employees.user_id）
        const { data: emp } = await sb
          .from("employees")
          .select("user_id")
          .eq("id", ro.sa_id)
          .maybeSingle();
        if (!emp?.user_id) return;

        await createInappNotification({
          recipient_user_id: emp.user_id as string,
          event_code: "aftersales.addon.rejected",
          title: `客戶拒絕追加項目`,
          body: `工單 ${ro.ro_code ?? ""} 的追加「${String(addon.name)}」已被拒絕。${
            decision.rejection_reason ? `原因：${decision.rejection_reason}。` : ""
          }已寫入人車待處理清單。`,
          href: `/parts/aftersales/repair-orders/${addonRoId}/lines`,
          priority: "orange",
          source_ro_id: addonRoId,
          source_ro_code: ro.ro_code ?? undefined,
          brand_id: brand,
        });
      } catch (e) {
        console.error("[RP8 addon rejected 通知] 副作用例外（不影響）", e);
      }
    });
  }

  revalidatePath(PAGE);
  revalidatePath(`/parts/aftersales/repair-orders/${addon.ro_id}/lines`);
  return { ok: true, data: { id, created_line_ids } };
}

// ─────────────────────────────────────────────────────────────
// B3 — 客戶自帶零件確認書
//
//  - setCustomerSuppliedAction     ：補標記／取消標記「客戶自備料」（pending 時提報就可帶標記，
//                                     這裡是給 SA 事後補標記或取消標記用）
//  - signCustomerSuppliedWaiverAction：SA / 客戶各自簽署電子責任聲明書；雙方都簽 → 鎖定，
//                                     鎖定後不可再修改標記或重簽
//
// 標記 + 切結書都存 repair_order_addons.metadata（不開新表）；agreed 後衍生的 repair_order_lines
// 也同步一份快照到 metadata（供「維修明細」頁顯示鎖定狀態，不必反查 addon）。
// ─────────────────────────────────────────────────────────────

/** 同步「客戶自備料」標記 + 切結書快照到已寫入的 repair_order_lines（agreed 前尚無 lines，迴圈為空、安全） */
async function syncCustomerSuppliedLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brand: string,
  addonId: string,
  value: boolean,
  waiver: CustomerSuppliedWaiver | null,
): Promise<void> {
  const { data: linkedLines } = await supabase
    .from("repair_order_lines")
    .select("id, kind, part_name, metadata")
    .eq("brand_id", brand)
    .eq("source", "addon")
    .eq("source_ref_id", addonId);

  for (const line of (linkedLines ?? []) as Array<{
    id: string;
    kind: string;
    part_name: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    const lineMeta: Record<string, unknown> = { ...(line.metadata ?? {}) };
    lineMeta.customer_supplied = value;
    lineMeta.customer_supplied_waiver = waiver;

    let nextName = line.part_name;
    if (line.kind === "part" && line.part_name) {
      const base = line.part_name.endsWith(CUSTOMER_SUPPLIED_SUFFIX)
        ? line.part_name.slice(0, -CUSTOMER_SUPPLIED_SUFFIX.length)
        : line.part_name;
      nextName = value ? `${base}${CUSTOMER_SUPPLIED_SUFFIX}` : base;
    }

    const patch: Record<string, unknown> = { metadata: lineMeta };
    if (nextName !== line.part_name) patch.part_name = nextName;

    await supabase.from("repair_order_lines").update(patch).eq("id", line.id).eq("brand_id", brand);
  }
}

/**
 * 標記／取消標記「客戶自備料」。
 *  - 標記時：若先前已建立庫存預留（source_type='repair_order_addon' 且 active），一併釋放
 *    （客戶自己帶的料不該佔用門店庫存預留額度，符合「不出庫、庫存數字不變」規格）。
 *  - 已鎖定（雙方切結書都簽了）→ 不可再修改。
 *  - 已取消的追加項目 → 不可修改。
 */
export async function setCustomerSuppliedAction(
  id: string,
  value: boolean,
): Promise<ActionResult<{ id: string; customer_supplied: boolean }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 ID" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const now = new Date().toISOString();

  const { data: cur, error: loadErr } = await supabase
    .from("repair_order_addons")
    .select("id, ro_id, customer_decision, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (loadErr || !cur) return { ok: false, error: "找不到追加項目" };
  if (cur.customer_decision === "cancelled")
    return { ok: false, error: "已取消的追加項目不可修改標記" };

  const meta = ((cur.metadata ?? {}) as Record<string, unknown>) || {};
  const existingWaiver = (meta.customer_supplied_waiver ?? null) as CustomerSuppliedWaiver | null;
  if (existingWaiver?.locked) {
    return { ok: false, error: "切結書已完成雙方簽署並鎖定，不可再修改「客戶自備料」標記" };
  }

  if (value) {
    // 釋放先前可能已建立的庫存預留（避免出庫）
    const { data: activeReservations } = await supabase
      .from("inventory_reservations")
      .select("id")
      .eq("brand_id", brand)
      .eq("source_type", "repair_order_addon")
      .eq("source_id", id)
      .eq("status", "active");
    for (const r of (activeReservations ?? []) as Array<{ id: string }>) {
      await supabase
        .from("inventory_reservations")
        .update({
          status: "cancelled",
          released_at: now,
          release_reason: "customer_supplied_marked",
          updated_at: now,
        })
        .eq("id", r.id)
        .eq("brand_id", brand)
        .eq("status", "active");
    }
  }

  const nextWaiver = value ? existingWaiver : null;
  const newMeta: Record<string, unknown> = {
    ...meta,
    customer_supplied: value,
    customer_supplied_marked_at: value ? now : null,
    customer_supplied_waiver: nextWaiver,
  };

  const { error: updErr } = await supabase
    .from("repair_order_addons")
    .update({ metadata: newMeta, updated_at: now })
    .eq("id", id)
    .eq("brand_id", brand);
  if (updErr) return { ok: false, error: updErr.message };

  await syncCustomerSuppliedLines(supabase, brand, id, value, nextWaiver);

  revalidatePath(PAGE);
  revalidatePath(`/parts/aftersales/repair-orders/${cur.ro_id}/lines`);
  return { ok: true, data: { id, customer_supplied: value } };
}

/**
 * SA / 客戶各自簽署「客戶自備料」責任聲明書。簽名圖檔壓縮後由前端 canvas 產出 dataURL，
 * 這裡上傳到 Supabase Storage（沿用 signature-upload.ts，DB 只存 URL 不存 base64）。
 * 雙方都簽署後鎖定：不可再修改「客戶自備料」標記，也不可重簽。
 */
export async function signCustomerSuppliedWaiverAction(
  id: string,
  role: CustomerSuppliedWaiverRole,
  signatureDataUrl: string,
): Promise<ActionResult<{ id: string; waiver: CustomerSuppliedWaiver }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 ID" };
  if (!signatureDataUrl) return { ok: false, error: "缺少簽名資料" };
  if (role !== "sa" && role !== "customer") return { ok: false, error: "簽署角色不合法" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const now = new Date().toISOString();

  const { data: cur, error: loadErr } = await supabase
    .from("repair_order_addons")
    .select("id, ro_id, customer_decision, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (loadErr || !cur) return { ok: false, error: "找不到追加項目" };
  if (cur.customer_decision === "cancelled")
    return { ok: false, error: "已取消的追加項目不可簽署切結書" };

  const meta = ((cur.metadata ?? {}) as Record<string, unknown>) || {};
  if (!meta.customer_supplied) {
    return { ok: false, error: "此項目尚未標記為「客戶自備料」，請先標記後再簽署切結書" };
  }

  const existing = (meta.customer_supplied_waiver ?? null) as CustomerSuppliedWaiver | null;
  if (existing?.locked) {
    return { ok: false, error: "切結書已完成雙方簽署並鎖定，不可再次簽署" };
  }

  const url = await uploadSignatureDataUrl(signatureDataUrl, brand, "ro-addon-waiver", id, role);
  if (!url) return { ok: false, error: "簽名圖檔上傳失敗，請重試" };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const waiver: CustomerSuppliedWaiver = {
    sa_signature_url: existing?.sa_signature_url ?? null,
    sa_signed_at: existing?.sa_signed_at ?? null,
    sa_signed_by: existing?.sa_signed_by ?? null,
    customer_signature_url: existing?.customer_signature_url ?? null,
    customer_signed_at: existing?.customer_signed_at ?? null,
    locked: false,
    locked_at: null,
  };
  if (role === "sa") {
    waiver.sa_signature_url = url;
    waiver.sa_signed_at = now;
    waiver.sa_signed_by = user?.id ?? null;
  } else {
    waiver.customer_signature_url = url;
    waiver.customer_signed_at = now;
  }
  if (waiver.sa_signature_url && waiver.customer_signature_url) {
    waiver.locked = true;
    waiver.locked_at = now;
  }

  const newMeta: Record<string, unknown> = { ...meta, customer_supplied_waiver: waiver };
  const { error: updErr } = await supabase
    .from("repair_order_addons")
    .update({ metadata: newMeta, updated_at: now })
    .eq("id", id)
    .eq("brand_id", brand);
  if (updErr) return { ok: false, error: updErr.message };

  await syncCustomerSuppliedLines(supabase, brand, id, true, waiver);

  // 稽核日誌（非阻塞）— 誰簽了、什麼時候、是否已鎖定
  {
    const actorId = user?.id ?? null;
    const roId = cur.ro_id as string;
    after(async () => {
      await writeAuditLog({
        table_name: "repair_order_addons",
        record_id: id,
        action: "customer_supplied_waiver_signed",
        actor_id: actorId,
        brand_id: brand,
        after: {
          role,
          locked: waiver.locked,
          signed_at: now,
        },
      });
      if (waiver.locked) {
        await appendRepairOrderEvent(
          roId,
          {
            action: "customer_supplied_waiver_locked",
            payload: { addon_id: id },
          },
          actorId,
        );
      }
    });
  }

  revalidatePath(PAGE);
  revalidatePath(`/parts/aftersales/repair-orders/${cur.ro_id}/lines`);
  return { ok: true, data: { id, waiver } };
}
