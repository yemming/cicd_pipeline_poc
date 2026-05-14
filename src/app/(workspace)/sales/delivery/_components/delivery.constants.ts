// RS05 交車流程 wizard 靜態清單

export const DLV_STEPS = [
  { idx: 1, label: "PDI 整備觸發" },
  { idx: 2, label: "交車確認表（36項）" },
  { idx: 3, label: "保固條款登記" },
  { idx: 4, label: "完成交車 · 觸發 D+3" },
] as const;

// PDI 29 項
export const PDI_ITEMS = [
  "閱讀技術公報 SRV-SRB-19-041 車款介紹",
  "目視檢查運輸包裝完整性（如適用）",
  "移除運輸包裝（如適用）",
  "目視檢查車輛完整性",
  "檢查所有配件完整性（參閱配件箱零件清單）",
  "移除車輪保護裝置",
  "移除左右反光片上的束帶",
  "安裝把手平衡端子",
  "安裝後視鏡及貼上提醒標籤",
  "啟動電瓶並安裝於車輛",
  "檢查最終傳動鏈條張力",
  "檢查胎壓 前/後 2.5 bar",
  "檢查煞車機離合器油（若有需要請補充）",
  "檢查引擎機油液面高度，必要時補充",
  "檢查鑰匙功能和龍頭鎖（左右）是否作動正常",
  "檢查燈光、方向燈、喇叭和控制開關；調整進遠燈高度；龍頭左右轉向檢查",
  "檢查儀錶板日期時間，設定符合台灣計量單位（Km、°C）",
  "檢查引擎停止開關、側腳柱開關和離合器拉桿開關操作",
  "檢查前後輪軸固定扭力 前-63 Nm；後-230 Nm",
  "檢查前後煞車卡鉗固定螺栓扭力 前-45 Nm；後-25 Nm",
  "添加汽油直到預備油量燈熄滅（4.5公升）",
  "透過 NDCS 檢查是否有技術公報或召回需要執行",
  "透過 DDS 2.0 檢查 ECU 是否有故障碼與軟體升級（Global Scan）",
  "根據客戶訂單安裝 Ducati Performance 配件並確認操作正常",
  "最終檢查和道路測試（確認安全裝置和散熱風扇作動）",
  "清潔車輛",
  "車輛保固啟動申請與文件填寫",
  "向車主說明定期保養計劃，依交車確認表實際教學車輛功能操作",
  "提供車主隨車文件、配件箱和保養手冊",
] as const;

export type DeliveryChecklistCategory = "a" | "b" | "c" | "d";

export const DELIVERY_CATEGORY_TITLES: Record<DeliveryChecklistCategory, string> = {
  a: "A. 經銷商交車準備",
  b: "B. 向客戶說明一般事項",
  c: "C. 使用注意事項",
  d: "D. 向客戶交車",
};

export type DeliveryChecklistItem = {
  id: string;
  category: DeliveryChecklistCategory;
  label: string;
};

// 36 項交車確認表
export const DELIVERY_ITEMS: DeliveryChecklistItem[] = [
  { id: "d01", category: "a", label: "確保「交車前檢查清單 PDI」已完成並簽名存檔" },
  { id: "d02", category: "a", label: "確認摩托車符合購買合約要求：型號/配件/外觀" },
  { id: "d03", category: "a", label: "確認車身號碼和車牌與行照是否一致" },
  { id: "d04", category: "a", label: "確認燃料已加滿至儀表板指示燈熄滅（至少 5 公升）" },
  { id: "d05", category: "a", label: "駕駛和乘客座高調整（組裝/拆卸操作）" },
  { id: "d06", category: "a", label: "擋風鏡高度調整" },
  { id: "d07", category: "a", label: "儀錶板傾角調整" },
  { id: "d08", category: "a", label: "後視鏡調整" },
  { id: "d09", category: "a", label: "煞車和離合器拉桿調整" },
  { id: "d10", category: "a", label: "後避震器 SAG 調整" },
  { id: "d11", category: "b", label: "鑰匙和鎖的功能，含備用鑰匙說明" },
  { id: "d12", category: "b", label: "機械或電子油箱蓋的功能" },
  { id: "d13", category: "b", label: "側邊或中央駐車架的功能" },
  { id: "d14", category: "b", label: "電源插座、USB 接頭、充電插座說明" },
  { id: "d15", category: "b", label: "側邊旅行箱和尾箱安裝/拆卸和使用注意事項" },
  { id: "d16", category: "b", label: "把手開關說明" },
  { id: "d17", category: "b", label: "儀錶板說明（設定選單、PIN CODE、駕駛模式等）" },
  { id: "d18", category: "b", label: "駕駛/乘客加熱坐墊和加溫握把說明（如有）" },
  { id: "d19", category: "b", label: "駕駛輔助系統：ABS、DTC、DWC、DSC、DPL、VHC 說明" },
  { id: "d20", category: "b", label: "機械或電子懸吊說明（預載調整）" },
  { id: "d21", category: "b", label: "Ducati 進退快排系統（DQS）說明" },
  { id: "d22", category: "b", label: "定速巡航控制（CC）、主動巡航控制（ACC）和盲區偵測（BSD）說明" },
  { id: "d23", category: "b", label: "藍芽多媒體整合配對智慧手機或藍芽對講機" },
  { id: "d24", category: "b", label: "Ducati Connect、Sygic GPS、XLink 應用程式說明" },
  { id: "d25", category: "b", label: "下載並講解 MyDucati 應用程式（車庫/定期維護/新消息）" },
  { id: "d26", category: "b", label: "摩托車定期保養計劃說明（里程保養/時間保養，登錄 Ducati 官網）" },
  { id: "d27", category: "b", label: "介紹維修廠以及服務顧問" },
  { id: "d28", category: "c", label: "引擎磨合：前 1,000 km 引擎轉速操作說明" },
  { id: "d29", category: "c", label: "鋰電池低溫啟動步驟（如車輛配備鋰電池）" },
  { id: "d30", category: "c", label: "傳動鏈條的清潔、張力值檢查及潤滑步驟" },
  { id: "d31", category: "c", label: "車輛清潔說明；避免腐蝕性產品或高壓水柱設備" },
  { id: "d32", category: "c", label: "定期胎壓檢查及使用原廠輪胎尺寸的重要性" },
  { id: "d33", category: "c", label: "引擎機油、冷卻液以及煞車/離合器液位檢查說明" },
  { id: "d34", category: "d", label: "啟動摩托車保固" },
  { id: "d35", category: "d", label: "介紹可加購的延長保服務" },
  { id: "d36", category: "d", label: "交付車輛領牌文件、車主手冊、隨車配件箱及正確填寫保固書" },
];

export const WARRANTY_CONFIRM_ITEMS = [
  "已向客戶說明保固條款內容及範圍",
  "已向客戶說明購買契約相關細節，並提供全套文件",
  "已依廠家規定說明定期保養計劃（里程保養 / 時間保養）",
  "已帶領客戶填寫保固相關表格",
  "已說明 www.ducati.com 網站及授權經銷商售後服務資訊",
] as const;

export const WARRANTY_EXCLUSIONS = [
  "用於任何運動競賽的機車",
  "用於租賃服務的機車",
  "正常使用自然耗損零件（輪胎、傳動零件、正時皮帶、煞車、離合器等）",
  "因氧化、環境因素、非正常使用、未定期保養所導致的故障與瑕疵",
  "在非 DUCATI 官方授權經銷商進行的維修保養",
  "使用未經 DUCATI 原廠核准之零件或改裝部品",
  "未遵守車主手冊使用建議，或未參加召回活動",
] as const;

export type SignatureRole = "tech" | "rs" | "customer";

export const SIGNATURE_DEFS: { role: SignatureRole; icon: string; label: string; sub: string }[] = [
  { role: "tech", icon: "🔧", label: "技師簽名", sub: "交車前準備已完成" },
  { role: "rs", icon: "📝", label: "銷售顧問（RS）簽名", sub: "交車說明完成" },
  { role: "customer", icon: "✍️", label: "客戶簽名", sub: "已閱讀並了解保固條款" },
];

export const HANDOVER_DOCS = [
  { icon: "📋", name: "PDI 檢查表（副本）", sub: "技師完成並簽名", tag: "RS 需簽", tagTone: "req" as const },
  { icon: "📜", name: "保固條款書（車主聯-紅）", sub: "RS + 客戶均需簽名", tag: "雙方需簽", tagTone: "req" as const },
  { icon: "✅", name: "交車確認表（副本）", sub: "RS + 客戶均需簽名", tag: "雙方需簽", tagTone: "req" as const },
  { icon: "📖", name: "車主手冊 / 隨車配件箱", sub: "原廠提供", tag: "無需簽名", tagTone: "no" as const },
  { icon: "🪪", name: "行照 / 保險卡", sub: "辦牌後交付", tag: "無需簽名", tagTone: "no" as const },
  { icon: "🗝️", name: "車鑰匙（正副鑰匙）", sub: "主動鑰匙 + 備用鑰匙", tag: "當面點交", tagTone: "no" as const },
];

export const WARRANTY_TERMS = [
  { label: "整車保固（台灣碩文版）", value: "2 年不限里程", sub: "自保固啟動日起" },
  { label: "零件保固（原廠非消耗品）", value: "24 個月", sub: "授權經銷商購買安裝起算" },
  { label: "一般保固（≥500cc 公路）", value: "24 個月不限里程", sub: "Panigale V4 S 適用" },
  { label: "Desmo 服務（≥500cc）", value: "24 個月 或 40,000 km", sub: "以先到為準" },
] as const;
