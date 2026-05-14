// Sales Module Overview — 靜態元資料常數
// 對應 nav_node 2e029972-042a-495f-b610-8c0775cb572e（Indian / 銷售模組導覽 RS00 v4）
// 拆檔避開 Next 16 "use server" 只能 export async function 的雷

export type SalesModuleAccent =
  | "blue"
  | "teal"
  | "red"
  | "amber"
  | "purple"
  | "dark"
  | "green";

export type SalesModuleVersionTone = "ver" | "new";

export type SalesModuleCard = {
  code: string;
  name: string;
  description: string;
  fileName: string;
  version: string;
  versionTone: SalesModuleVersionTone;
  accent: SalesModuleAccent;
};

export type SalesModulePanel = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: SalesModuleAccent;
  cards: SalesModuleCard[];
  note?: string;
  emphasis?: "default" | "teal" | "navy";
  gridCols?: 2 | 3;
};

export type SalesModuleConnectionStatus = "live" | "sim" | "p2";

export type SalesModuleConnection = {
  from: string;
  to: string;
  description: string;
  status: SalesModuleConnectionStatus;
};

export type SalesDesignPrinciple = {
  code: string;
  title: string;
  description: string;
};

export type SalesModuleFileVersionTone = "v2" | "gray" | "new";

export type SalesModuleFile = {
  code: string;
  fileName: string;
  version: string;
  versionTone: SalesModuleFileVersionTone;
  releaseTag: string;
  description: string;
};

export type SalesOverviewHero = {
  title: string;
  description: string;
  stats: Array<{ value: string; label: string }>;
};

export type SalesOverviewKpi = {
  label: string;
  value: string;
  tone: "blue" | "teal" | "amber" | "red";
  sub: string;
};

// ── Hero ────────────────────────────────────────────────
export const SALES_OVERVIEW_HERO: SalesOverviewHero = {
  title: "DUCATI 全系統模組導覽（RS + SA + CRM）",
  description:
    "完整覆蓋銷售（RS）與售後（SA）雙側流程：接待建檔 → 試駕 → 庫存 → 交車 → 售後保養 → CRM 追蹤 → 店長報表。RS05 交車後自動觸發 SA 側 CRM01B 建檔，形成完整客戶生命週期閉環。",
  stats: [
    { value: "22", label: "RS 模組" },
    { value: "8", label: "SA CRM 模組" },
    { value: "v4", label: "本頁版本" },
  ],
};

// ── KPI 四格 ────────────────────────────────────────────
export const SALES_OVERVIEW_KPIS: SalesOverviewKpi[] = [
  { label: "RS 前台模組", value: "10", tone: "blue", sub: "RS00–RS06 + RS_EX1" },
  { label: "主管 / 設定模組", value: "5", tone: "teal", sub: "RS_SET / RS_SET2 / RS_M1–M3" },
  { label: "CRM 全系列", value: "15", tone: "amber", sub: "CRM00 / A 系列 / B 系列 / CRM07 v2" },
  { label: "RS05→SA 跨部門串接", value: "✅", tone: "red", sub: "交車觸發 CRM01B 自動建檔" },
];

// ── 模組總覽 5 個 panel ─────────────────────────────────
export const SALES_OVERVIEW_PANELS: SalesModulePanel[] = [
  {
    key: "rs-frontline",
    title: "RS 前台作業模組",
    subtitle: "銷售顧問日常使用 · 接待 → 試駕 → 庫存 → 鑑價 → 報價訂單 → 交車 → 保險",
    icon: "🏍️",
    accent: "blue",
    cards: [
      {
        code: "RS01",
        name: "電子手卡",
        description: "四種來客身份 · HABC輔助建議 · 四色標籤 · 雙向跳轉回寫",
        fileName: "RS01_電子手卡_v8.html",
        version: "v8",
        versionTone: "ver",
        accent: "blue",
      },
      {
        code: "RS02",
        name: "試乘試駕",
        description: "試駕記錄 · 黃金時刻強制提示開報價單 · 回寫 RS01",
        fileName: "RS02_試乘試駕.html",
        version: "v1",
        versionTone: "ver",
        accent: "teal",
      },
      {
        code: "RS03A",
        name: "新車庫存看板",
        description: "新車庫存狀態 · 意向車型篩選 · 從 RS01 帶入條件",
        fileName: "RS03A_新車庫存看板.html",
        version: "v1",
        versionTone: "ver",
        accent: "blue",
      },
      {
        code: "RS03B",
        name: "中古車庫存看板",
        description: "CPO/DPO/PO 三級認證 · 中古車篩選 · 從 RS01 帶入",
        fileName: "RS03B_中古車庫存看板.html",
        version: "v1",
        versionTone: "ver",
        accent: "purple",
      },
      {
        code: "RS06",
        name: "中古車評估鑑價",
        description: "Desmo Service 記錄 · 認證等級評定 · 回寫 RS01",
        fileName: "RS06_中古車評估鑑價.html",
        version: "v1",
        versionTone: "ver",
        accent: "amber",
      },
      {
        code: "RS04",
        name: "賞車報價與成交訂單",
        description: "報價單（新/中古共用）· 新車訂購合約 · 中古車買賣切結合約",
        fileName: "RS04_賞車報價與成交訂單_v1.html",
        version: "NEW",
        versionTone: "new",
        accent: "red",
      },
      {
        code: "RS05",
        name: "交車管理",
        description: "PDI 觸發（PD-IN）· 交車確認表 36 項 · 保固條款簽名 · 觸發 D+3",
        fileName: "RS05_交車管理_v1.html",
        version: "NEW",
        versionTone: "new",
        accent: "teal",
      },
      {
        code: "RS_EX1",
        name: "前端續保招攬工作",
        description: "續保到期提醒 · 話術模板 · 新車交車招攬 · 佣金業績",
        fileName: "RS_EX1_前端續保招攬工作_v1.html",
        version: "NEW",
        versionTone: "new",
        accent: "red",
      },
    ],
  },
  {
    key: "rs-manager",
    title: "主管 / 設定模組",
    subtitle: "主管統一管理 · 參數下發各 RS 前台",
    icon: "⚙️",
    accent: "dark",
    cards: [
      {
        code: "RS_M1",
        name: "銷售漏斗看板",
        description: "三層 KPI · PULS 診斷 · HABC 分布 · 客群畫像",
        fileName: "RS_M1_銷售漏斗看板_v5.html",
        version: "v5",
        versionTone: "ver",
        accent: "dark",
      },
      {
        code: "RS_M2",
        name: "業績報表",
        description: "損益平衡進度 · RS 排行 · 車系分析 · 月度趨勢",
        fileName: "RS_M2_業績報表_v1.html",
        version: "NEW",
        versionTone: "new",
        accent: "dark",
      },
      {
        code: "RS_M3",
        name: "主管設定",
        description: "KPI目標 · 九宮格 · 標籤管理 · RS人員 · 保險設定",
        fileName: "RS_M3_主管設定_v2.html",
        version: "v2",
        versionTone: "ver",
        accent: "dark",
      },
      {
        code: "RS_SET",
        name: "參數設定頁",
        description: "線索來源清單 · 競品去向清單 · 功能開關",
        fileName: "RS_SET_參數設定頁_UI規範示範.html",
        version: "v1",
        versionTone: "ver",
        accent: "green",
      },
      {
        code: "RS_SET2",
        name: "客戶標籤管理",
        description: "官方標籤瀏覽 · 個人自訂（無審核）· 主管觀察視角",
        fileName: "RS_SET2_客戶標籤管理_v2.html",
        version: "v2",
        versionTone: "ver",
        accent: "green",
      },
    ],
  },
  {
    key: "crm-a",
    title: "CRM 銷售側模組（A 系列）",
    subtitle: "潛客管理 · HABC 分級 · 電訪追蹤 · NPS",
    icon: "👥",
    accent: "purple",
    cards: [
      {
        code: "CRM00",
        name: "CRM 模組導覽總覽",
        description: "RS + SA 雙側 CRM 全模組入口與流程關係圖",
        fileName: "CRM00_客服管理模組_導覽總覽_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "purple",
      },
      {
        code: "CRM01A",
        name: "銷售客戶基盤",
        description: "HABC 分級 · 列表/看板雙視圖 · SA 唯讀標籤（P-08）",
        fileName: "CRM01A_銷售客戶基盤_v1.html",
        version: "v2",
        versionTone: "ver",
        accent: "purple",
      },
      {
        code: "CRM02A",
        name: "銷售電訪問卷設定",
        description: "問卷版本控制 · 題型管理 · 適用時機 · 套用至 CRM03A",
        fileName: "CRM02A_銷售電訪問卷設定.html",
        version: "v1",
        versionTone: "ver",
        accent: "purple",
      },
      {
        code: "CRM03A",
        name: "銷售電訪工作台",
        description: "D+3/D+7 排程 · 話術提示 · 通話記錄 · 逾期警示",
        fileName: "CRM03A_銷售電訪工作台_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "purple",
      },
      {
        code: "CRM04A",
        name: "銷售休眠戰敗管理",
        description: "休眠分層 · 戰敗原因分析 · 再接觸排程",
        fileName: "CRM04A_銷售休眠戰敗管理_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "purple",
      },
      {
        code: "CRM05A",
        name: "NPS 看板(銷售)",
        description: "月度 NPS · 各面向評分 · 批評者追蹤",
        fileName: "CRM05A_NPS看板_銷售_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "purple",
      },
      {
        code: "CRM06A",
        name: "銷售推播通知管理",
        description: "範本管理 · 客群篩選 · 排程發送 · 開啟率成效",
        fileName: "CRM06A_銷售推播通知管理_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "purple",
      },
    ],
  },
  {
    key: "crm-b",
    title: "CRM 售後側模組（B 系列）",
    subtitle: "SA 售後專用 · P-08 部門隔離 · RS05 交車後自動串接",
    icon: "🔧",
    accent: "teal",
    emphasis: "teal",
    note:
      "🔗 RS05 串接說明：RS05 交車管理完成後，自動觸發 CRM01B 建立售後客戶基盤記錄，並由 CRM03B 排程 D+3 滿意度電訪。RS 與 SA 客戶資料依 P-08 原則隔離，唯一共享欄位為客戶標籤。",
    cards: [
      {
        code: "CRM01B",
        name: "售後客戶基盤",
        description: "逾期回廠追蹤 · 智慧快篩 · 保固/Desmo 提醒 · RS 共享標籤(唯讀)",
        fileName: "CRM01B_售後客戶基盤_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "teal",
      },
      {
        code: "CRM02B",
        name: "售後電訪問卷設定",
        description: "D+3/保養/保固/Desmo 問卷 · SA 話術腳本 · 同步至 CRM03B",
        fileName: "CRM02B_售後電訪問卷設定_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "teal",
      },
      {
        code: "CRM03B",
        name: "售後電訪工作台",
        description: "D+3 滿意度 · 回廠提醒 · Desmo/保固提醒 · NPS 快評",
        fileName: "CRM03B_售後電訪工作台_v1.html",
        version: "串接 RS05",
        versionTone: "new",
        accent: "teal",
      },
      {
        code: "CRM04B",
        name: "售後休眠流失管理",
        description: "逾期未回廠 · 流失原因分析 · 低NPS追蹤 · 喚醒排程",
        fileName: "CRM04B_售後休眠流失管理_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "teal",
      },
      {
        code: "CRM05B",
        name: "NPS 看板(售後)",
        description: "SA 個人 NPS · 服務類型拆分 · 批評者追蹤 · 面向評分",
        fileName: "CRM05B_NPS看板_售後_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "teal",
      },
      {
        code: "CRM06B",
        name: "售後推播通知管理",
        description: "自動化規則 · 保固/Desmo/維修通知範本 · 進廠轉換率",
        fileName: "CRM06B_售後推播通知管理_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "teal",
      },
    ],
  },
  {
    key: "store-manager",
    title: "店長跨部門總覽",
    subtitle: "唯讀視角 · RS + SA 雙側數據彙整 · P-08 原則下的跨部門觀察",
    icon: "🏬",
    accent: "dark",
    emphasis: "navy",
    gridCols: 2,
    cards: [
      {
        code: "CRM07",
        name: "店長跨部門綜合報表",
        description:
          "RS+SA NPS 對比趨勢 · SA 真實數據 · 逾期預警 · 跨部門標籤概覽 · 人員效率排行",
        fileName: "CRM07_店長綜合報表_v2.html",
        version: "v2 升版",
        versionTone: "new",
        accent: "dark",
      },
      {
        code: "CRM00",
        name: "CRM 模組入口總覽",
        description: "RS + SA 雙側 CRM 模組一覽 · 流程關係圖 · 快速跳轉各模組",
        fileName: "CRM00_客服管理模組_導覽總覽_v1.html",
        version: "v1",
        versionTone: "ver",
        accent: "dark",
      },
    ],
  },
];

// ── 18 條串接關係明細 ───────────────────────────────────
export const SALES_OVERVIEW_CONNECTIONS: SalesModuleConnection[] = [
  { from: "RS_M3 Tab1", to: "RS_M1 儀表盤", description: "KPI 目標值 → 儀表盤刻度線", status: "live" },
  { from: "RS_M3 Tab3", to: "RS01 / RS_SET2", description: "官方標籤庫下發", status: "live" },
  { from: "RS_M3 Tab4", to: "RS_M1 / 九宮格", description: "RS 人員清單同步", status: "live" },
  { from: "RS_M3 Tab5", to: "RS_EX1", description: "保險公司/話術/提醒天數下發(唯讀)", status: "live" },
  { from: "RS_SET", to: "RS01 / CRM03A", description: "線索來源 / 競品去向下拉選單", status: "live" },
  { from: "RS_SET2", to: "RS01", description: "個人自訂標籤供貼標使用", status: "live" },
  { from: "RS01", to: "RS02", description: "跳轉試駕，完成後回寫試駕結果(唯讀)", status: "sim" },
  { from: "RS01", to: "RS06", description: "跳轉鑑價，完成後回寫評估結果(唯讀)", status: "sim" },
  { from: "RS01", to: "RS03A / RS03B", description: "帶入意向車型篩選庫存", status: "live" },
  { from: "RS01", to: "CRM01A", description: "儲存後詢問是否同步建立潛客記錄", status: "sim" },
  { from: "RS01", to: "RS_EX1", description: "老車主身份觸發保險到期提醒", status: "live" },
  { from: "RS02", to: "RS01", description: "黃金時刻強制提示開報價單", status: "live" },
  { from: "RS02 / RS03A/B", to: "RS04", description: "試駕完成或客戶表明意願 → 開立賞車報價單", status: "live" },
  { from: "RS04 Tab1", to: "RS04 Tab2/3", description: "報價確認成交 → 依新車/中古車跳轉對應合約書", status: "live" },
  { from: "RS04", to: "RS05", description: "合約書確認後 → 進入交車管理", status: "live" },
  { from: "RS05 STEP2", to: "SA 售後模組", description: "觸發 PDI 工單(前綴碼 PD-IN)，通知 SA 技師執行 29 項整備", status: "live" },
  { from: "RS05 完成交車", to: "CRM03A", description: "交車完成 → 自動排程 D+3 滿意度回訪任務", status: "live" },
  { from: "CRM01A", to: "CRM03A", description: "建立潛客後排程 D+3/D+7 電訪任務", status: "sim" },
  { from: "CRM03A", to: "CRM01A", description: "通話記錄回寫客戶基盤歷史", status: "sim" },
  { from: "RS_SET2", to: "RS_M3 Tab3", description: "RS 高頻自訂標籤提示主管考慮升官方", status: "live" },
];

// ── 設計原則 6 條 ────────────────────────────────────────
export const SALES_DESIGN_PRINCIPLES: SalesDesignPrinciple[] = [
  {
    code: "P-01",
    title: "可設定參數化設計",
    description:
      "所有下拉選單、狀態代碼、追蹤天數等「參數」必須開放主管設定，不得硬寫死。實作位置：RS_SET、RS_M3 全五個 Tab。",
  },
  {
    code: "P-02",
    title: "三層 KPI 架構",
    description:
      "Layer 1 總經理看結果指標、Layer 2 主管看過程指標(儀表盤)、Layer 3 RS 看行為數據。RS_M1 / RS_M2 均依此架構呈現。",
  },
  {
    code: "P-03",
    title: "PULS 診斷閉環",
    description:
      "Problem → Understand → Let's solve it → Secure。點擊任一 KPI 展開四步診斷工作區，存檔後自動追蹤改善效果。",
  },
  {
    code: "P-04",
    title: "視角分離原則",
    description:
      "主管視角可看全店所有人數據；RS 個人視角只看自己 vs 全店平均，不顯示同事個別數據，避免內部競爭氛圍影響協作。",
  },
  {
    code: "P-05",
    title: "客群畫像(非客戶輪廓)",
    description:
      "標籤統計顯示於 RS_M1 主管視角，屬於群體累積洞察，不是單一客戶資料。用詞必須為「客群畫像」，不得用「客戶輪廓」。",
  },
  {
    code: "P-06",
    title: "自訂標籤自由度原則",
    description:
      "RS 自訂標籤無需審核，立即可用。每筆客戶最多 5 個自訂標籤。主管在 RS_M3 Tab3 觀察使用趨勢，決定是否升為官方標籤。",
  },
];

// ── 完整檔案清單 ────────────────────────────────────────
export const SALES_MODULE_FILES: SalesModuleFile[] = [
  { code: "RS00", fileName: "RS00_銷售模組_導覽總覽.html", version: "v3", versionTone: "v2", releaseTag: "v6.2", description: "本頁，補入 RS04/RS05/CRM00/CRM02A，串接關係升至 18 條" },
  { code: "RS01", fileName: "RS01_電子手卡_v8.html", version: "v8", versionTone: "v2", releaseTag: "v6.1", description: "四身份 / HABC / 標籤 / 雙向回寫" },
  { code: "RS02", fileName: "RS02_試乘試駕.html", version: "v1", versionTone: "gray", releaseTag: "v6.0", description: "試駕記錄 / 黃金時刻提示" },
  { code: "RS03A", fileName: "RS03A_新車庫存看板.html", version: "v1", versionTone: "gray", releaseTag: "v6.0", description: "新車庫存狀態" },
  { code: "RS03B", fileName: "RS03B_中古車庫存看板.html", version: "v1", versionTone: "gray", releaseTag: "v6.0", description: "三級認證中古車庫存" },
  { code: "RS06", fileName: "RS06_中古車評估鑑價.html", version: "v1", versionTone: "gray", releaseTag: "v6.0", description: "Desmo / 鑑價 / 認證" },
  { code: "RS04", fileName: "RS04_賞車報價與成交訂單_v1.html", version: "NEW", versionTone: "new", releaseTag: "v6.2", description: "報價單(新/中古共用) / 新車訂購合約 / 中古車買賣切結合約" },
  { code: "RS05", fileName: "RS05_交車管理_v1.html", version: "NEW", versionTone: "new", releaseTag: "v6.2", description: "PDI 觸發 PD-IN / 交車確認表 36 項 / 保固條款 / 觸發 D+3" },
  { code: "RS_SET", fileName: "RS_SET_參數設定頁_UI規範示範.html", version: "v1", versionTone: "gray", releaseTag: "v6.0", description: "線索來源 / 競品清單 / 功能開關" },
  { code: "RS_SET2", fileName: "RS_SET2_客戶標籤管理_v2.html", version: "v2", versionTone: "v2", releaseTag: "v6.1", description: "標籤自由新增 / 無審核 / 主管觀察" },
  { code: "RS_M1", fileName: "RS_M1_銷售漏斗看板_v5.html", version: "v5", versionTone: "gray", releaseTag: "v6.0", description: "漏斗 / PULS / 客群畫像" },
  { code: "RS_M2", fileName: "RS_M2_業績報表_v1.html", version: "NEW", versionTone: "new", releaseTag: "v6.1", description: "損益平衡 / RS排行 / 車系分析" },
  { code: "RS_M3", fileName: "RS_M3_主管設定_v2.html", version: "v2", versionTone: "v2", releaseTag: "v6.1", description: "五 Tab，新增 Tab5 保險設定" },
  { code: "CRM00", fileName: "CRM00_客服管理模組_導覽總覽_v1.html", version: "NEW", versionTone: "new", releaseTag: "v6.2", description: "CRM 模組入口總覽 / 13 個模組流程關係圖" },
  { code: "CRM01A", fileName: "CRM01A_銷售客戶基盤_v1.html", version: "NEW", versionTone: "new", releaseTag: "v6.1", description: "HABC / 列表看板 / 客戶詳情" },
  { code: "CRM02A", fileName: "CRM02A_銷售電訪問卷設定.html", version: "NEW", versionTone: "new", releaseTag: "v6.2", description: "問卷設定 / 題型管理 / 適用範圍" },
  { code: "CRM03A", fileName: "CRM03A_銷售電訪工作台_v1.html", version: "NEW", versionTone: "new", releaseTag: "v6.1", description: "D+3/D+7 / 話術 / 通話記錄" },
  { code: "RS_EX1", fileName: "RS_EX1_前端續保招攬工作_v1.html", version: "NEW", versionTone: "new", releaseTag: "v6.1", description: "續保提醒 / 話術 / 新車招攬 / 佣金" },
];
