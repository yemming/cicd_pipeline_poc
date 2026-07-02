// Customer Service Module Overview — 靜態元資料常數
// 對應 nav_node d1746283-a79c-40bb-831d-96cefd99541a（Indian / 客服功能導覽 CRM00 v2）
// 拆檔避開 Next 16 "use server" 只能 export async function 的雷

export type CsModuleAccent =
  | "blue"
  | "teal"
  | "red"
  | "amber"
  | "purple"
  | "dark"
  | "green";

export type CsModuleVersionTone = "ver" | "new" | "upd";

export type CsModuleCard = {
  code: string;
  name: string;
  description: string;
  fileName: string;
  version: string;          // 角標文字（e.g. "v1" / "v2 升版" / "串接 RS05"）
  versionTone: CsModuleVersionTone;
  accent: CsModuleAccent;
};

export type CsModulePanel = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: CsModuleAccent;
  layers: CsModuleLayer[];
  note?: string;
  emphasis?: "default" | "teal" | "navy";
  gridCols?: 2 | 3;
  doneBadge?: string;       // 例：「✅ 全 6 支完成」
};

// CRM 模組結構比 RS 多一層「layer subtitle」（例如「客戶基盤 × 問卷設定」分群）
export type CsModuleLayer = {
  title: string;
  cards: CsModuleCard[];
};

export type CsModuleConnectionStatus = "live" | "sim" | "p2";

export type CsModuleConnection = {
  from: string;
  to: string;
  description: string;
  status: CsModuleConnectionStatus;
  /** 視覺分組：blue=A系列(銷售側) / teal=B系列(售後側) / none=共用 */
  group?: "blue" | "teal" | "none";
};

export type CsModuleFileVersionTone = "v1" | "v2" | "new";

export type CsModuleFile = {
  code: string;
  fileName: string;
  version: string;
  versionTone: CsModuleFileVersionTone;
  status: string;           // 例 ✅ / 完成
  description: string;
  /** 視覺分組：none=共用 / blue=銷售側 / teal=售後側 */
  group?: "blue" | "teal" | "none";
};

export type CsOverviewHero = {
  title: string;
  description: string;
  stats: Array<{ value: string; label: string }>;
};

export type CsOverviewKpi = {
  label: string;
  value: string;
  tone: "blue" | "teal" | "amber" | "red" | "purple";
  sub: string;
};

// ── Hero ────────────────────────────────────────────────
export const CS_OVERVIEW_HERO: CsOverviewHero = {
  title: "CRM 客服管理模組",  // 品牌名由 board 動態注入，勿在此硬編碼
  description:
    "覆蓋銷售（RS）× 售後（SA）兩條線的客戶關係管理：電訪問卷設計、電訪任務工作台、休眠流失激活、NPS 滿意度看板、推播通知、店長跨部門綜合報表。RS05 交車後自動觸發 SA 側 CRM01B 建檔,形成完整客戶生命週期閉環。",
  stats: [
    { value: "15", label: "CRM 模組總數" },
    { value: "7",  label: "銷售側 A 系列" },
    { value: "6",  label: "售後側 B 系列" },
    { value: "✅", label: "全數完成" },
  ],
};

// ── KPI 四格 ────────────────────────────────────────────
export const CS_OVERVIEW_KPIS: CsOverviewKpi[] = [
  { label: "銷售側（A 系列）", value: "7",  tone: "blue",   sub: "CRM00/01A/02A/03A/04A/05A/06A" },
  { label: "售後側（B 系列）", value: "6",  tone: "teal",   sub: "CRM01B/02B/03B/04B/05B/06B ✅" },
  { label: "店長跨部門報表",   value: "1",  tone: "purple", sub: "CRM07 v2 · SA 真實數據已納入" },
  { label: "跨部門串接點",     value: "13", tone: "amber",  sub: "RS05→CRM01B 為核心觸發鏈" },
];

// ── Panels ──────────────────────────────────────────────
export const CS_OVERVIEW_PANELS: CsModulePanel[] = [
  // A 系列：銷售側
  {
    key: "crm-a-series",
    title: "銷售側 CRM 模組（A 系列）",
    subtitle: "對應 RS 銷售顧問 · 潛客建檔 → HABC 追蹤 → 電訪 → NPS → 推播",
    icon: "🔵",
    accent: "blue",
    layers: [
      {
        title: "客戶基盤 × 問卷設定",
        cards: [
          {
            code: "CRM01A",
            name: "銷售客戶基盤",
            description: "HABC 分級 · 列表/看板雙視圖 · SA 唯讀標籤（P-08 新增）",
            fileName: "CRM01A_銷售客戶基盤_v2.html",
            version: "v2 升版",
            versionTone: "upd",
            accent: "blue",
          },
          {
            code: "CRM02A",
            name: "銷售電訪問卷設定",
            description: "問卷題目管理 · 題型 CRUD · 版本控制 · 適用對象設定",
            fileName: "CRM02A_銷售電訪問卷設定_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "blue",
          },
        ],
      },
      {
        title: "電訪工作台 × 休眠追蹤",
        cards: [
          {
            code: "CRM03A",
            name: "銷售電訪工作台",
            description: "D+3/D+7 排程 · 話術提示 · 通話記錄 · 逾期警示",
            fileName: "CRM03A_銷售電訪工作台_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "blue",
          },
          {
            code: "CRM04A",
            name: "銷售休眠戰敗管理",
            description: "休眠分層 · 戰敗原因分析 · 競品流向 · 再接觸排程",
            fileName: "CRM04A_銷售休眠戰敗管理_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "blue",
          },
        ],
      },
      {
        title: "滿意度 × 推播",
        cards: [
          {
            code: "CRM05A",
            name: "NPS 看板（銷售）",
            description: "月度 NPS · 推薦/被動/批評分布 · 各面向評分 · 批評者追蹤",
            fileName: "CRM05A_NPS看板_銷售_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "blue",
          },
          {
            code: "CRM06A",
            name: "銷售推播通知管理",
            description: "LINE/SMS 範本管理 · 客群篩選 · 排程發送 · 開啟率追蹤",
            fileName: "CRM06A_銷售推播通知管理_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "blue",
          },
        ],
      },
    ],
  },
  // B 系列：售後側
  {
    key: "crm-b-series",
    title: "售後側 CRM 模組（B 系列）",
    subtitle: "對應 SA 服務顧問 · RS05 交車自動觸發 · P-08 隔離 · 自動化推播",
    icon: "🟢",
    accent: "teal",
    emphasis: "teal",
    doneBadge: "✅ 全 6 支完成",
    note: "🔗 RS05 串接：交車完成 → CRM01B 自動建檔 → CRM03B D+3 電訪 → CRM05B NPS → CRM07 店長報表。依 P-08，RS 與 SA 資料隔離，唯共享客戶標籤（雙側各唯讀）。",
    layers: [
      {
        title: "客戶基盤 × 問卷設定",
        cards: [
          {
            code: "CRM01B",
            name: "售後客戶基盤",
            description: "逾期回廠追蹤 · 智慧快篩（自訂條件）· 保固/Desmo 提醒 · RS 標籤唯讀",
            fileName: "CRM01B_售後客戶基盤_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "teal",
          },
          {
            code: "CRM02B",
            name: "售後電訪問卷設定",
            description: "D+3/保養/保固/Desmo 問卷 · SA 話術腳本 · 問卷預覽功能",
            fileName: "CRM02B_售後電訪問卷設定_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "teal",
          },
        ],
      },
      {
        title: "電訪工作台 × 休眠流失",
        cards: [
          {
            code: "CRM03B",
            name: "售後電訪工作台",
            description: "D+3/回廠/保固/Desmo 5 種類型 · 工單 RO 資訊條 · NPS 快評",
            fileName: "CRM03B_售後電訪工作台_v1.html",
            version: "串接 RS05",
            versionTone: "new",
            accent: "teal",
          },
          {
            code: "CRM04B",
            name: "售後休眠流失管理",
            description: "逾期未回廠分層 · 流失原因分析 · 低 NPS 追蹤 · 喚醒計畫排程",
            fileName: "CRM04B_售後休眠流失管理_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "teal",
          },
        ],
      },
      {
        title: "NPS 看板 × 推播通知",
        cards: [
          {
            code: "CRM05B",
            name: "NPS 看板（售後）",
            description: "SA 個人 NPS · 服務類型拆分 · 面向評分趨勢箭頭 · 批評者追蹤",
            fileName: "CRM05B_NPS看板_售後_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "teal",
          },
          {
            code: "CRM06B",
            name: "售後推播通知管理",
            description: "自動化 6 條規則 · 維修竣工通知（95%開啟）· Desmo/保固/生日提醒",
            fileName: "CRM06B_售後推播通知管理_v1.html",
            version: "v1",
            versionTone: "ver",
            accent: "teal",
          },
        ],
      },
    ],
  },
  // 店長跨部門
  {
    key: "crm-manager",
    title: "店長跨部門報表",
    subtitle: "唯讀視角 · RS+SA 雙側數據彙整",
    icon: "🏬",
    accent: "dark",
    emphasis: "navy",
    gridCols: 2,
    doneBadge: "v2 SA 真實數據",
    layers: [
      {
        title: "",
        cards: [
          {
            code: "CRM07",
            name: "店長跨部門綜合報表",
            description: "RS+SA NPS 雙軸趨勢 · SA 真實數據 · 逾期預警清單 · SA/RS 人員效率排行 · 跨部門標籤概覽",
            fileName: "CRM07_店長綜合報表_v2.html",
            version: "v2 升版",
            versionTone: "upd",
            accent: "dark",
          },
          {
            code: "CRM00",
            name: "CRM 模組導覽總覽",
            description: "RS A 系列 × SA B 系列全模組入口 · 串接關係明細 · 完整檔案清單",
            fileName: "CRM00_客服管理模組_導覽總覽_v2.html",
            version: "v2 本頁",
            versionTone: "upd",
            accent: "dark",
          },
        ],
      },
    ],
  },
];

// ── 串接關係（13 條）────────────────────────────────────
export const CS_OVERVIEW_CONNECTIONS: CsModuleConnection[] = [
  { from: "RS01 電子手卡",       to: "CRM01A",       description: "儲存後同步建立潛客記錄，排程 D+3/D+7 電訪",   status: "live", group: "blue" },
  { from: "CRM01A",              to: "CRM03A",       description: "建立潛客後排程電訪任務",                       status: "live", group: "blue" },
  { from: "CRM02A 問卷",         to: "CRM03A",       description: "啟用版問卷自動套用至電訪工作台話術",           status: "live", group: "blue" },
  { from: "CRM03A 電訪完成",     to: "CRM04A",       description: "失敗超過閾值 → 轉入休眠戰敗管理",             status: "live", group: "blue" },
  { from: "CRM03A 通話記錄",     to: "CRM05A NPS",   description: "電訪 NPS 評分同步至看板",                      status: "live", group: "blue" },
  { from: "CRM04A 休眠",         to: "CRM06A 推播",  description: "休眠激活觸發 LINE 喚醒推播",                   status: "live", group: "blue" },
  { from: "RS05 交車完成",       to: "CRM01B",       description: "自動建立售後客戶記錄，PDI 工單觸發，排程 D+3 電訪", status: "live", group: "teal" },
  { from: "CRM02B 問卷",         to: "CRM03B",       description: "SA 問卷（含話術腳本）套用至電訪工作台",         status: "live", group: "teal" },
  { from: "CRM03B D+3 完成",     to: "CRM05B NPS",   description: "電訪 NPS 評分同步至售後 NPS 看板",             status: "live", group: "teal" },
  { from: "CRM04B 逾期 30 天",   to: "CRM06B 推播",  description: "自動觸發保養提醒推播",                          status: "live", group: "teal" },
  { from: "SA 工單竣工",         to: "CRM06B 推播",  description: "工單關閉後自動發送取車通知（開啟率 95%）",     status: "live", group: "teal" },
  { from: "CRM05A/05B NPS",      to: "CRM07 報表",   description: "RS+SA 雙側 NPS 數據彙整，呈現雙軸趨勢對比",   status: "live", group: "none" },
  { from: "CRM01A RS標籤",       to: "CRM01B SA標籤", description: "P-08 共享：雙側各唯讀對方標籤，不可修改",     status: "live", group: "none" },
  { from: "RS_EX1 續保完成",     to: "CRM01A",       description: "續保資訊回寫客戶基盤",                          status: "p2",   group: "none" },
];

// ── 完整檔案清單（15 個）─────────────────────────────────
export const CS_MODULE_FILES: CsModuleFile[] = [
  // 共用
  { code: "CRM00",  fileName: "CRM00_客服管理模組_導覽總覽_v2.html", version: "v2 ↑", versionTone: "v2",  status: "✅", description: "本頁 · B 系列全數更新",       group: "none" },
  { code: "CRM07",  fileName: "CRM07_店長綜合報表_v2.html",          version: "v2 ↑", versionTone: "v2",  status: "✅", description: "SA 真實數據 · 雙軸 NPS 趨勢", group: "none" },
  // 銷售側 A
  { code: "CRM01A", fileName: "CRM01A_銷售客戶基盤_v2.html",         version: "v2 ↑", versionTone: "v2",  status: "✅", description: "補入 SA 唯讀標籤（P-08）",     group: "blue" },
  { code: "CRM02A", fileName: "CRM02A_銷售電訪問卷設定_v1.html",     version: "v1",   versionTone: "v1",  status: "✅", description: "問卷管理 / 題型 / 版本控制",   group: "blue" },
  { code: "CRM03A", fileName: "CRM03A_銷售電訪工作台_v1.html",       version: "v1",   versionTone: "v1",  status: "✅", description: "D+3/D+7 / 話術 / 通話記錄",     group: "blue" },
  { code: "CRM04A", fileName: "CRM04A_銷售休眠戰敗管理_v1.html",     version: "v1",   versionTone: "v1",  status: "✅", description: "休眠分層 / 戰敗分析 / 再接觸", group: "blue" },
  { code: "CRM05A", fileName: "CRM05A_NPS看板_銷售_v1.html",         version: "v1",   versionTone: "v1",  status: "✅", description: "月度 NPS / 面向評分 / 批評者", group: "blue" },
  { code: "CRM06A", fileName: "CRM06A_銷售推播通知管理_v1.html",     version: "v1",   versionTone: "v1",  status: "✅", description: "LINE/SMS / 排程發送 / 成效",   group: "blue" },
  // 售後側 B
  { code: "CRM01B", fileName: "CRM01B_售後客戶基盤_v1.html",         version: "v1 ✨", versionTone: "new", status: "✅", description: "逾期追蹤 / 智慧快篩 / 共享標籤", group: "teal" },
  { code: "CRM02B", fileName: "CRM02B_售後電訪問卷設定_v1.html",     version: "v1 ✨", versionTone: "new", status: "✅", description: "SA 話術腳本 / 問卷預覽",       group: "teal" },
  { code: "CRM03B", fileName: "CRM03B_售後電訪工作台_v1.html",       version: "v1 ✨", versionTone: "new", status: "✅", description: "5 種電訪類型 / RO 資訊條",     group: "teal" },
  { code: "CRM04B", fileName: "CRM04B_售後休眠流失管理_v1.html",     version: "v1 ✨", versionTone: "new", status: "✅", description: "逾期 3 Tab / 低NPS / 喚醒排程", group: "teal" },
  { code: "CRM05B", fileName: "CRM05B_NPS看板_售後_v1.html",         version: "v1 ✨", versionTone: "new", status: "✅", description: "SA 個人 NPS / 服務類型拆分",   group: "teal" },
  { code: "CRM06B", fileName: "CRM06B_售後推播通知管理_v1.html",     version: "v1 ✨", versionTone: "new", status: "✅", description: "自動化 6 條規則 / 進廠轉換率", group: "teal" },
];
