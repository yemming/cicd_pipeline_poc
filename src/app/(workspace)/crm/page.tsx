"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  ModuleHomeGallery,
  type ModuleHomeGalleryProps,
} from "@/components/module-home-gallery";

/**
 * /crm — 客服管理模組首頁（v2 圖卡導覽）
 *
 * 對應設計稿：docs/DUCATI_v2_output/01_銷售接待/00_模組導覽/CRM00_客服管理模組_導覽總覽_v2.html
 *
 * 邊界：13 個 CRM 子頁這次不搬。圖卡 href 先指向現有舊路徑
 * （/sales/crm/* 與 /aftersales/crm/*），等後續工項把子頁批次搬到 /crm/* 再回頭改 href。
 */

const HERO: ModuleHomeGalleryProps["hero"] = {
  title: "🎧 DUCATI CRM 客服管理模組",
  description:
    "覆蓋銷售（RS）× 售後（SA）兩條線的客戶關係管理：電訪問卷設計、電訪任務工作台、休眠流失激活、NPS 滿意度看板、推播通知、店長跨部門綜合報表。RS05 交車後自動觸發 SA 側 CRM01B 建檔,形成完整客戶生命週期閉環。",
  stats: [
    { value: 15, label: "CRM 模組總數" },
    { value: 7, label: "銷售側 A 系列" },
    { value: 6, label: "售後側 B 系列" },
    { value: "✅", label: "全數完成" },
  ],
};

const KPIS: ModuleHomeGalleryProps["kpis"] = [
  {
    label: "銷售側（A 系列）",
    value: 7,
    sub: "CRM00/01A/02A/03A/04A/05A/06A",
    tone: "blue",
  },
  {
    label: "售後側（B 系列)",
    value: 6,
    sub: "CRM01B/02B/03B/04B/05B/06B ✅",
    tone: "teal",
  },
  {
    label: "店長跨部門報表",
    value: 1,
    sub: "CRM07 v2 · SA 真實數據已納入",
    tone: "purple",
  },
  {
    label: "跨部門串接點",
    value: 13,
    sub: "RS05→CRM01B 為核心觸發鏈",
    tone: "amber",
  },
];

const PANELS: ModuleHomeGalleryProps["panels"] = [
  {
    icon: "groups",
    title: "銷售側 CRM 模組（A 系列）",
    subtitle: "對應 RS 銷售顧問 · 潛客建檔 → HABC 追蹤 → 電訪 → NPS → 推播",
    tone: "blue",
    layers: [
      {
        title: "客戶基盤 × 問卷設定",
        cards: [
          {
            code: "CRM01A",
            name: "銷售客戶基盤",
            desc: "HABC 分級 · 列表/看板雙視圖 · SA 唯讀標籤（P-08 新增）",
            href: "/crm/sales/customer-base",
            tone: "blue",
            badge: { text: "v2 升版", tone: "red" },
          },
          {
            code: "CRM02A",
            name: "銷售電訪問卷設定",
            desc: "問卷題目管理 · 題型 CRUD · 版本控制 · 適用對象設定",
            href: "/crm/sales/survey-templates",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "電訪工作台 × 休眠追蹤",
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
            desc: "休眠分層 · 戰敗原因分析 · 競品流向 · 再接觸排程",
            href: "/crm/sales/dormant-leads",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "滿意度 × 推播",
        cards: [
          {
            code: "CRM05A",
            name: "NPS 看板（銷售）",
            desc: "月度 NPS · 推薦/被動/批評分布 · 各面向評分 · 批評者追蹤",
            href: "/crm/sales/nps",
            tone: "blue",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "CRM06A",
            name: "銷售推播通知管理",
            desc: "LINE/SMS 範本管理 · 客群篩選 · 排程發送 · 開啟率追蹤",
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
    title: "售後側 CRM 模組（B 系列）",
    subtitle: "對應 SA 服務顧問 · RS05 交車自動觸發 · P-08 隔離 · 自動化推播",
    tone: "teal",
    badge: { text: "✅ 全 6 支完成", tone: "green" },
    note: (
      <div className="bg-[#E1F5EE] border border-[#A8DFC9] rounded-[7px] px-3.5 py-2.5 text-[12px] text-[#0F6E56]">
        🔗 <b>RS05 串接：</b>交車完成 → CRM01B 自動建檔 → CRM03B D+3 電訪 → CRM05B NPS → CRM07
        店長報表。依 P-08,RS 與 SA 資料隔離,唯共享客戶標籤（雙側各唯讀）。
      </div>
    ),
    layers: [
      {
        title: "客戶基盤 × 問卷設定",
        cards: [
          {
            code: "CRM01B",
            name: "售後客戶基盤",
            desc: "逾期回廠追蹤 · 智慧快篩（自訂條件）· 保固/Desmo 提醒 · RS 標籤唯讀",
            href: "/crm/aftersales/customer-base",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "CRM02B",
            name: "售後電訪問卷設定",
            desc: "D+3/保養/保固/Desmo 問卷 · SA 話術腳本 · 問卷預覽功能",
            href: "/crm/aftersales/survey-templates",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "電訪工作台 × 休眠流失",
        cards: [
          {
            code: "CRM03B",
            name: "售後電訪工作台",
            desc: "D+3/回廠/保固/Desmo 5 種類型 · 工單 RO 資訊條 · NPS 快評",
            href: "/crm/aftersales/call-tasks",
            tone: "teal",
            badge: { text: "串接 RS05", tone: "red" },
          },
          {
            code: "CRM04B",
            name: "售後休眠流失管理",
            desc: "逾期未回廠分層 · 流失原因分析 · 低 NPS 追蹤 · 喚醒計畫排程",
            href: "/crm/aftersales/dormant-customers",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
        ],
      },
      {
        title: "NPS 看板 × 推播通知",
        cards: [
          {
            code: "CRM05B",
            name: "NPS 看板（售後）",
            desc: "SA 個人 NPS · 服務類型拆分 · 面向評分趨勢箭頭 · 批評者追蹤",
            href: "/crm/aftersales/nps",
            tone: "teal",
            badge: { text: "v1", tone: "navy" },
          },
          {
            code: "CRM06B",
            name: "售後推播通知管理",
            desc: "自動化 6 條規則 · 維修竣工通知（95%開啟）· Desmo/保固/生日提醒",
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
    title: "店長跨部門報表",
    subtitle: "唯讀視角 · RS+SA 雙側數據彙整",
    tone: "navy",
    badge: { text: "v2 SA 真實數據", tone: "red" },
    layers: [
      {
        title: "綜合報表",
        cards: [
          {
            code: "CRM07",
            name: "店長跨部門綜合報表",
            desc: "RS+SA NPS 雙軸趨勢 · SA 真實數據 · 逾期預警清單 · SA/RS 人員效率排行 · 跨部門標籤概覽",
            href: "/customer-service/overview",
            tone: "navy",
            badge: { text: "v2 升版", tone: "red" },
          },
        ],
      },
    ],
  },
];

export default function CrmHomePage() {
  useSetPageHeader({
    title: "CRM 客服管理",
    breadcrumb: [{ label: "客服管理" }],
  });

  return <ModuleHomeGallery hero={HERO} kpis={KPIS} panels={PANELS} />;
}
