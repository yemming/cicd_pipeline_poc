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
  /** Device hint: desktop | tablet | ipad | mobile */
  device?: "desktop" | "tablet" | "ipad" | "mobile";
};

export type ModuleDef = {
  key: string;
  name: string;
  icon: string;
  accent?: string;
  description?: string;
  home: string;
  pages: ModulePage[];
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
      { name: "新增接待",     icon: "person_add",      href: "/sales/reception/new",       sprint: "S2-1", stitchScreenId: "99fce611466a4a649ef25a9e3b1a18b4", device: "ipad", section: "展廳接待" },
      { name: "接待記錄",     icon: "receipt_long",    href: "/sales/reception/records",   sprint: "S2-2", stitchScreenId: "f822233c2bba46cc922f40a25c68f4c1", device: "ipad", section: "展廳接待" },
      // 電子手卡三段
      { name: "手卡・前台登記", icon: "description",   href: "/sales/card/counter",        sprint: "S2-2", stitchScreenId: "48b9a52cdecb43df8f3742ce7772e57a", device: "ipad", section: "電子手卡" },
      { name: "手卡・顧問填寫", icon: "edit_note",     href: "/sales/card/consultant",     sprint: "S2-3", stitchScreenId: "a31b7bafb5b04dde83409277678754ab", device: "ipad", section: "電子手卡" },
      { name: "手卡・試駕成交", icon: "handshake",     href: "/sales/card/closing",        sprint: "S2-4", stitchScreenId: "83860fd7c7e5450883fa05481790cab2", device: "ipad", section: "電子手卡" },
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
      { name: "接待報價單",   icon: "request_quote",   href: "/sales/quote",               sprint: "S3-9", stitchScreenId: "f2f2139ca6274ad9bb4fa4d9ec0fb775", device: "ipad", section: "交易流程" },
      { name: "金融服務",     icon: "payments",        href: "/sales/finance",             sprint: "S3-3", stitchScreenId: "99a04d77b6eb4dc0abee06254039be18", device: "tablet", section: "交易流程" },
      { name: "保險服務",     icon: "verified_user",   href: "/sales/insurance",           sprint: "S3-4", stitchScreenId: "8df863759c604bab91a4a38e38e2e3ce", device: "tablet", section: "交易流程" },
      { name: "精品選配",     icon: "featured_video",  href: "/sales/accessories",         sprint: "S3-7", stitchScreenId: "cb56d0d2424f425e943d240e06d0c26c", device: "tablet", section: "交易流程" },
      // Mobile App
      { name: "顧問 App",     icon: "smartphone",      href: "/sales/sc-app",              sprint: "S3-8", stitchScreenId: "c67e7324cd3e4f62a0fc9b0fbbdce5dc", device: "mobile", section: "行動工具" },
      // 車型資訊（bonus）
      { name: "車型資訊",     icon: "two_wheeler",     href: "/sales/models",              sprint: "—",    stitchScreenId: "6a4a5093d497482fb532650d25589829", section: "行動工具" },
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
      { name: "預約看板",     icon: "calendar_today",  href: "/service/appointments",      sprint: "S4-1", stitchScreenId: "1575f27a2ada4bb8bb7d2f21894790cb" },
      { name: "維修工單",     icon: "construction",    href: "/service/workorders",        sprint: "S4-2", stitchScreenId: "2428f2b6c13e41658c0364f70d947940", device: "tablet" },
      { name: "技師派工",     icon: "garage",          href: "/service/workshop",          sprint: "S4-4", stitchScreenId: "ef95845f1f78486f83905a9cd1ec1ccf" },
      { name: "配件庫存",     icon: "inventory_2",     href: "/service/parts",             sprint: "S4-3", stitchScreenId: "bf46972c2a64481cb90839a93382c317" },
      { name: "保固管理",     icon: "shield",          href: "/service/warranty",          sprint: "S8-3", stitchScreenId: "efc46f958e984d43ad416acb574af0ef" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 3. 交車服務 (S7-2~S7-7)
  // ────────────────────────────────────────────────────────
  {
    key: "delivery",
    name: "交車服務",
    icon: "local_shipping",
    accent: "#C9A84C",
    description: "PDI・交車確認・交車儀式",
    home: "/delivery/pdi",
    permission: "delivery.access",
    pages: [
      { name: "PDI 檢查表",   icon: "fact_check",      href: "/delivery/pdi",              sprint: "S7-2", stitchScreenId: "867edbe750124ece91cb5a2afbe38761", device: "tablet" },
      { name: "PDI 配件安裝", icon: "settings_suggest",href: "/delivery/pdi-accessories",  sprint: "S7-3", stitchScreenId: "e323677e9e2e4cb190022f1fa09a502c", device: "tablet" },
      { name: "交車確認 (上)",icon: "assignment_turned_in", href: "/delivery/confirm-1",   sprint: "S7-4", stitchScreenId: "292c6069abfe41b69ffc41e90ed2878b", device: "tablet" },
      { name: "交車確認 (下)",icon: "task_alt",        href: "/delivery/confirm-2",        sprint: "S7-5", stitchScreenId: "6e86c72665d44820b2b770bbde15591f", device: "tablet" },
      { name: "保固條款簽署", icon: "draw",            href: "/delivery/warranty-sign",    sprint: "S7-6", stitchScreenId: "431a61ec63f54721a786bfc969d718f3", device: "tablet" },
      { name: "交車儀式",     icon: "celebration",     href: "/delivery/ceremony",         sprint: "S7-7", stitchScreenId: "55e45ebb3bff4682b32a2b15d60d27a4", device: "tablet" },
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
  // 5. 中古機車 (S5 全部)
  // ────────────────────────────────────────────────────────
  {
    key: "usedcar",
    name: "中古機車",
    icon: "two_wheeler",
    accent: "#95A5A6",
    description: "置換・庫存・拍賣",
    home: "/usedcar/evaluation",
    permission: "usedcar.access",
    pages: [
      { name: "置換評估",     icon: "assessment",      href: "/usedcar/evaluation",        sprint: "S5-1", stitchScreenId: "e8c1015b71784626ac9797caaf57f457", device: "tablet" },
      { name: "中古車庫存",   icon: "inventory",       href: "/usedcar/stock",             sprint: "S5-2", stitchScreenId: "6f6ddad5a36144daa42a772607663054" },
      { name: "拍賣管理",     icon: "gavel",           href: "/usedcar/auction",           sprint: "S5-3", stitchScreenId: "cc722dbd9b5c4af29b5fe7e516db70fd" },
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
  // 7. 整車庫存 (S10-1~3 + S6-7)
  // ────────────────────────────────────────────────────────
  {
    key: "inventory",
    name: "整車庫存",
    icon: "warehouse",
    accent: "#1ABC9C",
    description: "庫存・配額・返利",
    home: "/inventory/vehicles",
    permission: "inventory.access",
    pages: [
      { name: "整車庫存",     icon: "list_alt",        href: "/inventory/vehicles",        sprint: "S10-1", stitchScreenId: "91bdac2c367e4e04a3caa8d79201d864" },
      { name: "配額批售",     icon: "swap_horiz",      href: "/inventory/quota",           sprint: "S10-2", stitchScreenId: "763556ef5dd64192936e49a6c305e3ce" },
      { name: "返利結算",     icon: "monetization_on", href: "/inventory/rebate",          sprint: "S10-3", stitchScreenId: "f7e26a48756f404c8eb0f7c3b804a02a" },
      { name: "集團庫存總覽", icon: "hub",             href: "/inventory/group-overview",  sprint: "S6-7",  stitchScreenId: "9e696ef7243d48148cc3290aa55d0d16" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 8. 經銷商管理 (S1 全部 + S9-2 系統設定)
  // ────────────────────────────────────────────────────────
  {
    key: "admin",
    name: "經銷商管理",
    icon: "admin_panel_settings",
    accent: "#34495E",
    description: "組織・權限・審批・設定",
    home: "/admin/org",
    permission: "admin.access",
    pages: [
      // 組織 & 權限
      { name: "組織架構",     icon: "account_tree",    href: "/admin/org",                 sprint: "S1-1", stitchScreenId: "40cad06add0e44c6b523a54514b01b77", section: "組織與權限" },
      { name: "人員管理",     icon: "badge",           href: "/admin/staff",               sprint: "S1-2", stitchScreenId: "ceeb6d36062b47d68789dc49700707d9", section: "組織與權限" },
      { name: "角色權限",     icon: "key",             href: "/admin/roles",               sprint: "S1-3", stitchScreenId: "366a7fd4ce77445e925d02cde3afba82", section: "組織與權限" },
      // 審批中心
      { name: "審批流程設定", icon: "schema",          href: "/admin/approval-flow",       sprint: "S1-4",  stitchScreenId: "5164d2d5b68b4885ae24dd40f3b118a1", section: "審批中心" },
      { name: "我的審批",     icon: "fact_check",      href: "/admin/approvals",           sprint: "S1-5",  stitchScreenId: "8cf3cbe6d4ef429ca1a3d88958fd5924", section: "審批中心" },
      { name: "訂單審批",     icon: "assignment_ind",  href: "/admin/approvals/order",     sprint: "S1-6",  stitchScreenId: "b8e9e9148ed943d0a9914df3d52c0c8d", section: "審批中心" },
      { name: "折扣審批",     icon: "local_offer",     href: "/admin/approvals/discount",  sprint: "S1-7",  stitchScreenId: "c27c74ea875a4c8987b84c4cb8035ab9", section: "審批中心" },
      { name: "收車審批",     icon: "swap_vert",       href: "/admin/approvals/tradein",   sprint: "S1-8",  stitchScreenId: "638516e5f2284433ad9c8d2cc4351ddb", section: "審批中心" },
      { name: "退款審批",     icon: "currency_exchange", href: "/admin/approvals/refund",  sprint: "S1-9",  stitchScreenId: "3b1ee33fd56f4e5db193ada91c6e700c", section: "審批中心" },
      { name: "調車審批",     icon: "sync_alt",        href: "/admin/approvals/transfer",  sprint: "S1-10", stitchScreenId: "1e7d257222954e50a79e98d49173d153", section: "審批中心" },
      { name: "審批歷史",     icon: "history",         href: "/admin/approvals/history",   sprint: "S1-11", stitchScreenId: "8934f85891e446f2a1f1a60252863972", section: "審批中心" },
      // 設定
      { name: "系統設定",     icon: "settings",        href: "/admin/system",              sprint: "S9-2",  stitchScreenId: "6165a595ffd049918a2f79d48557c8bd", section: "系統設定" },
    ],
  },

  // ────────────────────────────────────────────────────────
  // 9. 集團管理 (S6 數據 + S9-1 行銷 + S10-4/5 政策)
  // ────────────────────────────────────────────────────────
  {
    key: "group",
    name: "集團管理",
    icon: "corporate_fare",
    accent: "#16A085",
    description: "跨門店數據・行銷・政策",
    home: "/group/dashboard",
    permission: "group.access",
    pages: [
      // 集團數據
      { name: "集團看板",     icon: "space_dashboard",  href: "/group/dashboard",          sprint: "S6-2", stitchScreenId: "0f7df3e575254e96b24b084be30179c1", section: "集團數據" },
      { name: "看板 (Mobile)",icon: "stay_primary_portrait", href: "/group/dashboard-mobile", sprint: "S6-1", stitchScreenId: "1dc126f847404a23bd966f7743937945", device: "mobile", section: "集團數據" },
      { name: "集團運營簡報", icon: "slideshow",        href: "/group/briefing",           sprint: "S6-3", stitchScreenId: "76f48bf6c9484de1a2082f702761fa40", section: "集團數據" },
      { name: "報表中心",     icon: "bar_chart",        href: "/group/reports",            sprint: "S6-5", stitchScreenId: "608f23f9cb484af39f71c15d1af39619", section: "集團數據" },
      { name: "銷售目標",     icon: "flag",             href: "/group/sales-target",       sprint: "S6-6", stitchScreenId: "f3e0be1e2b6c439ea20d5dd428577873", section: "集團數據" },
      // 行銷
      { name: "行銷活動",     icon: "campaign",         href: "/group/marketing",          sprint: "S9-1", stitchScreenId: "49b04c83bfe34273b9769ec9321d6c30", section: "行銷與政策" },
      // 廠商政策
      { name: "商務政策",     icon: "policy",           href: "/group/policy",             sprint: "S10-4", stitchScreenId: "a8f988ac82df4503aa4e6a99c5a5a95f", section: "行銷與政策" },
      { name: "合規稽核",     icon: "gpp_good",         href: "/group/compliance",         sprint: "S10-5", stitchScreenId: "fe943528afb949e0b7c2fe717a94c305", section: "行銷與政策" },
    ],
  },
];

export function getModuleByKey(key: string): ModuleDef | undefined {
  return modules.find((m) => m.key === key);
}

export function resolveModuleFromPathname(pathname: string): ModuleDef | null {
  const seg = pathname.split("/")[1];
  if (!seg) return null;
  return modules.find((m) => m.key === seg) ?? null;
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
