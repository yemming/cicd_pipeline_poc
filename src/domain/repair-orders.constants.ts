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

export type PrefixP1 = "MN" | "RP" | "WC" | "AC" | "OT" | "PD" | "TL";
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
  { code: "TL", name: "借用測試", desc: "Test & Loan · 臨時借出診斷/測試，當天必須結案" },
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
  // TL 借用測試：唯一合法組合 TL-IN（內部借出，費用依結案逐行處置決定）
  { p1: "TL", p2: "IN", verdict: "valid", accounting: "EXPENSE", description: "✅ TL-IN 借用測試 · 內部借出，費用依結案處置決定（轉工單/退料/向車主收費/門店吸收）" },
  // 以下未列在 HTML 11 種白名單中 → fallback 為 needs_supervisor（POC 階段不擋、加 metadata 標記）
  // RP-WR / AC-WR / OT-WR / MN-WR
];

/** 借用測試工單前綴（一車多工單規則：TL+任意=允許、TL+TL=告警；結案走 tl-close 不走結帳）*/
export const TL_PREFIX: PrefixP1 = "TL";

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

/**
 * 完整工單狀態清單（RP1 定案）
 *
 * 以下為 Russell 6/12 v1 規格定義的完整狀態機。
 * 原有 5 個狀態保持不變，新增 6 個：
 *   - 等待客戶授權  (B5-03)
 *   - 待料          (B9-01)
 *   - 待料-車輛已還  (B9-02)
 *   - 退回重工       (B11-01)
 *   - 已關閉-中途取消 (B17-01)
 *   - 已關閉-保固待確認 (B16-01)
 *
 * 語意對齊說明（terminal state 統一為「已關閉」系列，不動現有流程）：
 *   - 已關單  → 原有終態（正常完工結帳關閉）保持不動
 *   - 已取消  → 原有終態（管理員/SA 主動取消）保持不動
 *   - 已關閉-中途取消 → 新增終態（需主管授權，含部分結帳）
 *   - 已關閉-保固待確認 → 新增終態（完修待原廠確認費用，可視需要 re-open）
 *
 * TODO promote: 若 DB 加 enum/check constraint，把此清單同步到 DDL
 */
export const RO_STATUS_OPTIONS = [
  // ── 開放（可繼續轉換）──────────────────────────────
  "進行中",            // 工單建立後初始狀態（待派工）
  "維修中",            // 已指派主責技師，施工進行中
  "等待客戶授權",      // 技師追加 → SA 聯繫客戶中，等待同意或拒絕  (B5-03)
  "待料",              // 零件未到，工單暫停；車輛仍在廠  (B9-01)
  "待料-車輛已還",     // 等零件但客戶要求先取車，工單保持開啟  (B9-02)
  "退回重工",          // 複檢不通過，退回技師重新施工  (B11-01)
  "待結帳",            // 施工完畢，等待結帳收款
  // ── 終態（已關閉，不可逆）────────────────────────
  "已關單",            // 正常完工且結帳完成
  "已關閉-中途取消",   // 中途取消（需主管授權，含部分結帳）  (B17-01)
  "已關閉-保固待確認", // 完修待原廠確認費用  (B16-01)
  "已取消",            // 管理員 / SA 主動取消（不含部分結帳）
] as const;

export type RoStatus = (typeof RO_STATUS_OPTIONS)[number];

/**
 * 終態狀態集合（進入後不可再次呼叫 updateRepairOrderStatusAction 修改）
 *
 * 終態轉換只能由專用動作觸發（如 ro-checkout-actions.ts 的 completeCheckout），
 * 不走 updateRepairOrderStatusAction 通用入口。
 */
export const RO_TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>([
  "已關單",
  "已關閉-中途取消",
  "已關閉-保固待確認",
  "已取消",
]);

/**
 * 合法狀態轉換白名單（from → allowed_to[]）
 *
 * 設計原則：
 * 1. 只列出「可以走 updateRepairOrderStatusAction 通用入口」的轉換。
 *    終態 → 任何狀態：不在此表中（終態 guard 優先，在 action 層擋住）。
 * 2. 建立工單（"進行中"）只能由 confirmRepairOrderAction 觸發，不在此表。
 * 3. 正常關單（"已關單"）只能由 ro-checkout-actions.ts completeCheckout 觸發，不在此表；
 *    避免直接呼叫 updateRepairOrderStatusAction 繞過結帳驗證。
 * 4. 中途取消（"已關閉-中途取消"）未來需主管授權，此處先允許、前端層做 guard，
 *    後端層 action 先 permit（RP5 主管授權工作流是下一波）。
 *
 * TODO RP5: 加主管授權前置 guard 到「已關閉-中途取消」和「等待客戶授權」轉換
 */
export const RO_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  // 進行中（建單初始）→ 指派技師後進維修中（通常由 setLeadTechnicianAction 觸發）；
  //                     也可直接轉「等待客戶授權」（追加 SA 未指派技師前聯繫）
  //                     或直接取消（管理員取消，由 cancelRepairOrderAction 處理，不在此）
  "進行中": [
    "維修中",
    "等待客戶授權",
    "待料",
  ],

  // 維修中 → 追加授權 / 缺料 / 完工待複檢（複檢直接切待結帳，"退回重工"由複檢不通過觸發）
  "維修中": [
    "等待客戶授權",
    "待料",
    "待料-車輛已還",
    "待結帳",
    "退回重工",           // 複檢不通過直接退回（進場二次複檢仍在「維修中」語意下）
    "已關閉-中途取消",    // 中途取消（RP5 補主管授權前置後加 guard）
  ],

  // 等待客戶授權 → 客戶同意回施工中 / 拒絕且繼續施工 / 取消施工
  "等待客戶授權": [
    "維修中",             // 客戶同意追加，繼續施工
    "待料",               // 同意追加但零件未到
    "待結帳",             // 不追加，繼續原本項目完工
    "已關閉-中途取消",    // 客戶拒絕且不繼續施工（中途取消）
  ],

  // 待料 → 零件到貨回施工中 / 客戶要先取車
  "待料": [
    "維修中",             // 零件到貨，繼續施工
    "待料-車輛已還",      // 零件未到，客戶要先取車
    "已關閉-中途取消",    // 客戶放棄等零件，中途取消
  ],

  // 待料-車輛已還 → 零件到貨+客戶回廠
  "待料-車輛已還": [
    "維修中",             // 零件到貨且客戶回廠，繼續施工
    "已關閉-中途取消",    // 客戶決定放棄
  ],

  // 退回重工 → 重新施工
  "退回重工": [
    "維修中",             // 技師重工完畢，重新進入施工中
  ],

  // 待結帳 → 正常關閉由 checkout action 處理（不在此白名單）；
  //          但可能由 SA 確認「保固待確認」或「中途取消」
  "待結帳": [
    "已關閉-保固待確認",  // 完修但原廠費用未回覆  (B16-01)
    "已關閉-中途取消",    // 結帳流程中客戶取消（極少見但允許）
    // "已關單" 不在此表：只能由 ro-checkout-actions.ts completeCheckout 觸發
  ],

  // 已關閉-保固待確認 → 等原廠確認後可正式關單（實務上需人工改）
  // 若要允許此轉換，可在此加；目前 gap audit 未要求，先保守不開放
  // "已關閉-保固待確認": ["已關單"],
} as const;

/**
 * 純函式：驗證狀態轉換是否合法
 *
 * @returns
 *   "ok"             — 合法轉換
 *   "terminal"       — from 是終態，不可再轉
 *   "same"           — from === to，無需轉換
 *   "not_allowed"    — 不在白名單中
 */
export function validateRoStatusTransition(
  from: string,
  to: string,
): "ok" | "terminal" | "same" | "not_allowed" {
  if (from === to) return "same";
  if (RO_TERMINAL_STATUSES.has(from)) return "terminal";
  const allowed = RO_STATUS_TRANSITIONS[from] ?? [];
  if ((allowed as readonly string[]).includes(to)) return "ok";
  return "not_allowed";
}

/**
 * 純函式：取得當前狀態可以轉到哪些狀態
 * 終態或未知狀態回空陣列。
 */
export function getAllowedNextStatuses(from: string): readonly string[] {
  if (RO_TERMINAL_STATUSES.has(from)) return [];
  return RO_STATUS_TRANSITIONS[from] ?? [];
}

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
