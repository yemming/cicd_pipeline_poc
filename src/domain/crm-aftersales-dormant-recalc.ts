/**
 * 售後休眠分級批次重算（C-24 方案 B）
 *
 * 把 customers.aftersales_dormancy_status 從「每次查詢 runtime 現算、永不持久」
 * 升級成「每日批次重算寫回」，讓 CRM 休眠分析不再是 stale 的 seed 值。
 *
 * 設計原則（Ming 拍板）：
 *  - 用 service-role client（createServiceClient），系統級跨所有 brand 重算，
 *    不靠 getActiveScope() cookie（cron 沒有 request user / 沒有 active scope）。
 *  - 門檻沿用 60 / 120 / 180 天。
 *  - lost 只能人工標（markLost），cron 永不覆蓋 → 在 JS 端跳過 oldStatus==='lost' 的客戶。
 *  - 自動降級不建 call_task（避免洗版）。
 *  - 沒有 work_orders 紀錄的客戶（從未進廠）→ 維持 null，不強設狀態。
 *
 * ⚠️ 不可用 `.neq('aftersales_dormancy_status','lost')` 過濾：Postgres 下
 *    `NULL <> 'lost'` 結果是 NULL（非 true），會把 null 狀態的客戶一起濾掉，
 *    導致「從未算過 / 無狀態但有近期進廠」的客戶永遠不被重算。
 *    故一律撈全部 active 客戶，lost 改在 JS 端跳過。
 */

import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

// 門檻常數（改這裡，runtime 與 cron 兩邊應同步）
export const DORMANCY_THRESHOLDS = {
  DORMANT_60: 60,
  DORMANT_120: 120,
  DORMANT_180: 180,
} as const;

export type DormancyStatus = "active" | "dormant_60" | "dormant_120" | "dormant_180";

/**
 * 依「最後進廠至今天數」推算分級（純函式）。
 * 回傳 null = 從未進廠（無 work_orders），維持 null 不設狀態。
 */
export function calcDormancyStatus(daysSinceLastVisit: number | null): DormancyStatus | null {
  if (daysSinceLastVisit === null) return null;
  if (daysSinceLastVisit < DORMANCY_THRESHOLDS.DORMANT_60) return "active";
  if (daysSinceLastVisit < DORMANCY_THRESHOLDS.DORMANT_120) return "dormant_60";
  if (daysSinceLastVisit < DORMANCY_THRESHOLDS.DORMANT_180) return "dormant_120";
  return "dormant_180";
}

export type DormancyRecalcResult = {
  /** 掃描的 active 客戶總數（含被跳過的 lost） */
  total_scanned: number;
  /** 因 lost 被跳過、未重算的客戶數 */
  skipped_lost: number;
  /** 實際發生 UPDATE 的筆數（新值與舊值不同） */
  updated_count: number;
  /** 重算後分佈（不含 lost） */
  distribution: {
    active: number;
    dormant_60: number;
    dormant_120: number;
    dormant_180: number;
    no_visit: number; // 無工單，維持 null
  };
  elapsed_ms: number;
  ran_at: string; // UTC ISO
};

/**
 * 跨所有 brand 重算休眠分級並寫回 customers.aftersales_dormancy_status。
 * 用 service-role client → 繞過 RLS brand 過濾，一次掃全部 brand。
 * @param options.brandId 只跑單一 brand（debug 用）；不給則全 brand。
 * @param options.dryRun  只算不寫（驗收用）。
 */
export async function recalcAftersalesDormancy(
  options: { brandId?: string; dryRun?: boolean } = {},
): Promise<DormancyRecalcResult> {
  const t0 = Date.now();
  const db = createServiceClient();
  const ranAt = new Date().toISOString();

  // ── Step 1：撈所有 active 客戶（不過濾 lost，避免 null 被連帶濾掉） ──
  let custQuery = db
    .from("customers")
    .select("id, brand_id, aftersales_dormancy_status")
    .eq("is_active", true);
  if (options.brandId) custQuery = custQuery.eq("brand_id", options.brandId);

  const { data: customers, error: cErr } = await custQuery;
  if (cErr) throw new Error(`recalcAftersalesDormancy: 撈 customers 失敗 — ${cErr.message}`);

  const allCustomers = (customers ?? []) as Array<{
    id: string;
    brand_id: string;
    aftersales_dormancy_status: string | null;
  }>;

  const emptyResult: DormancyRecalcResult = {
    total_scanned: allCustomers.length,
    skipped_lost: 0,
    updated_count: 0,
    distribution: { active: 0, dormant_60: 0, dormant_120: 0, dormant_180: 0, no_visit: 0 },
    elapsed_ms: Date.now() - t0,
    ran_at: ranAt,
  };
  if (allCustomers.length === 0) return emptyResult;

  const customerIds = allCustomers.map((c) => c.id);

  // ── Step 2：撈每個客戶最近一筆 work_order 的 opened_at（JS 端取 max） ──
  const { data: workOrders, error: wErr } = await db
    .from("work_orders")
    .select("customer_id, opened_at")
    .in("customer_id", customerIds)
    .order("opened_at", { ascending: false });
  if (wErr) throw new Error(`recalcAftersalesDormancy: 撈 work_orders 失敗 — ${wErr.message}`);

  const lastVisitMap = new Map<string, string>();
  for (const wo of (workOrders ?? []) as Array<{ customer_id: string; opened_at: string | null }>) {
    if (wo.customer_id && wo.opened_at && !lastVisitMap.has(wo.customer_id)) {
      lastVisitMap.set(wo.customer_id, wo.opened_at);
    }
  }

  // ── Step 3：算新舊狀態，收集需更新的 rows（lost 跳過、不重算） ──
  const nowMs = Date.now();
  const dist = { active: 0, dormant_60: 0, dormant_120: 0, dormant_180: 0, no_visit: 0 };
  const toUpdate: Array<{ id: string; new_status: DormancyStatus | null }> = [];
  let skippedLost = 0;

  for (const c of allCustomers) {
    if (c.aftersales_dormancy_status === "lost") {
      skippedLost++;
      continue; // lost 人工標定，cron 不覆蓋
    }
    const lastVisitIso = lastVisitMap.get(c.id) ?? null;
    const daysSince = lastVisitIso
      ? Math.floor((nowMs - new Date(lastVisitIso).getTime()) / 86_400_000)
      : null;
    const newStatus = calcDormancyStatus(daysSince);

    if (newStatus === null) dist.no_visit++;
    else dist[newStatus]++;

    if (newStatus !== c.aftersales_dormancy_status) {
      toUpdate.push({ id: c.id, new_status: newStatus });
    }
  }

  // ── Step 4：批次寫回（dry-run 跳過）。同新值的 id 一起打，減少 round-trip。 ──
  if (!options.dryRun && toUpdate.length > 0) {
    const byStatus = new Map<DormancyStatus | "__null__", string[]>();
    for (const row of toUpdate) {
      const key = row.new_status ?? "__null__";
      if (!byStatus.has(key)) byStatus.set(key, []);
      byStatus.get(key)!.push(row.id);
    }
    for (const [statusKey, ids] of byStatus.entries()) {
      const statusValue = statusKey === "__null__" ? null : statusKey;
      // 不加 .neq('...','lost') 守門：lost 已在 JS 端跳過、不會進 toUpdate；
      // 且 neq 對 null 不安全。race window（讀後寫前被 markLost）極小，POC 可接受。
      const { error: uErr } = await db
        .from("customers")
        .update({ aftersales_dormancy_status: statusValue })
        .in("id", ids);
      if (uErr) {
        throw new Error(
          `recalcAftersalesDormancy: UPDATE 失敗（status=${statusValue}）— ${uErr.message}`,
        );
      }
    }
  }

  return {
    total_scanned: allCustomers.length,
    skipped_lost: skippedLost,
    updated_count: toUpdate.length,
    distribution: dist,
    elapsed_ms: Date.now() - t0,
    ran_at: ranAt,
  };
}
