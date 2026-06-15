"use server";

/**
 * Domain Helper — Aftersales Repair Order Addons（追加項目記錄）
 *
 * 對應頁面：/parts/aftersales/addons（全廠 list）+ /parts/aftersales/addons/[id] (detail)
 * Spec：docs/DUCATI_售後工單模組_..._最新版/04_追加項目記錄.html
 *
 * 結構：
 *   repair_order_addons (envelope) — 決策過程紀錄
 *     ↳ agreed → INSERT repair_order_lines (source='addon', source_ref_id=addon.id)
 *     ↳ rejected/deferred + safety → metadata.requires_followup=true（05 之後接走）
 *
 * 鐵律 #8：server-only module，types 全部抽到 repair-order-addons.constants.ts。
 * 這裡只 export async function。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  REJECTION_REASON_COLOR,
  REJECTION_REASON_LABEL,
  type AddonCostSummary,
  type AddonRejectionStatRow,
  type AddonsListFilter,
  type AddonsSummary,
  type CustomerDecision,
  type RejectionReason,
  type RepairOrderAddonRow,
  type RepairOrderAddonWithRo,
  type RoOptionForAddons,
  type SaAddonConversionRow,
} from "./repair-order-addons.constants";

const REJECTION_REASONS: ReadonlyArray<RejectionReason> = [
  "price",
  "time",
  "unnecessary",
  "consider",
  "other",
];

function emptySummary(): AddonsSummary {
  return {
    total: 0,
    pending: 0,
    agreed: 0,
    deferred: 0,
    rejected: 0,
    cancelled: 0,
    agreedAmount: 0,
    rejectedAmount: 0,
    followupNeeded: 0,
  };
}

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
      .select("id, ro_code, status, customer_name, vehicle_license_plate")
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
    acc[r.customer_decision] += 1;
    if (r.customer_decision === "agreed") acc.agreedAmount += Number(r.estimated_fee ?? 0);
    if (r.customer_decision === "rejected") acc.rejectedAmount += Number(r.estimated_fee ?? 0);
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (meta.requires_followup) acc.followupNeeded += 1;
    return acc;
  }, emptySummary());

  return { rows, summary };
}

export async function getAddonById(
  id: string,
): Promise<RepairOrderAddonWithRo | null> {
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
  return {
    ...(a as RepairOrderAddonRow),
    ro: (ro ?? null) as RepairOrderAddonWithRo["ro"],
  };
}

/**
 * 取「同意後」自動寫進 repair_order_lines 的明細，用於 detail page 顯示連動結果
 */
export async function listLinesFromAddon(
  addonId: string,
): Promise<
  Array<{
    id: string;
    line_no: number;
    kind: string;
    labor_name: string | null;
    part_name: string | null;
    qty: number | null;
    unit_price: number | null;
    amount: number | null;
  }>
> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_order_lines")
    .select("id, line_no, kind, labor_name, part_name, qty, unit_price, amount")
    .eq("brand_id", brand)
    .eq("source", "addon")
    .eq("source_ref_id", addonId)
    .order("line_no", { ascending: true });
  return (data ?? []) as Array<{
    id: string;
    line_no: number;
    kind: string;
    labor_name: string | null;
    part_name: string | null;
    qty: number | null;
    unit_price: number | null;
    amount: number | null;
  }>;
}

/**
 * B-24 統計①：本月增項拒絕原因分布（圓餅圖資料）
 * 來源：repair_order_addons 中 customer_decision='rejected'，依 metadata.rejection_reason 群聚。
 * 舊資料沒採集結構化原因者歸入 'unknown'。
 */
export async function addonRejectionStats(): Promise<AddonRejectionStatRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_order_addons")
    .select("estimated_fee, metadata")
    .eq("brand_id", brand)
    .eq("customer_decision", "rejected");

  const buckets = new Map<RejectionReason | "unknown", { count: number; amount: number }>();
  for (const r of data ?? []) {
    const meta = (r.metadata ?? {}) as { rejection_reason?: string };
    const reason = (
      REJECTION_REASONS.includes(meta.rejection_reason as RejectionReason)
        ? meta.rejection_reason
        : "unknown"
    ) as RejectionReason | "unknown";
    const cur = buckets.get(reason) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(r.estimated_fee ?? 0);
    buckets.set(reason, cur);
  }

  // 固定五類順序輸出（即使 0 件也回，讓圓餅圖五扇形穩定），unknown 視有無資料再附
  const rows: AddonRejectionStatRow[] = REJECTION_REASONS.map((reason) => {
    const v = buckets.get(reason) ?? { count: 0, amount: 0 };
    return {
      reason,
      label: REJECTION_REASON_LABEL[reason],
      color: REJECTION_REASON_COLOR[reason],
      count: v.count,
      amount: v.amount,
    };
  });
  const unknown = buckets.get("unknown");
  if (unknown && unknown.count > 0) {
    rows.push({
      reason: "unknown",
      label: "未分類（舊資料）",
      color: "#C9C7BF",
      count: unknown.count,
      amount: unknown.amount,
    });
  }
  return rows;
}

/**
 * B-24 統計②：SA 個人增項轉化率
 * 歸戶口徑：增項所屬工單的 SA（repair_orders.sa_id → employees.name）。
 * total = 已決策（agreed+deferred+rejected），accepted = agreed。
 * top_reason = 該 SA 被拒最高頻的結構化原因。
 */
export async function saAddonConversion(): Promise<SaAddonConversionRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: addons } = await supabase
    .from("repair_order_addons")
    .select("ro_id, customer_decision, metadata")
    .eq("brand_id", brand)
    .in("customer_decision", ["agreed", "deferred", "rejected"]);
  if (!addons || addons.length === 0) return [];

  // ro_id → sa_id
  const roIds = Array.from(new Set(addons.map((a) => a.ro_id as string)));
  const { data: ros } = await supabase
    .from("repair_orders")
    .select("id, sa_id")
    .in("id", roIds);
  const roToSa = new Map<string, string | null>();
  for (const r of ros ?? []) roToSa.set(r.id as string, (r.sa_id as string | null) ?? null);

  // sa_id → name
  const saIds = Array.from(
    new Set(Array.from(roToSa.values()).filter(Boolean) as string[]),
  );
  const saName = new Map<string, string>();
  if (saIds.length > 0) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, name")
      .in("id", saIds);
    for (const e of emps ?? []) saName.set(e.id as string, e.name as string);
  }

  type Agg = {
    total: number;
    accepted: number;
    reasonCounts: Map<RejectionReason, number>;
  };
  const map = new Map<string, Agg>();
  for (const a of addons) {
    const saId = roToSa.get(a.ro_id as string) ?? null;
    const name = (saId && saName.get(saId)) || "（未指派）";
    const agg = map.get(name) ?? { total: 0, accepted: 0, reasonCounts: new Map() };
    agg.total += 1;
    if (a.customer_decision === "agreed") agg.accepted += 1;
    if (a.customer_decision === "rejected") {
      const meta = (a.metadata ?? {}) as { rejection_reason?: string };
      if (REJECTION_REASONS.includes(meta.rejection_reason as RejectionReason)) {
        const reason = meta.rejection_reason as RejectionReason;
        agg.reasonCounts.set(reason, (agg.reasonCounts.get(reason) ?? 0) + 1);
      }
    }
    map.set(name, agg);
  }

  return Array.from(map.entries())
    .map(([sa_name, v]) => {
      let topReason: string | null = null;
      let topN = 0;
      for (const [reason, n] of v.reasonCounts) {
        if (n > topN) {
          topN = n;
          topReason = REJECTION_REASON_LABEL[reason];
        }
      }
      return {
        sa_name,
        total: v.total,
        accepted: v.accepted,
        rate: v.total > 0 ? Math.round((v.accepted / v.total) * 100) : 0,
        top_reason: topReason,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * 費用變動摘要 — 依工單 ID 彙整追加項目費用 vs 原始工單金額
 *
 * 設計稿對應：#cost-change 區塊（原始工單金額 + 追加小計 + 預估總金額）
 * 呼叫點：
 *  - addons-board.tsx toolbar（指定工單 filter 選中後顯示）
 *  - addon-detail-view.tsx 費用小結區塊
 */
export async function getAddonCostSummaryByRo(roId: string): Promise<AddonCostSummary> {
  const supabase = await createClient();

  // 撈工單原始估價
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("estimated_total")
    .eq("id", roId)
    .maybeSingle();

  const roEstimated = ro?.estimated_total != null ? Number(ro.estimated_total) : null;

  // 撈所有追加項目費用
  const { data: addons } = await supabase
    .from("repair_order_addons")
    .select("estimated_fee, customer_decision")
    .eq("ro_id", roId);

  const counts: AddonCostSummary["counts"] = {
    pending: 0,
    agreed: 0,
    deferred: 0,
    rejected: 0,
    cancelled: 0,
  };
  let addonSubtotal = 0;
  let agreedSubtotal = 0;

  for (const a of addons ?? []) {
    const fee = Number(a.estimated_fee ?? 0);
    const decision = a.customer_decision as CustomerDecision;
    addonSubtotal += fee;
    if (decision === "agreed") agreedSubtotal += fee;
    if (decision in counts) counts[decision] += 1;
  }

  const projectedTotal =
    roEstimated != null ? roEstimated + addonSubtotal : null;

  return {
    ro_estimated_total: roEstimated,
    addon_subtotal: addonSubtotal,
    agreed_subtotal: agreedSubtotal,
    projected_total: projectedTotal,
    counts,
  };
}

export async function listRoOptionsForAddons(): Promise<RoOptionForAddons[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_name")
    .eq("brand_id", brand)
    .in("status", ["進行中", "維修中", "待結帳"])
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as RoOptionForAddons[];
}
