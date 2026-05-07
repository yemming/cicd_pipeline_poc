import { PartsInline } from "@/components/parts-inline";
import { PlaceholderPage } from "@/components/placeholder-page";
import { loadStitchBody } from "@/lib/load-stitch-body";

/**
 * Catch-all 路由:把 53 頁設計稿(public/parts-stitch/*.body.html)inline 進來。
 *
 * Specific route(例:src/app/(workspace)/parts/purchase/orders/page.tsx)
 * 比 catch-all 優先,所以 W1-W6 升級成 Faithful Clone 後不需要動這支。
 */

type PartsMeta = {
  name: string;
  group: string;
  icon: string;
  /** 對應 public/parts-stitch/{htmlFile}.body.html — 沒設代表純 placeholder */
  htmlFile?: string;
};

const PARTS_PAGE_META: Record<string, PartsMeta> = {
  "/parts": { name: "模組導覽", group: "導覽", icon: "inventory_2", htmlFile: "00_庫存管理模組_導覽總覽" },
  "/parts/overview/flow": { name: "流程關係圖", group: "導覽", icon: "schema", htmlFile: "00_模組功能流程關係圖" },

  "/parts/setup/org": { name: "組織三層架構", group: "基礎設定", icon: "account_tree", htmlFile: "01_基礎設定_組織三層架構" },
  "/parts/setup/purchase-permissions": { name: "採購權限規則", group: "基礎設定", icon: "security", htmlFile: "01_基礎設定_採購權限規則" },
  "/parts/setup/item-permissions": { name: "商品管理權限", group: "基礎設定", icon: "admin_panel_settings", htmlFile: "01_基礎設定_商品管理權限" },
  "/parts/setup/count-rules": { name: "盤點回傳規則", group: "基礎設定", icon: "rule", htmlFile: "01_基礎設定_盤點回傳規則" },
  "/parts/setup/control-types": { name: "管控類型定義", group: "基礎設定", icon: "category", htmlFile: "01_基礎設定_管控類型定義" },
  "/parts/setup/warehouse-arch": { name: "倉儲四層架構", group: "基礎設定", icon: "warehouse", htmlFile: "02_基礎設定_倉儲四層架構" },
  "/parts/setup/warehouse-bins": { name: "倉庫庫區庫位", group: "基礎設定", icon: "shelves", htmlFile: "02_基礎設定_倉庫庫區庫位設定" },
  "/parts/setup/suppliers": { name: "供應商資訊", group: "基礎設定", icon: "local_shipping", htmlFile: "02_基礎設定_供應商資訊" },
  "/parts/setup/contracts": { name: "採購合約", group: "基礎設定", icon: "description", htmlFile: "02_基礎設定_採購合約" },
  "/parts/setup/items": { name: "商品基礎資料", group: "基礎設定", icon: "inventory_2", htmlFile: "03_基礎設定_商品基礎資料" },
  "/parts/setup/items-info": { name: "商品資訊", group: "基礎設定", icon: "info", htmlFile: "03_基礎設定_商品資訊" },
  "/parts/setup/serial": { name: "序列號追蹤", group: "基礎設定", icon: "qr_code", htmlFile: "03_基礎設定_序列號追蹤" },
  "/parts/setup/compatibility": { name: "適配設定", group: "基礎設定", icon: "sync_alt", htmlFile: "03_基礎設定_適配設定" },
  "/parts/setup/pricing": { name: "門市定價", group: "基礎設定", icon: "sell", htmlFile: "03_基礎設定_門市定價" },

  "/parts/purchase/flow": { name: "採購流程說明", group: "採購管理", icon: "route", htmlFile: "04_採購流程鏈路說明" },
  "/parts/purchase/requisitions": { name: "需求處理", group: "採購管理", icon: "request_quote", htmlFile: "04_採購管理_需求處理" },
  "/parts/purchase/replenishment": { name: "日常補貨計畫", group: "採購管理", icon: "autorenew", htmlFile: "04_採購管理_日常補貨計畫" },
  "/parts/purchase/orders": { name: "商品採購", group: "採購管理", icon: "shopping_cart_checkout", htmlFile: "04_採購管理_商品採購" },
  "/parts/purchase/returns": { name: "採購退貨", group: "採購管理", icon: "undo", htmlFile: "04_採購管理_採購退貨" },

  "/parts/receipt/po-grn": { name: "採購入庫", group: "入庫管理", icon: "login", htmlFile: "05_入庫管理_採購入庫" },
  "/parts/receipt/transfer-in": { name: "調撥入庫", group: "入庫管理", icon: "move_to_inbox", htmlFile: "05_入庫管理_調撥入庫" },
  "/parts/receipt/internal-sale": { name: "內售入庫", group: "入庫管理", icon: "storefront", htmlFile: "05_入庫管理_內售入庫" },
  "/parts/receipt/return-in": { name: "領料退貨入庫", group: "入庫管理", icon: "undo", htmlFile: "05_入庫管理_領料退貨入庫" },

  "/parts/issue/repair-pick": { name: "維修領料", group: "出庫管理", icon: "build", htmlFile: "06_出庫管理_維修領料" },
  "/parts/issue/transfer-out": { name: "調撥出庫", group: "出庫管理", icon: "outbox", htmlFile: "06_出庫管理_調撥出庫" },
  "/parts/issue/internal-sale": { name: "內售出庫", group: "出庫管理", icon: "point_of_sale", htmlFile: "06_出庫管理_內售出庫" },

  "/parts/operations/balance": { name: "庫存查詢", group: "庫存作業", icon: "search", htmlFile: "07_庫存管理_商品庫存查詢_v2" },
  "/parts/operations/receipts-history": { name: "入庫查詢", group: "庫存作業", icon: "history_edu", htmlFile: "07_庫存作業_入庫查詢" },
  "/parts/operations/transfers-in-transit": { name: "調撥在途查詢", group: "庫存作業", icon: "local_shipping", htmlFile: "07_庫存作業_調撥在途查詢" },
  "/parts/operations/exceptions": { name: "例外出入庫", group: "庫存作業", icon: "priority_high", htmlFile: "07_庫存作業_例外出入庫" },
  "/parts/operations/consignment": { name: "寄存管理", group: "庫存作業", icon: "all_inbox", htmlFile: "07_庫存作業_寄存管理" },
  "/parts/operations/adjust": { name: "備件庫存調整", group: "庫存作業", icon: "tune", htmlFile: "07_庫存作業_備件庫存調整" },
  "/parts/operations/count-ops": { name: "庫存盤點作業", group: "庫存作業", icon: "checklist", htmlFile: "07_庫存作業_庫存盤點作業" },

  "/parts/count/plans": { name: "盤點計畫", group: "盤點管理", icon: "event", htmlFile: "08_盤點管理_盤點計畫" },
  "/parts/count/sessions": { name: "盤點處理", group: "盤點管理", icon: "qr_code_scanner", htmlFile: "08_盤點管理_盤點處理" },
  "/parts/count/adjustments": { name: "報損報溢", group: "盤點管理", icon: "compare_arrows", htmlFile: "08_盤點管理_報損報溢" },

  "/parts/alerts/thresholds": { name: "庫存水位設定", group: "預警告警", icon: "water_drop", htmlFile: "10_預警告警_庫存水位設定" },
  "/parts/alerts/rules": { name: "告警類型與規則", group: "預警告警", icon: "rule_settings", htmlFile: "10_預警告警_告警類型與規則" },
  "/parts/alerts/escalation": { name: "告警階層設定", group: "預警告警", icon: "escalator_warning", htmlFile: "10_預警告警_告警階層設定" },
  "/parts/alerts/work-order-loop": { name: "工單增項閉環", group: "預警告警", icon: "add_task", htmlFile: "10_預警告警_工單增項閉環" },

  "/parts/warranty/flow": { name: "索賠流程說明", group: "保固索賠", icon: "route", htmlFile: "11_保固索賠_索賠流程說明" },
  "/parts/warranty/ro-link": { name: "RO 工單串接", group: "保固索賠", icon: "link", htmlFile: "11_保固索賠_RO工單串接" },
  "/parts/warranty/used-parts": { name: "舊件管理", group: "保固索賠", icon: "recycling", htmlFile: "11_保固索賠_舊件管理" },
  "/parts/warranty/used-parts-flow": { name: "舊件出入庫邏輯", group: "保固索賠", icon: "compare_arrows", htmlFile: "11_保固索賠_舊件出入庫邏輯" },
  "/parts/warranty/staging-warehouse": { name: "暫存倉設定", group: "保固索賠", icon: "inventory", htmlFile: "11_保固索賠_暫存倉設定" },
  "/parts/warranty/cost-recovery": { name: "費用回收", group: "保固索賠", icon: "savings", htmlFile: "11_保固索賠_費用回收" },

  "/parts/analytics/abc-structure": { name: "ABC 結構圖", group: "分析報表", icon: "pie_chart", htmlFile: "12_分析報表_ABC結構圖" },
  "/parts/analytics/abc": { name: "ABC 分類", group: "分析報表", icon: "category", htmlFile: "12_分析報表_ABC分類" },
  "/parts/analytics/abc-settings": { name: "ABC 分類設定", group: "分析報表", icon: "tune", htmlFile: "12_分析報表_ABC分類設定" },
  "/parts/analytics/stale": { name: "呆滯庫存", group: "分析報表", icon: "inventory_2", htmlFile: "12_分析報表_呆滯庫存" },
  "/parts/analytics/turnover": { name: "庫存周轉率", group: "分析報表", icon: "cached", htmlFile: "12_分析報表_庫存周轉率" },
};

export default async function PartsCatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const slug = (await params).slug;
  const path = "/parts/" + slug.join("/");
  const meta = PARTS_PAGE_META[path] ?? {
    name: "庫存管理",
    group: "庫存管理",
    icon: "inventory_2",
  };

  const breadcrumb = [
    { label: "庫存管理", href: "/parts" },
    ...(meta.group !== "庫存管理" && meta.group !== "導覽"
      ? [{ label: meta.group }]
      : []),
    ...(meta.name !== "模組導覽" ? [{ label: meta.name }] : []),
  ];

  if (meta.htmlFile) {
    const html = await loadStitchBody(meta.htmlFile, "parts-stitch");
    return (
      <PartsInline
        html={html}
        title={meta.name}
        breadcrumb={breadcrumb}
        fileName={meta.htmlFile}
      />
    );
  }

  return (
    <PlaceholderPage
      title={meta.name}
      description="此頁面尚未對應到任何設計稿。"
      icon={meta.icon}
      breadcrumb={breadcrumb}
    />
  );
}
