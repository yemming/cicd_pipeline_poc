"use server";

/**
 * Server actions — RS_INV03 整車採購財務結算（關運保分攤寫回整車成本）
 *
 * Result<T> pattern、無 redirect（client 自控導航）。
 * 對應頁面：/sales/inventory/cost-settlement（list / [id] 結算作業）
 * 設計稿：docs/20260527/RS_INV03_整車採購財務結算.html
 *
 * 成本寫回策略：
 *   按各台車的「原始採購價」佔比分攤關 / 運 / 保三項，把分攤後三項加進 cost_price
 *   （cost_price 升級為到岸成本 landed cost），自動被 generated 欄位 total_cost 吃進去。
 *   分攤明細寫 metadata.cost_settlement，original_price 為冪等基底。
 *
 * 冪等：重跑時一律以 metadata.cost_settlement.original_price 當 cost_price 起點重算，
 *       不會把關運保疊加兩次（沒結算過的車以當前 cost_price 為基底）。
 *
 * 權限：檢視 → SALES_ORDER_VIEW；結算寫回 → SALES_ORDER_EDIT
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  getSettlementPODetail,
  allocateImportCosts,
  type AllocationLine,
} from "@/domain/cost-settlement";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/sales/inventory/cost-settlement";

export type SettleCostInput = {
  customs: number;
  freight: number;
  insurance: number;
};

export type SettleCostResult = {
  po_id: string;
  po_no: string;
  vehicle_count: number;
  total_import: number;
  total_landed_cost: number; // Σ new_cost_price
  lines: Array<{
    id: string;
    vin: string | null;
    model_display_name: string | null;
    original_price: number;
    customs: number;
    freight: number;
    insurance: number;
    new_cost_price: number;
  }>;
};

function normCost(v: number | undefined | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/**
 * 對某採購單做財務結算：按採購成本比例分攤關運保、寫回每台 cost_price + metadata。
 *
 * 注意 cost_price 是 generated 欄位 total_cost 的輸入之一，更新 cost_price 後
 * total_cost 由 DB 自動重算，本 action 不需手動寫 total_cost。
 */
export async function settleCostAction(
  poId: string,
  input: SettleCostInput,
): Promise<ActionResult<SettleCostResult>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);

  if (!poId) return { ok: false, error: "缺少採購單 id" };

  const customs = normCost(input.customs);
  const freight = normCost(input.freight);
  const insurance = normCost(input.insurance);

  const detail = await getSettlementPODetail(poId);
  if (!detail) return { ok: false, error: "找不到採購單或無權限" };
  if (detail.vehicles.length === 0)
    return { ok: false, error: "此採購單底下沒有車輛，無法結算（請先完成到港確認）" };

  // 冪等基底：每台以 original_price（沿 metadata 還原）為分攤起點
  const bases = detail.vehicles.map((v) => ({
    id: v.id,
    original_price: v.original_price,
  }));

  const lines: AllocationLine[] = allocateImportCosts(bases, {
    customs,
    freight,
    insurance,
  });
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();
  const settledAt = new Date().toISOString();

  // 逐台寫回 cost_price（= original + 分攤）+ metadata.cost_settlement
  for (const v of detail.vehicles) {
    const line = lineById.get(v.id);
    if (!line) continue;

    // 保留既有 metadata 其他 key，只覆蓋 cost_settlement
    const { data: cur, error: curErr } = await supabase
      .from("new_car_inventory")
      .select("metadata")
      .eq("id", v.id)
      .eq("brand_id", detail.brand_id)
      .maybeSingle();
    if (curErr) return { ok: false, error: `讀取車輛 metadata 失敗：${curErr.message}` };

    const baseMeta =
      cur?.metadata && typeof cur.metadata === "object"
        ? (cur.metadata as Record<string, unknown>)
        : {};

    const newMeta = {
      ...baseMeta,
      cost_settlement: {
        original_price: line.original_price,
        customs: line.customs,
        freight: line.freight,
        insurance: line.insurance,
        settled_at: settledAt,
      },
    };

    const { error: updErr } = await supabase
      .from("new_car_inventory")
      .update({
        cost_price: line.new_cost_price,
        metadata: newMeta,
        updated_at: settledAt,
        updated_by: userId,
      })
      .eq("id", v.id)
      .eq("brand_id", detail.brand_id);
    if (updErr) return { ok: false, error: `寫回車輛成本失敗（${v.vin ?? v.id}）：${updErr.message}` };
  }

  const total_import = customs + freight + insurance;
  const total_landed_cost = lines.reduce((s, l) => s + l.new_cost_price, 0);

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${poId}`);
  revalidatePath("/sales/inventory/purchase-orders");
  revalidatePath("/sales/showroom/new-cars");
  revalidatePath("/inventory/vehicles");

  return {
    ok: true,
    data: {
      po_id: poId,
      po_no: detail.po_no,
      vehicle_count: detail.vehicles.length,
      total_import,
      total_landed_cost,
      lines: detail.vehicles.map((v) => {
        const l = lineById.get(v.id)!;
        return {
          id: v.id,
          vin: v.vin,
          model_display_name: v.model_display_name,
          original_price: l.original_price,
          customs: l.customs,
          freight: l.freight,
          insurance: l.insurance,
          new_cost_price: l.new_cost_price,
        };
      }),
    },
  };
}
