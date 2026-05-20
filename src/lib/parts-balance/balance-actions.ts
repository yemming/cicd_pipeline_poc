"use server";

/**
 * Server actions for /parts/operations/balance（v2 商品庫存查詢，§7.1）
 *
 * 目前只需要一個動作：「一鍵生補貨單」— 走既有 calculate_replenishment RPC，
 * 為該 row 所在倉跑一輪 replenishment run，結果跳轉 /parts/purchase/replenishment。
 *
 * 注意：RPC 是「整倉」運算、不分單 item。所以一鍵生補貨單 = 跑該倉的整輪計算、
 *      不只該 item 自己，但 UX 上對 user 來說「按一下就有建議」夠用了。
 */

import { runReplenishment } from "@/domain/replenishment";

export type CreateReplenishmentResult =
  | { ok: true; runId: string; lines: number }
  | { ok: false; error: string };

export async function createReplenishmentFromBalance(input: {
  warehouseId: string | null;
}): Promise<CreateReplenishmentResult> {
  const res = await runReplenishment({
    warehouseId: input.warehouseId ?? null,
    horizonDays: 7,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, runId: res.runId, lines: res.lines };
}
