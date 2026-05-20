/**
 * Server actions — Parts Analytics Stale（呆滯庫存）
 *
 * 主要動作：
 *   - createCleanupPlanFromStale — 把選中的呆滯料號打包成「清庫計畫草稿」
 *
 * POC 階段：清庫計畫尚未開正式表，這裡先回傳假的 plan_id（uuid v4）+
 * 把選中的料號 ID 寫到 `business_rules` 一張通用規則表的 metadata，方便日後追 audit。
 * 未來開正式 `cleanup_plans` 表時，把這支 action 的 insert 換掉即可，UI 不動。
 */

"use server";

import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CreateCleanupPlanResult = {
  plan_id: string;
  item_count: number;
  total_value: number;
  /** 草稿存到哪裡的 hint，供 UI 顯示 */
  storage_hint: string;
};

/**
 * 把選中的呆滯料號產出清庫計畫草稿。
 *
 * 行為：
 *   1. 權限：要有 PARTS_ITEM_VIEW（檢視）+ 嘗試 PARTS_ITEM_UPDATE（沒這權限就走唯讀提示）
 *   2. 抓選中料號當下的 qty / value、組摘要
 *   3. 把摘要 insert 到 business_rules（rule_kind = 'cleanup_plan_draft'），config jsonb 帶料號清單
 *   4. 回 plan_id 給 UI 顯示
 *
 * 失敗：
 *   - itemIds 空 → ok:false, error:'尚未選擇任何呆滯料號'
 *   - 權限不足 → throw（requirePermission）
 */
export async function createCleanupPlanFromStale(
  itemIds: string[],
): Promise<ActionResult<CreateCleanupPlanResult>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_VIEW);
  const canMutate = await hasPermission(PERMISSIONS.PARTS_ITEM_UPDATE);

  const ids = Array.from(new Set(itemIds.filter((s) => typeof s === "string" && s.length > 0)));
  if (ids.length === 0) {
    return { ok: false, error: "尚未選擇任何呆滯料號" };
  }
  if (ids.length > 500) {
    return { ok: false, error: "一次最多 500 個料號" };
  }

  try {
    const supabase = await createClient();
    const scope = await getActiveScope();
    const brand = scope.brand_id;

    // 1) 抓選中料號當下 qty / unit_cost 算總積壓金額
    const stockRes = await supabase
      .from("stock_items")
      .select("item_id, qty, unit_cost")
      .eq("brand_id", brand)
      .in("item_id", ids)
      .gt("qty", 0);
    if (stockRes.error) {
      return { ok: false, error: `讀取庫存失敗：${stockRes.error.message}` };
    }

    const valueByItem = new Map<string, number>();
    for (const s of stockRes.data ?? []) {
      const v = Number(s.qty ?? 0) * Number(s.unit_cost ?? 0);
      valueByItem.set(s.item_id, (valueByItem.get(s.item_id) ?? 0) + v);
    }
    const totalValue = Math.round(
      Array.from(valueByItem.values()).reduce((a, b) => a + b, 0),
    );

    // 2) 產生 plan_id
    const planId = randomUUID();

    // 3) 嘗試寫到 business_rules（rule_kind = 'cleanup_plan_draft'）
    //    沒寫入權限就跳過、只回假 plan_id（UI 仍可往下走）
    let storageHint = "暫存於 session（無寫入權限）";
    if (canMutate) {
      const insertRes = await supabase
        .from("business_rules")
        .insert({
          brand_id: brand,
          rule_kind: "cleanup_plan_draft",
          is_active: false,
          config: {
            plan_id: planId,
            title: `清庫計畫草稿 ${new Date().toISOString().slice(0, 10)}`,
            item_ids: ids,
            item_count: ids.length,
            total_value: totalValue,
            generated_at: new Date().toISOString(),
            source: "parts/analytics/stale",
          },
          metadata: {},
        })
        .select("id")
        .maybeSingle();

      if (insertRes.error) {
        // business_rules schema 跟預期不同 → 不擋使用者、UI 仍給出 plan_id
        storageHint = `已產出 plan_id 但持久化失敗：${insertRes.error.message}`;
      } else {
        storageHint = `已寫入 business_rules（草稿 ID: ${insertRes.data?.id ?? planId}）`;
      }
    }

    return {
      ok: true,
      data: {
        plan_id: planId,
        item_count: ids.length,
        total_value: totalValue,
        storage_hint: storageHint,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `產生清庫計畫失敗：${msg}` };
  }
}
