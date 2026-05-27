/**
 * 中古車整備工單 — 常數與型別（client-safe，無 supabase / server-only）
 *
 * 24 項 checklist 逐字照抄設計稿 docs/20260527/02_中古車整備工單.html 的 reconItems：
 *   A 清潔與外觀(5) + B 機械系統(8) + C 安全系統確認(6) + D 文件與完工(5) = 24
 *
 * ⚠️ build-only 陷阱：client 元件（recon-workorder-view.tsx）只能 value-import 本檔，
 * 不可 value-import 含 server 依賴的 @/domain/recon-workorder（那邊有 "use server"）。
 * 純型別則可從 domain helper type-import。
 */

export type ReconChecklistResult = "ok" | "flagged" | "na";

export type ReconChecklistItemState = {
  /** 0-based index（0–23） */
  idx: number;
  /** null = 未填；ok = 正常；flagged = 異常（標記旗標）；na = N/A */
  result: ReconChecklistResult | null;
  /** 異常 / 備註說明 */
  note: string;
};

export type ReconChecklistCategory = {
  cat: "A" | "B" | "C" | "D";
  catName: string;
  items: string[];
};

/** 24 項 checklist，逐字照抄設計稿 reconItems */
export const RECON_CHECKLIST_CATEGORIES: ReconChecklistCategory[] = [
  {
    cat: "A",
    catName: "A. 清潔與外觀",
    items: [
      "高壓水洗車身",
      "引擎室清潔",
      "車身拋光處理",
      "補漆/外觀修復（依評估）",
      "鉻件/金屬件光亮處理",
    ],
  },
  {
    cat: "B",
    catName: "B. 機械系統",
    items: [
      "更換機油及機油濾芯",
      "檢查冷卻液液面及品質",
      "檢查並調整傳動鏈條張力",
      "檢查前後輪胎花紋深度及胎壓",
      "檢查煞車油並補充/更換",
      "檢查電瓶電壓（靜態≥12.6V）",
      "檢查所有燈具功能",
      "引擎啟動測試，確認無異音",
    ],
  },
  {
    cat: "C",
    catName: "C. 安全系統確認",
    items: [
      "前後煞車制動效果測試",
      "ABS功能確認（如配備）",
      "油門、離合器拉桿作動順暢",
      "轉向無異常晃動",
      "前後懸吊作動正常",
      "道路測試（最少5km）",
    ],
  },
  {
    cat: "D",
    catName: "D. 文件與完工",
    items: [
      "確認VIN與行照一致",
      "拍攝整備完成照片（前後左右）",
      "填寫整備工時與零件記錄",
      "主管複驗簽核",
      "整備報告存檔",
    ],
  },
];

/** 攤平成 24 項的純文字陣列（idx 對應 0–23） */
export const RECON_CHECKLIST_FLAT: { idx: number; cat: string; text: string }[] =
  RECON_CHECKLIST_CATEGORIES.flatMap((c) => c.items.map((text) => ({ cat: c.cat, text }))).map(
    (it, idx) => ({ idx, cat: it.cat, text: it.text }),
  );

export const RECON_CHECKLIST_TOTAL = RECON_CHECKLIST_FLAT.length; // = 24

export type ReconPartLine = {
  /** 料號（可空） */
  part_no: string;
  name: string;
  qty: number;
  unit_price: number;
};

export type ReconLaborLine = {
  name: string;
  technician: string;
  /** 工時 LU */
  lu: number;
  /** 單價 / LU */
  rate: number;
};

/** 一項是否「已處理」（正常 / 異常 / N/A 都算填了） */
export function isChecklistItemDone(s: ReconChecklistItemState | undefined): boolean {
  return !!s && s.result !== null;
}

/** 已填項數 */
export function countChecklistDone(checklist: ReconChecklistItemState[]): number {
  return checklist.filter(isChecklistItemDone).length;
}

/** 進度 % (0–100) */
export function checklistProgress(checklist: ReconChecklistItemState[]): number {
  if (RECON_CHECKLIST_TOTAL === 0) return 0;
  return Math.round((countChecklistDone(checklist) / RECON_CHECKLIST_TOTAL) * 100);
}

export function partsTotal(parts: ReconPartLine[]): number {
  return parts.reduce((s, p) => s + Number(p.qty || 0) * Number(p.unit_price || 0), 0);
}

export function laborTotal(labor: ReconLaborLine[]): number {
  return labor.reduce((s, l) => s + Number(l.lu || 0) * Number(l.rate || 0), 0);
}
