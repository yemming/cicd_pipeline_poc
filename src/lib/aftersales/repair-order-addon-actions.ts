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

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

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

export async function cancelAddonAction(id: string): Promise<ActionResult<{ id: string }>> {
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
    return { ok: false, error: "已決策的追加項目無法取消" };
  const { error } = await supabase
    .from("repair_order_addons")
    .update({ customer_decision: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
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
 * decideAddon — 三向分支
 *  - agreed   → INSERT repair_order_lines (source='addon', source_ref_id=addon.id)
 *               依 addon_type 拆 1 或 2 條 line
 *               metadata.reserved_at 標記庫存預留時點（庫存實扣交給領料模組）
 *  - deferred → 純更新 envelope；safety!=normal 標 metadata.requires_followup=true
 *  - rejected → 純更新 envelope；safety!=normal 標 metadata.requires_followup=true
 *
 * 不寫 followup_cases（05 提案落地後再串）。
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

    for (const l of linesToInsert) {
      const { data: inserted, error: insErr } = await supabase
        .from("repair_order_lines")
        .insert({
          repair_order_id: addon.ro_id,
          brand_id: brand,
          line_no: nextLineNo,
          kind: l.kind,
          labor_name: l.labor_name ?? null,
          labor_units: l.labor_units ?? null,
          part_name: l.part_name ?? null,
          qty: l.qty ?? null,
          unit_price: l.unit_price,
          amount: l.amount,
          source: "addon",
          source_ref_id: addon.id,
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
  const requiresFollowup =
    decision.customer_decision !== "agreed" && addon.safety_level !== "normal";
  const newMeta: Record<string, unknown> = { ...meta };
  if (requiresFollowup) newMeta.requires_followup = true;
  // B-23：把結構化拒絕原因落地 metadata，供 B-24 圓餅圖 / SA 轉化率聚合
  if (decision.customer_decision === "rejected" && decision.rejection_reason) {
    newMeta.rejection_reason = decision.rejection_reason;
  }

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

  revalidatePath(PAGE);
  revalidatePath(`/parts/aftersales/repair-orders/${addon.ro_id}/lines`);
  return { ok: true, data: { id, created_line_ids } };
}
