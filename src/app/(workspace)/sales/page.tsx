"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  ModuleHomeGallery,
  type ModuleHomeGalleryProps,
} from "@/components/module-home-gallery";

/**
 * /sales — 銷售接待模組首頁（v2 圖卡導覽）
 *
 * 對應設計稿：docs/DUCATI_v2_output/01_銷售接待/00_模組導覽/RS00_銷售模組_導覽總覽_v4.html
 *
 * 邊界：
 * - 子頁這次不動。圖卡 href 指向現有可 work 的舊路徑（reception/handcard、
 *   showroom/new-cars 等）；找不到對應頁的暫指 "#" 並標 TODO。
 * - 沿用共用 <ModuleHomeGallery>，prop shape 完全符合 RS00 結構，未擴 prop。
 */

const HERO: ModuleHomeGalleryProps["hero"] = {
  title: "🏍️ DUCATI 銷售接待模組",
  description:
    "完整覆蓋銷售（RS）與售後（SA）雙側流程：接待建檔 → 試駕 → 庫存 → 鑑價 → 報價訂單 → 交車 → 售後保養 → CRM 追蹤 → 店長報表。RS05 交車後自動觸發 SA 側 CRM01B 建檔,形成完整客戶生命週期閉環。",
  stats: [
    { value: 22, label: "RS 模組" },
    { value: 8, label: "SA CRM 模組" },
    { value: "v4", label: "本頁版本" },
  ],
};

const KPIS: ModuleHomeGalleryProps["kpis"] = [
  {
    label: "RS 前台模組",
    value: 10,
    sub: "RS00–RS06 + RS_EX1",
    tone: "blue",
  },
  {
    label: "主管 / 設定模組",
    value: 5,
    sub: "RS_SET / RS_SET2 / RS_M1–M3",
    tone: "teal",
  },
  {
    label: "CRM 全系列",
    value: 15,
    sub: "CRM00 / A 系列 / B 系列 / CRM07 v2",
    tone: "amber",
  },
  {
    label: "RS05→SA 跨部門串接",
    value: "✅",
    sub: "交車觸發 CRM01B 自動建檔",
    tone: "navy",
  },
];

const PANELS: ModuleHomeGalleryProps["panels"] = [
  {
    icon: "two_wheeler",
    title: "RS 前台作業模組",
    subtitle: "銷售顧問日常使用 · 接待 → 試駕 → 庫存 → 鑑價 → 報價訂單 → 交車 → 保險",
    tone: "blue",
    layers: [
      {
        title: "接待 × 試駕",
        cards: [
          {
            code: "RS01",
            name: "電子手卡",
            desc: "四種來客身份 · HABC 輔助建議 · 四色標籤 · 雙向跳轉回寫",
            href: "/sales/reception/handcard",
            tone: "blue",
            badge: { text: "v8", tone: "navy" },
          },
          {
            code: "RS02",
            name: "試乘試駕",
            desc: "試駕記錄 · 黃金時刻強制提示開報價單 · 回寫 RS01",
            href: "/sales/reception/test-rides",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "庫存 × 鑑價",
        cards: [
          {
            code: "RS03A",
            name: "新車庫存看板",
            desc: "新車庫存狀態 · 意向車型篩選 · 從 RS01 帶入條件",
            href: "/sales/showroom/new-cars",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "RS03B",
            name: "中古車庫存看板",
            desc: "CPO/DPO/PO 三級認證 · 中古車篩選 · 從 RS01 帶入",
            href: "/sales/showroom/used-cars",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "RS06",
            name: "中古車評估鑑價",
            desc: "Desmo Service 記錄 · 認證等級評定 · 回寫 RS01",
            href: "/usedcar/evaluations",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "報價 × 交車 × 保險",
        cards: [
          {
            code: "RS04",
            name: "賞車報價與成交訂單",
            desc: "報價單（新/中古共用）· 新車訂購合約 · 中古車買賣切結合約",
            href: "/sales/quote",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "RS05",
            name: "交車管理",
            desc: "PDI 觸發（PD-IN）· 交車確認表 36 項 · 保固條款簽名 · 觸發 D+3",
            href: "/sales/delivery",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "RS_EX1",
            name: "前端續保招攬工作",
            desc: "續保到期提醒 · 話術模板 · 新車交車招攬 · 佣金業績",
            href: "/sales/insurance",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
        ],
      },
    ],
  },
  {
    icon: "settings",
    title: "主管 / 設定模組",
    subtitle: "主管統一管理 · 參數下發各 RS 前台",
    tone: "navy",
    layers: [
      {
        title: "戰情看板 × 業績報表",
        cards: [
          {
            code: "RS_M1",
            name: "銷售漏斗看板",
            desc: "三層 KPI · PULS 診斷 · HABC 分布 · 客群畫像",
            href: "/sales/manager/funnel",
            tone: "navy",
            badge: { text: "v5", tone: "navy" },
          },
          {
            code: "RS_M2",
            name: "業績報表",
            desc: "損益平衡進度 · RS 排行 · 車系分析 · 月度趨勢",
            href: "/sales/manager/sales-report",
            tone: "navy",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "RS_M3",
            name: "主管設定",
            desc: "KPI 目標 · 九宮格 · 標籤管理 · RS 人員 · 保險設定",
            href: "/sales/manager/kpi-targets",
            tone: "navy",
            badge: { text: "v2", tone: "navy" },
          },
        ],
      },
      {
        title: "參數 × 標籤",
        cards: [
          {
            code: "RS_SET",
            name: "參數設定頁",
            desc: "線索來源清單 · 競品去向清單 · 功能開關",
            href: "/sales/settings/handcard-params",
            tone: "navy",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "RS_SET2",
            name: "客戶標籤管理",
            desc: "官方標籤瀏覽 · 個人自訂（無審核）· 主管觀察視角",
            href: "/sales/settings/customer-tags",
            tone: "navy",
            badge: { text: "v2", tone: "navy" },
          },
        ],
      },
    ],
  },
  {
    icon: "groups",
    title: "CRM 銷售側模組（A 系列）",
    subtitle: "潛客管理 · HABC 分級 · 電訪追蹤 · NPS",
    tone: "blue",
    layers: [
      {
        title: "客戶基盤 × 問卷",
        cards: [
          {
            code: "CRM01A",
            name: "銷售客戶基盤",
            desc: "HABC 分級 · 列表/看板雙視圖 · SA 唯讀標籤（P-08）",
            href: "/crm/sales/customer-base",
            tone: "blue",
            badge: { text: "v2", tone: "navy" },
          },
          {
            code: "CRM02A",
            name: "銷售電訪問卷設定",
            desc: "問卷版本控制 · 題型管理 · 適用時機 · 套用至 CRM03A",
            href: "/crm/sales/survey-templates",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "電訪 × 休眠",
        cards: [
          {
            code: "CRM03A",
            name: "銷售電訪工作台",
            desc: "D+3/D+7 排程 · 話術提示 · 通話記錄 · 逾期警示",
            href: "/crm/sales/call-tasks",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "CRM04A",
            name: "銷售休眠戰敗管理",
            desc: "休眠分層 · 戰敗原因分析 · 再接觸排程",
            href: "/crm/sales/dormant-leads",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "NPS × 推播",
        cards: [
          {
            code: "CRM05A",
            name: "NPS 看板（銷售）",
            desc: "月度 NPS · 各面向評分 · 批評者追蹤",
            href: "/crm/sales/nps",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "CRM06A",
            name: "銷售推播通知管理",
            desc: "範本管理 · 客群篩選 · 排程發送 · 開啟率成效",
            href: "/crm/sales/push-notifications",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
    ],
  },
  {
    icon: "support_agent",
    title: "CRM 售後側模組（B 系列）",
    subtitle: "SA 售後專用 · P-08 部門隔離 · RS05 交車後自動串接",
    tone: "teal",
    badge: { text: "SA 側 · 真實數據", tone: "green" },
    note: (
      <div className="bg-[#E1F5EE] border border-[#A8DFC9] rounded-[7px] px-3.5 py-2.5 text-[12px] text-[#0F6E56]">
        🔗 <b>RS05 串接說明：</b>RS05 交車管理完成後,自動觸發 CRM01B 建立售後客戶基盤記錄,
        並由 CRM03B 排程 D+3 滿意度電訪。RS 與 SA 客戶資料依 P-08 原則隔離,唯一共享欄位為客戶標籤。
      </div>
    ),
    layers: [
      {
        title: "客戶基盤 × 問卷",
        cards: [
          {
            code: "CRM01B",
            name: "售後客戶基盤",
            desc: "逾期回廠追蹤 · 智慧快篩 · 保固/Desmo 提醒 · RS 共享標籤（唯讀）",
            href: "/crm/aftersales/customer-base",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "CRM02B",
            name: "售後電訪問卷設定",
            desc: "D+3/保養/保固/Desmo 問卷 · SA 話術腳本 · 同步至 CRM03B",
            href: "/crm/aftersales/survey-templates",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "電訪 × 休眠",
        cards: [
          {
            code: "CRM03B",
            name: "售後電訪工作台",
            desc: "D+3 滿意度 · 回廠提醒 · Desmo/保固提醒 · NPS 快評",
            href: "/crm/aftersales/call-tasks",
            tone: "teal",
            badge: { text: "串接 RS05", tone: "red" },
          },
          {
            code: "CRM04B",
            name: "售後休眠流失管理",
            desc: "逾期未回廠 · 流失原因分析 · 低 NPS 追蹤 · 喚醒排程",
            href: "/crm/aftersales/dormant-customers",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "NPS × 推播",
        cards: [
          {
            code: "CRM05B",
            name: "NPS 看板（售後）",
            desc: "SA 個人 NPS · 服務類型拆分 · 批評者追蹤 · 面向評分",
            href: "/crm/aftersales/nps",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "CRM06B",
            name: "售後推播通知管理",
            desc: "自動化規則 · 保固/Desmo/維修通知範本 · 進廠轉換率",
            href: "/crm/aftersales/push-notifications",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
    ],
  },
  {
    icon: "store",
    title: "店長跨部門總覽",
    subtitle: "唯讀視角 · RS + SA 雙側數據彙整 · P-08 原則下的跨部門觀察",
    tone: "navy",
    layers: [
      {
        title: "綜合報表",
        cards: [
          {
            code: "CRM07",
            name: "店長跨部門綜合報表",
            desc: "RS+SA NPS 對比趨勢 · SA 真實數據 · 逾期預警 · 跨部門標籤概覽 · 人員效率排行",
            href: "/customer-service/overview",
            tone: "navy",
            badge: { text: "v2 升版", tone: "red" },
          },
        ],
      },
    ],
  },
];

export default function SalesHomePage() {
  useSetPageHeader({
    title: "銷售接待",
    breadcrumb: [{ label: "銷售接待" }],
  });

  return <ModuleHomeGallery hero={HERO} kpis={KPIS} panels={PANELS} />;
}
