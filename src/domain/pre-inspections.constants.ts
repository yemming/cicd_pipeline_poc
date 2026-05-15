/**
 * Constants — 售後 接待預檢（SA Pre-Inspection）
 *
 * Spec：DUCATI 售後預檢單 v2 — 5-step wizard
 *  1. 環車檢查（dot marks 標傷 + 環檢項目 8 條）
 *  2. 來意詢問（來廠目的 + 車主原話 + SA 主動詢問 8 題）
 *  3. 技師深入檢查（引擎/煞車/輪胎/電氣/車架傳動 5 大類）
 *  4. 報價（SA 環檢項目 + 技師同意項目 → 工時費 + 零件費 + 5% 稅）
 *  5. 確認簽名（SA + 車主簽名）→ 自動轉錄至正式工單(RO)
 *
 * 一張預檢單流向：in_progress → quoting → signed → transferred(已轉 RO) | cancelled
 */

export const PRE_INSPECTION_STATUS = [
  "in_progress",
  "quoting",
  "signed",
  "transferred",
  "cancelled",
] as const;
export type PreInspectionStatus = (typeof PRE_INSPECTION_STATUS)[number];

export const STATUS_LABEL: Record<PreInspectionStatus, string> = {
  in_progress: "預檢中",
  quoting: "報價中",
  signed: "已簽名",
  transferred: "已轉工單",
  cancelled: "已取消",
};

export const STATUS_CHIP: Record<PreInspectionStatus, string> = {
  in_progress: "bg-[#FDF3E3] text-[#854F0B]",
  quoting: "bg-[#EAF4FB] text-[#185FA5]",
  signed: "bg-[#E5F5EE] text-[#0F6E56]",
  transferred: "bg-[#EAF3DE] text-[#3B6D11]",
  cancelled: "bg-[#F2F2F2] text-[#6B6A68]",
};

/** 環檢項目（每個 0=正常, 1=注意, 2=損傷, -1=未檢） */
export type CheckRow = { label: string; state: -1 | 0 | 1 | 2 };
export const DEFAULT_CHECKS: CheckRow[] = [
  { label: "車身外觀（刮傷/凹痕/龜裂）", state: -1 },
  { label: "前後燈光功能（頭/尾/方向燈）", state: -1 },
  { label: "後照鏡（完整/鬆動）", state: -1 },
  { label: "前輪胎（胎紋/胎壁/胎壓）", state: -1 },
  { label: "後輪胎（胎紋/胎壁/胎壓）", state: -1 },
  { label: "前煞車來令片（目視厚度）", state: -1 },
  { label: "後煞車來令片（目視厚度）", state: -1 },
  { label: "鏈條（鬆緊/潤滑/磨耗）", state: -1 },
];

/** 來廠目的（idx 對應） */
export type Purpose = { label: string; warn?: boolean };
export const PURPOSES: Purpose[] = [
  { label: "定期保養" },
  { label: "里程保養" },
  { label: "Desmo 保養" },
  { label: "故障維修" },
  { label: "改裝安裝" },
  { label: "⚠️ 疑似保固問題", warn: true },
  { label: "📢 公報召回通知", warn: true },
  { label: "其他" },
];

/** SA 主動詢問問句 */
export const SA_ASKS: string[] = [
  "上次保養時間／里程為何？",
  "是否有任何異常聲響？（何時／何種情況）",
  "操控上是否有任何異常感覺？",
  "煞車感覺是否正常？（偏軟／偏硬／偏移）",
  "燈光及電子系統是否正常？",
  "是否有任何滲漏（油／水）？",
  "是否有想加裝的改裝配件？",
  "是否有其他需要評估的項目？",
];
export type AskAnswer = "yes" | "no" | "na";

/** 技師深入檢查 row */
export type TechCategory = "engine" | "brake" | "tire" | "elec" | "chassis";
export const TECH_CATEGORY_LABEL: Record<TechCategory, string> = {
  engine: "引擎系統",
  brake: "煞車系統",
  tire: "輪胎系統",
  elec: "電氣系統",
  chassis: "車架傳動",
};
export const TECH_CATEGORY_BG: Record<TechCategory, string> = {
  engine: "bg-[#854F0B]",
  brake: "bg-[#CC0000]",
  tire: "bg-[#185FA5]",
  elec: "bg-[#534AB7]",
  chassis: "bg-[#2C2C2C]",
};
export const TECH_CATEGORY_ORDER: TechCategory[] = [
  "engine",
  "brake",
  "tire",
  "elec",
  "chassis",
];

export type TechSafety = 1 | 2 | 3; // 1=立即必修, 2=近期建議, 3=一般建議
export const SAFETY_LABEL: Record<TechSafety, string> = {
  1: "🔴 立即必修",
  2: "🟡 近期建議",
  3: "🟢 一般建議",
};
export const SAFETY_CHIP: Record<TechSafety, string> = {
  1: "bg-[#FCEBEB] text-[#CC0000]",
  2: "bg-[#FAEEDA] text-[#854F0B]",
  3: "bg-[#E1F5EE] text-[#0F6E56]",
};

export type TechDecision = "none" | "agree" | "defer" | "reject";
export const DECISION_LABEL: Record<TechDecision, string> = {
  none: "—",
  agree: "✓ 同意",
  defer: "⏸ 暫緩",
  reject: "✕ 拒絕",
};

export type TechRow = {
  cat: TechCategory;
  title: string;
  diag: string;
  safety: TechSafety;
  state: TechDecision;
  lu: number;
  parts: number;
};

/** 報價 SA 項目 */
export type SaQuoteItem = { name: string; lu: number; parts: number };

export const LU_RATE = 165; // NT$ per LU (LU × 6 分鐘 × 1650/小時 = labor cost)
export const TAX_RATE = 0.05;

export type DotMark = {
  view: "side" | "top";
  x: number; // 0~1 比例
  y: number;
  label: string;
  state: "ok" | "warn" | "bad" | "empty";
};

/** 簽名 snapshot */
export type Signature = {
  text: string | null;
  signed_at: string | null; // ISO
  screenshot_url?: string | null;
};

/** 報價計算（給 helper / wizard 共用） */
export function computeQuote(
  saItems: SaQuoteItem[],
  techRows: TechRow[],
): { labor: number; parts: number; tax: number; total: number; agreedLu: number } {
  let labor = 0;
  let parts = 0;
  let agreedLu = 0;
  saItems.forEach((i) => {
    labor += Math.round(i.lu * LU_RATE);
    parts += i.parts;
    agreedLu += i.lu;
  });
  techRows.forEach((t) => {
    if (t.state === "agree") {
      labor += Math.round(t.lu * LU_RATE);
      parts += t.parts;
      agreedLu += t.lu;
    }
  });
  const tax = Math.round((labor + parts) * TAX_RATE);
  return { labor, parts, tax, total: labor + parts + tax, agreedLu };
}

/** wizard step meta */
export const WIZARD_STEPS = [
  { key: "circle", label: "環車檢查" },
  { key: "purpose", label: "來意詢問" },
  { key: "tech", label: "技師深入檢查" },
  { key: "quote", label: "報價" },
  { key: "sign", label: "確認簽名" },
] as const;
export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];
