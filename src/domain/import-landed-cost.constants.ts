/**
 * Landed Cost Pool 多基礎分攤引擎 — 純型別 + 純函式（client / server 共用）
 *
 * 推廣自 cost-settlement.constants.ts 的 allocateImportCosts（單一基礎、最大餘數法），
 * 改成「每條費用明細各自帶 allocation_basis」的多基礎分攤（BrainDump P2P 卡 §6.3 決策表）。
 *
 * 分攤基礎：
 *   direct      整筆歸 target_vehicle_id（關稅 / 貨物稅 / 推貿 / VSCC 個別審驗 / PDI）
 *   cif         按各 VIN cif_value 佔比（海運保險、與貨值相關）
 *   weight      按各 VIN gross_weight_kg 佔比（海運運費、商港費）
 *   qty         台數平均（報關費、內陸、THC）
 *   model_amort 按車型攤提權重（總代理車型審驗費 / 導入費；權重由 caller 帶入，無則退化為 qty）
 *
 * ❌ 禁用按毛利 / 售價分攤（§6.4，會被認定操縱成本）。
 * 全部用最大餘數法保證 Σ各 VIN = 該筆金額（零尾差）。
 */

export type AllocationBasis = "direct" | "cif" | "weight" | "qty" | "model_amort";

/** 分攤用的車輛維度 */
export type AllocationVehicle = {
  id: string;
  cif_value: number;
  gross_weight_kg: number;
  /** model_amort 基礎的權重（例：該車型每台攤提額）；省略時退化為均攤 */
  amort_weight?: number;
};

/** 一條 Landed Cost Pool 費用明細 */
export type PoolLineInput = {
  id: string;
  cost_type: string;
  amount: number;
  allocation_basis: AllocationBasis;
  is_inventoriable: boolean;
  /** direct 基礎時指定的目標 VIN */
  target_vehicle_id?: string | null;
};

/** 分攤後一筆「pool line × vehicle」的結果 */
export type AllocationResultLine = {
  pool_line_id: string;
  vehicle_id: string;
  cost_type: string;
  allocated_amount: number;
  ratio: number;
  is_inventoriable: boolean;
};

/**
 * cost_type → new_car_inventory 成本欄位 的歸集映射。
 * 寫回車輛主檔時，把分攤結果依此 bucket 累加。進項稅額（import_vat）不寫任何成本欄。
 */
export function costTypeToColumn(
  costType: string,
): "cost_price" | "customs_duty" | "commodity_tax" | "model_amortized_cost" | "import_fees" | null {
  switch (costType) {
    case "goods":
      return "cost_price";
    case "customs":
      return "customs_duty";
    case "commodity_tax":
      return "commodity_tax";
    case "model_amort":
    case "vscc_model":
    case "model_intro":
      return "model_amortized_cost";
    case "import_vat":
      return null; // 進項稅額 — 不入成本
    default:
      // trade_fee / port_fee / freight / insurance / thc / baf / broker / inland / storage / vscc_individual …
      return "import_fees";
  }
}

/** 費用類型目錄（UI 下拉 + 預設分攤基礎建議 · §4 費用表） */
export const COST_TYPE_CATALOG: Array<{
  value: string;
  label: string;
  defaultBasis: AllocationBasis;
  inventoriable: boolean;
}> = [
  { value: "goods", label: "車輛貨款", defaultBasis: "direct", inventoriable: true },
  { value: "customs", label: "進口關稅", defaultBasis: "direct", inventoriable: true },
  { value: "commodity_tax", label: "貨物稅", defaultBasis: "direct", inventoriable: true },
  { value: "trade_fee", label: "推廣貿易服務費", defaultBasis: "direct", inventoriable: true },
  { value: "port_fee", label: "商港服務費", defaultBasis: "weight", inventoriable: true },
  { value: "import_vat", label: "進口營業稅（進項）", defaultBasis: "direct", inventoriable: false },
  { value: "freight", label: "海運運費", defaultBasis: "weight", inventoriable: true },
  { value: "insurance", label: "海運保險費", defaultBasis: "cif", inventoriable: true },
  { value: "thc", label: "THC 碼頭裝卸費", defaultBasis: "qty", inventoriable: true },
  { value: "baf", label: "BAF/CAF 附加費", defaultBasis: "qty", inventoriable: true },
  { value: "broker", label: "報關行服務費", defaultBasis: "qty", inventoriable: true },
  { value: "inland", label: "內陸運輸", defaultBasis: "qty", inventoriable: true },
  { value: "storage", label: "倉儲費", defaultBasis: "qty", inventoriable: true },
  { value: "vscc_individual", label: "VSCC 個別審驗費", defaultBasis: "direct", inventoriable: true },
  { value: "vscc_model", label: "VSCC 車型審驗費（攤提）", defaultBasis: "model_amort", inventoriable: true },
  { value: "model_intro", label: "車型導入費（攤提）", defaultBasis: "model_amort", inventoriable: true },
];

export const COST_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  COST_TYPE_CATALOG.map((c) => [c.value, c.label]),
);

export const ALLOCATION_BASIS_LABEL: Record<AllocationBasis, string> = {
  direct: "直接歸屬",
  cif: "按 CIF 價值",
  weight: "按重量",
  qty: "按台數平均",
  model_amort: "按車型攤提",
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 最大餘數法：把整數金額 amount 依 weights 佔比分到各位置，保證 Σ = amount（零尾差）。
 * weights 全 0 時退化為均攤。
 */
function distributeByWeights(amount: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const amt = Math.round(amount);
  const totalW = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);

  if (totalW <= 0) {
    const base = Math.floor(amt / n);
    const arr = weights.map(() => base);
    let rem = amt - base * n;
    for (let i = 0; i < n && rem > 0; i++, rem--) arr[i] += 1;
    return arr;
  }

  const exact = weights.map((w) => (amt * (w > 0 ? w : 0)) / totalW);
  const floored = exact.map((x) => Math.floor(x));
  let remainder = Math.round(amt - floored.reduce((s, x) => s + x, 0));
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    out[order[k].i] += 1;
  }
  return out;
}

/**
 * 把一批 pool lines 對一組車輛做多基礎分攤。
 * 回傳每筆 (pool_line × vehicle) 的分攤金額（已過濾 0）。
 */
export function allocateCostPool(
  vehicles: AllocationVehicle[],
  poolLines: PoolLineInput[],
): AllocationResultLine[] {
  if (vehicles.length === 0) return [];
  const result: AllocationResultLine[] = [];

  for (const line of poolLines) {
    const amount = num(line.amount);
    if (amount === 0) continue;

    // direct：整筆歸目標車（找不到目標就退化為均攤，避免漏帳）
    if (line.allocation_basis === "direct" && line.target_vehicle_id) {
      const target = vehicles.find((v) => v.id === line.target_vehicle_id);
      if (target) {
        result.push({
          pool_line_id: line.id,
          vehicle_id: target.id,
          cost_type: line.cost_type,
          allocated_amount: Math.round(amount),
          ratio: 1,
          is_inventoriable: line.is_inventoriable,
        });
        continue;
      }
    }

    const weights = vehicles.map((v) => {
      switch (line.allocation_basis) {
        case "cif":
          return num(v.cif_value);
        case "weight":
          return num(v.gross_weight_kg);
        case "model_amort":
          return num(v.amort_weight);
        case "qty":
        case "direct": // direct 無目標 → 均攤
        default:
          return 1;
      }
    });

    const dist = distributeByWeights(amount, weights);
    const totalW = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
    vehicles.forEach((v, idx) => {
      const a = dist[idx];
      if (a === 0) return;
      result.push({
        pool_line_id: line.id,
        vehicle_id: v.id,
        cost_type: line.cost_type,
        allocated_amount: a,
        ratio: totalW > 0 ? (weights[idx] > 0 ? weights[idx] / totalW : 0) : 1 / vehicles.length,
        is_inventoriable: line.is_inventoriable,
      });
    });
  }

  return result;
}

/** 把分攤結果聚合成每車的成本欄 bucket（寫回 new_car_inventory 用） */
export type VehicleCostBuckets = {
  cost_price: number;
  customs_duty: number;
  commodity_tax: number;
  model_amortized_cost: number;
  import_fees: number;
};

export function aggregateByVehicle(
  lines: AllocationResultLine[],
): Map<string, VehicleCostBuckets> {
  const map = new Map<string, VehicleCostBuckets>();
  for (const l of lines) {
    const col = costTypeToColumn(l.cost_type);
    if (!col) continue; // 進項稅額不入成本
    const b =
      map.get(l.vehicle_id) ??
      { cost_price: 0, customs_duty: 0, commodity_tax: 0, model_amortized_cost: 0, import_fees: 0 };
    b[col] += l.allocated_amount;
    map.set(l.vehicle_id, b);
  }
  return map;
}
