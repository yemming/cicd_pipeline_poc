/**
 * Delivery constants — RS05 交車管理 6 step 共用常數
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS05_交車管理_v1.html
 */

export const DELIVERY_STEPS = [
  {
    id: 1 as const,
    num: "STEP 1",
    label: "訂單覆核",
    href: "/delivery/confirm-1",
    sprint: "銷售 · RS05-v1-step1",
  },
  {
    id: 2 as const,
    num: "STEP 2",
    label: "PDI 整備",
    href: "/delivery/pdi",
    sprint: "銷售 · RS05-v1-step2",
  },
  {
    id: 3 as const,
    num: "STEP 3",
    label: "PDI 配件安裝",
    href: "/delivery/pdi-accessories",
    sprint: "銷售 · RS05-v1-step3",
  },
  {
    id: 4 as const,
    num: "STEP 4",
    label: "交車確認表",
    href: "/delivery/confirm-2",
    sprint: "銷售 · RS05-v1-step4",
  },
  {
    id: 5 as const,
    num: "STEP 5",
    label: "保固條款簽署",
    href: "/delivery/warranty-sign",
    sprint: "銷售 · RS05-v1-step5",
  },
  {
    id: 6 as const,
    num: "STEP 6",
    label: "完成交車",
    href: "/delivery/ceremony",
    sprint: "銷售 · RS05-v1-step6",
  },
];

// PDI 29 項
export const PDI_ITEMS: string[] = [
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
];

// 客戶交車確認表 36 項
export type DeliveryItemCat = "a" | "b" | "c" | "d";

export const DELIVERY_ITEMS: { t: string; c: DeliveryItemCat }[] = [
  { t: "確保「交車前檢查清單 PDI」已完成並簽名存檔", c: "a" },
  { t: "確認摩托車符合購買合約要求：型號/配件/外觀", c: "a" },
  { t: "確認車身號碼和車牌與行照是否一致", c: "a" },
  { t: "確認燃料已加滿至儀表板指示燈熄滅（至少 5 公升）", c: "a" },
  { t: "駕駛和乘客座高調整（組裝/拆卸操作）", c: "a" },
  { t: "擋風鏡高度調整", c: "a" },
  { t: "儀錶板傾角調整", c: "a" },
  { t: "後視鏡調整", c: "a" },
  { t: "煞車和離合器拉桿調整", c: "a" },
  { t: "後避震器 SAG 調整", c: "a" },
  { t: "鑰匙和鎖的功能，含備用鑰匙說明", c: "b" },
  { t: "機械或電子油箱蓋的功能", c: "b" },
  { t: "側邊或中央駐車架的功能", c: "b" },
  { t: "電源插座、USB 接頭、充電插座說明", c: "b" },
  { t: "側邊旅行箱和尾箱安裝/拆卸和使用注意事項", c: "b" },
  { t: "把手開關說明", c: "b" },
  { t: "儀錶板說明（設定選單、PIN CODE、駕駛模式等）", c: "b" },
  { t: "駕駛/乘客加熱坐墊和加溫握把說明（如有）", c: "b" },
  { t: "駕駛輔助系統：ABS、DTC、DWC、DSC、DPL、VHC 說明", c: "b" },
  { t: "機械或電子懸吊說明（預載調整）", c: "b" },
  { t: "Ducati 進退快排系統（DQS）說明", c: "b" },
  {
    t: "定速巡航控制（CC）、主動巡航控制（ACC）和盲區偵測（BSD）說明",
    c: "b",
  },
  { t: "藍芽多媒體整合配對智慧手機或藍芽對講機", c: "b" },
  { t: "Ducati Connect、Sygic GPS、XLink 應用程式說明", c: "b" },
  { t: "下載並講解 MyDucati 應用程式（車庫/定期維護/新消息）", c: "b" },
  {
    t: "摩托車定期保養計劃說明（里程保養/時間保養，登錄 Ducati 官網）",
    c: "b",
  },
  { t: "介紹維修廠以及服務顧問", c: "b" },
  { t: "引擎磨合：前 1,000 km 引擎轉速操作說明", c: "c" },
  { t: "鋰電池低溫啟動步驟（如車輛配備鋰電池）", c: "c" },
  { t: "傳動鏈條的清潔、張力值檢查及潤滑步驟", c: "c" },
  { t: "車輛清潔說明；避免腐蝕性產品或高壓水柱設備", c: "c" },
  { t: "定期胎壓檢查及使用原廠輪胎尺寸的重要性", c: "c" },
  { t: "引擎機油、冷卻液以及煞車/離合器液位檢查說明", c: "c" },
  { t: "啟動摩托車保固", c: "d" },
  { t: "介紹可加購的延長保服務", c: "d" },
  { t: "交付車輛領牌文件、車主手冊、隨車配件箱及正確填寫保固書", c: "d" },
];

export const DELIVERY_ITEM_CAT_NAME: Record<DeliveryItemCat, string> = {
  a: "A. 經銷商交車準備",
  b: "B. 向客戶說明一般事項",
  c: "C. 使用注意事項",
  d: "D. 向客戶交車",
};

// 預先標記每一項是否要在前面顯示類別 divider（純 static 計算）
export const DELIVERY_ITEM_ROWS: {
  item: { t: string; c: DeliveryItemCat };
  i: number;
  showDivider: boolean;
}[] = DELIVERY_ITEMS.map((item, i) => ({
  item,
  i,
  showDivider:
    i === 0 || DELIVERY_ITEMS[i - 1].c !== item.c,
}));

// 配件安裝（demo data，Ducati Performance）
export const PDI_ACCESSORIES = [
  {
    key: "acc-1",
    name: "原廠後牌架（短尾）",
    sku: "96781041AA",
    qty: 1,
    note: "依客戶訂單配發",
  },
  {
    key: "acc-2",
    name: "Termignoni 雙出排氣管",
    sku: "96481861AA",
    qty: 1,
    note: "需重新校正 ECU map",
  },
  {
    key: "acc-3",
    name: "原廠碳纖維前土除",
    sku: "96981031AA",
    qty: 1,
    note: "—",
  },
  {
    key: "acc-4",
    name: "Rizoma 後視鏡（一對）",
    sku: "RIZ-BS810B",
    qty: 1,
    note: "—",
  },
  {
    key: "acc-5",
    name: "防摔球套組（引擎側）",
    sku: "97180641AA",
    qty: 1,
    note: "—",
  },
];

// 保固條款五項確認
export const WARRANTY_CHECKLIST_ITEMS = [
  "已向客戶說明保固條款內容及範圍",
  "已向客戶說明購買契約相關細節，並提供全套文件",
  "已依廠家規定說明定期保養計劃（里程保養 / 時間保養）",
  "已帶領客戶填寫保固相關表格",
  "已說明 www.ducati.com 網站及授權經銷商售後服務資訊",
];

// 隨車文件
export const DELIVERY_DOCS = [
  {
    key: "doc-pdi",
    icon: "📋",
    name: "PDI 檢查表（副本）",
    sub: "技師完成並簽名",
    tag: "RS 需簽",
    tone: "req" as const,
  },
  {
    key: "doc-warranty",
    icon: "📜",
    name: "保固條款書（車主聯-紅）",
    sub: "RS + 客戶均需簽名",
    tag: "雙方需簽",
    tone: "req" as const,
  },
  {
    key: "doc-confirm",
    icon: "✅",
    name: "交車確認表（副本）",
    sub: "RS + 客戶均需簽名",
    tag: "雙方需簽",
    tone: "req" as const,
  },
  {
    key: "doc-manual",
    icon: "📖",
    name: "車主手冊 / 隨車配件箱",
    sub: "原廠提供",
    tag: "無需簽名",
    tone: "no" as const,
  },
  {
    key: "doc-license",
    icon: "🪪",
    name: "行照 / 保險卡",
    sub: "辦牌後交付",
    tag: "無需簽名",
    tone: "no" as const,
  },
  {
    key: "doc-key",
    icon: "🗝️",
    name: "車鑰匙（正副鑰匙）",
    sub: "主動鑰匙 + 備用鑰匙",
    tag: "當面點交",
    tone: "no" as const,
  },
];
