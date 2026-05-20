/**
 * /parts/aftersales 模組導覽常數
 *
 * 規格：第十輪 BDN M03-1 — 重設為 ModuleHomeGallery 樣式
 *   + 頂部 KpiCard 列（今日預約 / 進行中 RO / 待結帳 / 未追蹤）
 *   + 3-5 分區入口
 *
 * Stitch 樣板：docs/DUCATI_v2_output/03_售後修護/01_售後接待/00_售後工單模組_導覽總覽.html
 *
 * 拆檔理由：避開 Next 16 "use server" 只能 export async function 的雷；
 * panel 結構 / hero 文案 / 子模組分區屬靜態元資料，types & consts 放 .constants.ts，
 * helper 走 .ts 包一層 async 給 server component 用。
 */

import type {
  ModuleHomeGalleryProps,
  ModuleHomeKpi,
} from "@/components/module-home-gallery";

// ── 靜態 hero / panels（不會變的部份）─────────────────────────────────────
export const AFTERSALES_HERO: ModuleHomeGalleryProps["hero"] = {
  title: "🔧 DUCATI 售後修護模組",
  description:
    "覆蓋售後完整 pipeline：預約 → SA 預檢五關 → RO 工單開立 → 工位派工 → 竣工複檢 → 結帳收款 → 增項閉環 → 人車檔案。支援增項追蹤 D+3 / D+10、保固索賠串接、技師電子打卡、職級簽核授權；與庫存模組 4 個串接點打通領料 / 退料 / 換零件 / 保固歸還流程。",
  stats: [
    { value: 6, label: "主流程 Phase" },
    { value: 13, label: "核心頁面" },
    { value: 4, label: "庫存串接點" },
    { value: "v2", label: "本頁版本" },
  ],
};

// ── 動態 KPI tone 規格（值由 helper 從 DB 算出）────────────────────────────
export type AftersalesOverviewKpis = {
  today_appointments: number;
  in_progress_ro: number;
  awaiting_checkout: number;
  pending_followups: number;
};

/** 把 KPI 數字組成 <ModuleHomeGallery> 認得的 4 顆 kpi card */
export function buildAftersalesKpis(k: AftersalesOverviewKpis): ModuleHomeKpi[] {
  return [
    {
      label: "今日預約",
      value: k.today_appointments,
      sub: "尚未完成的當日 appointments",
      tone: "blue",
    },
    {
      label: "進行中工單",
      value: k.in_progress_ro,
      sub: "RO status = 維修中 / 進行中",
      tone: "teal",
    },
    {
      label: "待結帳",
      value: k.awaiting_checkout,
      sub: "完工待收款 + checkout in_progress",
      tone: "amber",
    },
    {
      label: "未追蹤增項",
      value: k.pending_followups,
      sub: "followup_cases tracking 中",
      tone: "purple",
    },
  ];
}

// ── 5 分區 panels（入口卡片）────────────────────────────────────────────
export const AFTERSALES_PANELS: ModuleHomeGalleryProps["panels"] = [
  {
    icon: "calendar_today",
    title: "預約與進廠接待",
    subtitle: "Phase 1-2 · 預約看板 → 環車預檢五關 → 客戶簽名",
    tone: "blue",
    layers: [
      {
        title: "預約 × 預檢",
        cards: [
          {
            code: "01",
            name: "預約管理看板",
            desc: "日 / 週視圖 · 技師工作負載即時統計 · 拖曳改時段",
            href: "/parts/aftersales/appointments",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "04",
            name: "預檢單（SA 五關）",
            desc: "環車 + 來意 + 技師深入 + SA 報價 + 第一次簽名（Tab 切換）",
            href: "/parts/aftersales/pre-inspections",
            tone: "blue",
            badge: { text: "v3", tone: "navy" },
          },
          {
            code: "01s",
            name: "工單查詢",
            desc: "RO 列表 · 多條件篩選 · 已關單歷史回查",
            href: "/parts/aftersales/ro-search",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
    ],
  },
  {
    icon: "construction",
    title: "工單開立 × 維修執行",
    subtitle: "Phase 3-4 · RO 極簡確認 → 工位看板 → 技師派工 → 完工交棒",
    tone: "teal",
    badge: { text: "🔧 核心 Pipeline", tone: "green" },
    layers: [
      {
        title: "RO 工單",
        cards: [
          {
            code: "02",
            name: "正式工單（RO）",
            desc: "資料自動帶入 · SA 30 秒完成 · 自動算金額 · 狀態流：開立 → 維修 → 待結帳",
            href: "/parts/aftersales/repair-orders",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "04+",
            name: "追加項目記錄",
            desc: "技師發現問題 → SA 報價 → 客戶採納 / 拒絕 / 暫緩 → 自動進閉環",
            href: "/parts/aftersales/addons",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "車間管理",
        cards: [
          {
            code: "07a",
            name: "工位看板",
            desc: "圖形化工位狀態 · 點工位即技師電子打卡 · 即時負載",
            href: "/parts/aftersales/management/bays",
            tone: "teal",
            badge: { text: "v2", tone: "navy" },
          },
          {
            code: "07b",
            name: "技師派工看板",
            desc: "依專長 / 負載派工 · 拖曳指派 · 完工交棒 30 秒推進至複檢",
            href: "/parts/aftersales/management/dispatch",
            tone: "teal",
            badge: { text: "v2", tone: "navy" },
          },
          {
            code: "RO+",
            name: "RO 交接（handoff）",
            desc: "工序間人員交接 · 簽名授權 · 工時與責任歸屬",
            href: "/parts/aftersales/ro-handoff",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
    ],
  },
  {
    icon: "task_alt",
    title: "竣工 × 結帳 × 取車通知",
    subtitle: "Phase 5-6 · 五步竣工複檢 → 第二次簽名 → 收款開票 → LINE 取車推播",
    tone: "navy",
    layers: [
      {
        title: "竣工 × 結帳",
        cards: [
          {
            code: "06",
            name: "竣工複檢",
            desc: "5 步驟 wizard · 職級授權簽核 · 拍照存證 · 推進至取車通知",
            href: "/parts/aftersales/final-inspections",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "08",
            name: "結帳收款",
            desc: "費用明細 → 第二次簽名 → 收款方式 → 發票開立 → RO 關單存檔",
            href: "/parts/aftersales/checkout",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "11",
            name: "取車通知設定",
            desc: "完工 / 待取車推播範本 · LINE / SMS 雙通路 · 排程發送",
            href: "/parts/aftersales/pickup-notifications",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
    ],
  },
  {
    icon: "loop",
    title: "增項閉環 × 人車檔案",
    subtitle: "支線 · 暫緩 / 拒絕項目持續追蹤 · 客戶 360° 維修履歷",
    tone: "teal",
    layers: [
      {
        title: "閉環 × 檔案",
        cards: [
          {
            code: "05",
            name: "增項閉環追蹤",
            desc: "待追蹤看板（安全等級置頂）· D+3 / D+10 時間軸 · SA 閉環績效",
            href: "/parts/aftersales/followups",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "09",
            name: "人車檔案",
            desc: "客戶基本卡 · 座騎多台 · RO 維修履歷 timeline · 保固狀態追蹤",
            href: "/parts/aftersales/customers",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
    ],
  },
  {
    icon: "settings",
    title: "主管設定 × 系統參數",
    subtitle: "員工名冊 / RO 編號規則 / 客戶標籤 / 取車通知模板 / 折扣規則",
    tone: "navy",
    layers: [
      {
        title: "員工 × 編號 × 標籤",
        cards: [
          {
            code: "M1",
            name: "員工名冊",
            desc: "SA · 技師 · 職級 · 簽核權限 · 證照與工時統計",
            href: "/parts/aftersales/management/staff",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "M2",
            name: "RO 編號規則",
            desc: "前綴碼 P1 / P2 · 流水號規則 · 雙 brand 各自獨立",
            href: "/parts/aftersales/management/ro-numbering",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "M3",
            name: "客戶標籤主管設定",
            desc: "官方標籤 CRUD · 個人標籤審核 · 套用至 RO / 預檢",
            href: "/parts/aftersales/management/customer-tags",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "派工 × 通知 × 折扣",
        cards: [
          {
            code: "M4",
            name: "工位派工設定",
            desc: "工位 / 技師 / 設備管理 · 派工規則 · 排班範本",
            href: "/parts/aftersales/management/bays",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "M5",
            name: "取車通知模板",
            desc: "LINE / SMS 推播文案 · 變數插入 · 排程規則",
            href: "/parts/aftersales/settings/pickup-notify",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "M6",
            name: "售後折扣管理",
            desc: "RO 折扣規則 · 折讓單 · 主管授權層級",
            href: "/parts/aftersales/management/discounts",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
    ],
  },
];

// ── 今日焦點（today's focus）shape ────────────────────────────────────────
export type AftersalesFocusItem = {
  label: string;
  value: number;
  /** 點擊跳轉的清單頁 */
  href: string;
  /** 用 KpiCard tone 規範 */
  tone: "blue" | "teal" | "amber" | "red" | "purple" | "green" | "gray";
  icon: string;
  hint: string;
};
