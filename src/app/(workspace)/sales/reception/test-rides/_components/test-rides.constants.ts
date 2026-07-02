// 試乘試駕（RS02）wizard 靜態選項清單

export const TD_LICENSE_OPTIONS = [
  { value: "valid", label: "✅ 有效大型重機駕照（A1/A2）" },
  { value: "none", label: "❌ 無駕照（不可試駕）" },
] as const;

// B-05：試駕車款已改為 DB-backed（依 active brand 撈 vehicle_models），不再寫死 Ducati 車型。
// 車款下拉的資料來源見 getTestDriveLookups()，wizard/page.tsx 撈好傳進 TestRidesForm。

export const TD_ROUTES = [
  "市區短程（約 15 分）",
  "山路/彎道體驗（約 30 分）",
  "高速公路巡航（約 20 分）",
  "綜合路線（約 45 分）",
] as const;

export const TD_PURPOSES = [
  "新車購買前體驗",
  "中古車購買前確認",
  "換購比較（現有其他車款）",
  "純體驗（暫無購買計畫）",
] as const;

export const TD_INTENT_LEVELS = [
  "H 級（本月成交）",
  "A 級（30 天內）",
  "B 級（3 個月內）",
  "C 級（暫時觀望）",
] as const;

export const TD_ESCORT_MODES = [
  "客戶獨自試駕",
  "RS 陪同（機車後座）",
  "RS 先導（另一台車）",
  "RS 尾隨（另一台車）",
] as const;

export type SafetyCategory = "customer" | "vehicle" | "briefing";

export type SafetyItem = {
  id: string;
  category: SafetyCategory;
  label: string;
};

export const TD_SAFETY_ITEMS: SafetyItem[] = [
  { id: "sc0", category: "customer", label: "持有有效大型重機駕照（A1 或 A2）" },
  { id: "sc1", category: "customer", label: "已配戴合格安全帽（全罩式或3/4罩，需扣好扣環）" },
  { id: "sc2", category: "customer", label: "著長袖長褲，穿著閉趾鞋（不可穿涼鞋、拖鞋）" },
  { id: "sc3", category: "customer", label: "精神狀態良好，無飲酒或服用影響駕駛之藥物" },
  { id: "sc4", category: "customer", label: "已簽署試駕同意書（客戶確認知悉風險）" },
  { id: "sc5", category: "vehicle", label: "前後燈光正常（頭燈/尾燈/方向燈）" },
  { id: "sc6", category: "vehicle", label: "前後煞車正常作動" },
  { id: "sc7", category: "vehicle", label: "胎壓正常（前 2.5 bar / 後 2.5 bar）" },
  { id: "sc8", category: "vehicle", label: "油量足夠（不低於 1/4 格）" },
  { id: "sc9", category: "vehicle", label: "鏡子（後視鏡）調整完畢" },
  { id: "sc10", category: "vehicle", label: "發動正常，怠速穩定，無故障燈亮起" },
  { id: "sc11", category: "briefing", label: "已向客戶說明試駕路線與路況" },
  { id: "sc12", category: "briefing", label: "已說明車輛特性（動力模式 / ABS / DTC 設定）" },
  { id: "sc13", category: "briefing", label: "已告知緊急聯絡方式及回廠時間" },
];

export const SAFETY_CATEGORY_TITLES: Record<SafetyCategory, string> = {
  customer: "客戶本身",
  vehicle: "試駕車輛",
  briefing: "試駕說明（RS 口頭說明完成）",
};

// Step 4 評估選項
export const TD_OVERALL_FEEDBACK = [
  { value: "ok", label: "😊 非常滿意", tone: "ok" as const },
  { value: "amber", label: "🙂 尚可接受", tone: "amber" as const },
  { value: "red", label: "😐 不符期待", tone: "red" as const },
];

export const TD_POWER_FEEL = [
  "— 選擇 —",
  "超出預期（非常強烈）",
  "符合預期",
  "低於預期",
  "太強，操控不易",
];

export const TD_HANDLING_FEEL = [
  "— 選擇 —",
  "非常靈活，輕鬆上手",
  "需要適應期",
  "感覺偏重/偏大",
  "感覺偏輕/不穩",
];

export const TD_ERGONOMICS = [
  "— 選擇 —",
  "非常舒適",
  "尚可",
  "坐姿太攻擊性",
  "腳踏位置不適合",
];

export const TD_INTENT_CHANGE = [
  "— 選擇 —",
  "意願明顯提升 ⬆️",
  "維持原意願",
  "意願下降 ⬇️",
  "改變車款興趣",
];

// B-05：「試駕後推薦車款調整」改吃 DB-backed 車款（維持原車款 + models），不再寫死 Ducati 車型。

export const TD_SKIP_REASONS = [
  "— 請選擇跳過原因 —",
  "客戶需要時間考慮",
  "客戶需要與家人商量",
  "客戶對車款尚未確定",
  "客戶對價格有疑慮，需另行溝通",
  "車款不符合期待，需推薦其他車型",
  "客戶主動說明不急購買",
];

export const TD_STEPS = [
  { idx: 1, label: "試駕登記" },
  { idx: 2, label: "安全確認清單" },
  { idx: 3, label: "簽名同意" },
  { idx: 4, label: "試駕計時" },
  { idx: 5, label: "結束評估 · 黃金時刻" },
] as const;
