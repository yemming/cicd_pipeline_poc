"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  ModuleHomeGallery,
  type ModuleHomeGalleryProps,
} from "@/components/module-home-gallery";

/**
 * /parts — 庫存管理模組首頁（v2 圖卡導覽）
 *
 * 對應設計稿：docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/00_庫存管理模組_導覽總覽.html
 *           docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/00_庫存管理模組_流程關係圖.html
 *
 * 邊界：
 * - 子頁不動，圖卡 href 指向現役 /parts/* 子路徑。
 * - 沿用共用 <ModuleHomeGallery>，9 區 panel 對應規格 GROUP A–G（B 拆成採購/入庫/出庫）。
 * - 規格 30 支 HTML（23 完成 + 7 新）全集 + 既有路由總共 52 張卡。
 */

const HERO: ModuleHomeGalleryProps["hero"] = {
  title: "🏍️ DUCATI 庫存管理模組",
  description:
    "涵蓋採購、入庫、出庫、庫存作業、盤點、預警告警、保固索賠、分析報表全流程。RO 工單串接領料、原廠 DMS 到貨匯入、調撥在途追蹤、三層告警階層升階,構成完整零件生命週期閉環。",
  stats: [
    { value: 30, label: "規格 HTML 頁面" },
    { value: 9, label: "功能子模組" },
    { value: "v2", label: "本頁版本" },
  ],
};

const KPIS: ModuleHomeGalleryProps["kpis"] = [
  {
    label: "基礎設定",
    value: 14,
    sub: "組織 / 倉儲 / 商品 三組",
    tone: "blue",
  },
  {
    label: "進出庫流程",
    value: 12,
    sub: "採購 5 · 入庫 4 · 出庫 3",
    tone: "teal",
  },
  {
    label: "庫存 × 盤點 × 預警",
    value: 15,
    sub: "庫存 7 · 盤點 3 · 預警 5",
    tone: "amber",
  },
  {
    label: "保固 + 分析",
    value: 11,
    sub: "舊件管理 + ABC 報表",
    tone: "navy",
  },
];

const PANELS: ModuleHomeGalleryProps["panels"] = [
  // 1 — 基礎設定
  {
    icon: "settings",
    title: "基礎設定",
    subtitle: "組織 × 倉儲 × 商品三組基礎主檔 · GROUP A · 1.x / 2.x / 3.x",
    tone: "blue",
    layers: [
      {
        title: "1.x 組織 × 權限",
        cards: [
          {
            code: "1.1",
            name: "組織三層架構",
            desc: "集團 / 法人 / 門市 三層 · 跨層權限與成本中心",
            href: "/parts/setup/org",
            tone: "blue",
          },
          {
            code: "1.2",
            name: "採購權限規則",
            desc: "依角色 / 金額 / 品類設定可下單範圍與審核流程",
            href: "/parts/setup/purchase-permissions",
            tone: "blue",
          },
          {
            code: "1.3",
            name: "商品管理權限",
            desc: "商品建檔 / 改價 / 停用授權矩陣",
            href: "/parts/setup/item-permissions",
            tone: "blue",
          },
          {
            code: "1.4",
            name: "盤點回傳規則",
            desc: "差異閾值 / 自動報損報溢 / 主管覆核規則",
            href: "/parts/setup/count-rules",
            tone: "blue",
          },
          {
            code: "1.5",
            name: "管控類型定義",
            desc: "A/B/C/D 管控等級 · 序號 / 批號 / 一般 三類追蹤",
            href: "/parts/setup/control-types",
            tone: "blue",
          },
        ],
      },
      {
        title: "2.x 倉儲 × 供應商",
        cards: [
          {
            code: "2.1",
            name: "倉儲四層架構",
            desc: "倉庫 → 庫區 → 庫位 → 擺放 四層樹",
            href: "/parts/setup/warehouse-arch",
            tone: "blue",
          },
          {
            code: "2.2",
            name: "倉庫 / 庫區 / 庫位",
            desc: "倉位編碼 · 容量 · 揀貨動線設定",
            href: "/parts/setup/warehouse-bins",
            tone: "blue",
          },
          {
            code: "2.3",
            name: "供應商資訊",
            desc: "供應商主檔 · 帳期 · 對應品類",
            href: "/parts/setup/suppliers",
            tone: "blue",
          },
          {
            code: "2.4",
            name: "採購合約",
            desc: "年度合約 · 階梯價 · 履約進度",
            href: "/parts/setup/contracts",
            tone: "blue",
          },
        ],
      },
      {
        title: "3.x 商品主檔",
        cards: [
          {
            code: "3.1",
            name: "商品基礎資料",
            desc: "商品 / 品類 / 字典樹結構",
            href: "/parts/setup/items",
            tone: "blue",
          },
          {
            code: "3.2",
            name: "商品資訊（多維度料號）",
            desc: "多維度料號 · 規格 · 替代料",
            href: "/parts/setup/items-info",
            tone: "blue",
          },
          {
            code: "3.3",
            name: "門市定價",
            desc: "門市別售價 · 折扣規則 · 階梯",
            href: "/parts/setup/pricing",
            tone: "blue",
          },
          {
            code: "3.4",
            name: "適配設定",
            desc: "料號 ↔ 車型 / 年份 適配對照",
            href: "/parts/setup/compatibility",
            tone: "blue",
          },
          {
            code: "3.5",
            name: "序列號 / 批號追蹤",
            desc: "序號 / 批號管理 · 履歷追蹤",
            href: "/parts/setup/serial",
            tone: "blue",
          },
        ],
      },
    ],
  },

  // 2 — 採購管理
  {
    icon: "shopping_cart",
    title: "採購管理",
    subtitle: "採購流程鏈路 × 需求處理 × 商品採購 × 退貨 · GROUP B · 4.x",
    tone: "navy",
    layers: [
      {
        title: "4.x 採購流程",
        cards: [
          {
            code: "4.1",
            name: "採購流程鏈路",
            desc: "需求 → 採購 → 入庫 全鏈路視覺化",
            href: "/parts/purchase/flow",
            tone: "navy",
          },
          {
            code: "4.2",
            name: "日常補貨計畫",
            desc: "依水位 / ABC / 銷售節奏自動建議補貨",
            href: "/parts/purchase/replenishment",
            tone: "navy",
          },
          {
            code: "4.3",
            name: "需求處理",
            desc: "從工單缺料 / 補貨提案彙整需求單",
            href: "/parts/purchase/requisitions",
            tone: "navy",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "4.4",
            name: "商品採購",
            desc: "採購單建立 · 供應商確認 · 預計到貨",
            href: "/parts/purchase/orders",
            tone: "navy",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "4.5",
            name: "採購退貨",
            desc: "退供應商 · 退貨單 · 對帳沖銷",
            href: "/parts/purchase/returns",
            tone: "navy",
          },
        ],
      },
    ],
  },

  // 3 — 入庫管理
  {
    icon: "input",
    title: "入庫管理",
    subtitle: "採購入庫 × 調撥入庫 × 內售入庫 × 領料退貨入庫 · GROUP B · 5.x",
    tone: "teal",
    layers: [
      {
        title: "5.x 入庫流程",
        cards: [
          {
            code: "5.1",
            name: "採購入庫（含原廠 DMS 匯入）",
            desc: "依採購單收料 · 原廠到貨清單匯入比對",
            href: "/parts/receipt/po-grn",
            tone: "teal",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "5.2",
            name: "調撥入庫",
            desc: "門店間調撥收料 · 在途轉現貨",
            href: "/parts/receipt/transfer-in",
            tone: "teal",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "5.3",
            name: "內售入庫",
            desc: "公司內部撥用入庫沖銷",
            href: "/parts/receipt/internal-sale",
            tone: "teal",
          },
          {
            code: "5.4",
            name: "領料退貨入庫",
            desc: "工單退料 · 良品回庫 · 報損隔離",
            href: "/parts/receipt/return-in",
            tone: "teal",
          },
        ],
      },
    ],
  },

  // 4 — 出庫管理
  {
    icon: "output",
    title: "出庫管理",
    subtitle: "維修領料 × 調撥出庫 × 內售出庫 · GROUP B · 6.x",
    tone: "teal",
    layers: [
      {
        title: "6.x 出庫流程",
        cards: [
          {
            code: "6.1",
            name: "維修領料（RO 工單串接）",
            desc: "RO 工單帶料 · 自動扣庫 · 缺料觸發補貨",
            href: "/parts/issue/repair-pick",
            tone: "teal",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "6.2",
            name: "調撥出庫",
            desc: "跨門店調撥出貨 · 物流追蹤",
            href: "/parts/issue/transfer-out",
            tone: "teal",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "6.3",
            name: "內售出庫",
            desc: "公司內部撥用出庫 · 部門間結轉",
            href: "/parts/issue/internal-sale",
            tone: "teal",
          },
        ],
      },
    ],
  },

  // 5 — 庫存查詢與作業
  {
    icon: "inventory_2",
    title: "庫存查詢與作業",
    subtitle: "查詢 × 例外處理 × 寄存 × 即時調整 · GROUP C · 7.x",
    tone: "blue",
    layers: [
      {
        title: "7.x 庫存作業",
        cards: [
          {
            code: "7.1",
            name: "商品庫存查詢",
            desc: "即時庫存 · 多維篩選 · 告警儀表板入口",
            href: "/parts/operations/balance",
            tone: "blue",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "7.2",
            name: "例外出入庫",
            desc: "非正常流程手動出入 · 主管審核 · 稽核日誌",
            href: "/parts/operations/exceptions",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "7.3",
            name: "寄存管理",
            desc: "客戶寄存件追蹤 · 到期提醒 · 轉入退還",
            href: "/parts/operations/consignment",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "7.4",
            name: "庫存盤點作業",
            desc: "現場盤點視圖 · 條碼掃描 · 差異標示",
            href: "/parts/operations/count-ops",
            tone: "blue",
          },
          {
            code: "7.5",
            name: "備件庫存調整",
            desc: "即時調整 · 計算後落單 · 調整日誌",
            href: "/parts/operations/adjust",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "7.6",
            name: "入庫查詢",
            desc: "跨類型入庫彙整 · 可展開明細",
            href: "/parts/operations/receipts-history",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "7.7",
            name: "調撥在途查詢",
            desc: "物流里程碑 · 逾期標示 · 右側追蹤面板",
            href: "/parts/operations/transfers-in-transit",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
        ],
      },
    ],
  },

  // 6 — 盤點管理
  {
    icon: "fact_check",
    title: "盤點管理",
    subtitle: "盤點計畫 × 條碼處理 × 報損報溢 · GROUP D · 8.x",
    tone: "navy",
    layers: [
      {
        title: "8.x 盤點流程",
        cards: [
          {
            code: "8.1",
            name: "盤點計畫",
            desc: "週 / 月 / 不定期盤點規劃 · 範圍 · 人員指派",
            href: "/parts/count/plans",
            tone: "navy",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "8.2",
            name: "盤點處理（條碼掃描）",
            desc: "現場條碼掃描 · 即時差異 · 雙人覆盤",
            href: "/parts/count/sessions",
            tone: "navy",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "8.3",
            name: "報損報溢",
            desc: "差異調整單 · 原因分類 · 主管覆核",
            href: "/parts/count/adjustments",
            tone: "navy",
            badge: { text: "HTML", tone: "green" },
          },
        ],
      },
    ],
  },

  // 7 — 預警告警
  {
    icon: "notifications_active",
    title: "預警告警",
    subtitle: "水位設定 × 告警規則 × 階層升階 · GROUP E · 10.x",
    tone: "blue",
    layers: [
      {
        title: "10.x 預警機制",
        cards: [
          {
            code: "10.1",
            name: "庫存水位設定",
            desc: "零件 / 機車 / 耗材 三分頁水位設定",
            href: "/parts/alerts/thresholds",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
          {
            code: "10.2",
            name: "告警類型與規則",
            desc: "缺貨 / 呆滯 / 異常 各類告警規則",
            href: "/parts/alerts/rules",
            tone: "blue",
          },
          {
            code: "10.3",
            name: "告警儀表板",
            desc: "即時告警總覽 · 優先級分類",
            href: "/parts/operations/balance",
            tone: "blue",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "10.4",
            name: "工單增項閉環",
            desc: "缺料 → 補貨 → 通知工單 全循環",
            href: "/parts/alerts/work-order-loop",
            tone: "blue",
          },
          {
            code: "10.5",
            name: "告警階層設定",
            desc: "三層收件人 · 升階規則 · 通知管道",
            href: "/parts/alerts/escalation",
            tone: "blue",
            badge: { text: "NEW", tone: "red" },
          },
        ],
      },
    ],
  },

  // 8 — 保固索賠舊件
  {
    icon: "verified",
    title: "保固索賠舊件",
    subtitle: "索賠流程 × 舊件管理 × 暫存倉 × 費用回收 · GROUP F · 11.x",
    tone: "navy",
    layers: [
      {
        title: "11.x 保固機制",
        cards: [
          {
            code: "11.1",
            name: "索賠流程說明",
            desc: "舊件 → 暫存 → 原廠驗收 → 費用回收 完整鏈路",
            href: "/parts/warranty/flow",
            tone: "navy",
          },
          {
            code: "11.2",
            name: "舊件出入庫邏輯",
            desc: "良品 / 不良 / 暫存 三類流向",
            href: "/parts/warranty/used-parts-flow",
            tone: "navy",
          },
          {
            code: "11.3",
            name: "暫存倉設定",
            desc: "暫存倉位 · 隔離規則 · 保存期",
            href: "/parts/warranty/staging-warehouse",
            tone: "navy",
          },
          {
            code: "11.4",
            name: "舊件管理介面",
            desc: "舊件清單 · 狀態 · 原廠回覆",
            href: "/parts/warranty/used-parts",
            tone: "navy",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "11.5",
            name: "與 RO 工單串接",
            desc: "保固維修 RO 自動帶舊件 · 雙向對照",
            href: "/parts/warranty/ro-link",
            tone: "navy",
          },
          {
            code: "11.6",
            name: "索賠費用回收",
            desc: "原廠核賠金額 · AR 沖銷 · 對帳",
            href: "/parts/warranty/cost-recovery",
            tone: "navy",
          },
        ],
      },
    ],
  },

  // 9 — ABC 分類 / 分析報表
  {
    icon: "analytics",
    title: "分析報表",
    subtitle: "ABC 分類 × 周轉率 × 呆滯佔比 × 缺貨率 · GROUP G · 12.x",
    tone: "blue",
    layers: [
      {
        title: "12.x ABC × 報表",
        cards: [
          {
            code: "12.1",
            name: "ABC 分類定義",
            desc: "ABC 分類算法 / 重新分類週期 / 規則設定",
            href: "/parts/analytics/abc-settings",
            tone: "blue",
          },
          {
            code: "12.2",
            name: "庫存周轉率",
            desc: "周轉天數 / 月度比較 / 品類拆分",
            href: "/parts/analytics/turnover",
            tone: "blue",
          },
          {
            code: "12.3",
            name: "呆滯庫存佔比",
            desc: "30/60/90/180 天呆滯分層",
            href: "/parts/analytics/stale",
            tone: "blue",
          },
          {
            code: "12.4",
            name: "ABC 分類報表",
            desc: "A/B/C 件數佔比 / 金額佔比",
            href: "/parts/analytics/abc",
            tone: "blue",
            badge: { text: "HTML", tone: "green" },
          },
          {
            code: "12.5",
            name: "ABC 結構圖",
            desc: "Pareto / 樹狀結構視覺化",
            href: "/parts/analytics/abc-structure",
            tone: "blue",
          },
        ],
      },
    ],
  },
];

export default function PartsHomePage() {
  useSetPageHeader({
    title: "庫存管理",
    breadcrumb: [{ label: "庫存管理" }],
  });

  return <ModuleHomeGallery hero={HERO} kpis={KPIS} panels={PANELS} />;
}
