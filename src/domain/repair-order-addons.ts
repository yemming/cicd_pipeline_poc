"use server";

/**
 * Domain Helper — Aftersales Repair Order Addons（追加項目記錄）
 *
 * 對應頁面：/parts/aftersales/addons（全廠 list）+ 內嵌 decideAddon 操作
 * Spec：docs/DUCATI_售後工單模組_..._最新版/04_追加項目記錄.html
 *
 * 結構：
 *   repair_order_addons (envelope) — 決策過程紀錄
 *     ↳ agreed → INSERT repair_order_lines (source='addon', source_ref_id=addon.id)
 *     ↳ rejected/deferred + safety → metadata.requires_followup=true（05 之後接走）
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type AddonType = "labor" | "parts" | "labor_and_parts";
export type SafetyLevel = "normal" | "safety_related" | "safety_critical";
export type ConfirmMethod = "phone" | "onsite" | "line";
export type CustomerDecision = "pending" | "agreed" | "deferred" | "rejected" | "cancelled";

export type RepairOrderAddonRow = {
  id: string;
  brand_id: string;
  ro_id: string;
  addon_no: number;
  name: string;
  addon_type: AddonType;
  safety_level: SafetyLevel;
  estimated_fee: number;
  tech_reason: string | null;
  proposed_by: string | null;
  proposed_at: string;
  confirm_method: ConfirmMethod | null;
  customer_decision: CustomerDecision;
  customer_decision_at: string | null;
  decided_by_sa_id: string | null;
  decision_note: string | null;
  followup_case_id: string | null;
  reserved_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RepairOrderAddonWithRo = RepairOrderAddonRow & {
  ro: {
    id: string;
    ro_code: string;
    status: string;
    customer_name: string | null;
    vehicle_license_plate: string | null;
  } | null;
};

export type AddonsListFilter = {
  decision?: CustomerDecision | "all";
  safetyLevel?: SafetyLevel | "all";
  roId?: string | null;
  q?: string | null;
};

export type AddonsSummary = {
  total: number;
  pending: number;
  agreed: number;
  deferred: number;
  rejected: number;
  agreedAmount: number;
  rejectedAmount: number;
  followupNeeded: number;
};

export async function listAddons(
  filter: AddonsListFilter = {},
): Promise<{ rows: RepairOrderAddonWithRo[]; summary: AddonsSummary }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("repair_order_addons")
    .select(
      "id, brand_id, ro_id, addon_no, name, addon_type, safety_level, estimated_fee, tech_reason, proposed_by, proposed_at, confirm_method, customer_decision, customer_decision_at, decided_by_sa_id, decision_note, followup_case_id, reserved_at, metadata, created_at, updated_at",
    )
    .eq("brand_id", brand)
    .order("proposed_at", { ascending: false });

  if (filter.decision && filter.decision !== "all") {
    q = q.eq("customer_decision", filter.decision);
  }
  if (filter.safetyLevel && filter.safetyLevel !== "all") {
    q = q.eq("safety_level", filter.safetyLevel);
  }
  if (filter.roId) {
    q = q.eq("ro_id", filter.roId);
  }
  if (filter.q) {
    q = q.ilike("name", `%${filter.q}%`);
  }

  const { data: addons, error } = await q;
  if (error) {
    console.error("[domain/repair-order-addons] listAddons error", error);
    return { rows: [], summary: emptySummary() };
  }

  const roIds = Array.from(new Set((addons ?? []).map((a) => a.ro_id)));
  const roMap = new Map<string, RepairOrderAddonWithRo["ro"]>();
  if (roIds.length > 0) {
    const { data: ros } = await supabase
      .from("repair_orders")
      .select(
        "id, ro_code, status, customer_name, vehicle_license_plate",
      )
      .in("id", roIds);
    for (const r of ros ?? []) {
      roMap.set(r.id, r as RepairOrderAddonWithRo["ro"]);
    }
  }

  const rows: RepairOrderAddonWithRo[] = (addons ?? []).map((a) => ({
    ...(a as unknown as RepairOrderAddonRow),
    ro: roMap.get(a.ro_id) ?? null,
  }));

  const summary = rows.reduce<AddonsSummary>((acc, r) => {
    acc.total += 1;
    acc[r.customer_decision === "cancelled" ? "rejected" : r.customer_decision] += 1;
    if (r.customer_decision === "agreed") acc.agreedAmount += Number(r.estimated_fee ?? 0);
    if (r.customer_decision === "rejected") acc.rejectedAmount += Number(r.estimated_fee ?? 0);
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (meta.requires_followup) acc.followupNeeded += 1;
    return acc;
  }, emptySummary());

  return { rows, summary };
}

export async function getAddonById(id: string): Promise<RepairOrderAddonWithRo | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: a } = await supabase
    .from("repair_order_addons")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!a) return null;
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_name, vehicle_license_plate")
    .eq("id", a.ro_id)
    .maybeSingle();
  return { ...(a as RepairOrderAddonRow), ro: (ro ?? null) as RepairOrderAddonWithRo["ro"] };
}

export async function listRoOptionsForAddons(): Promise<
  { id: string; ro_code: string; status: string; customer_name: string | null }[]
> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_name")
    .eq("brand_id", brand)
    .in("status", ["進行中", "維修中", "待結帳"])
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as { id: string; ro_code: string; status: string; customer_name: string | null }[];
}

function emptySummary(): AddonsSummary {
  return {
    total: 0,
    pending: 0,
    agreed: 0,
    deferred: 0,
    rejected: 0,
    agreedAmount: 0,
    rejectedAmount: 0,
    followupNeeded: 0,
  };
}
