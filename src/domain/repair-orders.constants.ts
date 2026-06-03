/**
 * Constants — 售後正式工單 RO（前綴定義 + 11 種合法組合白名單）
 *
 * Spec 來源：docs/proposals/feature-aftersales-ro-phase1.md §3
 * HTML：docs/DUCATI_售後工單模組_..._最新版/02_正式工單RO.html L86-99
 *
 * POC 階段：規則先 hardcode 在此檔。Phase 2 視 work_order_prefix_rules
 * 表落地狀態決定 promote 到 DB 還是維持 constant + business_rules cover。
 * 雙 brand 共用同一份規則（Indian 政策若有差異，再走 business_rules
 * rule_kind='ro_prefix_combo' 覆蓋）。
 */

export type PrefixP1 = "MN" | "RP" | "WC" | "AC" | "OT" | "PD";
export type PrefixP2 = "CP" | "WR" | "FR" | "IN";
export type ComboVerdict = "valid" | "invalid" | "needs_supervisor";
export type AccountingCategory = "AR_CUSTOMER" | "AR_VENDOR" | "EXPENSE" | "MIXED" | "VEHICLE_COST";

export const PREFIX_P1_DEFS: {
  code: PrefixP1;
  name: string;
  desc: string;
}[] = [
  { code: "MN", name: "定期保養", desc: "Maintenance · 客付收入" },
  { code: "RP", name: "機修", desc: "Repair · 客付收入" },
  { code: "WC", name: "保固索賠", desc: "Warranty · 廠商轉收入" },
  { code: "AC", name: "事故", desc: "Accident · 保險付款" },
  { code: "OT", name: "其他業務", desc: "Others · 客付收入" },
  { code: "PD", name: "PDI整備", desc: "Pre-Delivery Inspection · 內部結算" },
];

export const PREFIX_P2_DEFS: {
  code: PrefixP2;
  name: string;
  desc: string;
}[] = [
  { code: "CP", name: "客付", desc: "Customer Pay · 自費" },
  { code: "WR", name: "保固", desc: "Warranty · 廠商負擔" },
  { code: "FR", name: "免費施工", desc: "Free of Charge · 本店吸收" },
  { code: "IN", name: "內部結算", desc: "Internal · 整車成本轉入" },
];

export const PREFIX_COMBO_RULES: {
  p1: PrefixP1;
  p2: PrefixP2;
  verdict: ComboVerdict;
  accounting: AccountingCategory | null;
  description: string;
}[] = [
  { p1: "MN", p2: "CP", verdict: "valid", accounting: "AR_CUSTOMER", description: "✅ MN-CP 定保客付 · 一般應收帳款 · 合法組合" },
  { p1: "MN", p2: "FR", verdict: "valid", accounting: "EXPENSE", description: "✅ MN-FR 定保免費（返工/公關）· 費用認列" },
  { p1: "RP", p2: "CP", verdict: "valid", accounting: "AR_CUSTOMER", description: "✅ RP-CP 機修客付 · 一般應收帳款 · 合法組合" },
  { p1: "RP", p2: "FR", verdict: "valid", accounting: "EXPENSE", description: "✅ RP-FR 機修免費（返工賠償）· 費用認列" },
  { p1: "WC", p2: "WR", verdict: "valid", accounting: "AR_VENDOR", description: "✅ WC-WR 保固索賠（廠商付）· 廠商應收帳款" },
  { p1: "WC", p2: "CP", verdict: "valid", accounting: "MIXED", description: "✅ WC-CP 保固轉客付（超出範圍部分）" },
  { p1: "WC", p2: "FR", verdict: "invalid", accounting: null, description: "❌ WC-FR 邏輯衝突！保固索賠不可免費施工，請重新選擇" },
  { p1: "AC", p2: "CP", verdict: "valid", accounting: "AR_CUSTOMER", description: "✅ AC-CP 事故客付 · 一般應收帳款" },
  { p1: "AC", p2: "FR", verdict: "valid", accounting: "EXPENSE", description: "✅ AC-FR 事故免費（特殊公關）· 費用認列" },
  { p1: "OT", p2: "CP", verdict: "valid", accounting: "AR_CUSTOMER", description: "✅ OT-CP 其他業務客付 · 一般應收帳款" },
  { p1: "OT", p2: "FR", verdict: "valid", accounting: "EXPENSE", description: "✅ OT-FR 其他業務免費 · 費用認列" },
  { p1: "PD", p2: "IN", verdict: "valid", accounting: "VEHICLE_COST", description: "✅ PD-IN PDI整備 · 整車成本轉入（內部結算，車主應付 NT$0）" },
  // 以下未列在 HTML 11 種白名單中 → fallback 為 needs_supervisor（POC 階段不擋、加 metadata 標記）
  // RP-WR / AC-WR / OT-WR / MN-WR
];

/** 純函式：驗證 P1×P2 組合 */
export function validatePrefixCombo(p1: PrefixP1, p2: PrefixP2): ComboVerdict {
  const rule = PREFIX_COMBO_RULES.find((r) => r.p1 === p1 && r.p2 === p2);
  if (rule) return rule.verdict;
  return "needs_supervisor";
}

/** 純函式：取得組合描述 */
export function describeCombo(p1: PrefixP1, p2: PrefixP2): string {
  const rule = PREFIX_COMBO_RULES.find((r) => r.p1 === p1 && r.p2 === p2);
  if (rule) return rule.description;
  return `⚠️ ${p1}-${p2} 組合需主管確認`;
}

/** 純函式：組工單編號 */
export function buildRoCode(
  p1: PrefixP1,
  p2: PrefixP2,
  issue_date: string,
  sequence_no: number,
): string {
  const yymmdd = issue_date.replace(/-/g, "").slice(2);
  return `${p1}-${p2}-${yymmdd}-${String(sequence_no).padStart(3, "0")}`;
}

export const RO_STATUS_OPTIONS = [
  "進行中",
  "維修中",
  "待結帳",
  "已關單",
  "已取消",
] as const;

export type RoStatus = (typeof RO_STATUS_OPTIONS)[number];

/**
 * 工單優先級（G-1 DDL `repair_orders.priority`，CHECK = urgent|normal|flexible）
 * 派工依此排序：緊急置頂。chip 走色票表（紅=緊急 / 琥珀=一般 / 綠=彈性）。
 */
export type RoPriority = "urgent" | "normal" | "flexible";

export const RO_PRIORITY_DEFS: {
  code: RoPriority;
  label: string;
  emoji: string;
  desc: string;
  /** list chip / detail badge 用 */
  chip: string;
  /** confirm-view 選擇器選中態邊框/底色 */
  selected: string;
}[] = [
  { code: "urgent", label: "緊急", emoji: "🔴", desc: "客戶在店等 / 趕交車 · 派工置頂", chip: "bg-[#FDECEA] text-[#CC0000]", selected: "border-[#CC0000] bg-[#FDECEA]" },
  { code: "normal", label: "一般", emoji: "🟡", desc: "正常排程 · 依進廠順序", chip: "bg-[#FDF3E3] text-[#854F0B]", selected: "border-[#854F0B] bg-[#FDF3E3]" },
  { code: "flexible", label: "彈性", emoji: "🟢", desc: "可彈性安排 · 量大時讓位", chip: "bg-[#EAF3DE] text-[#3B6D11]", selected: "border-[#3B6D11] bg-[#EAF3DE]" },
];

/** 排序權重：緊急(0) → 一般(1) → 彈性(2)；未知值墊底 */
export const RO_PRIORITY_SORT: Record<string, number> = {
  urgent: 0,
  normal: 1,
  flexible: 2,
};

export function priorityDef(code: string | null | undefined) {
  return RO_PRIORITY_DEFS.find((d) => d.code === code) ?? RO_PRIORITY_DEFS[1];
}
