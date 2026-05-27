/**
 * PDI 整備工單 — 常數與型別（client-safe，無 supabase / server-only）
 *
 * 29 項 checklist 逐字照抄設計稿 docs/20260527/02_PDI工單執行.html
 * 分 A~D 四類：A 交車前準備與外觀(8) + B 機械系統(9) + C 電氣與系統(6) + D 最終測試與文件(7) = 30…
 * → 設計稿 buildChecklist 連續編號 1–29（共 29 項），逐項照抄如下（與設計稿 pdiItems 完全一致）。
 */

export type PdiChecklistResult = "ok" | "flagged" | "na";

export type PdiChecklistItemState = {
  /** 0-based index（0–28） */
  idx: number;
  /** null = 未填；ok = 正常；flagged = 異常；na = N/A */
  result: PdiChecklistResult | null;
  /** 異常 / 備註說明 */
  note: string;
};

export type PdiChecklistCategory = {
  cat: "A" | "B" | "C" | "D";
  catName: string;
  items: string[];
};

/** 29 項 checklist，逐字照抄設計稿 pdiItems */
export const PDI_CHECKLIST_CATEGORIES: PdiChecklistCategory[] = [
  {
    cat: "A",
    catName: "A. 交車前準備與外觀確認",
    items: [
      "閱讀技術公報 SRV-SRB 車款介紹",
      "目視檢查運輸包裝完整性（如適用）",
      "移除運輸包裝（如適用）",
      "目視檢查車輛完整性",
      "檢查所有配件完整性（參閱配件箱零件清單）",
      "移除車輪保護裝置",
      "安裝把手平衡端子",
      "安裝後視鏡及貼上提醒標籤",
    ],
  },
  {
    cat: "B",
    catName: "B. 機械系統確認",
    items: [
      "啟動電瓶並安裝於車輛",
      "檢查最終傳動鏈條張力",
      "檢查胎壓 前/後 2.5 bar",
      "檢查煞車及離合器油（若有需要請補充）",
      "檢查引擎機油液面高度，必要時補充",
      "檢查鑰匙功能和龍頭鎖（左右）是否作動正常",
      "檢查前後輪軸固定扭力",
      "檢查前後煞車卡鉗固定螺栓扭力",
      "添加汽油直到預備油量燈熄滅",
    ],
  },
  {
    cat: "C",
    catName: "C. 電氣與系統確認",
    items: [
      "檢查燈光、方向燈、喇叭和控制開關；調整遠近燈高度",
      "檢查儀錶板日期時間，設定符合計量單位（Km、°C）",
      "檢查引擎停止開關、側腳柱開關和離合器拉桿開關",
      "透過 NDCS 檢查是否有技術公報或召回需要執行",
      "透過 DDS 2.0 檢查 ECU 是否有故障碼與軟體升級",
      "根據客戶訂單安裝 Performance 配件並確認操作正常",
    ],
  },
  {
    cat: "D",
    catName: "D. 最終測試與文件",
    items: [
      "最終檢查和道路測試（確認安全裝置和散熱風扇作動）",
      "清潔車輛",
      "車輛保固啟動申請與文件填寫",
      "向車主說明定期保養計劃，依交車確認表實際教學車輛功能操作",
      "提供車主隨車文件、配件箱和保養手冊",
      "確認 PDI 檢查表已完成並簽名存檔",
      "確認整備費用已記錄（工時 + 零件）",
    ],
  },
];

/** 攤平成 29 項的純文字陣列（idx 對應 0–28） */
export const PDI_CHECKLIST_FLAT: { idx: number; cat: string; text: string }[] =
  PDI_CHECKLIST_CATEGORIES.flatMap((c) => c.items.map((text) => ({ cat: c.cat, text }))).map(
    (it, idx) => ({ idx, cat: it.cat, text: it.text }),
  );

export const PDI_CHECKLIST_TOTAL = PDI_CHECKLIST_FLAT.length; // = 29

export type PdiPartLine = {
  /** 料號（可空） */
  part_no: string;
  name: string;
  qty: number;
  unit_price: number;
};

export type PdiLaborLine = {
  name: string;
  technician: string;
  /** 工時 LU */
  lu: number;
  /** 單價 / LU */
  rate: number;
};

/** 一項是否「已處理」（正常 / 異常 / N/A 都算填了） */
export function isChecklistItemDone(s: PdiChecklistItemState | undefined): boolean {
  return !!s && s.result !== null;
}

/** 已填項數 */
export function countChecklistDone(checklist: PdiChecklistItemState[]): number {
  return checklist.filter(isChecklistItemDone).length;
}

/** 進度 % (0–100) */
export function checklistProgress(checklist: PdiChecklistItemState[]): number {
  if (PDI_CHECKLIST_TOTAL === 0) return 0;
  return Math.round((countChecklistDone(checklist) / PDI_CHECKLIST_TOTAL) * 100);
}

export function partsTotal(parts: PdiPartLine[]): number {
  return parts.reduce((s, p) => s + Number(p.qty || 0) * Number(p.unit_price || 0), 0);
}

export function laborTotal(labor: PdiLaborLine[]): number {
  return labor.reduce((s, l) => s + Number(l.lu || 0) * Number(l.rate || 0), 0);
}
