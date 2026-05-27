/**
 * RS_INV03 整車採購財務結算 — 純型別 + 純函式（client / server 共用，無 server-only）
 *
 * 為什麼獨立成 .constants：client component（cost-settlement-form）需要 value-import
 * allocateImportCosts 做即時預覽。若放在帶 `import "server-only"` 的 cost-settlement.ts，
 * Turbopack build 會爆（client 不能 value-import server-only 模組）。型別 + 純計算放這、
 * 撈 DB 的 helper 留在 cost-settlement.ts。
 */

// ── 型別 ──────────────────────────────────────────────────────────────

/**
 * metadata.cost_settlement 的形狀。original_price 是冪等基底：
 * 重跑分攤時一律以它為 cost_price 起點，避免關運保被重複疊加。
 */
export type CostSettlementMeta = {
  original_price: number;
  customs: number;
  freight: number;
  insurance: number;
  settled_at: string; // ISO timestamp
};

/** 待結算 / 已結算的採購單（list 用） */
export type SettlementPORow = {
  id: string;
  po_no: string;
  supplier_name: string | null;
  order_date: string | null;
  expected_arrival: string | null;
  status: string;
  brand_id: string;
  vehicle_count: number; // 該 PO 下的車輛台數
  total_purchase_cost: number; // Σ original_price（沿 metadata 還原，沒結算過則 = cost_price）
  settled: boolean; // 是否已結算（任一台帶 cost_settlement 即視為已結算）
  settled_at: string | null;
  total_import_cost: number; // 已結算的關運保合計（未結算為 0）
};

/** 結算作業頁：某 PO 的一台車（含其原始採購價基底） */
export type SettlementVehicle = {
  id: string;
  vin: string | null;
  color: string | null;
  model_display_name: string | null;
  model_series: string | null;
  status: string;
  cost_price: number; // 目前 DB 的 cost_price（可能已含分攤）
  original_price: number; // 冪等基底：metadata.cost_settlement.original_price ?? cost_price
  pdi_labor_cost: number;
  pdi_parts_cost: number;
  transfer_freight_cost: number;
  total_cost: number;
  settlement: CostSettlementMeta | null; // 既有分攤明細（沒結算過為 null）
};

export type SettlementPODetail = {
  id: string;
  po_no: string;
  supplier_name: string | null;
  order_date: string | null;
  expected_arrival: string | null;
  status: string;
  brand_id: string;
  vehicles: SettlementVehicle[];
  total_purchase_cost: number; // Σ original_price
  settled: boolean;
  existing_customs: number; // 已結算的關稅合計（預填輸入框）
  existing_freight: number;
  existing_insurance: number;
};

export const COST_SETTLEMENT_PAGE_SIZE_DEFAULT = 50;

// ── 分攤計算（純函式，server action / 預覽共用）──────────────────────────

export type AllocationLine = {
  id: string;
  original_price: number;
  ratio: number;
  customs: number;
  freight: number;
  insurance: number;
  new_cost_price: number; // original_price + 三項分攤
};

/**
 * 按 original_price 佔比分攤關 / 運 / 保。
 * 用「最大餘數法」確保各項分攤總和精確等於輸入金額（避免四捨五入後尾差）。
 */
export function allocateImportCosts(
  vehicles: Array<{ id: string; original_price: number }>,
  costs: { customs: number; freight: number; insurance: number },
): AllocationLine[] {
  const totalBase = vehicles.reduce((s, v) => s + v.original_price, 0);
  if (vehicles.length === 0) return [];

  // 三項各自獨立做最大餘數分配
  const distribute = (amount: number): number[] => {
    if (totalBase <= 0) {
      // 沒有成本基底 → 均攤
      const base = Math.floor(amount / vehicles.length);
      const arr = vehicles.map(() => base);
      let rem = amount - base * vehicles.length;
      for (let i = 0; i < arr.length && rem > 0; i++, rem--) arr[i] += 1;
      return arr;
    }
    const exact = vehicles.map((v) => (amount * v.original_price) / totalBase);
    const floored = exact.map((x) => Math.floor(x));
    let remainder = Math.round(amount - floored.reduce((s, x) => s + x, 0));
    // 餘數依小數部分大→小補 1
    const order = exact
      .map((x, i) => ({ i, frac: x - Math.floor(x) }))
      .sort((a, b) => b.frac - a.frac);
    const out = [...floored];
    for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
      out[order[k].i] += 1;
    }
    return out;
  };

  const cArr = distribute(Math.round(costs.customs));
  const fArr = distribute(Math.round(costs.freight));
  const iArr = distribute(Math.round(costs.insurance));

  return vehicles.map((v, idx) => {
    const customs = cArr[idx];
    const freight = fArr[idx];
    const insurance = iArr[idx];
    return {
      id: v.id,
      original_price: v.original_price,
      ratio: totalBase > 0 ? v.original_price / totalBase : 1 / vehicles.length,
      customs,
      freight,
      insurance,
      new_cost_price: v.original_price + customs + freight + insurance,
    };
  });
}
