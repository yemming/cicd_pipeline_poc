/**
 * DealerOS Module Registry (Ducati Edition)
 *
 * Single Source of Truth for navigation — drives Launcher / ModuleRail /
 * PagesPanel / CommandPalette / (future) RBAC.
 *
 * Each page may carry a `stitchScreenId` so <StitchViewer> can iframe-embed
 * the original Stitch design while Faithful Clone is pending.
 */

export type ModulePage = {
  name: string;
  icon?: string;
  href: string;
  comingSoon?: boolean;
  /** Stitch screen ID — drives <StitchViewer> preview for unclohned pages */
  stitchScreenId?: string;
  /** Optional grouping label shown as a section header in PagesPanel */
  section?: string;
  /** Sprint code from DealerOS_畫面總表_Stitch_Mapping.xlsx (e.g. "S2-1") */
  sprint?: string;
  /** Only visible to admin users (FEEDBACK_ADMIN_EMAILS / NOTIFICATION_ADMIN_EMAILS) */
  adminOnly?: boolean;
  /** 小數字徽章（如「3」表示 3 筆待處理） */
  badge?: string;
};

/**
 * 樣板 sidebar 的「可摺疊 parent group」— 對應 nav_nodes level=2。
 * 有 children 就是 expandable group；有 href 沒 children 就是 direct link。
 */
export type ParentGroup = {
  name: string;
  /** Material Symbol 名（如 'point_of_sale'），優先級高於 emoji */
  icon?: string;
  emoji?: string;
  badge?: string;
  /** Direct-link parent（樣板的「庫存查詢」「模組導覽總覽」），有 href 就跳轉而非摺疊 */
  href?: string;
  children: ModulePage[];
};

/**
 * 樣板 sidebar 的「section 分組標題」— 對應 nav_nodes.section_group。
 * 帶彩色圓點 + 大寫 label，下面掛 multiple parents。
 */
export type SectionGroup = {
  title: string;
  /** 'blue' | 'purple' | 'amber' | 'coral' | 'gray' 或 hex */
  color?: string;
  parents: ParentGroup[];
};

export type ModuleDef = {
  /** DB-driven nav 用 nav_nodes.id（uuid，唯一）；
   *  舊版寫死 modules 為 undefined，回退用 `key` 當識別 */
  id?: string;
  key: string;
  name: string;
  icon: string;
  accent?: string;
  description?: string;
  home: string;
  /** 扁平 page list — PagesPanel / CommandPalette / 全文搜尋用 */
  pages: ModulePage[];
  /** 三層樹（section → parent → page）— 樣板版 ModernSidebar 用；無此欄則 fallback 到 pages */
  sections?: SectionGroup[];
  permission?: string;
  comingSoon?: boolean;
};

export const STITCH_PROJECT_ID = "4439217217980273986";

export const modules: ModuleDef[] = [
  // ────────────────────────────────────────────────────────
  // 1. 銷售管理 (S2 售前核心 + S3 銷售閉環 + S7-1 試駕排程)
  // ────────────────────────────────────────────────────────
  {
    key: "sales",
    name: "銷售管理",
    icon: "storefront",
    accent: "#CC0000",
    description: "展廳・手卡・訂單・試駕",
    home: "/sales/showroom",
    permission: "sales.access",
    pages: [
      // 展廳 & 接待
      { name: "展廳看板",     icon: "dashboard",       href: "/sales/showroom",            sprint: "S2-1", stitchScreenId: "5bbc36d4437146f0baa044517465d1e0", section: "展廳接待" },
      { name: "新增接待",     icon: "person_add",      href: "/sales/reception/new",       sprint: "S2-1", stitchScreenId: "99fce611466a4a649ef25a9e3b1a18b4", section: "展廳接待" },
      { name: "接待記錄",     icon: "receipt_long",    href: "/sales/reception/records",   sprint: "S2-2", stitchScreenId: "f822233c2bba46cc922f40a25c68f4c1", section: "展廳接待" },
      // 電子手卡三段
      { name: "手卡・第一階段", icon: "description",   href: "/sales/card/counter",        sprint: "S2-2", stitchScreenId: "48b9a52cdecb43df8f3742ce7772e57a", section: "電子手卡" },
      { name: "手卡・第二階段", icon: "edit_note",     href: "/sales/card/consultant",     sprint: "S2-3", stitchScreenId: "a31b7bafb5b04dde83409277678754ab", section: "電子手卡" },
      { name: "手卡・第三階段", icon: "handshake",     href: "/sales/card/closing",        sprint: "S2-4", stitchScreenId: "83860fd7c7e5450883fa05481790cab2", section: "電子手卡" },
      // 客戶 & 分析
      { name: "客戶中心",     icon: "group",           href: "/sales/customers",           sprint: "S2-7", stitchScreenId: "a7b0843a2c094c38908fc9e60e89d7f2", section: "客戶與分析" },
      { name: "客戶標籤",     icon: "sell",            href: "/sales/customers/tags",      sprint: "S2-5", stitchScreenId: "89f1d788c965410daca3bcae02c7ba6e", section: "客戶與分析" },
      { name: "銷售漏斗",     icon: "filter_alt",      href: "/sales/funnel",              sprint: "S2-6", stitchScreenId: "ec054eb14dc2417da2ca912aec8318d2", section: "客戶與分析" },
      // 線索 & 電銷
      { name: "線索管理",     icon: "search",          href: "/sales/leads",               sprint: "S3-1", stitchScreenId: "7fc8a244a33941aba5db6e8e9bfc6f11", section: "線索與電銷" },
      { name: "電銷工作台",   icon: "call",            href: "/sales/bdc",                 sprint: "S3-2", stitchScreenId: "9f0cbd757c59418da5f94b0e71de75ee", section: "線索與電銷" },
      { name: "CRM 電訪",     icon: "contact_phone",   href: "/sales/crm",                 sprint: "S3-6", stitchScreenId: "a97d23e4f03847bb8333b1befd647632", section: "線索與電銷" },
      // 試駕
      { name: "試駕排程",     icon: "drive_eta",       href: "/sales/testdrive",           sprint: "S7-1", stitchScreenId: "a2d1439fc4b4454f805d7560bc22a0d7", section: "試駕管理" },
      // 交易流程
      { name: "訂單中心",     icon: "assignment",      href: "/sales/orders",              sprint: "S3-5", stitchScreenId: "3fc682ca14fb4e6492217377a97aa732", section: "交易流程" },
      { name: "接待報價單",   icon: "request_quote",   href: "/sales/quote",               sprint: "S3-9", stitchScreenId: "f2f2139ca6274ad9bb4fa4d9ec0fb775", section: "交易流程" },
      { name: "金融服務",     icon: "payments",        href: "/sales/finance",             sprint: "S3-3", stitchScreenId: "99a04d77b6eb4dc0abee06254039be18", section: "交易流程" },
      { name: "保險服務",     icon: "verified_user",   href: "/sales/insurance",           sprint: "S3-4", stitchScreenId: "8df863759c604bab91a4a38e38e2e3ce", section: "交易流程" },
      { name: "精品選配",     icon: "featured_video",  href: "/sales/accessories",         sprint: "S3-7", stitchScreenId: "cb56d0d2424f425e943d240e06d0c26c", section: "交易流程" },
      // Mobile App
      { name: "顧問 App",     icon: "smartphone",      href: "/sales/sc-app",              sprint: "S3-8", stitchScreenId: "c67e7324cd3e4f62a0fc9b0fbbdce5dc", section: "行動工具" },
      // 車型資訊（bonus）
      { name: "車型資訊",     icon: "two_wheeler",     href: "/sales/models",              sprint: "—",    stitchScreenId: "6a4a5093d497482fb532650d25589829", section: "行動工具" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 1.5 POS v2 — 極簡收銀 + 進銷存 + 中古車銷售（Spec v1.0 Phase 1 MVP）
  // 設計原則：≤5 個主項，複雜流程以 Wizard 呈現
  // ────────────────────────────────────────────────────────
  {
    key: "pos",
    name: "POS 收銀",
    icon: "point_of_sale",
    accent: "#4F46E5",
    description: "極簡收銀・進銷存・日記帳",
    home: "/pos",
    permission: "pos.access",
    pages: [
      { name: "快速收銀",       icon: "shopping_cart_checkout", href: "/pos" },
      { name: "商品與庫存",     icon: "inventory_2",            href: "/pos/products" },
      { name: "帳務（日記帳）", icon: "menu_book",              href: "/pos/ledger" },
      { name: "POS 設定",       icon: "settings",               href: "/pos/settings" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 2. 維修管理 (S4 全部 + S8-3 保固)
  // ────────────────────────────────────────────────────────
  {
    key: "service",
    name: "維修管理",
    icon: "build",
    accent: "#4A90E2",
    description: "預約・工單・維修廠・配件",
    home: "/service/appointments",
    permission: "service.access",
    pages: [
      { name: "預約看板",     icon: "calendar_today",  href: "/service/appointments",   stitchScreenId: "1575f27a2ada4bb8bb7d2f21894790cb" },
      { name: "接待預檢",     icon: "fact_check",      href: "/service/pi" },
      { name: "PDI 作業",     icon: "verified",        href: "/service/pdi" },
      { name: "維修工單",     icon: "construction",    href: "/service/workorders" },
      { name: "技師派工",     icon: "garage",          href: "/service/workshop",       stitchScreenId: "ef95845f1f78486f83905a9cd1ec1ccf" },
      { name: "竣工複檢",     icon: "task_alt",        href: "/service/inspection" },
      { name: "增項管理",     icon: "add_task",        href: "/service/dropoff" },
      { name: "配件庫存",     icon: "inventory_2",     href: "/service/parts",          stitchScreenId: "bf46972c2a64481cb90839a93382c317" },
      { name: "保固管理",     icon: "shield",          href: "/service/warranty",       stitchScreenId: "efc46f958e984d43ad416acb574af0ef" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 3. 交車服務 (S7-2~S7-7)
  // ────────────────────────────────────────────────────────
  {
    key: "delivery",
    name: "交車服務",
    icon: "local_florist",
    accent: "#C9A84C",
    description: "PDI・交車確認・交車儀式",
    home: "/delivery/ceremony",
    permission: "delivery.access",
    pages: [
      { name: "交車儀式",     icon: "celebration",     href: "/delivery/ceremony",         sprint: "S7-7", stitchScreenId: "55e45ebb3bff4682b32a2b15d60d27a4" },
      { name: "PDI 檢查表",   icon: "fact_check",      href: "/delivery/pdi",              sprint: "S7-2", stitchScreenId: "867edbe750124ece91cb5a2afbe38761" },
      { name: "PDI 配件安裝", icon: "settings_suggest",href: "/delivery/pdi-accessories",  sprint: "S7-3", stitchScreenId: "e323677e9e2e4cb190022f1fa09a502c" },
      { name: "交車確認 (上)",icon: "assignment_turned_in", href: "/delivery/confirm-1",   sprint: "S7-4", stitchScreenId: "292c6069abfe41b69ffc41e90ed2878b" },
      { name: "交車確認 (下)",icon: "task_alt",        href: "/delivery/confirm-2",        sprint: "S7-5", stitchScreenId: "6e86c72665d44820b2b770bbde15591f" },
      { name: "保固條款簽署", icon: "draw",            href: "/delivery/warranty-sign",    sprint: "S7-6", stitchScreenId: "431a61ec63f54721a786bfc969d718f3" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 4. 客戶關懷 (S8-1, S8-2)
  // ────────────────────────────────────────────────────────
  {
    key: "csi",
    name: "客戶關懷",
    icon: "sentiment_satisfied",
    accent: "#E67E22",
    description: "CSI・轉介紹・再購",
    home: "/csi/surveys",
    permission: "csi.access",
    pages: [
      { name: "CSI 滿意度",   icon: "reviews",         href: "/csi/surveys",               sprint: "S8-1", stitchScreenId: "a17fb6da32f14c40b0ce90488eeec9ff" },
      { name: "再購/轉介紹",  icon: "group_add",       href: "/csi/referrals",             sprint: "S8-2", stitchScreenId: "e2ae74e9b031441295eceba43825c30c" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 5. 中古交易 (S5 全部 + 銷售管理子模組)
  // ────────────────────────────────────────────────────────
  {
    key: "usedcar",
    name: "中古交易",
    icon: "two_wheeler",
    accent: "#F43F5E",
    description: "置換・庫存・拍賣・銷售管理",
    home: "/usedcar/sales-dashboard",
    permission: "usedcar.access",
    pages: [
      // 車輛管理
      { name: "置換評估",       icon: "assessment",        href: "/usedcar/evaluation",       sprint: "S5-1", stitchScreenId: "e8c1015b71784626ac9797caaf57f457", section: "車輛管理" },
      { name: "中古車庫存",     icon: "inventory",         href: "/usedcar/stock",            sprint: "S5-2", stitchScreenId: "6f6ddad5a36144daa42a772607663054", section: "車輛管理" },
      { name: "拍賣管理",       icon: "gavel",             href: "/usedcar/auction",          sprint: "S5-3", stitchScreenId: "cc722dbd9b5c4af29b5fe7e516db70fd", section: "車輛管理" },
      // 銷售管理（中古車專屬銷售流程）
      { name: "中古銷售看板",   icon: "dashboard",         href: "/usedcar/sales-dashboard",  section: "銷售管理" },
      { name: "潛客跟進",       icon: "person_search",     href: "/usedcar/prospects",        section: "銷售管理" },
      { name: "新增潛客",       icon: "person_add",        href: "/usedcar/prospects/new",    section: "銷售管理" },
      { name: "線索分析",       icon: "bar_chart",         href: "/usedcar/lead-analysis",    section: "銷售管理" },
      { name: "跟進分析",       icon: "track_changes",     href: "/usedcar/followup-analysis",section: "銷售管理" },
      // 業務報表
      { name: "業務數據表",     icon: "table_chart",       href: "/usedcar/ops-data",         section: "業務報表" },
      { name: "財務報表",       icon: "receipt_long",      href: "/usedcar/finance-report",   section: "業務報表" },
      { name: "開口率管理",     icon: "swap_horiz",        href: "/usedcar/open-rate",        section: "業務報表" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 6. 直銷官網 D2C (S6-4)
  // ────────────────────────────────────────────────────────
  {
    key: "d2c",
    name: "直銷官網",
    icon: "shopping_cart",
    accent: "#9B59B6",
    description: "消費者直購入口",
    home: "/d2c/home",
    pages: [
      { name: "消費者首頁",   icon: "home",            href: "/d2c/home",                  sprint: "S6-4", stitchScreenId: "02ccf2fe2f9a4416b026a95e7fddcf2f" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 7. 經銷商管理 (S10-1~5 + S6-7 + S9-1)
  // ────────────────────────────────────────────────────────
  {
    key: "inventory",
    name: "經銷商管理",
    icon: "warehouse",
    accent: "#1ABC9C",
    description: "整車庫存・政策・行銷",
    home: "/inventory/vehicles",
    permission: "inventory.access",
    pages: [
      // 庫存與結算
      { name: "整車庫存",     icon: "list_alt",        href: "/inventory/vehicles",        sprint: "S10-1", stitchScreenId: "91bdac2c367e4e04a3caa8d79201d864", section: "庫存與結算" },
      { name: "配額批售",     icon: "swap_horiz",      href: "/inventory/quota",           sprint: "S10-2", stitchScreenId: "763556ef5dd64192936e49a6c305e3ce", section: "庫存與結算" },
      { name: "返利結算",     icon: "monetization_on", href: "/inventory/rebate",          sprint: "S10-3", stitchScreenId: "f7e26a48756f404c8eb0f7c3b804a02a", section: "庫存與結算" },
      // 行銷與政策
      { name: "行銷活動",     icon: "campaign",        href: "/inventory/marketing",       sprint: "S9-1",  stitchScreenId: "49b04c83bfe34273b9769ec9321d6c30", section: "行銷與政策" },
      { name: "商務政策",     icon: "policy",          href: "/inventory/policy",          sprint: "S10-4", stitchScreenId: "a8f988ac82df4503aa4e6a99c5a5a95f", section: "行銷與政策" },
      { name: "合規稽核",     icon: "gpp_good",        href: "/inventory/compliance",      sprint: "S10-5", stitchScreenId: "fe943528afb949e0b7c2fe717a94c305", section: "行銷與政策" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 8. 簽核管理 (S1 簽核中心)
  // ────────────────────────────────────────────────────────
  {
    key: "admin",
    name: "簽核管理",
    icon: "admin_panel_settings",
    accent: "#34495E",
    description: "簽核流程・單據審核",
    home: "/admin/approvals",
    permission: "admin.access",
    pages: [
      { name: "簽核流程設定", icon: "schema",          href: "/admin/approval-flow",       sprint: "S1-4",  stitchScreenId: "5164d2d5b68b4885ae24dd40f3b118a1", section: "簽核中心" },
      { name: "我的簽核",     icon: "fact_check",      href: "/admin/approvals",           sprint: "S1-5",  stitchScreenId: "8cf3cbe6d4ef429ca1a3d88958fd5924", section: "簽核中心" },
      { name: "訂單簽核",     icon: "assignment_ind",  href: "/admin/approvals/order",     sprint: "S1-6",  stitchScreenId: "b8e9e9148ed943d0a9914df3d52c0c8d", section: "簽核中心" },
      { name: "折扣簽核",     icon: "local_offer",     href: "/admin/approvals/discount",  sprint: "S1-7",  stitchScreenId: "c27c74ea875a4c8987b84c4cb8035ab9", section: "簽核中心" },
      { name: "收車簽核",     icon: "swap_vert",       href: "/admin/approvals/tradein",   sprint: "S1-8",  stitchScreenId: "638516e5f2284433ad9c8d2cc4351ddb", section: "簽核中心" },
      { name: "退款簽核",     icon: "currency_exchange", href: "/admin/approvals/refund",  sprint: "S1-9",  stitchScreenId: "3b1ee33fd56f4e5db193ada91c6e700c", section: "簽核中心" },
      { name: "調車簽核",     icon: "sync_alt",        href: "/admin/approvals/transfer",  sprint: "S1-10", stitchScreenId: "1e7d257222954e50a79e98d49173d153", section: "簽核中心" },
      { name: "簽核歷史",     icon: "history",         href: "/admin/approvals/history",   sprint: "S1-11", stitchScreenId: "8934f85891e446f2a1f1a60252863972", section: "簽核中心" },

      // Notification Hub（Phase 4 新增，參考 Notion IM 規格書 v1.0）
      { name: "通知儀表板",   icon: "campaign",        href: "/admin/notifications",                section: "通知中心", adminOnly: true },
      { name: "訂閱管理",     icon: "subscriptions",   href: "/admin/notifications/subscriptions",  section: "通知中心", adminOnly: true },
      { name: "通路與目標",   icon: "group_work",      href: "/admin/notifications/targets",        section: "通知中心", adminOnly: true },
      { name: "模板檢視",     icon: "description",     href: "/admin/notifications/templates",      section: "通知中心", adminOnly: true },
      { name: "送達記錄",     icon: "receipt_long",    href: "/admin/notifications/deliveries",     section: "通知中心", adminOnly: true },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 9. 基本資料設定（Wave 1-2 落地的 master-data + transaction admin CRUD）
  //    分三層 section：List（主檔）/ Transaction（交易）/ Report（報表）
  //    對應 ERP 經典資料分類；comingSoon 標示尚未做 admin 頁但 schema 已有
  // ────────────────────────────────────────────────────────
  {
    key: "master-data",
    name: "基本資料設定",
    icon: "tune",
    accent: "#7C3AED",
    description: "主檔・交易・報表 — 系統基本資料與營運紀錄",
    home: "/admin/master-data/employees",
    permission: "admin.access",
    pages: [
      // ─── List（主檔基本資料） ───────────────────────
      { name: "員工主檔",       icon: "badge",         href: "/admin/master-data/employees",          section: "List 主檔" },
      { name: "客戶車輛",       icon: "two_wheeler",   href: "/admin/master-data/vehicles",           section: "List 主檔" },
      { name: "客戶資料",       icon: "person",        href: "/admin/master-data/customers",          section: "List 主檔" },
      { name: "客戶聯絡人",     icon: "contacts",      href: "/admin/master-data/customer-contacts", section: "List 主檔" },
      { name: "部門組織",       icon: "account_tree",  href: "/admin/master-data/departments",        section: "List 主檔" },
      { name: "供應商",         icon: "business",      href: "/admin/master-data/suppliers",          section: "List 主檔" },
      { name: "料號商品",       icon: "inventory_2",   href: "/admin/master-data/items",              section: "List 主檔", comingSoon: true },
      { name: "供應商定價",     icon: "price_change",  href: "/admin/master-data/supplier-pricing",    section: "List 主檔" },
      { name: "料號前置時間",   icon: "schedule_send", href: "/admin/master-data/item-lead-times",     section: "List 主檔" },
      { name: "補貨計畫設定",   icon: "tune",          href: "/admin/master-data/replenishment-policies", section: "List 主檔" },

      // ─── Transaction（交易紀錄） ────────────────────
      { name: "維修預約",       icon: "event_available", href: "/admin/master-data/appointments",     section: "Transaction 交易" },
      { name: "維修工單",       icon: "build",         href: "/admin/master-data/work-orders",        section: "Transaction 交易" },
      { name: "PI / PDI 檢驗",  icon: "fact_check",    href: "/admin/master-data/inspections",        section: "Transaction 交易" },
      { name: "保固索賠",       icon: "verified",      href: "/admin/master-data/warranty-claims",    section: "Transaction 交易" },

      // ─── Report（報表） ─────────────────────────────
      { name: "員工 / 部門報表", icon: "groups",        href: "/admin/master-data/reports/staffing",   section: "Report 報表", comingSoon: true },
      { name: "工單統計",        icon: "query_stats",   href: "/admin/master-data/reports/work-orders", section: "Report 報表", comingSoon: true },
      { name: "保養回廠率",      icon: "trending_up",   href: "/admin/master-data/reports/return-rate", section: "Report 報表", comingSoon: true },
      { name: "車輛保固到期",    icon: "schedule",      href: "/admin/master-data/reports/warranty-due", section: "Report 報表", comingSoon: true },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 10. 集團管理 (S6 數據)
  // ────────────────────────────────────────────────────────
  {
    key: "group",
    name: "集團管理",
    icon: "corporate_fare",
    accent: "#4338CA",
    description: "跨門店數據・報表・目標",
    home: "/group/briefing",
    permission: "group.access",
    pages: [
      { name: "集團運營簡報", icon: "slideshow",        href: "/group/briefing",           sprint: "S6-3", stitchScreenId: "76f48bf6c9484de1a2082f702761fa40", section: "集團數據" },
      { name: "集團看板",     icon: "space_dashboard",  href: "/group/dashboard",          sprint: "S6-2", stitchScreenId: "0f7df3e575254e96b24b084be30179c1", section: "集團數據" },
      { name: "看板 (Mobile)",icon: "stay_primary_portrait", href: "/group/dashboard-mobile", sprint: "S6-1", stitchScreenId: "1dc126f847404a23bd966f7743937945", section: "集團數據" },
      { name: "集團庫存總覽", icon: "hub",              href: "/group/group-overview",     sprint: "S6-7", stitchScreenId: "9e696ef7243d48148cc3290aa55d0d16", section: "集團數據" },
      { name: "報表中心",     icon: "bar_chart",        href: "/group/reports",            sprint: "S6-5", stitchScreenId: "608f23f9cb484af39f71c15d1af39619", section: "集團數據" },
      { name: "銷售目標",     icon: "flag",             href: "/group/sales-target",       sprint: "S6-6", stitchScreenId: "f3e0be1e2b6c439ea20d5dd428577873", section: "集團數據" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 11. 會計財務設定 (COA v2.0 + GL Dimensions + NetSuite Mapping)
  // ────────────────────────────────────────────────────────
  {
    key: "accounting",
    name: "會計財務設定",
    icon: "account_balance",
    accent: "#7E5A00",
    description: "會計科目表・統計科目表・NetSuite Mapping",
    home: "/admin/accounting/coa",
    permission: "accounting.access",
    pages: [
      { name: "會計科目表",  icon: "account_balance",  href: "/admin/accounting/coa",              section: "會計設定" },
      { name: "統計科目表",  icon: "category",         href: "/admin/accounting/dimensions",       section: "會計設定" },
      { name: "Mapping 表",  icon: "swap_horiz",       href: "/admin/accounting/netsuite-mapping", section: "會計設定" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 12. 系統設定 (S1 組織權限 + S9-2 系統設定)
  // ────────────────────────────────────────────────────────
  {
    key: "settings",
    name: "系統設定",
    icon: "settings",
    accent: "#0891B2",
    description: "組織・權限・系統偏好",
    home: "/settings/org",
    permission: "settings.access",
    pages: [
      // 組織 & 權限
      { name: "組織架構",     icon: "account_tree",    href: "/settings/org",              sprint: "S1-1", stitchScreenId: "40cad06add0e44c6b523a54514b01b77", section: "組織與權限" },
      { name: "人員管理",     icon: "badge",           href: "/settings/staff",            sprint: "S1-2", stitchScreenId: "ceeb6d36062b47d68789dc49700707d9", section: "組織與權限" },
      { name: "角色權限",     icon: "key",             href: "/settings/roles",            sprint: "S1-3", stitchScreenId: "366a7fd4ce77445e925d02cde3afba82", section: "組織與權限" },
      // 系統設定
      { name: "基本設定",     icon: "tune",            href: "/settings/general",          sprint: "S9-2", stitchScreenId: "6165a595ffd049918a2f79d48557c8bd", section: "系統設定" },
      { name: "字典管理",     icon: "menu_book",       href: "/settings/dictionary",       section: "系統設定" },
      { name: "業務序號",     icon: "format_list_numbered", href: "/settings/serial",      section: "系統設定" },
      { name: "車型管理",     icon: "two_wheeler",     href: "/settings/models",           section: "系統設定" },
      { name: "通知設定",     icon: "notifications",   href: "/settings/notifications",    section: "系統設定" },
      { name: "數據匯入/出",  icon: "import_export",   href: "/settings/data-io",          section: "系統設定" },
      { name: "API 整合",     icon: "hub",             href: "/settings/api",              section: "系統設定" },
      // 意見回饋
      { name: "單據看板",     icon: "view_kanban",     href: "/feedback/tickets",          section: "意見回饋" },
      { name: "新增單據",     icon: "add_comment",     href: "/feedback/tickets/new",      section: "意見回饋" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 11. 工具 (通用小工具：農民曆、擇日…)
  // ────────────────────────────────────────────────────────
  {
    key: "tools",
    name: "工具",
    icon: "widgets",
    accent: "#F59E0B",
    description: "農民曆・擇日・決策輔助",
    home: "/tools/calendar",
    pages: [
      // 擇日 / 時序
      { name: "農民曆",       icon: "calendar_month",   href: "/tools/calendar",         section: "擇日時序" },
      { name: "交車良辰吉時",  icon: "event_available",  href: "/tools/delivery-timing",  section: "擇日時序" },
      { name: "騎士氣象",     icon: "partly_cloudy_day",href: "/tools/rider-weather",    section: "擇日時序" },
      // 決策輔助
      { name: "資產配置分析",  icon: "analytics",        href: "/tools/wpm",              section: "決策輔助" },
      { name: "理性護航計算機",icon: "calculate",        href: "/tools/daily-cost",       section: "決策輔助" },
      { name: "競品降維對照", icon: "compare_arrows",   href: "/tools/rival-smash",      section: "決策輔助" },
      // 風水 / 玄學
      { name: "領牌風水運算器",icon: "casino",           href: "/tools/license-fengshui", section: "風水運算" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 12. 新功能開發區 (尚未轉譯成 React 的設計稿 HTML，iframe 預覽)
  // ────────────────────────────────────────────────────────
  {
    key: "dev",
    name: "新功能開發區",
    icon: "science",
    accent: "#D97706",
    description: "尚未轉譯的設計稿預覽",
    home: "/dev/demo-dashboard",
    pages: [
      { name: "Demo Dashboard（資料層連通）", icon: "dashboard",       href: "/dev/demo-dashboard" },
      { name: "04_預檢單+RO串接_v1",          icon: "fact_check",      href: "/dev/preflight-ro-v1" },
      { name: "04_預檢單_SA環檢_v2",          icon: "rule",            href: "/dev/preflight-sa-v2" },
      { name: "Ducati_售後完整工單套件_v4",   icon: "folder_special",  href: "/dev/aftersales-kit" },
    ],
  },
];

export function getModuleByKey(key: string): ModuleDef | undefined {
  return modules.find((m) => m.key === key);
}

// pathname-to-module overrides: URL segment → module key
const SEGMENT_MODULE_OVERRIDES: Record<string, string> = {
  feedback: "settings",
};

export function resolveModuleFromPathname(pathname: string): ModuleDef | null {
  const seg = pathname.split("/")[1];
  if (!seg) return null;
  const key = SEGMENT_MODULE_OVERRIDES[seg] ?? seg;
  return modules.find((m) => m.key === key) ?? null;
}

export function findPageByHref(href: string): { module: ModuleDef; page: ModulePage } | null {
  for (const m of modules) {
    const p = m.pages.find((p) => p.href === href);
    if (p) return { module: m, page: p };
  }
  return null;
}

/** Flattened page list for CommandPalette / global search */
export function allPages(): Array<ModulePage & { moduleName: string; moduleKey: string; accent?: string }> {
  return modules.flatMap((m) =>
    m.pages.map((p) => ({
      ...p,
      moduleName: m.name,
      moduleKey: m.key,
      accent: m.accent,
    }))
  );
}
