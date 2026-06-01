/**
 * 進口稅金引擎 — 純型別 + 純函式（client / server 共用，無 server-only）
 *
 * 為什麼獨立 .constants：landed-cost 結算頁的 client component 要 value-import
 * computeImportTaxes 做即時預覽（填 CIF / 選稅則 → 馬上算稅）。帶 server-only 的
 * import-tax.ts 留撈 hs_code_tariffs 的 helper。
 *
 * 依據（BrainDump P2P 卡 §5.1 疊加計算）：
 *   關稅      = CIF × 關稅率
 *   貨物稅    = (CIF + 關稅) × 貨物稅率           // >150cc 0.17、≤150cc 0
 *   推貿費    = CIF × 0.0004
 *   商港費    = 按重量另計（外部帶入，非疊加）
 *   進口營業稅 = (CIF + 關稅 + 貨物稅) × 0.05      // ← 進項稅額，不入存貨成本
 */

/** 稅則稅率（對應 hs_code_tariffs 一筆 row 的率欄位） */
export type TariffRates = {
  customs_rate: number; // 關稅率
  commodity_tax_rate: number; // 貨物稅率（>150cc 0.17）
  trade_promotion_rate: number; // 推貿費率（預設 0.0004）
  vat_rate: number; // 進口營業稅率（預設 0.05）
};

/** 一台車（或一批）的進口稅金拆解結果 */
export type ImportTaxBreakdown = {
  cif: number;
  customs: number; // 關稅
  commodityTax: number; // 貨物稅
  tradeFee: number; // 推貿費
  portFee: number; // 商港服務費（按重量，外部帶入）
  importVat: number; // 進口營業稅（進項稅額 — 不入成本）
  /** 計入存貨成本的稅費合計（不含進項營業稅）= 關 + 貨物稅 + 推貿 + 商港 */
  inventoriableTotal: number;
  /** 進口時實際吐出的現金合計 = inventoriableTotal + importVat */
  totalPayable: number;
};

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

/**
 * 依稅率疊加計算單一 CIF 的進口稅金。商港費按重量另算、由 caller 帶入（預設 0）。
 *
 * 進口營業稅標記為「進項稅額」：雖在進口時繳，但後續銷售可扣抵銷項，**不是真正成本**，
 * 所以從 inventoriableTotal 排除，僅計入 totalPayable（前期現金流出）。
 */
export function computeImportTaxes(
  cif: number,
  rates: TariffRates,
  opts: { portFee?: number } = {},
): ImportTaxBreakdown {
  const base = Number.isFinite(cif) ? cif : 0;
  const customs = round(base * rates.customs_rate);
  const commodityTax = round((base + customs) * rates.commodity_tax_rate);
  const tradeFee = round(base * rates.trade_promotion_rate);
  const portFee = round(opts.portFee ?? 0);
  const importVat = round((base + customs + commodityTax) * rates.vat_rate);
  const inventoriableTotal = customs + commodityTax + tradeFee + portFee;
  return {
    cif: base,
    customs,
    commodityTax,
    tradeFee,
    portFee,
    importVat,
    inventoriableTotal,
    totalPayable: inventoriableTotal + importVat,
  };
}

/** HS Code 8711 摩托車分級（白/黃/紅牌）— 稅則 seed 與 UI 下拉用 */
export const PLATE_CLASSES = [
  { value: "white", label: "白牌（≤250cc）" },
  { value: "yellow", label: "黃牌（250–550cc）" },
  { value: "red", label: "紅牌（≥550cc）" },
] as const;

/** HS Code 8711.x 預設稅則（年度版本 master 的 seed 基底；實際率以 GC411 為準） */
export const HS_CODE_8711_DEFAULTS = [
  { hs_code: "8711.20", displacement_min: 50, displacement_max: 250, plate_class: "white" },
  { hs_code: "8711.30", displacement_min: 250, displacement_max: 500, plate_class: "yellow" },
  { hs_code: "8711.40", displacement_min: 500, displacement_max: 800, plate_class: "red" },
  { hs_code: "8711.50", displacement_min: 800, displacement_max: null, plate_class: "red" },
] as const;
